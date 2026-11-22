import { useRef } from 'react';
import type { PointerEvent } from 'react';

export default function ResizeHandle({ label, axis, value, min, max, onChange }: {
  label: string; axis: 'x' | 'y'; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const start = useRef<{ pointer: number; coordinate: number; value: number } | null>(null);
  const clamp = (next: number) => onChange(Math.round(Math.max(min, Math.min(max, next))));
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current?.pointer !== event.pointerId) return;
    start.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className={`panel-resizer resize-${axis}`} role="separator" tabIndex={0}
    aria-label={label} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      start.current = { pointer: event.pointerId, coordinate: axis === 'x' ? event.clientX : event.clientY, value };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const drag = start.current;
      if (!drag || drag.pointer !== event.pointerId) return;
      const delta = (axis === 'x' ? event.clientX : event.clientY) - drag.coordinate;
      clamp(drag.value + (axis === 'x' ? delta : -delta));
    }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => { start.current = null; }}
    onKeyDown={event => {
      const direction = axis === 'x' ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowDown: -1, ArrowUp: 1 };
      const step = direction[event.key as keyof typeof direction];
      if (step) { event.preventDefault(); clamp(value + step * 20); }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); clamp(event.key === 'Home' ? min : max); }
    }} />;
}
