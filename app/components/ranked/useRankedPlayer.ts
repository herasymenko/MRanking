"use client";

import { useEffect, useRef, useState } from "react";

export type RankedPlayerSelection = { itemId: string; loadKey: number };

export function useRankedPlayer() {
  const [player, setPlayer] = useState<RankedPlayerSelection | null>(null);
  const [receiving, setReceiving] = useState(false);
  const playerRef = useRef<HTMLElement | null>(null);
  const loadKeyRef = useRef(0);
  const receiveTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (receiveTimerRef.current !== null) {
        window.clearTimeout(receiveTimerRef.current);
      }
    },
    [],
  );

  function playInPlayer(itemId: string) {
    loadKeyRef.current += 1;
    setPlayer({ itemId, loadKey: loadKeyRef.current });
    setReceiving(true);
    if (receiveTimerRef.current !== null) {
      window.clearTimeout(receiveTimerRef.current);
    }
    receiveTimerRef.current = window.setTimeout(() => {
      setReceiving(false);
      receiveTimerRef.current = null;
    }, 320);
  }

  function playFromTile(itemId: string, source: HTMLElement) {
    playInPlayer(itemId);
    flyToPlayer(source, playerRef.current);
  }

  function closePlayer() {
    setPlayer(null);
  }

  return {
    closePlayer,
    playFromTile,
    playInPlayer,
    player,
    playerRef,
    receiving,
  };
}

function flyToPlayer(source: HTMLElement, player: HTMLElement | null) {
  const target = player?.getBoundingClientRect();
  if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const origin = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.remove("dragging", "active");
  clone.classList.add("ranked-card-flight");
  Object.assign(clone.style, {
    height: `${origin.height}px`,
    left: `${origin.left}px`,
    top: `${origin.top}px`,
    width: `${origin.width}px`,
  });
  document.body.insertAdjacentElement("beforeend", clone);
  const x = target.left + target.width / 2 - (origin.left + origin.width / 2);
  const y = target.top + target.height / 2 - (origin.top + origin.height / 2);
  const animation = clone.animate(
    [
      { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
      { transform: `translate3d(${x}px,${y}px,0) scale(.18)`, opacity: 0 },
    ],
    { duration: 240, easing: "cubic-bezier(.3,.8,.3,1)" },
  );
  animation.addEventListener("finish", () => clone.remove(), { once: true });
  animation.addEventListener("cancel", () => clone.remove(), { once: true });
}
