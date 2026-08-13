"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { RankedRun } from "../../../lib/types";
import { moveRankedItem, setRankedGroupOrder } from "../../domain/ranked";
import { animateRankedPreviewOpen } from "./useRankedPlayer";
import type { PlayRankedSound } from "./useRankedSounds";

type DragSource = "group" | "leader";
type PointerDrag = {
  itemId: string;
  overPlayer: boolean;
  playerBounds: DOMRect | null;
  pointerId: number;
  preview: HTMLElement | null;
  source: DragSource;
  sourceElement: HTMLElement;
  startX: number;
  startY: number;
  started: boolean;
  targetIndex: number;
  targetMidpoints: number[];
};

export function useRankedPointerOrder({
  run,
  onChange,
  playerRef,
  playInPlayer,
  playSound,
}: {
  run: RankedRun;
  onChange: (run: RankedRun) => void;
  playerRef: RefObject<HTMLElement | null>;
  playInPlayer: (itemId: string) => void;
  playSound: PlayRankedSound;
}) {
  const [dragged, setDragged] = useState<{
    itemId: string;
    source: DragSource;
  } | null>(null);
  const [draftOrder, setDraftOrder] = useState(() => [
    ...run.state.orderedGroup,
  ]);
  const [playerDragActive, setPlayerDragActive] = useState(false);
  const draftOrderRef = useRef(draftOrder);
  const dragRef = useRef<PointerDrag | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const previousRowRects = useRef(new Map<string, DOMRect>());
  const flipAnimations = useRef(new Map<string, Animation>());

  useEffect(() => {
    if (dragRef.current) {
      return;
    }
    const next = [...run.state.orderedGroup];
    draftOrderRef.current = next;
    setDraftOrder(next);
  }, [run.state.orderedGroup]);

  useLayoutEffect(() => {
    const before = previousRowRects.current;
    if (before.size === 0) {
      return;
    }
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    rowRefs.current.forEach((element, id) => {
      const previous = before.get(id);
      if (!previous || dragged?.itemId === id || reduceMotion) {
        return;
      }
      const current = element.getBoundingClientRect();
      const delta = previous.top - current.top;
      if (Math.abs(delta) > 1) {
        flipAnimations.current.get(id)?.cancel();
        const animation = element.animate(
          [
            { transform: `translateY(${delta}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 125, easing: "cubic-bezier(.2,.82,.2,1)" },
        );
        flipAnimations.current.set(id, animation);
        animation.addEventListener(
          "finish",
          () => flipAnimations.current.delete(id),
          { once: true },
        );
      }
    });
    before.clear();
  }, [draftOrder, dragged?.itemId]);

  useEffect(
    () => () => {
      dragRef.current?.preview?.remove();
      dragCleanupRef.current?.();
      flipAnimations.current.forEach((animation) => animation.cancel());
      document.body.classList.remove("ranked-pointer-dragging");
    },
    [],
  );

  function beginPointerDrag(
    event: ReactPointerEvent<HTMLElement>,
    itemId: string,
    source: DragSource,
  ) {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button,a,input,iframe")
    ) {
      return;
    }
    event.preventDefault();
    dragCleanupRef.current?.();
    const sourceElement = event.currentTarget;
    const origin = sourceElement.getBoundingClientRect();
    const session: PointerDrag = {
      itemId,
      overPlayer: false,
      playerBounds: playerRef.current?.getBoundingClientRect() ?? null,
      pointerId: event.pointerId,
      preview: null,
      source,
      sourceElement,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      targetIndex: draftOrderRef.current.indexOf(itemId),
      targetMidpoints: draftOrderRef.current.map((id) => {
        const bounds = rowRefs.current.get(id)?.getBoundingClientRect();
        return bounds ? bounds.top + bounds.height / 2 : 0;
      }),
    };
    dragRef.current = session;
    try {
      sourceElement.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners keep mouse dragging functional without capture.
    }

    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      dragCleanupRef.current = null;
      dragRef.current = null;
      document.body.classList.remove("ranked-pointer-dragging");
      setDragged(null);
      setPlayerDragActive(false);
      if (sourceElement.hasPointerCapture(session.pointerId)) {
        sourceElement.releasePointerCapture(session.pointerId);
      }
    };

    const createPreview = () => {
      const clone = sourceElement.cloneNode(true) as HTMLElement;
      clone.classList.remove("dragging", "active");
      clone.classList.add("ranked-drag-preview");
      Object.assign(clone.style, {
        height: `${origin.height}px`,
        left: `${origin.left}px`,
        top: `${origin.top}px`,
        width: `${origin.width}px`,
      });
      document.body.insertAdjacentElement("beforeend", clone);
      session.preview = clone;
      session.started = true;
      document.body.classList.add("ranked-pointer-dragging");
      setDragged({ itemId, source });
    };

    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== session.pointerId) {
        return;
      }
      const coalesced = pointerEvent.getCoalescedEvents?.();
      const current = coalesced?.[coalesced.length - 1] ?? pointerEvent;
      const x = current.clientX - session.startX;
      const y = current.clientY - session.startY;
      if (!session.started && Math.hypot(x, y) < 2) {
        return;
      }
      pointerEvent.preventDefault();
      if (!session.started) {
        createPreview();
      }
      if (session.preview) {
        session.preview.style.transform =
          `translate3d(${x}px,${y}px,0) scale(1.018)`;
      }
      const playerBounds = session.playerBounds;
      const overPlayer = Boolean(
        playerBounds &&
          pointInside(current.clientX, current.clientY, playerBounds),
      );
      if (overPlayer !== session.overPlayer) {
        session.overPlayer = overPlayer;
        setPlayerDragActive(overPlayer);
      }
      if (source !== "group" || overPlayer) {
        return;
      }
      reorderAt(current.clientY, itemId);
    };

    const end = (pointerEvent: PointerEvent | null, cancelled: boolean) => {
      if (pointerEvent && pointerEvent.pointerId !== session.pointerId) {
        return;
      }
      const playerBounds = playerRef.current?.getBoundingClientRect();
      const droppedInPlayer = Boolean(
        !cancelled &&
          session.started &&
          pointerEvent &&
          playerBounds &&
          pointInside(pointerEvent.clientX, pointerEvent.clientY, playerBounds),
      );
      if (droppedInPlayer && playerBounds) {
        const preview = session.preview;
        session.preview = null;
        if (preview) {
          animateRankedPreviewOpen(preview, playerBounds);
        }
        playSound("drop");
        playInPlayer(itemId);
        if (source === "group") {
          restoreOriginalOrder();
        }
      } else if (!cancelled && session.started && source === "group") {
        const next = draftOrderRef.current;
        if (next.some((id, index) => id !== run.state.orderedGroup[index])) {
          onChange(setRankedGroupOrder(run, next));
        }
      } else if (cancelled && source === "group") {
        restoreOriginalOrder();
      }
      session.preview?.remove();
      cleanup();
    };

    const reorderAt = (clientY: number, draggedId: string) => {
      const order = draftOrderRef.current;
      const fromIndex = order.indexOf(draggedId);
      if (fromIndex < 0) {
        return;
      }
      const foundIndex = session.targetMidpoints.findIndex(
        (midpoint) => midpoint > 0 && clientY < midpoint,
      );
      const targetIndex = foundIndex < 0 ? order.length - 1 : foundIndex;
      if (targetIndex === session.targetIndex) {
        return;
      }
      session.targetIndex = targetIndex;
      if (targetIndex !== fromIndex) {
        playSound("move");
        flipAnimations.current.forEach((animation) => animation.cancel());
        flipAnimations.current.clear();
        previousRowRects.current = captureRowRects(rowRefs.current);
        const next = moveRankedItem(order, fromIndex, targetIndex);
        draftOrderRef.current = next;
        setDraftOrder(next);
      }
    };

    const restoreOriginalOrder = () => {
      const original = [...run.state.orderedGroup];
      draftOrderRef.current = original;
      setDraftOrder(original);
    };
    const finish = (pointerEvent: PointerEvent) => end(pointerEvent, false);
    const cancel = () => end(null, true);
    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
  }

  return {
    beginPointerDrag,
    draftOrder,
    dragged,
    playerDragActive,
    rowRefs,
  };
}

function pointInside(x: number, y: number, bounds: DOMRect) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function captureRowRects(rows: Map<string, HTMLElement>) {
  return new Map(
    [...rows].map(([id, element]) => [id, element.getBoundingClientRect()]),
  );
}
