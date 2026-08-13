"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RankedSoundCue = "drop" | "move" | "play" | "stop";
export type PlayRankedSound = (cue: RankedSoundCue) => void;

const STORAGE_KEY = "mranking:ranked-ui-volume:v1";
const DEFAULT_VOLUME = 0.22;
const MOVE_COOLDOWN_MS = 42;
const MAX_VOICES = 4;
const SOUND_SHAPES: Record<
  RankedSoundCue,
  { duration: number; endFrequency: number; gain: number; startFrequency: number }
> = {
  move: { duration: 0.022, endFrequency: 620, gain: 0.035, startFrequency: 760 },
  play: { duration: 0.045, endFrequency: 620, gain: 0.048, startFrequency: 920 },
  drop: { duration: 0.055, endFrequency: 850, gain: 0.05, startFrequency: 540 },
  stop: { duration: 0.05, endFrequency: 330, gain: 0.044, startFrequency: 560 },
};

export function useRankedSounds() {
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const contextRef = useRef<AudioContext | null>(null);
  const lastMoveRef = useRef(0);
  const voicesRef = useRef(0);

  useEffect(() => {
    let savedVolume: number | null = null;
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(stored) && stored >= 0 && stored <= 1) {
        savedVolume = stored;
      }
    } catch {
      // Device preferences are optional when storage is unavailable.
    }
    if (savedVolume === null) {
      return undefined;
    }
    const timer = window.setTimeout(() => setVolumeState(savedVolume), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(
    () => () => {
      void contextRef.current?.close();
      contextRef.current = null;
    },
    [],
  );

  const setVolume = useCallback((nextVolume: number) => {
    const normalized = Math.min(1, Math.max(0, nextVolume));
    setVolumeState(normalized);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(normalized));
    } catch {
      // Keep the in-memory preference even when storage is blocked.
    }
  }, []);

  const unlockSound = useCallback(() => {
    const context = getAudioContext(contextRef);
    if (context?.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
  }, []);

  const playSound = useCallback<PlayRankedSound>(
    (cue) => {
      if (volume <= 0) {
        return;
      }
      const now = performance.now();
      if (cue === "move" && now - lastMoveRef.current < MOVE_COOLDOWN_MS) {
        return;
      }
      if (voicesRef.current >= MAX_VOICES) {
        return;
      }
      if (cue === "move") {
        lastMoveRef.current = now;
      }
      const context = getAudioContext(contextRef);
      if (!context) {
        return;
      }
      if (context.state === "suspended") {
        void context.resume().catch(() => undefined);
        return;
      }
      if (context.state !== "running") {
        return;
      }
      voicesRef.current += 1;
      try {
        playClick(context, cue, volume, () => {
          voicesRef.current = Math.max(0, voicesRef.current - 1);
        });
      } catch {
        voicesRef.current = Math.max(0, voicesRef.current - 1);
      }
    },
    [volume],
  );

  return { playSound, setVolume, unlockSound, volume };
}

function getAudioContext(contextRef: { current: AudioContext | null }) {
  if (contextRef.current && contextRef.current.state !== "closed") {
    return contextRef.current;
  }
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }
  try {
    contextRef.current = new AudioContextConstructor();
    return contextRef.current;
  } catch {
    return null;
  }
}

function playClick(
  context: AudioContext,
  cue: RankedSoundCue,
  volume: number,
  onEnded: () => void,
) {
  const shape = SOUND_SHAPES[cue];
  const start = context.currentTime + 0.002;
  const end = start + shape.duration;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(shape.startFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(shape.endFrequency, end);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, volume * shape.gain),
    start + 0.003,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.006);
  oscillator.addEventListener(
    "ended",
    () => {
      oscillator.disconnect();
      gain.disconnect();
      onEnded();
    },
    { once: true },
  );
}
