package ai.eburon.flutter_translator_edge

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class ModelPackManager(context: Context) {
    private val modelRoot = File(context.filesDir, "models")
    private val manifestFile = File(modelRoot, "manifest.json")
    private val requiredStages = setOf("vad", "stt", "llm", "tts")

    data class Status(
        val manifestPresent: Boolean,
        val requiredPresent: Boolean,
        val hashesVerified: Boolean,
        val profile: String,
        val issues: List<String>,
    ) {
        val readyForInitialization: Boolean
            get() = manifestPresent && requiredPresent && hashesVerified && issues.isEmpty()
    }

    fun rootPath(): String = modelRoot.absolutePath

    fun manifestJson(): String = if (manifestFile.isFile) manifestFile.readText() else "{}"

    fun inspect(verifyHashes: Boolean): Status {
        if (!manifestFile.isFile) {
            return Status(
                manifestPresent = false,
                requiredPresent = false,
                hashesVerified = false,
                profile = "none",
                issues = listOf("Missing ${manifestFile.absolutePath}"),
            )
        }

        val issues = mutableListOf<String>()
        val json = try {
            JSONObject(manifestFile.readText())
        } catch (failure: Throwable) {
            return Status(
                manifestPresent = true,
                requiredPresent = false,
                hashesVerified = false,
                profile = "invalid",
                issues = listOf("Invalid model manifest: ${failure.message}"),
            )
        }

        if (json.optInt("schemaVersion", -1) != 1) {
            issues += "Unsupported model manifest schemaVersion; expected 1."
        }

        val profile = json.optString("profile", "default")
        val models = json.optJSONArray("models")
        if (models == null) {
            issues += "Model manifest has no models array."
            return Status(true, false, false, profile, issues)
        }

        val stagesFound = mutableSetOf<String>()
        var allHashesVerified = verifyHashes
        for (index in 0 until models.length()) {
            val entry = models.optJSONObject(index) ?: continue
            val required = entry.optBoolean("required", true)
            if (!required) continue

            val stage = entry.optString("stage", "").trim().lowercase()
            val relativePath = entry.optString("file", "").trim()
            val expectedSha = entry.optString("sha256", "").trim().lowercase()
            if (stage.isEmpty() || relativePath.isEmpty()) {
                issues += "Required model entry #$index is missing stage/file."
                continue
            }
            stagesFound += stage

            val file = safeResolve(relativePath)
            if (file == null) {
                issues += "Unsafe model path rejected: $relativePath"
                continue
            }
            if (!file.isFile) {
                issues += "Missing $stage model: $relativePath"
                continue
            }

            if (verifyHashes) {
                if (!expectedSha.matches(Regex("^[0-9a-f]{64}$"))) {
                    allHashesVerified = false
                    issues += "Missing/invalid SHA-256 for $stage model: $relativePath"
                } else {
                    val actual = sha256(file)
                    if (actual != expectedSha) {
                        allHashesVerified = false
                        issues += "SHA-256 mismatch for $stage model: $relativePath"
                    }
                }
            } else {
                allHashesVerified = false
            }
        }

        val missingStages = requiredStages - stagesFound
        if (missingStages.isNotEmpty()) {
            issues += "Missing required stages: ${missingStages.sorted().joinToString(", ")}"
        }

        val requiredPresent = missingStages.isEmpty() && issues.none {
            it.startsWith("Missing ") || it.startsWith("Unsafe ") || it.contains("missing stage/file")
        }
        return Status(
            manifestPresent = true,
            requiredPresent = requiredPresent,
            hashesVerified = allHashesVerified && issues.none { it.contains("SHA-256") },
            profile = profile,
            issues = issues,
        )
    }

    private fun safeResolve(relativePath: String): File? {
        return try {
            val root = modelRoot.canonicalFile
            val child = File(root, relativePath).canonicalFile
            if (child.path == root.path || !child.path.startsWith(root.path + File.separator)) null else child
        } catch (_: Throwable) {
            null
        }
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(1024 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
