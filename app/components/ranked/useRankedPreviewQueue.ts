"use client";

import { useEffect, useRef, useState } from "react";

const PREVIEW_SLICE_MS = 12_000;

export function useRankedPreviewQueue({
  playInPlayer,
  closePlayer,
  onStart,
}: {
  playInPlayer: (itemId: string) => void;
  closePlayer: () => void;
  onStart: () => void;
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

  function start(itemIds: string[]) {
    if (!itemIds.length) {
      return;
    }
    const queue = [...itemIds];
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
      playInPlayer(queue[index]);
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
      clearTimer();
    },
  );

  return { preview, start, stop };
}
