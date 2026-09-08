package ai.eburon.flutter_translator_edge

import android.content.Context
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class NativeTranslatorRuntime(
    context: Context,
    private val emit: (Map<String, Any?>) -> Unit,
) {
    private val bridge = EdgeNativeBridge()
    private val models = ModelPackManager(context)
    private val worker = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "edge-translator-worker")
    }
    private val poller: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "edge-translator-events")
        }

    @Volatile private var initialized = false
    @Volatile private var currentSessionId: String? = null
    @Volatile private var currentSettings: Map<String, Any?> = emptyMap()

    private val capture = AudioCaptureEngine(
        onPcm = { samples, sampleRate, captureTimeNs ->
            bridge.pushPcm16(samples, sampleRate, captureTimeNs)
        },
        onLevel = { level ->
            val session = currentSessionId
            if (session != null) {
                emit(
                    mapOf(
                        "type" to "mic_level",
                        "sessionId" to session,
                        "level" to level,
                    ),
                )
            }
        },
        onError = { code, message ->
            emit(
                mapOf(
                    "type" to "error",
                    "sessionId" to currentSessionId,
                    "code" to code,
                    "message" to message,
                ),
            )
        },
    )

    init {
        poller.scheduleAtFixedRate(::drainNativeEvents, 25, 25, TimeUnit.MILLISECONDS)
    }

    fun capabilities(): Map<String, Any?> {
        val build = bridge.buildInfo()
        val pack = models.inspect(verifyHashes = false)
        val issues = mutableListOf<String>()
        if (!bridge.libraryLoaded) issues += "JNI library not loaded: ${bridge.loadError ?: "unknown error"}"
        if (!build.pipelineReady) issues += "Native STT/LLM/TTS/VAD pipeline is not compiled as ready."
        issues += pack.issues

        return mapOf(
            "localRuntimeLinked" to (
                bridge.libraryLoaded && build.pipelineReady && pack.requiredPresent
            ),
            "nativeLibraryLoaded" to bridge.libraryLoaded,
            "pipelineReady" to build.pipelineReady,
            "modelsPresent" to pack.requiredPresent,
            "modelsVerified" to false,
            "runtimeAbi" to build.abiVersion,
            "revision" to build.revision,
            "vad" to if (build.sileroVad) "Silero VAD linked" else "Silero VAD not linked",
            "stt" to if (build.whisper) "whisper.cpp linked" else "whisper.cpp not linked",
            "llm" to if (build.llama) "llama.cpp linked" else "llama.cpp not linked",
            "tts" to if (build.sherpaOnnx) "sherpa-onnx linked" else "sherpa-onnx not linked",
            "capture" to "Android AudioRecord PCM16 mono; native resampling boundary",
            "modelProfile" to pack.profile,
            "issues" to issues,
        )
    }

    fun initialize(settings: Map<String, Any?>): CompletableFuture<RuntimeOutcome> = submit {
        emitState("Verifying local model pack")
        val build = bridge.buildInfo()
        if (!bridge.libraryLoaded) {
            return@submit RuntimeOutcome.error(
                "native_library_missing",
                "edge_translator JNI library is not loaded. ${bridge.loadError ?: ""}".trim(),
            )
        }
        if (!build.pipelineReady) {
            return@submit RuntimeOutcome.error(
                "native_pipeline_not_ready",
                "Native pipeline is not yet complete; no cloud fallback is permitted.",
            )
        }

        val pack = models.inspect(verifyHashes = true)
        if (!pack.readyForInitialization) {
            return@submit RuntimeOutcome.error(
                "model_pack_invalid",
                pack.issues.joinToString("; ").ifBlank { "Required local model pack is invalid." },
                mapOf("issues" to pack.issues),
            )
        }

        val error = bridge.initialize(
            modelRoot = models.rootPath(),
            manifestJson = models.manifestJson(),
            settingsJson = settings.toJsonString(),
        )
        if (error != null) {
            return@submit RuntimeOutcome.error("native_initialize_failed", error)
        }
        currentSettings = settings.toMap()
        initialized = true
        emitState("Local models ready")
        RuntimeOutcome.success(mapOf("modelsVerified" to true))
    }

    fun start(settings: Map<String, Any?>): CompletableFuture<RuntimeOutcome> = submit {
        if (!initialized) {
            return@submit RuntimeOutcome.error(
                "runtime_not_initialized",
                "Call initialize before starting the local translation session.",
            )
        }
        val sessionId = UUID.randomUUID().toString()
        currentSessionId = sessionId
        currentSettings = settings.toMap()
        val nativeError = bridge.start(sessionId, settings.toJsonString())
        if (nativeError != null) {
            currentSessionId = null
            return@submit RuntimeOutcome.error("native_start_failed", nativeError)
        }

        val captureResult = capture.start()
        if (!captureResult.ok) {
            bridge.stop()
            currentSessionId = null
            return@submit captureResult
        }

        emitState("Streaming locally", sessionId)
        RuntimeOutcome.success(
            mapOf(
                "sessionId" to sessionId,
                "audio" to captureResult.payload,
            ),
        )
    }

    fun stop(): CompletableFuture<RuntimeOutcome> = submit {
        val oldSession = currentSessionId
        currentSessionId = null
        capture.stop()
        bridge.stop()
        emit(
            mapOf(
                "type" to "state",
                "sessionId" to oldSession,
                "state" to "Ready",
            ),
        )
        RuntimeOutcome.success()
    }

    fun reset(): CompletableFuture<RuntimeOutcome> = submit {
        bridge.reset()
        capture.setOutputSuppressed(false)
        emit(
            mapOf(
                "type" to "interrupted",
                "sessionId" to currentSessionId,
            ),
        )
        RuntimeOutcome.success()
    }

    fun updateSettings(settings: Map<String, Any?>): CompletableFuture<RuntimeOutcome> = submit {
        currentSettings = settings.toMap()
        bridge.updateSettings(settings.toJsonString())
        RuntimeOutcome.success()
    }

    fun setMicMuted(muted: Boolean): CompletableFuture<RuntimeOutcome> = submit {
        capture.setMuted(muted)
        bridge.setMicMuted(muted)
        RuntimeOutcome.success()
    }

    fun setTtsMuted(muted: Boolean): CompletableFuture<RuntimeOutcome> = submit {
        bridge.setTtsMuted(muted)
        RuntimeOutcome.success()
    }

    private fun drainNativeEvents() {
        val session = currentSessionId
        for (event in bridge.drainEvents()) {
            val eventSession = event["sessionId"]?.toString()
            val type = event["type"]?.toString()
            val sessionScoped = type !in setOf("error", "state")
            if (sessionScoped && (session == null || eventSession != session)) continue

            when (type) {
                "audio_started" -> capture.setOutputSuppressed(true)
                "audio_ended", "interrupted" -> capture.setOutputSuppressed(false)
            }
            emit(event)
        }
    }

    private fun emitState(state: String, sessionId: String? = currentSessionId) {
        emit(
            mapOf(
                "type" to "state",
                "sessionId" to sessionId,
                "state" to state,
            ),
        )
    }

    private fun submit(block: () -> RuntimeOutcome): CompletableFuture<RuntimeOutcome> {
        val future = CompletableFuture<RuntimeOutcome>()
        worker.execute {
            try {
                future.complete(block())
            } catch (failure: Throwable) {
                future.completeExceptionally(failure)
            }
        }
        return future
    }

    fun close() {
        currentSessionId = null
        capture.stop()
        try {
            bridge.stop()
            bridge.shutdown()
        } catch (_: Throwable) {
        }
        poller.shutdownNow()
        worker.shutdownNow()
    }
}
