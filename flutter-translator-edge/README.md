# Flutter Translator Edge

Flutter port of the `dual-translate` interface and session behavior, created from GitHub `main` baseline `9254f6c2feecc0a673ee550e8462b5ca52e1b25d`.

## Current implementation status

This commit establishes the **Flutter application, translation state machine, deterministic language router, conversation/history UI, controls, settings drawer, full existing language-name catalog, Android platform-channel contract, and routing tests**.

It **does not claim that local inference is finished**. The Android bootstrap deliberately reports `localRuntimeLinked=false` until Silero VAD, whisper.cpp, llama.cpp/Qwen, and sherpa-onnx are actually integrated and measured on physical phones. Pressing Start therefore produces an explicit local-runtime error instead of silently calling Gemini or another cloud service.

No Gemini API key, Python server, Ollama daemon, VPS, or new listening port is required by this Flutter architecture.

## Behavioral contract carried over

- Input and Translation conversation blocks.
- Start/stop, mic mute, TTS mute, reset, mic-level visualization.
- Staff language + guest language controls.
- Latest guest language pairing with Dutch/Flemish.
- Continuous guest-language monitoring independent from the visible selector state.
- Medical/general mode and topic setting.
- Translation-only semantics are owned by the native local pipeline; spoken instructions/questions are data to translate, never commands to execute.
- Stable utterance IDs and exactly-once history insertion.
- Revision-aware partial transcript updates for Whisper-style cumulative hypotheses.
- No automatic cloud fallback.

## Bootstrap Android

The repository stores portable Flutter sources plus the Android native host template. Generate the standard Flutter Android shell on a machine with Flutter installed:

```bash
cd flutter-translator-edge
./tool/bootstrap_android.sh
```

The script runs `flutter create --platforms=android`, installs the committed `MainActivity.kt`/manifest, raises Android `minSdk` to 26 in the generated app, then runs:

```bash
flutter pub get
flutter analyze
flutter test
```

After the native runtimes are linked, run the physical-device suite and only then change the capabilities result to `localRuntimeLinked=true`.

## Intended native model profile

| Stage | Initial target |
| --- | --- |
| VAD | Silero VAD, native ONNX, 16 kHz stateful segmentation |
| STT | whisper.cpp multilingual base `ggml-base-q5_1.bin` |
| Translation | llama.cpp + Qwen3.5-2B text-only GGUF Q4_K_M; 0.8B only as qualified constrained fallback |
| TTS | sherpa-onnx with installed Piper-compatible locale voices; start with `nl_BE-nathalie-medium` |

Model binaries are intentionally not stored in Git.

## Directory map

- `lib/main.dart` - mobile-first translator UI matching the existing controls/layout semantics.
- `lib/translator_controller.dart` - provider-neutral session/event state machine and history dedupe.
- `lib/local_translation_engine.dart` - Flutter `MethodChannel` / `EventChannel` adapter.
- `lib/language_router.dart` - deterministic Dutch/Flemish/latest-guest direction logic.
- `lib/language_catalog.dart` - language labels carried over from the React app.
- `native/android/` - Android host templates; currently an explicit no-cloud runtime stub.
- `LOCAL_RUNTIME.md` - JNI/native event and acceptance contract.
- `test/language_router_test.dart` - required routing fixtures already encoded as tests.

## Known parity work still open

1. Link native Silero/whisper.cpp/llama.cpp/sherpa-onnx implementations and model-pack manager.
2. Reintroduce Firebase authentication/session persistence as an adapter independent from local inference, including airplane-mode restart behavior for previously authenticated users.
3. Persist history offline and queue idempotent Firebase synchronization by utterance ID.
4. Replace the temporary TSV clipboard history export with the existing PDF-equivalent Flutter exporter.
5. Port super-admin/profile details and remaining account/policy surfaces.
6. Package fonts/icons/avatar fallbacks locally.
7. Add runtime permission handling, Bluetooth/headset route tests, interruption/background/resume handling, and model download/hash/license UI.
8. Run device qualification. Do not call model selection or latency successful until measured on physical Android hardware.

## Verification note

The environment used to prepare this repository change had Git but **did not have Flutter or Dart installed**, so `flutter analyze`, `flutter test`, and Android compilation could not be executed here. The bootstrap script makes those checks mandatory on the first Flutter-capable workstation/CI runner. This change should therefore be treated as an implementation scaffold, not a verified native-inference release.
