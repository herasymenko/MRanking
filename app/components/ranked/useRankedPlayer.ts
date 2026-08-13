"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayRankedSound } from "./useRankedSounds";

export type RankedPlayerSelection = { itemId: string; loadKey: number };

export function useRankedPlayer(playSound: PlayRankedSound) {
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
    }, 520);
  }

  function toggleFromTile(itemId: string, source: HTMLElement) {
    if (player?.itemId === itemId) {
      playSound("stop");
      animateRankedTileClose(source, playerRef.current);
      closePlayer();
      return;
    }
    playSound("play");
    playInPlayer(itemId);
    animateRankedTileOpen(source, playerRef.current);
  }

  function closePlayer() {
    if (receiveTimerRef.current !== null) {
      window.clearTimeout(receiveTimerRef.current);
      receiveTimerRef.current = null;
    }
    setReceiving(false);
    setPlayer(null);
  }

  return {
    closePlayer,
    toggleFromTile,
    playInPlayer,
    player,
    playerRef,
    receiving,
  };
}

export function animateRankedTileOpen(
  source: HTMLElement,
  player: HTMLElement | null,
) {
  const target = player?.getBoundingClientRect();
  if (!target || reducedMotion()) {
    return;
  }
  const clone = source.cloneNode(true) as HTMLElement;
  document.body.insertAdjacentElement("beforeend", clone);
  expandElementIntoPlayer(clone, source.getBoundingClientRect(), target);
}

export function animateRankedPreviewOpen(
  preview: HTMLElement,
  target: DOMRect,
) {
  if (reducedMotion()) {
    preview.remove();
    return;
  }
  expandElementIntoPlayer(preview, preview.getBoundingClientRect(), target);
}

export function animateRankedTileClose(
  target: HTMLElement,
  player: HTMLElement | null,
) {
  const origin = player?.getBoundingClientRect();
  if (!origin || reducedMotion()) {
    return;
  }
  const clone = target.cloneNode(true) as HTMLElement;
  document.body.insertAdjacentElement("beforeend", clone);
  collapseElementIntoTile(clone, origin, target.getBoundingClientRect());
}

function expandElementIntoPlayer(
  element: HTMLElement,
  origin: DOMRect,
  target: DOMRect,
) {
  element.classList.remove("dragging", "active", "ranked-drag-preview");
  element.classList.add("ranked-card-opening");
  Object.assign(element.style, {
    height: `${origin.height}px`,
    left: `${origin.left}px`,
    top: `${origin.top}px`,
    transform: "none",
    width: `${origin.width}px`,
  });
  const animation = element.animate(
    [
      {
        borderRadius: "13px",
        height: `${origin.height}px`,
        left: `${origin.left}px`,
        opacity: 1,
        top: `${origin.top}px`,
        width: `${origin.width}px`,
      },
      {
        borderRadius: "18px",
        height: `${target.height}px`,
        left: `${target.left}px`,
        offset: 0.78,
        opacity: 0.96,
        top: `${target.top}px`,
        width: `${target.width}px`,
      },
      {
        borderRadius: "18px",
        height: `${target.height}px`,
        left: `${target.left}px`,
        opacity: 0,
        top: `${target.top}px`,
        width: `${target.width}px`,
      },
    ],
    { duration: 500, easing: "cubic-bezier(.2,.76,.22,1)" },
  );
  animation.addEventListener("finish", () => element.remove(), { once: true });
  animation.addEventListener("cancel", () => element.remove(), { once: true });
}

function collapseElementIntoTile(
  element: HTMLElement,
  origin: DOMRect,
  target: DOMRect,
) {
  element.classList.remove("dragging", "active", "ranked-drag-preview");
  element.classList.add("ranked-card-closing");
  Object.assign(element.style, {
    height: `${origin.height}px`,
    left: `${origin.left}px`,
    top: `${origin.top}px`,
    transform: "none",
    width: `${origin.width}px`,
  });
  const animation = element.animate(
    [
      {
        borderRadius: "18px",
        height: `${origin.height}px`,
        left: `${origin.left}px`,
        opacity: 0.92,
        top: `${origin.top}px`,
        width: `${origin.width}px`,
      },
      {
        borderRadius: "13px",
        height: `${target.height}px`,
        left: `${target.left}px`,
        offset: 0.86,
        opacity: 1,
        top: `${target.top}px`,
        width: `${target.width}px`,
      },
      {
        borderRadius: "13px",
        height: `${target.height}px`,
        left: `${target.left}px`,
        opacity: 0,
        top: `${target.top}px`,
        width: `${target.width}px`,
      },
    ],
    { duration: 500, easing: "cubic-bezier(.2,.76,.22,1)" },
  );
  animation.addEventListener("finish", () => element.remove(), { once: true });
  animation.addEventListener("cancel", () => element.remove(), { once: true });
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
