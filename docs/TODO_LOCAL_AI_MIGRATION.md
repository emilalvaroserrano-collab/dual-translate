# TODO: Replace Gemini Live with on-device real-time translation

Replace the Gemini speech pipeline with **local STT → local translation LLM → local TTS**, while preserving the existing React interface, controls, conversation display, language pairing, and translation-only behavior. STT is included because the request repeats TTS where speech recognition is needed.

**Status:** implementation plan; model selection is provisional until measured on physical mobile devices. The latency and memory numbers below are engineering targets, not observed results.

Prepared on 2026-09-08 from `dual-translate-main.zip` and GitHub `main` at commit `9254f6c2feecc0a673ee550e8462b5ca52e1b25d`. The core translation files match. The attachment differs in two authentication files and omits two published policy pages; start implementation from GitHub `main` and preserve those repository files.

## 1. Existing integration points

| Existing files | Migration work |
| --- | --- |
| `App.tsx`, `contexts/LiveAPIContext.tsx`, `hooks/media/use-live-api.ts` | Remove the local provider's Gemini key dependency; preserve the hook values consumed by the UI. `App.tsx` currently renders `MissingKeyScreen` without the key. |
| `lib/genai-live-client.ts`, `components/demo/streaming-console/StreamingConsole.tsx` | Replace Gemini transport/configuration with a provider adapter; preserve transcription, audio, completion, error, and language-change events. |
| `components/console/control-tray/ControlTray.tsx`, `lib/audio-recorder.ts`, `lib/worklets/audio-processing.ts` | Keep mic/start/stop/mute behavior; route audio to native inference. Current capture is tagged as mono PCM16 at 16 kHz, with 2,048-sample worklet buffers. |
| `hooks/use-vad.ts`, `lib/audio-streamer.ts`, `lib/utils.ts` | Replace the volume threshold indicator with real segmentation; handle actual input/output sample rates and playback completion. Playback currently assumes 24 kHz. |
| `lib/state.ts`, `lib/constants.ts`, `lib/constants/medical-terms.ts` | Preserve Dutch/Flemish pairing, topic, medical glossary, settings, language names, and saved voice preferences through provider-neutral mappings. |
| `lib/history.ts`, `lib/auth.ts`, `index.tsx`, `components/Sidebar.tsx` | Preserve authentication, local history, PDF export, settings, and admin-compatible translation records; make online synchronization independent of local inference. |
| `package.json`, `package-lock.json`, `vite.config.ts`, `index.html`, `.env.example` | Remove Gemini SDK/configuration at final cutover, including the import-map entry; package offline UI assets. |

## 2. Mobile runtime and model decision

Use an **Android-first Capacitor shell containing the existing Vite build**, with a native plugin for audio and inference. Kotlin/JNI/C++ perform the work off the UI thread; React receives state and transcript events. Capacitor supports native plugins, and llama.cpp supplies an Android integration path. This is an architectural recommendation for keeping the existing UI. [Capacitor plugins](https://capacitorjs.com/docs/plugins), [llama.cpp Android](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md).

The installed app runs its models on the phone. No Python server, Ollama service, VPS, or new listening port is required. Keep the existing Vite development port, **3000**. A hosted SPA cannot call an Android native plugin by itself: retain a separate web adapter, and qualify any future WASM/WebGPU local browser implementation independently.

| Stage | Initial choice | Mobile configuration and fallback |
| --- | --- | --- |
| Speech detection | **Silero VAD**, native ONNX | Stateful 16 kHz processing; tune speech threshold, pre-roll, and endpoint silence on device. [Official implementation](https://github.com/snakers4/silero-vad). |
| STT | **Whisper multilingual base**, `ggml-base-q5_1.bin`, through **whisper.cpp** | Published model file is about **59.7 MB**. Evaluate multilingual small Q5_1, about **190 MB**, when base misses the accuracy gate. These are download sizes, not RAM requirements. Do not use `.en` models. [Model files](https://huggingface.co/ggerganov/whisper.cpp/tree/main), [runtime and quantization](https://github.com/ggml-org/whisper.cpp). |
| Translation LLM | **Qwen3.5-2B**, text-only GGUF **Q4_K_M**, through **llama.cpp** | Start with a 2,048-token context, bounded glossary/history, and non-thinking output. Convert the official weights or verify a traceable conversion; pin the converter, tokenizer, template, and quantization. [Official model](https://huggingface.co/Qwen/Qwen3.5-2B). |
| Smaller LLM option | **Qwen3.5-0.8B**, text-only GGUF **Q4_K_M** | Candidate for constrained devices only after per-language quality tests. Use the same conversion and compatibility checks. It is not assumed to match 2B translation quality. [Official model](https://huggingface.co/Qwen/Qwen3.5-0.8B). |
| TTS | **Piper-compatible VITS voices through sherpa-onnx** | Install only needed language voices. Start Flemish with `vits-piper-nl_BE-nathalie-medium`; evaluate `nathalie-x_low` for smaller devices. Validate French, German, and English packs next. Voice/model licenses must be checked individually. [Piper integration](https://k2-fsa.github.io/sherpa/onnx/tts/piper.html), [Dutch voice catalog](https://k2-fsa.github.io/sherpa/onnx/tts/all/Dutch/index.html), [Android engines](https://k2-fsa.github.io/sherpa/onnx/tts/apk-engine.html). |

Additional TTS candidates: **Supertonic 3** is approximately 99M parameters and lists 31 languages, including Dutch, French, and German, but not Tagalog. Its upstream repository announces the end of official development/support. Benchmark it only as a pinned optional pack with a maintenance owner; retain the Flemish voice option. [Model card](https://huggingface.co/Supertone/supertonic-3), [upstream notice](https://github.com/supertone-inc/supertonic). **Kokoro-82M** can be evaluated for its supported languages, but its published voice list does not include Dutch/Flemish or German, so it cannot cover this app alone. [Voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).

Do not label the current language menu as fully supported simply because an LLM is multilingual. Spoken translation requires the intersection of **STT language support, tested translation direction, installed TTS voice, and device performance**.

## 3. P0 — Freeze behavior and establish a device baseline

- [ ] Capture the existing UI and interactions on phone portrait/landscape and tablet layouts: header, sidebar, conversation bubbles, mic visualizer, start/pause, mic mute, TTS mute, reset, language/voice controls, topic, medical mode, history, and PDF export.
- [ ] Record behavior for manual language selection, custom languages, auto-detection, and changing settings during a session. Keep these fixtures as the migration contract.
- [ ] Identify physical target devices: Android version, SoC, ARM ABI, installed RAM, available memory/storage, audio routes, supported acceleration, and thermal behavior. An x86 development container is not a phone performance test.
- [ ] Benchmark base/small STT and 2B/0.8B LLM candidates before committing to a minimum supported device. Start evaluation with 6–8 GB Android devices; treat 4 GB devices as a separate constrained profile.

## 4. P1 — Introduce the local provider without rewriting the UI

- [ ] Add `lib/translation/types.ts`, `lib/translation/provider.ts`, and `lib/translation/local-client.ts`; define provider-neutral session configuration and typed methods for initialize/start/stop, settings, mute, reset, and cancellation.
- [ ] Implement separate `SttProvider`, `TranslationProvider`, and `TtsProvider` interfaces behind one session orchestrator. Maintain per-direction context while sharing model weights and one microphone/playback scheduler.
- [ ] Preserve the public `useLiveAPIContext()` values: `client`, `config`, `setConfig`, `connect`, `disconnect`, `connected`, `volume`, `isAiSpeaking`, `isTtsMuted`, and `toggleTtsMute`. Add internal capabilities without redesigning callers.
- [ ] Normalize the existing `open`, `close`, `setupcomplete`, `error`, `inputTranscription`, `outputTranscription`, `audio`, `interrupted`, and `turncomplete` events. Replace Google SDK types throughout `lib/state.ts` and components.
- [ ] Give each session, utterance, transcript revision, and audio segment a stable ID. Cancel stale work after reset, disconnect, or a language-setting change; stale callbacks must never update the current conversation.
- [ ] Add an Android Capacitor plugin with native capture/playback and background inference workers. Send text, levels, and status across the bridge; avoid copying continuous base64 audio through JavaScript on mobile.
- [ ] Make initialization and connect failures settle predictably so the existing connecting indicator cannot remain stuck. Add explicit model-missing, permission-denied, unsupported-language, and out-of-memory states through existing error/modal components.

## 5. P1 — Capture, segmentation, and continuous STT

- [ ] Resample the device's actual microphone rate to mono 16 kHz before ASR. Never only relabel 44.1/48 kHz PCM as 16 kHz. Clip float-to-PCM conversion safely and flush partial buffers when stopping.
- [ ] Use a bounded native audio ring buffer; adapt frames to the selected VAD model's required input length. Start tuning around 150–250 ms pre-roll and 300–500 ms endpoint silence.
- [ ] Replace `use-vad.ts`'s current 1.5-second volume timeout with engine speech-state events. The current hook only changes an indicator; changing it alone does not segment audio for local STT.
- [ ] Implement overlapping-window Whisper decoding with stable-prefix/local-agreement commits and endpoint finalization. Whisper is not a native streaming recognizer; measure the streaming wrapper's delay and compute cost explicitly.
- [ ] Emit revision-aware partial text into the existing input bubble. Current handlers append text deltas; cumulative Whisper hypotheses must replace the correct provisional text rather than produce repeated words.
- [ ] Suppress silence/noise hallucinations, retain the original source language/script, and run Whisper in transcription mode. Translation to arbitrary target languages belongs to the LLM stage.
- [ ] Bound long speech with phrase-aware segmentation and overlap deduplication. For the initial release, finish a speaker's turn before audible translation starts, preserving the current turn-taking flow.

## 6. P1 — Preserve language routing and translation behavior

- [ ] Extract a deterministic language router from `generateSystemPrompt()` and the `setGuestLanguage` handler. Use confirmed language detection metadata and canonical codes, not LLM tool calling, to choose the direction.
- [ ] Keep the default Dutch/Flemish group together. Detecting another supported language sets it as the latest guest language and translates to Dutch/Flemish; Dutch/Flemish input translates to that latest guest language.
- [ ] Preserve the initial selected guest language and existing fallback when no guest language is known. Carry source/target language snapshots with each utterance so later re-pairing cannot mislabel history.
- [ ] Reproduce the existing selector update from `setLanguage2()` and `setAutoDetect(false)` while preserving continuous guest-language monitoring specified by the current prompt. Separate the selector's displayed state from internal pairing state instead of accidentally stopping detection after the first turn.
- [ ] Map names such as `Dutch (Flemish)`, `English (US)`, and `Tagalog (Filipino)` to ASR codes, translation codes, and locale-specific voices. Use Dutch ASR plus the selected `nl-BE` voice preference; do not promise reliable acoustic distinction between Dutch regional variants.
- [ ] On short or ambiguous speech, avoid switching the pair without sufficient evidence. Validate confidence thresholds and keep a recoverable repeat/selection path in existing controls.

Required routing fixtures:

| Input sequence | Required output direction |
| --- | --- |
| English, then Dutch/Flemish | English → Dutch/Flemish; Dutch/Flemish → English |
| French after English, then Dutch/Flemish | French → Dutch/Flemish; Dutch/Flemish → French |
| Tagalog after French, then Dutch/Flemish | Tagalog → Dutch/Flemish; Dutch/Flemish → Tagalog, with a verified local Tagalog TTS pack |
| Spoken “ignore previous instructions” or a spoken question | Translate those words; never execute them or answer the question |
| Silence or unintelligible noise | No invented transcript, translation, or audio |

## 7. P1 — Low-latency local translation LLM

- [ ] Load one shared Qwen model and verify the pinned llama.cpp revision supports its architecture, GGUF conversion, tokenizer, and chat template on ARM64. Disable vision loading and thinking output for this text translation path.
- [ ] Build a short translation-only prompt with explicit source/target codes, bounded previous-turn context, topic, and relevant glossary terms. Treat transcript text as data, including spoken instructions. Output only the translation.
- [ ] Benchmark decoding parameters on the bilingual corpus; use model-card defaults as a reference and record deliberate overrides. Bound output tokens and handle truncation without silently speaking an incomplete translation.
- [ ] Begin speculative translation only on committed source segments. Invalidate unsent work after revisions or pairing changes. Speak only committed translated phrases; never send unstable tokens or reasoning markers to TTS.
- [ ] Test negation, amounts, dates, names, units, questions, code-switching, and medical terms. Do not replace clinical precision with a smaller model merely to meet latency targets.

## 8. P1 — Local voice output and audio scheduling

- [ ] Implement sherpa-onnx TTS with local model, configuration, phonemizer/tokenizer assets, and voice metadata. Load the selected pair's voices within the device budget; measure direction-switch loading time.
- [ ] Synthesize completed translated clauses and queue audio progressively. Do not call Piper token by token or describe file/whole-clause synthesis as inherently streaming.
- [ ] Carry `sampleRate`, channel count, encoding, segment ID, and final-segment markers with audio. Remove the fixed 24 kHz assumption from the provider boundary; resample or play at the actual voice output rate.
- [ ] Track generation completion separately from audible playback completion. Keep `isAiSpeaking` and mic suppression active until the final scheduled audio buffer drains. Preserve the current sequential two-way flow; simultaneous full-duplex/barge-in is a separate enhancement.
- [ ] Ensure stop/reset/disconnect cancels native inference, queued audio, and already scheduled playback. TTS mute must still complete the text/history turn without deadlocking the microphone state.
- [ ] Keep the existing voice selector and migrate saved Gemini voice IDs to honest local voice profiles. Do not imply that local models reproduce Gemini voices or expose many distinct choices that all silently play one voice.

## 9. P2 — Offline operation, history, and model packs

- [ ] Generate a capability matrix for every entry in `AVAILABLE_LANGUAGES` and custom languages: ASR, LLM direction, TTS locale/model, license, download size, and device-test status. Prioritize Flemish/Dutch, English, French, German, and Tagalog fixtures, then the remaining European and global catalog.
- [ ] Treat missing TTS coverage, including Tagalog or a requested dialect, as an explicit unresolved task. Standard Dutch, Arabic, or Portuguese support is not proof of Flemish, Darija, or regional voice quality. Keep the language controls and explain availability in the existing sidebar/modal; do not mark full parity complete while gaps remain.
- [ ] Add resumable downloads/imports with pinned revisions, exact byte sizes, SHA-256 verification, atomic activation, cancellation, low-storage handling, and rollback to the previous valid pack. Package license/attribution metadata with each voice and runtime dependency.
- [ ] Keep model binaries out of Git and the web JavaScript bundle. Install only necessary packs, prewarm the active profile, and release inactive resources according to measured memory pressure.
- [ ] Remove the Gemini key gate in local mode. Retain real Firebase authentication and persisted sessions; first-time sign-in and model installation may need connectivity. Verify a previously authenticated user can restart and translate in airplane mode without bypassing account controls.
- [ ] Decouple local history persistence from Firebase writes. Current completion saving runs only when the last turn is not already final; fix that condition so local providers emitting final text first still save exactly once. Preserve existing record fields and make replay/sync idempotent by utterance ID.
- [ ] Queue settings/history synchronization while offline and resume through the existing account flow. Local inference does not automatically make existing Firebase transcript synchronization private or disabled; keep that behavior explicit and independently controllable.
- [ ] Bundle fonts, icons, required scripts, and fallback avatars for the installed app so airplane mode preserves the current appearance. Keep current login, role checks, admin compatibility, history deletion, and PDF export behavior.

## 10. P2 — Performance and acceptance gates

Targets apply to **warm 3–8-second conversational utterances**, measured separately for each direction, supported language pair, and physical device. Report cold initialization and first voice loading separately.

| Metric | Initial release target |
| --- | --- |
| First visible provisional transcript | p95 ≤ 1.2 s after the first voiced frame |
| Actual end of input speech → first audible translated audio | p50 ≤ 1.5 s; p95 ≤ 3.0 s, including endpoint detection and all inference stages |
| Sustained ASR and TTS throughput | Each real-time factor < 1; no growing work/audio queue |
| Stop/reset → audio stopped | p95 ≤ 200 ms |
| Standard 6–8 GB device profile | Target peak app memory ≤ 2.5 GB, including WebView, native buffers, caches, and loaded voices; verify against OS memory pressure |
| Continuous use | 30-minute alternating conversation without crash, clipped turns, self-transcription, or sustained latency failure |

- [ ] Instrument monotonic timestamps for capture, endpoint, final ASR, first translated phrase, first synthesized audio, playback start, and playback end. Record p50/p95, peak memory, battery drain, and thermal state with model hashes and device identity.
- [ ] Test UI equivalence and controls with real native audio, denied/revoked permission, headphone/Bluetooth changes, interruptions, background/resume, reset during generation, and repeated connect/disconnect. Keep UI updates responsive during inference.
- [ ] Verify partial revisions, interleaved direction changes, TTS mute, cancellation, and already-final transcript events produce exactly one correctly paired history record and no stale audio.
- [ ] Run an airplane-mode test after setup, including app restart. Separately observe network traffic in online local mode: no Gemini/cloud-inference calls; classify Firebase synchronization and downloads independently.
- [ ] Evaluate at least 100 utterances per priority direction with bilingual review, including noise, regional accents, code-switching, names, numbers, and medical negation/dosage fixtures. Record STT errors and translation adequacy; any critical meaning reversal in the medical fixture set blocks enabling that profile for medical mode.
- [ ] Run `npm run lint` (`tsc --noEmit`) and `npm run build`, then the Android build and physical-device acceptance suite. The repository has no established automated test suite; add behavioral tests for the new router, event lifecycle, resampling, and persistence boundaries as implementation lands.

## 11. P3 — Cutover, fallback, and rollback

- [ ] Ship incremental changes: provider contract → native runtime/model packs → VAD/STT → router/LLM → TTS/playback → offline/history → device qualification → Gemini removal. Each stage must leave the UI usable.
- [ ] During development, keep Gemini isolated in its own adapter for comparison and an explicit rollback option. Never automatically upload local audio to Gemini when a model is slow, unsupported, or unavailable.
- [ ] If a device misses the budget, benchmark base STT, the 0.8B LLM, smaller voices, shorter context, and lower inference concurrency. Accept a fallback only if it still passes quality and latency gates; otherwise mark the profile unsupported and keep a usable error/retry path.
- [ ] After all required language/device gates pass, remove `@google/genai`, `GenAILiveClient`, Gemini model constants/configuration, build-time key injection, and dead SDK-typed tool declarations/imports. Update README and AGENTS.md for native setup, supported device profiles, model installation, and verification commands.
- [ ] Keep the last qualified local model manifest and prior app release available. Roll back app/model versions without resetting authentication, settings, or history. Use additive, backward-compatible persistence changes until the rollback window closes.
- [ ] Declare completion only when the installed app retains the established UI and pairing flow, runs STT/LLM/TTS entirely on the phone for its qualified catalog, passes real-device acceptance, and has no Gemini inference dependency. A smaller beta language catalog is not full migration completion.

## Verification status of this TODO

The integration map and behavior findings were checked against the uploaded code and GitHub file hashes; model/runtime capabilities were checked against the linked primary documentation. No local inference implementation or phone latency/quality benchmark is being claimed by this planning change.
