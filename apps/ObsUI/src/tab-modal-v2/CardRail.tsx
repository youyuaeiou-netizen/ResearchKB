import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import { IoArrowBackOutline, IoArrowForwardOutline } from "react-icons/io5";

type PointerState = { id: number; startX: number; startScrollLeft: number; moved: boolean };

export function CardRail({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<PointerState | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({ atStart: true, atEnd: false });

  const syncPosition = () => {
    const node = railRef.current;
    if (!node) return;
    const max = Math.max(0, node.scrollWidth - node.clientWidth);
    setPosition({ atStart: node.scrollLeft <= 1, atEnd: node.scrollLeft >= max - 1 });
  };

  useEffect(() => {
    syncPosition();
    const node = railRef.current;
    if (!node) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncPosition);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const moveRail = (direction: -1 | 1) => {
    const node = railRef.current;
    if (!node) return;
    const amount = Math.max(220, Math.round(node.clientWidth * 0.72));
    const max = Math.max(0, node.scrollWidth - node.clientWidth);
    const next = Math.min(max, Math.max(0, node.scrollLeft + direction * amount));
    node.scrollLeft = next;
    syncPosition();
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = pointerRef.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.moved) suppressClickRef.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointerRef.current = null;
    setDragging(false);
    syncPosition();
  };

  return <section className={`tab-modal-v2__rail-group ${className}`.trim()} aria-label={title}>
    <div className="tab-modal-v2__rail-heading"><span>{title}</span></div>
    <div className="tab-modal-v2__rail-controls">
      <button type="button" aria-label={`${title}向左滚动`} disabled={position.atStart} onClick={() => moveRail(-1)}><IoArrowBackOutline aria-hidden="true" /></button>
      <button type="button" aria-label={`${title}向右滚动`} disabled={position.atEnd} onClick={() => moveRail(1)}><IoArrowForwardOutline aria-hidden="true" /></button>
    </div>
    <div
      ref={railRef}
      className={`tab-modal-v2__card-rail${dragging ? " is-dragging" : ""}`}
      data-v2-rail="true"
      tabIndex={0}
      onScroll={syncPosition}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement;
        if (target.closest("button, input, select, textarea, a")) return;
        pointerRef.current = { id: event.pointerId, startX: event.clientX, startScrollLeft: event.currentTarget.scrollLeft, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = pointerRef.current;
        if (!current || current.id !== event.pointerId) return;
        const distance = event.clientX - current.startX;
        if (Math.abs(distance) > 4) current.moved = true;
        if (!current.moved) return;
        event.currentTarget.scrollLeft = current.startScrollLeft - distance;
        setDragging(true);
        syncPosition();
        event.preventDefault();
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
        if (!event.deltaY || event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
        event.currentTarget.scrollLeft += event.deltaY;
        syncPosition();
        event.preventDefault();
      }}
    >{children}</div>
  </section>;
}
