# Flutter Translator Edge

Android-first Flutter port of `dual-translate`, preserving the existing translation-only UI/behavior while moving inference behind a provider-neutral **on-device STT -> translation LLM -> TTS** runtime.

Baseline behavior was taken from GitHub `main` commit `9254f6c2feecc0a673ee550e8462b5ca52e1b25d`.

## What is implemented now

### Flutter layer

- Mobile-first conversation UI with Input / Translation turns.
- Start/stop, mic mute, TTS mute, reset, mic-level state.
- Staff/guest language settings and the existing language-name catalog.
- Dutch/Flemish <-> latest guest language routing contract.
- Continuous guest-language monitoring independent of the displayed selector.
- Medical/general mode and topic/voice settings.
- Revision-aware partial transcript replacement for cumulative Whisper hypotheses.
- Stable utterance IDs and exactly-once in-memory history insertion.
- No Gemini key and no automatic cloud inference fallback.

### Android native boundary

- Real runtime capability inspection instead of a hardcoded flag.
- Runtime microphone permission flow.
- Dedicated background worker for model verification/init/control.
- Stable native session IDs and stale-event filtering.
- JNI library loader with ABI/build capability reporting.
- Model manifest validation with path traversal protection and SHA-256 verification before activation.
- CMake/JNI contract library that compiles as an honest stub until the complete local pipeline is wired.
- Pinned native source baselines and a fetch script; model weights remain outside Git.
- GitHub Actions workflow for Flutter analysis/tests and Android debug APK build.

## Truthful current limitation

The JNI contract is **not yet the actual inference implementation**. `pipelineReady` remains false until Silero VAD, whisper.cpp, llama.cpp/Qwen, sherpa-onnx TTS, native capture/playback, cancellation, and event emission are linked and tested together. The app therefore refuses to advertise a ready local runtime rather than silently falling back to Gemini/cloud inference.

## Native source pins reviewed 2026-09-08

See `native/versions.env`:

- whisper.cpp `v1.9.3`
- llama.cpp `b10837`
- sherpa-onnx `v1.13.7`
- Silero VAD `v6.2.1`

These are source baselines only; pinning them is not a device-qualification claim.

## Bootstrap

```bash
cd flutter-translator-edge
./tool/bootstrap_android.sh
```

To also produce a debug APK:

```bash
EDGE_BUILD_APK=1 ./tool/bootstrap_android.sh
```

To fetch pinned native source trees without model weights:

```bash
./tool/fetch_native_deps.sh
```

The bootstrap generates the standard Flutter Android shell, copies the committed Kotlin/C++ bridge, enables the CMake JNI contract, then runs:

```bash
flutter pub get
flutter analyze
flutter test
```

## Model pack layout

Installed models live in the Android app's private files directory:

```text
files/models/
  manifest.json
  vad/...
  stt/...
  llm/...
  tts/...
```

Start from `native/model-manifest.example.json`, replace each placeholder SHA with the exact SHA-256 of the installed file, and keep paths relative to the model root. Initialization refuses unsafe paths, missing stages, missing files, malformed hashes, and hash mismatches.

Required initial stages are `vad`, `stt`, `llm`, and `tts`.

## Intended qualified profile

| Stage | Initial target |
| --- | --- |
| VAD | Silero VAD, stateful 16 kHz ONNX segmentation |
| STT | whisper.cpp multilingual base `ggml-base-q5_1.bin` |
| Translation | llama.cpp + Qwen3.5-2B text-only GGUF Q4_K_M |
| Constrained LLM fallback | Qwen3.5-0.8B only after quality gates |
| TTS | sherpa-onnx + Piper-compatible installed locale voices; Flemish starts with `nl_BE-nathalie-medium` |

## Next implementation block

1. Link Silero VAD and real microphone capture/resampling.
2. Add whisper.cpp overlapping-window decoding + stable-prefix commits.
3. Implement deterministic language routing from confirmed ASR metadata.
4. Link llama.cpp/Qwen translation-only decoding with bounded glossary/context.
5. Link sherpa-onnx TTS + sample-rate-aware AudioTrack scheduling.
6. Make reset/disconnect cancel native work and queued playback within the acceptance target.
7. Persist history/settings offline, then add idempotent Firebase sync separately from inference.
8. Restore Firebase authentication, PDF export, profile/admin parity, local assets, and model-pack UI.
9. Run physical ARM64 acceptance; do not mark the runtime complete before measured latency/memory/quality gates pass.

See `LOCAL_RUNTIME.md` for the control/event ABI and acceptance contract.
