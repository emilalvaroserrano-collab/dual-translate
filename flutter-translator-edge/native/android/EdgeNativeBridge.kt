package ai.eburon.flutter_translator_edge

class EdgeNativeBridge {
    val libraryLoaded: Boolean
    val loadError: String?

    init {
        var loaded = false
        var error: String? = null
        try {
            System.loadLibrary("edge_translator")
            loaded = true
        } catch (failure: UnsatisfiedLinkError) {
            error = failure.message ?: failure.toString()
        } catch (failure: SecurityException) {
            error = failure.message ?: failure.toString()
        }
        libraryLoaded = loaded
        loadError = error
    }

    fun buildInfo(): NativeBuildInfo {
        if (!libraryLoaded) return NativeBuildInfo(revision = "library-not-loaded")
        return try {
            NativeBuildInfo.fromJson(nativeBuildInfoJson())
        } catch (_: Throwable) {
            NativeBuildInfo(revision = "invalid-build-info")
        }
    }

    fun initialize(modelRoot: String, manifestJson: String, settingsJson: String): String? {
        requireLoaded()
        return nativeInitialize(modelRoot, manifestJson, settingsJson)
    }

    fun start(sessionId: String, settingsJson: String): String? {
        requireLoaded()
        return nativeStart(sessionId, settingsJson)
    }

    fun stop() {
        if (libraryLoaded) nativeStop()
    }

    fun reset() {
        if (libraryLoaded) nativeReset()
    }

    fun updateSettings(settingsJson: String) {
        if (libraryLoaded) nativeUpdateSettings(settingsJson)
    }

    fun setMicMuted(muted: Boolean) {
        if (libraryLoaded) nativeSetMicMuted(muted)
    }

    fun setTtsMuted(muted: Boolean) {
        if (libraryLoaded) nativeSetTtsMuted(muted)
    }

    fun drainEvents(): List<Map<String, Any?>> {
        if (!libraryLoaded) return emptyList()
        return try {
            parseEventArray(nativeDrainEvents())
        } catch (_: Throwable) {
            emptyList()
        }
    }

    fun shutdown() {
        if (libraryLoaded) nativeShutdown()
    }

    private fun requireLoaded() {
        check(libraryLoaded) { "edge_translator JNI library is not loaded: ${loadError ?: "unknown error"}" }
    }

    private external fun nativeBuildInfoJson(): String
    private external fun nativeInitialize(
        modelRoot: String,
        manifestJson: String,
        settingsJson: String,
    ): String?
    private external fun nativeStart(sessionId: String, settingsJson: String): String?
    private external fun nativeStop()
    private external fun nativeReset()
    private external fun nativeUpdateSettings(settingsJson: String)
    private external fun nativeSetMicMuted(muted: Boolean)
    private external fun nativeSetTtsMuted(muted: Boolean)
    private external fun nativeDrainEvents(): String
    private external fun nativeShutdown()
}
