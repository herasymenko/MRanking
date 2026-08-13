"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { RankedRun } from "../../../lib/types";
import { moveRankedItem, setRankedGroupOrder } from "../../domain/ranked";

type DragSource = "group" | "leader";
type PointerDrag = {
  currentX: number;
  currentY: number;
  itemId: string;
  origin: DOMRect;
  overPlayer: boolean;
  pointerId: number;
  preview: HTMLElement | null;
  source: DragSource;
  startX: number;
  startY: number;
  started: boolean;
};

export function useRankedPointerOrder({
  run,
  onChange,
  playerRef,
  playInPlayer,
}: {
  run: RankedRun;
  onChange: (run: RankedRun) => void;
  playerRef: RefObject<HTMLElement | null>;
  playInPlayer: (itemId: string) => void;
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
        element.animate(
          [
            { transform: `translateY(${delta}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 190, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      }
    });
    before.clear();
  }, [draftOrder, dragged?.itemId]);

  useEffect(
    () => () => {
      dragRef.current?.preview?.remove();
      dragCleanupRef.current?.();
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
      currentX: 0,
      currentY: 0,
      itemId,
      origin,
      overPlayer: false,
      pointerId: event.pointerId,
      preview: null,
      source,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
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
      const x = pointerEvent.clientX - session.startX;
      const y = pointerEvent.clientY - session.startY;
      if (!session.started && Math.hypot(x, y) < 5) {
        return;
      }
      pointerEvent.preventDefault();
      if (!session.started) {
        createPreview();
      }
      session.currentX = x;
      session.currentY = y;
      if (session.preview) {
        session.preview.style.transform =
          `translate3d(${x}px,${y}px,0) scale(1.018)`;
      }
      const playerBounds = playerRef.current?.getBoundingClientRect();
      const overPlayer = Boolean(
        playerBounds &&
          pointInside(pointerEvent.clientX, pointerEvent.clientY, playerBounds),
      );
      if (overPlayer !== session.overPlayer) {
        session.overPlayer = overPlayer;
        setPlayerDragActive(overPlayer);
      }
      if (source !== "group" || overPlayer) {
        return;
      }
      reorderAt(pointerEvent.clientY, itemId);
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
          animatePreviewToPlayer(preview, session, playerBounds);
        }
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
      let targetIndex = order.length - 1;
      for (let index = 0; index < order.length; index += 1) {
        const bounds = rowRefs.current
          .get(order[index])
          ?.getBoundingClientRect();
        if (bounds && clientY < bounds.top + bounds.height / 2) {
          targetIndex = index;
          break;
        }
      }
      if (targetIndex !== fromIndex) {
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

function animatePreviewToPlayer(
  preview: HTMLElement,
  drag: PointerDrag,
  target: DOMRect,
) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    preview.remove();
    return;
  }
  const x = target.left + target.width / 2 - (drag.origin.left + drag.origin.width / 2);
  const y = target.top + target.height / 2 - (drag.origin.top + drag.origin.height / 2);
  const animation = preview.animate(
    [
      {
        transform: `translate3d(${drag.currentX}px,${drag.currentY}px,0) scale(1.018)`,
        opacity: 1,
      },
      { transform: `translate3d(${x}px,${y}px,0) scale(.18)`, opacity: 0 },
    ],
    { duration: 220, easing: "cubic-bezier(.3,.8,.3,1)" },
  );
  animation.addEventListener("finish", () => preview.remove(), { once: true });
  animation.addEventListener("cancel", () => preview.remove(), { once: true });
}
