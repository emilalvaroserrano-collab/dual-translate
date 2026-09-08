#include <jni.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <deque>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

#ifndef EDGE_WITH_WHISPER
#define EDGE_WITH_WHISPER 0
#endif
#ifndef EDGE_WITH_LLAMA
#define EDGE_WITH_LLAMA 0
#endif
#ifndef EDGE_WITH_SHERPA_ONNX
#define EDGE_WITH_SHERPA_ONNX 0
#endif
#ifndef EDGE_WITH_SILERO_VAD
#define EDGE_WITH_SILERO_VAD 0
#endif
#ifndef EDGE_PIPELINE_IMPLEMENTED
#define EDGE_PIPELINE_IMPLEMENTED 0
#endif
#ifndef EDGE_NATIVE_REVISION
#define EDGE_NATIVE_REVISION "unknown"
#endif

namespace {
constexpr int kAsrSampleRate = 16000;
constexpr size_t kAudioRingCapacity = static_cast<size_t>(kAsrSampleRate) * 30;
constexpr double kPi = 3.14159265358979323846;

std::mutex g_event_mutex;
std::mutex g_audio_mutex;
std::deque<std::string> g_events;
std::deque<float> g_audio_16k;
std::string g_session_id;
bool g_initialized = false;
bool g_started = false;

constexpr bool kPipelineReady =
    EDGE_WITH_WHISPER && EDGE_WITH_LLAMA && EDGE_WITH_SHERPA_ONNX &&
    EDGE_WITH_SILERO_VAD && EDGE_PIPELINE_IMPLEMENTED;

class StreamingSincResampler {
public:
    void reset(int source_rate) {
        source_rate_ = source_rate;
        buffer_.assign(kRadius, 0.0f);
        next_position_ = static_cast<double>(kRadius);
    }

    std::vector<float> process(const int16_t* samples, size_t count, int source_rate) {
        if (samples == nullptr || count == 0 || source_rate <= 0) return {};
        if (source_rate_ != source_rate) reset(source_rate);

        buffer_.reserve(buffer_.size() + count);
        for (size_t i = 0; i < count; ++i) {
            buffer_.push_back(static_cast<float>(samples[i]) / 32768.0f);
        }

        if (source_rate == kAsrSampleRate) {
            std::vector<float> out;
            out.reserve(count);
            const size_t begin = buffer_.size() - count;
            out.insert(out.end(), buffer_.begin() + static_cast<std::ptrdiff_t>(begin), buffer_.end());
            // Keep only enough history for a later route/sample-rate transition.
            if (buffer_.size() > static_cast<size_t>(kRadius * 2)) {
                buffer_.erase(buffer_.begin(), buffer_.end() - kRadius);
            }
            next_position_ = static_cast<double>(buffer_.size());
            return out;
        }

        const double step = static_cast<double>(source_rate) / kAsrSampleRate;
        const double rate_ratio = static_cast<double>(kAsrSampleRate) / source_rate;
        const double cutoff = 0.5 * std::min(1.0, rate_ratio) * 0.94;
        std::vector<float> out;
        out.reserve(static_cast<size_t>(count / step) + 4);

        while (next_position_ + kRadius < static_cast<double>(buffer_.size())) {
            const auto center = static_cast<long>(std::floor(next_position_));
            double weighted = 0.0;
            double normalization = 0.0;

            for (int tap = -kRadius + 1; tap <= kRadius; ++tap) {
                const long index = center + tap;
                if (index < 0 || index >= static_cast<long>(buffer_.size())) continue;

                const double distance = static_cast<double>(index) - next_position_;
                const double window_position = std::abs(distance) / kRadius;
                if (window_position >= 1.0) continue;

                const double window = 0.5 * (1.0 + std::cos(kPi * window_position));
                const double scaled = 2.0 * cutoff * distance;
                const double sinc = std::abs(scaled) < 1e-12
                    ? 1.0
                    : std::sin(kPi * scaled) / (kPi * scaled);
                const double weight = 2.0 * cutoff * sinc * window;
                weighted += static_cast<double>(buffer_[static_cast<size_t>(index)]) * weight;
                normalization += weight;
            }

            const double value = std::abs(normalization) > 1e-12
                ? weighted / normalization
                : 0.0;
            out.push_back(static_cast<float>(std::clamp(value, -1.0, 1.0)));
            next_position_ += step;
        }

        const long removable = static_cast<long>(std::floor(next_position_)) - kRadius;
        if (removable > 0) {
            const size_t remove_count = std::min(
                static_cast<size_t>(removable),
                buffer_.size(),
            );
            buffer_.erase(
                buffer_.begin(),
                buffer_.begin() + static_cast<std::ptrdiff_t>(remove_count),
            );
            next_position_ -= static_cast<double>(remove_count);
        }
        return out;
    }

private:
    static constexpr int kRadius = 16;
    int source_rate_ = 0;
    double next_position_ = 0.0;
    std::vector<float> buffer_;
};

StreamingSincResampler g_resampler;

jstring to_jstring(JNIEnv* env, const std::string& value) {
    return env->NewStringUTF(value.c_str());
}

std::string from_jstring(JNIEnv* env, jstring value) {
    if (value == nullptr) return {};
    const char* chars = env->GetStringUTFChars(value, nullptr);
    if (chars == nullptr) return {};
    std::string result(chars);
    env->ReleaseStringUTFChars(value, chars);
    return result;
}

std::string json_escape(const std::string& input) {
    std::ostringstream out;
    for (char c : input) {
        switch (c) {
            case '\\': out << "\\\\"; break;
            case '"': out << "\\\""; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default: out << c; break;
        }
    }
    return out.str();
}

void push_event(const std::string& json) {
    std::lock_guard<std::mutex> lock(g_event_mutex);
    g_events.push_back(json);
}

void push_state(const std::string& state) {
    std::ostringstream out;
    out << "{\"type\":\"state\",\"state\":\"" << json_escape(state) << "\"";
    if (!g_session_id.empty()) {
        out << ",\"sessionId\":\"" << json_escape(g_session_id) << "\"";
    }
    out << "}";
    push_event(out.str());
}

std::string drain_events_json() {
    std::lock_guard<std::mutex> lock(g_event_mutex);
    std::ostringstream out;
    out << '[';
    bool first = true;
    while (!g_events.empty()) {
        if (!first) out << ',';
        first = false;
        out << g_events.front();
        g_events.pop_front();
    }
    out << ']';
    return out.str();
}

void append_audio_16k(const std::vector<float>& audio) {
    if (audio.empty()) return;
    for (float sample : audio) {
        if (g_audio_16k.size() == kAudioRingCapacity) {
            g_audio_16k.pop_front();
        }
        g_audio_16k.push_back(sample);
    }
}

void clear_audio_pipeline() {
    std::lock_guard<std::mutex> lock(g_audio_mutex);
    g_audio_16k.clear();
    g_resampler = StreamingSincResampler();
}
}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeBuildInfoJson(
    JNIEnv* env,
    jobject /* thiz */) {
    std::ostringstream out;
    out << "{"
        << "\"abiVersion\":3,"
        << "\"whisper\":" << (EDGE_WITH_WHISPER ? "true" : "false") << ','
        << "\"llama\":" << (EDGE_WITH_LLAMA ? "true" : "false") << ','
        << "\"sherpaOnnx\":" << (EDGE_WITH_SHERPA_ONNX ? "true" : "false") << ','
        << "\"sileroVad\":" << (EDGE_WITH_SILERO_VAD ? "true" : "false") << ','
        << "\"pipelineReady\":" << (kPipelineReady ? "true" : "false") << ','
        << "\"capture\":\"android-audiorecord-pcm16\","
        << "\"asrSampleRate\":16000,"
        << "\"resampler\":\"streaming-windowed-sinc-r16\","
        << "\"revision\":\"" << json_escape(EDGE_NATIVE_REVISION) << "\""
        << "}";
    return to_jstring(env, out.str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeInitialize(
    JNIEnv* env,
    jobject /* thiz */,
    jstring model_root,
    jstring manifest_json,
    jstring settings_json) {
    (void)model_root;
    (void)manifest_json;
    (void)settings_json;
    if (!kPipelineReady) {
        return to_jstring(
            env,
            "Native contract library is compiled, but the complete local inference pipeline is not linked/qualified.");
    }
    g_initialized = true;
    clear_audio_pipeline();
    push_state("Local native runtime initialized");
    return nullptr;
}

extern "C" JNIEXPORT jstring JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeStart(
    JNIEnv* env,
    jobject /* thiz */,
    jstring session_id,
    jstring settings_json) {
    (void)settings_json;
    if (!g_initialized) {
        return to_jstring(env, "Native runtime is not initialized.");
    }
    if (!kPipelineReady) {
        return to_jstring(env, "Native local inference pipeline is not ready.");
    }
    g_session_id = from_jstring(env, session_id);
    g_started = true;
    clear_audio_pipeline();
    push_state("Streaming locally");
    return nullptr;
}

extern "C" JNIEXPORT void JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativePushPcm16(
    JNIEnv* env,
    jobject /* thiz */,
    jshortArray samples,
    jint sample_rate,
    jlong capture_time_ns) {
    (void)capture_time_ns;
    if (!g_started || samples == nullptr || sample_rate <= 0) return;

    const jsize length = env->GetArrayLength(samples);
    if (length <= 0) return;

    std::vector<jshort> input(static_cast<size_t>(length));
    env->GetShortArrayRegion(samples, 0, length, input.data());
    if (env->ExceptionCheck()) return;

    std::lock_guard<std::mutex> lock(g_audio_mutex);
    const auto resampled = g_resampler.process(
        reinterpret_cast<const int16_t*>(input.data()),
        input.size(),
        static_cast<int>(sample_rate),
    );
    append_audio_16k(resampled);

    // Next stage consumes this bounded 16 kHz ring with Silero VAD. Keeping the
    // ring here makes capture/resampling real while EDGE_PIPELINE_IMPLEMENTED
    // remains false until VAD -> Whisper -> LLM -> TTS is actually wired.
}

extern "C" JNIEXPORT void JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeStop(
    JNIEnv* /* env */,
    jobject /* thiz */) {
    if (g_started && !g_session_id.empty()) {
        std::ostringstream out;
        out << "{\"type\":\"interrupted\",\"sessionId\":\""
            << json_escape(g_session_id) << "\"}";
        push_event(out.str());
    }
    g_started = false;
    g_session_id.clear();
    clear_audio_pipeline();
}

extern "C" JNIEXPORT void JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeReset(
    JNIEnv* /* env */,
    jobject /* thiz */) {
    clear_audio_pipeline();
    if (!g_session_id.empty()) {
        std::ostringstream out;
        out << "{\"type\":\"interrupted\",\"sessionId\":\""
            << json_escape(g_session_id) << "\"}";
        push_event(out.str());
    }
}

extern "C" JNIEXPORT void JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeUpdateSettings(
    JNIEnv* /* env */,
    jobject /* thiz */,
    jstring /* settings_json */) {}

extern "C" JNIEXPORT void JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeSetMicMuted(
    JNIEnv* /* env */,
    jobject /* thiz */,
    jboolean /* muted */) {}

extern "C" JNIEXPORT void JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeSetTtsMuted(
    JNIEnv* /* env */,
    jobject /* thiz */,
    jboolean /* muted */) {}

extern "C" JNIEXPORT jstring JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeDrainEvents(
    JNIEnv* env,
    jobject /* thiz */) {
    return to_jstring(env, drain_events_json());
}

extern "C" JNIEXPORT void JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeShutdown(
    JNIEnv* /* env */,
    jobject /* thiz */) {
    {
        std::lock_guard<std::mutex> lock(g_event_mutex);
        g_events.clear();
    }
    g_session_id.clear();
    g_started = false;
    g_initialized = false;
    clear_audio_pipeline();
}
