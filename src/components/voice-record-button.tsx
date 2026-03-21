"use client";

import { useState, useRef, useCallback } from "react";

interface VoiceRecordButtonProps {
  onTranscript: (text: string) => void;
}

export function VoiceRecordButton({ onTranscript }: VoiceRecordButtonProps) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        setState("transcribing");

        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");

        try {
          const res = await fetch("/api/stt", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.text) {
            onTranscript(data.text);
          }
        } catch {
          // silent
        }

        setState("idle");
        setSeconds(0);
      };

      mediaRecorder.start(1000);
      setState("recording");
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setState("idle");
    }
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (state === "transcribing") {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border font-medium"
        style={{ borderColor: "#c084fc", color: "#7c3aed", backgroundColor: "#f8f0ff" }}
      >
        <span className="animate-spin">⏳</span> מתמלל...
      </button>
    );
  }

  if (state === "recording") {
    return (
      <button
        onClick={stopRecording}
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border font-medium animate-pulse"
        style={{ borderColor: "#dc2626", color: "#dc2626", backgroundColor: "#fef2f2" }}
      >
        🔴 {formatTime(seconds)} — לחץ לעצור
      </button>
    );
  }

  return (
    <button
      onClick={startRecording}
      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border font-medium transition-colors hover:bg-purple-50"
      style={{ borderColor: "#c084fc", color: "#7c3aed", backgroundColor: "#faf5ff" }}
    >
      🎙️ הקלט
    </button>
  );
}
