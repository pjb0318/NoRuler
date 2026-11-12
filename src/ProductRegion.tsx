import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { ShapeEvidence } from './imageDimensions';

export type Region = NonNullable<ShapeEvidence['region']>;
type Point = { x: number; y: number };

function position(event: PointerEvent<HTMLDivElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
}

function rectangle(a: Point, b: Point): Region {
  return { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) };
}

export default function ProductRegion({ src, zoom, region, onRegion }: {
  src: string;
  zoom: number;
  region?: Region | null;
  onRegion?: (next: Region) => void;
}) {
  const [drawing, setDrawing] = useState(false);
  const [temporary, setTemporary] = useState<Region>();
  const start = useRef<{ pointerId: number; point: Point } | null>(null);
  const visibleRegion = temporary ?? region;
  function finish() {
    start.current = null;
    setTemporary(undefined);
  }

  return <>
    {onRegion && <div className="product-region-tools">
      <button type="button" aria-pressed={drawing} onClick={() => setDrawing(value => !value)}>
        {drawing ? '영역 지정 취소' : '상품 영역 다시 지정'}
      </button>
      {drawing && <small>원본 위에서 상품을 둘러싸도록 드래그하세요.</small>}
    </div>}
    <div className="image-review-viewport">
      <div className={drawing ? 'product-region is-drawing' : 'product-region'} style={{ width: `${zoom * 100}%` }}
        onPointerDown={event => {
          if (!drawing || event.button !== 0 || start.current) return;
          start.current = { pointerId: event.pointerId, point: position(event) };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (start.current?.pointerId === event.pointerId) setTemporary(rectangle(start.current.point, position(event)));
        }}
        onPointerUp={event => {
          if (start.current?.pointerId !== event.pointerId) return;
          const next = rectangle(start.current.point, position(event));
          finish();
          if (next.right - next.left < .005 || next.bottom - next.top < .005) return;
          onRegion?.(next);
          setDrawing(false);
        }}
        onPointerCancel={finish}
        onLostPointerCapture={finish}>
        <img src={src} alt={onRegion ? '확대한 상품 사진' : '확대한 원본'} draggable={false} />
        {visibleRegion && <div className="product-region-outline" aria-label="선택한 상품 영역" style={{
          left: `${visibleRegion.left * 100}%`, top: `${visibleRegion.top * 100}%`,
          width: `${(visibleRegion.right - visibleRegion.left) * 100}%`,
          height: `${(visibleRegion.bottom - visibleRegion.top) * 100}%`,
        }} />}
      </div>
    </div>
  </>;
}
