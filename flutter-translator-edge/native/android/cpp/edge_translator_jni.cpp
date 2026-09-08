#include <jni.h>

#include <deque>
#include <mutex>
#include <sstream>
#include <string>

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
std::mutex g_mutex;
std::deque<std::string> g_events;
std::string g_session_id;
bool g_initialized = false;
bool g_started = false;

constexpr bool kPipelineReady =
    EDGE_WITH_WHISPER && EDGE_WITH_LLAMA && EDGE_WITH_SHERPA_ONNX &&
    EDGE_WITH_SILERO_VAD && EDGE_PIPELINE_IMPLEMENTED;

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
    std::lock_guard<std::mutex> lock(g_mutex);
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
    std::lock_guard<std::mutex> lock(g_mutex);
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
}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeBuildInfoJson(
    JNIEnv* env,
    jobject /* thiz */) {
    std::ostringstream out;
    out << "{"
        << "\"abiVersion\":2,"
        << "\"whisper\":" << (EDGE_WITH_WHISPER ? "true" : "false") << ','
        << "\"llama\":" << (EDGE_WITH_LLAMA ? "true" : "false") << ','
        << "\"sherpaOnnx\":" << (EDGE_WITH_SHERPA_ONNX ? "true" : "false") << ','
        << "\"sileroVad\":" << (EDGE_WITH_SILERO_VAD ? "true" : "false") << ','
        << "\"pipelineReady\":" << (kPipelineReady ? "true" : "false") << ','
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
    push_state("Streaming locally");
    return nullptr;
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
}

extern "C" JNIEXPORT void JNICALL
Java_ai_eburon_flutter_1translator_1edge_EdgeNativeBridge_nativeReset(
    JNIEnv* /* env */,
    jobject /* thiz */) {
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
    std::lock_guard<std::mutex> lock(g_mutex);
    g_events.clear();
    g_session_id.clear();
    g_started = false;
    g_initialized = false;
}
