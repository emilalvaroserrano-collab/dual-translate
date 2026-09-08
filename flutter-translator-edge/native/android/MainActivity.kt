package ai.eburon.flutter_translator_edge

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Native boundary for the on-device translator.
 *
 * This bootstrap intentionally exposes no cloud fallback and reports the local
 * runtime as unlinked until Silero VAD, whisper.cpp, llama.cpp and sherpa-onnx
 * are wired behind this contract.
 */
class MainActivity : FlutterActivity() {
    private val controlChannel = "ai.eburon.flutter_translator_edge/control"
    private val eventChannel = "ai.eburon.flutter_translator_edge/events"
    private var eventSink: EventChannel.EventSink? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            controlChannel,
        ).setMethodCallHandler(::handleControlCall)

        EventChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            eventChannel,
        ).setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                eventSink = events
            }

            override fun onCancel(arguments: Any?) {
                eventSink = null
            }
        })
    }

    private fun handleControlCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "capabilities" -> result.success(
                mapOf(
                    "localRuntimeLinked" to false,
                    "vad" to "Silero VAD / ONNX - pending JNI integration",
                    "stt" to "whisper.cpp multilingual base Q5_1 - pending JNI integration",
                    "llm" to "llama.cpp + Qwen3.5-2B Q4_K_M - pending JNI integration",
                    "tts" to "sherpa-onnx Piper-compatible voices - pending JNI integration",
                ),
            )

            "initialize", "start" -> result.error(
                "native_runtime_not_linked",
                "Local inference runtime is not linked. No Gemini/cloud fallback is permitted.",
                null,
            )

            "stop", "reset", "updateSettings", "setMicMuted", "setTtsMuted" -> {
                result.success(null)
            }

            else -> result.notImplemented()
        }
    }
}
