"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RankedSoundCue = "drop" | "move" | "next" | "play" | "stop" | "top";
export type PlayRankedSound = (cue: RankedSoundCue) => void;

const STORAGE_KEY = "mranking:ranked-ui-volume:v1";
const DEFAULT_VOLUME = 0.22;
const MOVE_COOLDOWN_MS = 42;
const CUE_COOLDOWN_MS = 28;
const MAX_VOICES = 4;
const NOISE_DURATION = 0.08;
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();
const masterBuses = new WeakMap<AudioContext, AudioNode>();
type NoiseLayer = {
  delay?: number;
  duration: number;
  filter: BiquadFilterType;
  frequency: number;
  gain: number;
  q: number;
};
const SOUND_LAYERS: Record<RankedSoundCue, NoiseLayer[]> = {
  move: [
    { duration: 0.008, filter: "highpass", frequency: 2400, gain: 0.11, q: 0.55 },
  ],
  play: [
    { duration: 0.01, filter: "bandpass", frequency: 2300, gain: 0.12, q: 0.7 },
    { delay: 0.006, duration: 0.016, filter: "lowpass", frequency: 850, gain: 0.055, q: 0.5 },
  ],
  drop: [
    { duration: 0.011, filter: "highpass", frequency: 1800, gain: 0.13, q: 0.5 },
    { delay: 0.008, duration: 0.024, filter: "bandpass", frequency: 650, gain: 0.065, q: 0.65 },
  ],
  stop: [
    { duration: 0.009, filter: "bandpass", frequency: 1450, gain: 0.1, q: 0.65 },
    { delay: 0.005, duration: 0.022, filter: "lowpass", frequency: 480, gain: 0.06, q: 0.5 },
  ],
  next: [
    { duration: 0.011, filter: "highpass", frequency: 1900, gain: 0.115, q: 0.55 },
    { delay: 0.034, duration: 0.018, filter: "bandpass", frequency: 900, gain: 0.06, q: 0.6 },
  ],
  top: [
    { duration: 0.008, filter: "highpass", frequency: 2600, gain: 0.07, q: 0.5 },
  ],
};

export function useRankedSounds() {
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const contextRef = useRef<AudioContext | null>(null);
  const lastMoveRef = useRef(0);
  const lastCueRef = useRef(0);
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
    if (context && context.state !== "running") {
      void context.resume().catch(() => undefined);
    }
  }, []);

  const playSound = useCallback<PlayRankedSound>(
    (cue) => {
      if (volume <= 0) {
        return;
      }
      const now = performance.now();
      if (now - lastCueRef.current < CUE_COOLDOWN_MS) {
        return;
      }
      if (cue === "move" && now - lastMoveRef.current < MOVE_COOLDOWN_MS) {
        return;
      }
      if (voicesRef.current >= MAX_VOICES) {
        return;
      }
      if (cue === "move") {
        lastMoveRef.current = now;
      }
      lastCueRef.current = now;
      const context = getAudioContext(contextRef);
      if (!context) {
        return;
      }
      const launch = () => {
        if (context.state !== "running" || voicesRef.current >= MAX_VOICES) {
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
      };
      if (context.state !== "running") {
        void context
          .resume()
          .then(launch)
          .catch(() => undefined);
        return;
      }
      launch();
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
  const layers = SOUND_LAYERS[cue];
  let remaining = layers.length;
  const noise = getNoiseBuffer(context);
  layers.forEach((layer) => {
    const start = context.currentTime + 0.002 + (layer.delay ?? 0);
    const end = start + layer.duration;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noise;
    filter.type = layer.filter;
    filter.frequency.setValueAtTime(layer.frequency, start);
    filter.Q.setValueAtTime(layer.q, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume * layer.gain),
      start + 0.0007,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(getMasterBus(context));
    source.start(start);
    source.stop(end + 0.002);
    source.addEventListener(
      "ended",
      () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
        remaining -= 1;
        if (remaining === 0) {
          onEnded();
        }
      },
      { once: true },
    );
  });
}

function getNoiseBuffer(context: AudioContext) {
  const cached = noiseBuffers.get(context);
  if (cached) {
    return cached;
  }
  const length = Math.ceil(context.sampleRate * NOISE_DURATION);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = 0x4d52414e;
  for (let index = 0; index < channel.length; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    channel[index] = (seed / 4294967296) * 2 - 1;
  }
  noiseBuffers.set(context, buffer);
  return buffer;
}

function getMasterBus(context: AudioContext) {
  const cached = masterBuses.get(context);
  if (cached) {
    return cached;
  }
  const lowpass = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 5200;
  lowpass.Q.value = 0.35;
  compressor.threshold.value = -26;
  compressor.knee.value = 18;
  compressor.ratio.value = 7;
  compressor.attack.value = 0.001;
  compressor.release.value = 0.06;
  lowpass.connect(compressor);
  compressor.connect(context.destination);
  masterBuses.set(context, lowpass);
  return lowpass;
}
