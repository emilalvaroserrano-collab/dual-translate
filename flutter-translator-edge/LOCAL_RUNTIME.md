# Local runtime contract

The Flutter layer is transport-neutral. Android owns microphone permission, model validation, audio capture, VAD, ASR, deterministic routing, LLM inference, TTS, playback, cancellation, and stale-work invalidation.

## Flutter control channel

`ai.eburon.flutter_translator_edge/control`

Methods:

- `capabilities`
- `initialize(settings)`
- `start(settings)`
- `stop()`
- `reset()`
- `updateSettings(settings)`
- `setMicMuted({muted})`
- `setTtsMuted({muted})`

There is no cloud fallback method.

`capabilities` reports separately:

- JNI library loaded
- native ABI version/revision
- pipeline compiled/implemented
- required model files present
- model profile
- explicit readiness issues

SHA-256 verification is performed during initialization before activation, not hidden behind a capability label.

## Flutter event channel

`ai.eburon.flutter_translator_edge/events`

Session-scoped events must carry the current `sessionId`; utterance events also carry a stable `utteranceId`.

Supported `type` values:

- `input_partial`
- `input_final`
- `translation_partial`
- `translation_final`
- `guest_language_changed`
- `mic_level`
- `audio_started`
- `audio_ended`
- `interrupted`
- `turn_complete`
- `state`
- `error`

Partial transcripts/translations are cumulative revisions. Flutter replaces provisional text for the same utterance ID instead of appending deltas.

## JNI contract

Android loads `libedge_translator.so` through `EdgeNativeBridge`.

Current ABI version: **2**.

The contract exposes:

- build info / feature readiness
- initialize with model root + verified manifest + settings JSON
- start with a generated session ID
- stop/reset/update/mute controls
- event draining
- shutdown

`NativeTranslatorRuntime` polls the native event queue and drops stale session-scoped events before they can update Flutter.

The committed C++ implementation is intentionally a contract stub. `EDGE_PIPELINE_IMPLEMENTED` defaults to OFF, so simply compiling the JNI library cannot falsely advertise working local inference.

## Model activation rules

Model root: app-private `files/models/`.

Required manifest schema: `schemaVersion: 1`.

Required initial stages:

- `vad`
- `stt`
- `llm`
- `tts`

Each required entry must point to a file inside the model root and include its exact 64-hex SHA-256. Canonical path checks reject traversal outside the model directory. Model hashes are checked on the background runtime worker before native initialization.

## Initial native pipeline target

1. Capture microphone at the real Android input format/sample rate.
2. Resample safely to mono 16 kHz for ASR/VAD.
3. Stateful Silero VAD with bounded pre-roll and endpoint silence.
4. whisper.cpp multilingual decoding with revision-safe partials and endpoint finalization.
5. Determine source language and route Dutch/Flemish <-> latest confirmed guest language deterministically.
6. llama.cpp + Qwen text-only translation prompt; spoken commands/questions remain source data, never executable instructions.
7. sherpa-onnx local TTS using the installed target-locale voice.
8. Queue audio with explicit sample rate/channels/segment IDs.
9. Emit `audio_ended` only when final audible playback drains.
10. Reset/disconnect invalidates work and prevents stale callbacks/audio.

## Source baselines

`native/versions.env` pins the reviewed source baselines. `tool/fetch_native_deps.sh` places them under `native/third_party/`, which is gitignored. No model weights are fetched or committed by that script.

## Acceptance before `pipelineReady=true`

- Build and run on physical ARM64 Android, not only emulator/container.
- First visible provisional transcript target: p95 <= 1.2 s after first voiced frame.
- Speech end -> first audible translated audio target: p50 <= 1.5 s; p95 <= 3.0 s.
- ASR and TTS sustained RTF < 1 without queue growth.
- Stop/reset -> audible audio stopped target: p95 <= 200 ms.
- 30-minute alternating conversation without crash, self-transcription, clipped turns, or sustained thermal latency failure.
- At least 100 reviewed utterances per priority direction for Dutch/Flemish, English, French, German, and Tagalog when a verified Tagalog TTS pack exists.
- Any critical medical meaning reversal blocks enabling that profile for medical mode.

Do not set `EDGE_PIPELINE_IMPLEMENTED=ON` or advertise `pipelineReady=true` until those implementation and qualification conditions are actually met.
