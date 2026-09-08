package ai.eburon.flutter_translator_edge

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process
import kotlin.math.sqrt

/**
 * Owns microphone capture on Android. Audio never crosses the Flutter bridge.
 *
 * The capture rate is selected from rates commonly exposed by Android audio
 * HALs. PCM remains at the actual selected rate until it reaches JNI, where the
 * native streaming resampler converts it to mono 16 kHz for VAD/ASR.
 */
class AudioCaptureEngine(
    private val onPcm: (ShortArray, Int, Long) -> Unit,
    private val onLevel: (Double) -> Unit,
    private val onError: (String, String) -> Unit,
) {
    private data class CaptureConfig(
        val sampleRate: Int,
        val bufferBytes: Int,
        val frameSamples: Int,
    )

    @Volatile private var running = false
    @Volatile private var muted = false
    @Volatile private var outputSuppressed = false
    @Volatile private var activeRecord: AudioRecord? = null
    private var captureThread: Thread? = null

    @Synchronized
    fun start(): RuntimeOutcome {
        if (running) {
            return RuntimeOutcome.success(
                mapOf("sampleRate" to (activeRecord?.sampleRate ?: 0)),
            )
        }

        val config = selectConfig()
            ?: return RuntimeOutcome.error(
                "audio_input_unsupported",
                "No supported mono PCM16 microphone capture rate was found.",
            )

        running = true
        val thread = Thread(
            { captureLoop(config) },
            "edge-audio-capture",
        )
        captureThread = thread
        thread.start()
        return RuntimeOutcome.success(
            mapOf(
                "sampleRate" to config.sampleRate,
                "encoding" to "pcm_s16le",
                "channels" to 1,
            ),
        )
    }

    @Synchronized
    fun stop() {
        if (!running && captureThread == null) return
        running = false
        try {
            activeRecord?.stop()
        } catch (_: IllegalStateException) {
        }

        val thread = captureThread
        if (thread != null && thread !== Thread.currentThread()) {
            try {
                thread.join(750)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
        captureThread = null
        onLevel(0.0)
    }

    fun setMuted(value: Boolean) {
        muted = value
        if (value) onLevel(0.0)
    }

    /** Prevents translated TTS from being fed back into ASR. */
    fun setOutputSuppressed(value: Boolean) {
        outputSuppressed = value
        if (value) onLevel(0.0)
    }

    private fun selectConfig(): CaptureConfig? {
        for (rate in intArrayOf(48_000, 44_100, 32_000, 16_000)) {
            val minimum = AudioRecord.getMinBufferSize(
                rate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
            if (minimum <= 0) continue

            // Keep enough native buffering for transient scheduler stalls while
            // emitting ~20 ms chunks to the inference pipeline.
            val frameSamples = maxOf(rate / 50, 320)
            val bufferBytes = maxOf(minimum * 2, frameSamples * 2 * 8)
            return CaptureConfig(
                sampleRate = rate,
                bufferBytes = bufferBytes,
                frameSamples = frameSamples,
            )
        }
        return null
    }

    private fun captureLoop(config: CaptureConfig) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        var record: AudioRecord? = null
        try {
            record = AudioRecord.Builder()
                .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(config.sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                        .build(),
                )
                .setBufferSizeInBytes(config.bufferBytes)
                .build()

            if (record.state != AudioRecord.STATE_INITIALIZED) {
                onError(
                    "audio_record_init_failed",
                    "AudioRecord could not initialize at ${config.sampleRate} Hz.",
                )
                return
            }

            activeRecord = record
            record.startRecording()
            if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                onError(
                    "audio_record_start_failed",
                    "Android microphone capture did not enter RECORDSTATE_RECORDING.",
                )
                return
            }

            val buffer = ShortArray(config.frameSamples)
            while (running) {
                val read = record.read(
                    buffer,
                    0,
                    buffer.size,
                    AudioRecord.READ_BLOCKING,
                )
                when {
                    read > 0 -> handleFrame(buffer, read, config.sampleRate)
                    read == AudioRecord.ERROR_DEAD_OBJECT -> {
                        onError(
                            "audio_device_lost",
                            "The Android audio input route was lost.",
                        )
                        break
                    }
                    read < 0 && running -> {
                        onError(
                            "audio_read_failed",
                            "AudioRecord.read failed with code $read.",
                        )
                        break
                    }
                }
            }
        } catch (failure: SecurityException) {
            onError(
                "microphone_permission_denied",
                failure.message ?: "Microphone permission was denied.",
            )
        } catch (failure: IllegalArgumentException) {
            onError(
                "audio_configuration_invalid",
                failure.message ?: "Android rejected the audio capture format.",
            )
        } catch (failure: IllegalStateException) {
            if (running) {
                onError(
                    "audio_capture_failed",
                    failure.message ?: "Android audio capture failed.",
                )
            }
        } finally {
            running = false
            activeRecord = null
            try {
                if (record?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                    record.stop()
                }
            } catch (_: IllegalStateException) {
            }
            record?.release()
            onLevel(0.0)
        }
    }

    private fun handleFrame(buffer: ShortArray, length: Int, sampleRate: Int) {
        if (muted || outputSuppressed) return

        var squareSum = 0.0
        for (index in 0 until length) {
            val normalized = buffer[index].toDouble() / Short.MAX_VALUE.toDouble()
            squareSum += normalized * normalized
        }
        val rms = sqrt(squareSum / length.toDouble()).coerceIn(0.0, 1.0)
        onLevel(rms)

        // AudioRecord reuses its read buffer, so make exactly one bounded copy
        // before JNI takes ownership of this frame.
        onPcm(
            buffer.copyOf(length),
            sampleRate,
            System.nanoTime(),
        )
    }
}
