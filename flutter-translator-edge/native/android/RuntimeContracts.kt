package ai.eburon.flutter_translator_edge

import org.json.JSONArray
import org.json.JSONObject

data class RuntimeOutcome(
    val ok: Boolean,
    val code: String = "ok",
    val message: String = "",
    val payload: Any? = null,
) {
    companion object {
        fun success(payload: Any? = null) = RuntimeOutcome(ok = true, payload = payload)
        fun error(code: String, message: String, payload: Any? = null) =
            RuntimeOutcome(ok = false, code = code, message = message, payload = payload)
    }
}

data class NativeBuildInfo(
    val abiVersion: Int = 0,
    val whisper: Boolean = false,
    val llama: Boolean = false,
    val sherpaOnnx: Boolean = false,
    val sileroVad: Boolean = false,
    val pipelineReady: Boolean = false,
    val revision: String = "unknown",
) {
    val allEnginesCompiled: Boolean
        get() = whisper && llama && sherpaOnnx && sileroVad

    companion object {
        fun fromJson(raw: String): NativeBuildInfo {
            val json = JSONObject(raw)
            return NativeBuildInfo(
                abiVersion = json.optInt("abiVersion", 0),
                whisper = json.optBoolean("whisper", false),
                llama = json.optBoolean("llama", false),
                sherpaOnnx = json.optBoolean("sherpaOnnx", false),
                sileroVad = json.optBoolean("sileroVad", false),
                pipelineReady = json.optBoolean("pipelineReady", false),
                revision = json.optString("revision", "unknown"),
            )
        }
    }
}

fun Map<String, Any?>.toJsonString(): String = JSONObject(this).toString()

fun parseEventArray(raw: String): List<Map<String, Any?>> {
    val array = JSONArray(raw)
    val events = ArrayList<Map<String, Any?>>(array.length())
    for (index in 0 until array.length()) {
        val item = array.optJSONObject(index) ?: continue
        val map = linkedMapOf<String, Any?>()
        for (key in item.keys()) {
            val value = item.opt(key)
            map[key] = if (value === JSONObject.NULL) null else value
        }
        events += map
    }
    return events
}
