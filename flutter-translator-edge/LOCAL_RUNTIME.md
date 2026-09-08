# Local runtime contract

The Flutter layer is intentionally transport-neutral. Android owns real-time audio capture, VAD, ASR, LLM inference, TTS, playback scheduling, and cancellation. Flutter receives only transcript/state/level events.

## Control channel

`ai.eburon.flutter_translator_edge/control`

Methods:

- `capabilities` -> runtime/model availability
- `initialize(settings)` -> load/warm active model profile
- `start(settings)` -> begin capture and translation session
- `stop()` -> cancel capture/inference and drain no stale callbacks
- `reset()` -> cancel current utterance and queued playback
- `updateSettings(settings)` -> provider-neutral language/topic/voice configuration
- `setMicMuted({muted})`
- `setTtsMuted({muted})`

There is no cloud fallback method.

## Event channel

`ai.eburon.flutter_translator_edge/events`

Every event should include stable `sessionId` and, where applicable, `utteranceId`.

Supported event `type` values:

- `input_partial` / `input_final`: `text`, `sourceLanguage`, `targetLanguage`
- `translation_partial` / `translation_final`: `text`, `sourceLanguage`, `targetLanguage`
- `guest_language_changed`: detected guest language in `sourceLanguage` or `targetLanguage`
- `mic_level`: normalized `level` in 0..1
- `audio_started` / `audio_ended`
- `interrupted`
- `turn_complete`
- `state`: human-readable `state`
- `error`: `message`

Partial text is a cumulative revision, not an append-only delta. Flutter replaces the provisional text for the same utterance ID, preventing duplicate Whisper words.

## Initial native pipeline

1. Native microphone capture at actual device sample rate.
2. Resample to mono 16 kHz.
3. Silero VAD with pre-roll and endpointing.
4. whisper.cpp multilingual base Q5_1 with overlapping-window stable-prefix commits.
5. Deterministic Dutch/Flemish <-> latest guest language routing.
6. llama.cpp running Qwen3.5-2B text-only Q4_K_M, bounded context, no thinking output.
7. sherpa-onnx Piper-compatible local voice pack.
8. Native audio scheduler tracks playback completion separately from generation completion.

The UI must not set `isAiSpeaking=false` until final audible playback drains. Reset/disconnect must invalidate stale session and utterance IDs before callbacks cross the channel.

## Required acceptance before enabling `localRuntimeLinked=true`

- Physical ARM64 Android measurements, not emulator/container assumptions.
- Warm speech-end -> first audible translation: p50 <= 1.5 s, p95 <= 3.0 s target.
- 30-minute alternating conversation without queue growth or self-transcription.
- Stop/reset -> audio stopped p95 <= 200 ms target.
- Priority bilingual review for Dutch/Flemish, English, French, German, Tagalog.
- Medical mode remains disabled for any profile with a critical meaning reversal in the safety fixture set.
