package ai.eburon.flutter_translator_edge

import android.Manifest
import android.content.pm.PackageManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val controlChannel = "ai.eburon.flutter_translator_edge/control"
    private val eventChannel = "ai.eburon.flutter_translator_edge/events"
    private val micPermissionRequestCode = 7401

    private var eventSink: EventChannel.EventSink? = null
    private lateinit var runtime: NativeTranslatorRuntime
    private var pendingStart: PendingStart? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        runtime = NativeTranslatorRuntime(applicationContext) { event ->
            runOnUiThread { eventSink?.success(event) }
        }

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
            "capabilities" -> result.success(runtime.capabilities())
            "initialize" -> runtime.initialize(settings(call)).completeOnUi(result)
            "start" -> startWithPermission(settings(call), result)
            "stop" -> runtime.stop().completeOnUi(result)
            "reset" -> runtime.reset().completeOnUi(result)
            "updateSettings" -> runtime.updateSettings(settings(call)).completeOnUi(result)
            "setMicMuted" -> runtime.setMicMuted(call.argument<Boolean>("muted") == true).completeOnUi(result)
            "setTtsMuted" -> runtime.setTtsMuted(call.argument<Boolean>("muted") == true).completeOnUi(result)
            else -> result.notImplemented()
        }
    }

    private fun startWithPermission(
        settings: Map<String, Any?>,
        result: MethodChannel.Result,
    ) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            runtime.start(settings).completeOnUi(result)
            return
        }

        if (pendingStart != null) {
            result.error(
                "permission_request_in_progress",
                "A microphone permission request is already in progress.",
                null,
            )
            return
        }

        pendingStart = PendingStart(settings, result)
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), micPermissionRequestCode)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != micPermissionRequestCode) return

        val pending = pendingStart ?: return
        pendingStart = null
        val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            pending.result.error(
                "microphone_permission_denied",
                "Microphone permission is required for on-device speech translation.",
                null,
            )
            return
        }
        runtime.start(pending.settings).completeOnUi(pending.result)
    }

    @Suppress("UNCHECKED_CAST")
    private fun settings(call: MethodCall): Map<String, Any?> =
        (call.arguments as? Map<String, Any?>) ?: emptyMap()

    private fun java.util.concurrent.CompletableFuture<RuntimeOutcome>.completeOnUi(
        result: MethodChannel.Result,
    ) {
        whenComplete { outcome, error ->
            runOnUiThread {
                when {
                    error != null -> result.error(
                        "native_runtime_failure",
                        error.message ?: error.toString(),
                        null,
                    )
                    outcome == null -> result.error(
                        "native_runtime_failure",
                        "Native runtime returned no outcome.",
                        null,
                    )
                    outcome.ok -> result.success(outcome.payload)
                    else -> result.error(outcome.code, outcome.message, outcome.payload)
                }
            }
        }
    }

    override fun onDestroy() {
        if (::runtime.isInitialized) runtime.close()
        super.onDestroy()
    }

    private data class PendingStart(
        val settings: Map<String, Any?>,
        val result: MethodChannel.Result,
    )
}
