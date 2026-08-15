import { useEffect, useState, useRef } from 'react';
import { type AudioRecorder } from '../lib/audio-recorder';

export const useVAD = (audioRecorder: AudioRecorder, threshold: number = 0.05, duration: number = 1500) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const silenceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleVolume = (volume: number) => {
      // Basic VAD
      if (volume > threshold) {
        if (!isSpeaking) {
          setIsSpeaking(true);
        }
        if (silenceTimer.current) {
          clearTimeout(silenceTimer.current);
          silenceTimer.current = null;
        }
      } else {
        if (isSpeaking && !silenceTimer.current) {
          silenceTimer.current = setTimeout(() => {
            setIsSpeaking(false);
            silenceTimer.current = null;
          }, duration);
        }
      }
    };

    audioRecorder.on('volume', handleVolume);
    return () => {
      audioRecorder.off('volume', handleVolume);
      if (silenceTimer.current) {
        clearTimeout(silenceTimer.current);
      }
    };
  }, [audioRecorder, threshold, duration, isSpeaking]);

  return isSpeaking;
};
