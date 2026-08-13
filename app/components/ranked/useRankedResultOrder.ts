"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { moveRankedItem } from "../../domain/ranked";
import { animateRankedPreviewOpen } from "./useRankedPlayer";
import type { PlayRankedSound } from "./useRankedSounds";

type ResultDrag = {
  initialOrder: string[];
  itemId: string;
  origin: DOMRect;
  overPlayer: boolean;
  pointerId: number;
  preview: HTMLElement | null;
  sourceElement: HTMLElement;
  startX: number;
  startY: number;
  started: boolean;
  targetIndex: number;
  targetMidpoints: number[];
};

export function useRankedResultOrder({
  canAdjust,
  onCommit,
  order,
  playerRef,
  playInPlayer,
  playSound,
  points,
}: {
  canAdjust: boolean;
  onCommit: (order: string[]) => void;
  order: string[];
  playerRef: RefObject<HTMLElement | null>;
  playInPlayer: (itemId: string) => void;
  playSound: PlayRankedSound;
  points: Map<string, number>;
}) {
  const [draftOrder, setDraftOrder] = useState(order);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [playerDragActive, setPlayerDragActive] = useState(false);
  const draftOrderRef = useRef(order);
  const dragRef = useRef<ResultDrag | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const previousRects = useRef(new Map<string, DOMRect>());

  useEffect(() => {
    if (dragRef.current) {
      return;
    }
    draftOrderRef.current = order;
    setDraftOrder(order);
  }, [order]);

  useLayoutEffect(() => {
    if (!previousRects.current.size) {
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rowRefs.current.forEach((element, id) => {
      const before = previousRects.current.get(id);
      if (!before || id === draggedId || reduced) {
        return;
      }
      const after = element.getBoundingClientRect();
      const delta = before.top - after.top;
      if (Math.abs(delta) > 1) {
        element.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
          { duration: 135, easing: "cubic-bezier(.2,.82,.2,1)" },
        );
      }
    });
    previousRects.current.clear();
  }, [draftOrder, draggedId]);

  useEffect(
    () => () => {
      dragRef.current?.preview?.remove();
      cleanupRef.current?.();
      document.body.classList.remove("ranked-pointer-dragging");
    },
    [],
  );

  function beginPointerDrag(
    event: ReactPointerEvent<HTMLElement>,
    itemId: string,
  ) {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button,a,input,iframe")
    ) {
      return;
    }
    const fromHandle = Boolean(
      (event.target as HTMLElement).closest(".ranked-drag-handle"),
    );
    if (event.pointerType !== "mouse" && !fromHandle) {
      return;
    }
    event.preventDefault();
    cleanupRef.current?.();
    const sourceElement = event.currentTarget;
    const initialOrder = [...draftOrderRef.current];
    const origin = sourceElement.getBoundingClientRect();
    const session: ResultDrag = {
      initialOrder,
      itemId,
      origin,
      overPlayer: false,
      pointerId: event.pointerId,
      preview: null,
      sourceElement,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      targetIndex: initialOrder.indexOf(itemId),
      targetMidpoints: initialOrder.map((id) => {
        const bounds = rowRefs.current.get(id)?.getBoundingClientRect();
        return bounds ? bounds.top + bounds.height / 2 : 0;
      }),
    };
    dragRef.current = session;
    try {
      sourceElement.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners keep dragging available when capture is unavailable.
    }

    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      cleanupRef.current = null;
      dragRef.current = null;
      document.body.classList.remove("ranked-pointer-dragging");
      setDraggedId(null);
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
      setDraggedId(itemId);
    };

    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== session.pointerId) {
        return;
      }
      const x = pointerEvent.clientX - session.startX;
      const y = pointerEvent.clientY - session.startY;
      if (!session.started && Math.hypot(x, y) < 3) {
        return;
      }
      pointerEvent.preventDefault();
      if (!session.started) {
        createPreview();
      }
      if (session.preview) {
        session.preview.style.transform = `translate3d(${x}px,${y}px,0) scale(1.012)`;
      }
      const playerBounds = playerRef.current?.getBoundingClientRect();
      const overPlayer = Boolean(
        playerBounds && pointInside(pointerEvent.clientX, pointerEvent.clientY, playerBounds),
      );
      if (overPlayer !== session.overPlayer) {
        session.overPlayer = overPlayer;
        setPlayerDragActive(overPlayer);
      }
      if (!overPlayer && canAdjust) {
        reorderAt(y);
      }
    };

    const reorderAt = (deltaY: number) => {
      const current = draftOrderRef.current;
      const fromIndex = current.indexOf(itemId);
      const draggedPoints = points.get(itemId);
      if (fromIndex < 0 || draggedPoints === undefined) {
        return;
      }
      const allowed = session.initialOrder
        .map((id, index) => ({ id, index }))
        .filter(({ id }) => points.get(id) === draggedPoints)
        .map(({ index }) => index);
      const first = Math.min(...allowed);
      const last = Math.max(...allowed);
      const draggedTop = session.origin.top + deltaY;
      const draggedBottom = draggedTop + session.origin.height;
      let targetIndex = session.initialOrder.indexOf(itemId);
      if (deltaY > 0) {
        for (let index = targetIndex + 1; index <= last; index += 1) {
          if (draggedBottom >= session.targetMidpoints[index]) {
            targetIndex = index;
          }
        }
      } else if (deltaY < 0) {
        for (let index = targetIndex - 1; index >= first; index -= 1) {
          if (draggedTop <= session.targetMidpoints[index]) {
            targetIndex = index;
          }
        }
      }
      if (targetIndex === session.targetIndex || targetIndex === fromIndex) {
        return;
      }
      session.targetIndex = targetIndex;
      playSound("move");
      previousRects.current = new Map(
        [...rowRefs.current].map(([id, element]) => [id, element.getBoundingClientRect()]),
      );
      const next = moveRankedItem(current, fromIndex, targetIndex);
      draftOrderRef.current = next;
      setDraftOrder(next);
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
        draftOrderRef.current = session.initialOrder;
        setDraftOrder(session.initialOrder);
      } else if (!cancelled && session.started && canAdjust) {
        const next = draftOrderRef.current;
        if (next.some((id, index) => id !== session.initialOrder[index])) {
          onCommit(next);
        }
      } else if (cancelled) {
        draftOrderRef.current = session.initialOrder;
        setDraftOrder(session.initialOrder);
      }
      session.preview?.remove();
      cleanup();
    };

    const finish = (pointerEvent: PointerEvent) => end(pointerEvent, false);
    const cancel = () => end(null, true);
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
  }

  return {
    beginPointerDrag,
    draftOrder,
    draggedId,
    playerDragActive,
    rowRefs,
  };
}

function pointInside(x: number, y: number, bounds: DOMRect) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}
