"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";

interface VoicePlayButtonProps {
  text: string;
  size?: "sm" | "default";
  className?: string;
}

export function VoicePlayButton({ text, size = "sm", className = "" }: VoicePlayButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const generateAudio = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error("TTS failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      setAudioBlob(blob);
      setAudioUrl(url);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setState("idle");
      };

      audio.onerror = () => {
        setState("idle");
      };

      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  };

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If playing, stop
    if (state === "playing" && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState("idle");
      return;
    }

    // If we already have audio, replay it
    if (audioUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setState("playing");
      return;
    }

    // Generate new audio
    await generateAudio();
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioBlob) return;

    const downloadUrl = URL.createObjectURL(audioBlob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `ben-solomon-voice-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="inline-flex gap-1">
      <Button
        size={size}
        variant="outline"
        onClick={handlePlay}
        disabled={state === "loading"}
        className={className}
        style={
          state === "playing"
            ? { backgroundColor: "#fef3c7", borderColor: "#f59e0b", color: "#92400e" }
            : { borderColor: "#8b5cf6", color: "#8b5cf6" }
        }
      >
        {state === "loading" ? "⏳ מייצר..." : state === "playing" ? "⏸️ עצור" : "🔊 השמע בקול בן"}
      </Button>
      {audioBlob && (
        <Button
          size={size}
          variant="outline"
          onClick={handleDownload}
          className={className}
          style={{ borderColor: "#8b5cf6", color: "#8b5cf6" }}
        >
          ⬇️ הורד
        </Button>
      )}
    </div>
  );
}
