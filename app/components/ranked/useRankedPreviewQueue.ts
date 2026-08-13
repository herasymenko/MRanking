"use client";

import { useEffect, useRef, useState } from "react";
import type { SourceType } from "../../../lib/types";
import { isYouTubeSource } from "../../domain/pack";

const PREVIEW_SLICE_MS = 7_000;
type PreviewQueueItem = { itemId: string; duration: string | null };

export function useRankedPreviewQueue({
  playInPlayer,
  closePlayer,
  onStart,
  sourceType,
}: {
  playInPlayer: (itemId: string, startSeconds?: number) => void;
  closePlayer: () => void;
  onStart: () => void;
  sourceType: SourceType;
}) {
  const [preview, setPreview] = useState<{ index: number; total: number } | null>(null);
  const tokenRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function stop({ close = true }: { close?: boolean } = {}) {
    tokenRef.current += 1;
    clearTimer();
    setPreview(null);
    if (close) {
      closePlayer();
    }
  }

  function start(items: PreviewQueueItem[]) {
    if (!items.length) {
      return;
    }
    const queue = items.map((item) => ({ ...item }));
    tokenRef.current += 1;
    const token = tokenRef.current;
    clearTimer();
    onStart();

    const playAt = (index: number) => {
      if (token !== tokenRef.current) {
        return;
      }
      if (index >= queue.length) {
        setPreview(null);
        closePlayer();
        return;
      }
      setPreview({ index, total: queue.length });
      playInPlayer(
        queue[index].itemId,
        randomPreviewStart(sourceType, queue[index].duration),
      );
      timerRef.current = window.setTimeout(
        () => playAt(index + 1),
        PREVIEW_SLICE_MS,
      );
    };

    playAt(0);
  }

  useEffect(
    () => () => {
      tokenRef.current += 1;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return { preview, start, stop };
}

function randomPreviewStart(sourceType: SourceType, duration: string | null) {
  if (!isYouTubeSource(sourceType)) {
    return 0;
  }
  const durationSeconds = parseDurationSeconds(duration);
  const latestStart = Math.max(0, durationSeconds - PREVIEW_SLICE_MS / 1000);
  return Math.floor(Math.random() * (latestStart + 1));
}

function parseDurationSeconds(duration: string | null) {
  if (!duration || !/^\d+(?::\d+){1,2}$/.test(duration)) {
    return 0;
  }
  return duration
    .split(":")
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);
}
