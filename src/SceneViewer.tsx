import { useEffect, useRef, useState } from 'react';
import { Box, Focus, Grid2X2, Maximize2, Minus, Move, Plus, Rotate3D, RotateCcw, Ruler, Tags, TriangleAlert } from 'lucide-react';
import { ComparisonScene } from './scene';
import type { MoveState, TransformMode, View } from './scene';
import type { Product, Preset, Unit } from './domain';

const views: { id: View; label: string }[] = [
  { id: 'perspective', label: '3D' },
  { id: 'front', label: '정면' },
  { id: 'right', label: '오른쪽' },
  { id: 'back', label: '뒤' },
  { id: 'left', label: '왼쪽' },
  { id: 'top', label: '위에서' },
];

export default function SceneViewer({ product, presets, unit, resetKey }: { product: Product | null; presets: Preset[]; unit: Unit; resetKey: number }) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<ComparisonScene | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<View | null>('perspective');
  const [mode, setMode] = useState<TransformMode>('translate');
  const [grid, setGrid] = useState(true);
  const [dimensions, setDimensions] = useState(true);
  const [names, setNames] = useState(true);
  const [moveState, setMoveState] = useState<MoveState>({ moved: false, dragging: false, selected: null });
  useEffect(() => {
    try { engine.current = new ComparisonScene(host.current!, () => setError(true), setMoveState, setView);
      setView('perspective'); }
    catch { setError(true); }
    return () => { engine.current?.destroy(); engine.current = null; };
  }, [retry]);
  useEffect(() => { engine.current?.update(product, presets, unit, dimensions, grid); }, [product, presets, unit, dimensions, grid, retry]);
  useEffect(() => { engine.current?.resetProductPosition(); }, [resetKey, retry]);
  useEffect(() => { engine.current?.setTransformMode(mode); }, [mode, retry]);
  return <section className={`viewer${moveState.dragging ? ' is-moving-product' : ''}${names ? '' : ' hide-object-names'}`} aria-label="3D 비교 공간">
    <div className="viewer-top"><span className="live-badge"><span /> LIVE COMPARISON</span><span className="scale-badge">모든 물건, 같은 축척</span></div>
    <div className="scene" ref={host} />
    {error && <div className="scene-error"><TriangleAlert size={30} /><h3>3D 화면을 불러오지 못했어요</h3><p>브라우저의 하드웨어 가속을 켜거나<br />WebGL을 지원하는 브라우저에서 열어 주세요.</p><button onClick={() => { setError(false); setRetry(v => v + 1); }}>다시 시도</button></div>}
    <div className="view-switch" aria-label="시점 선택">
      {views.map(({ id, label }) => <button key={id} aria-pressed={view === id} onClick={() => engine.current?.setView(id)}>
        {id === 'perspective' && <Box size={14} />}{label}
      </button>)}
    </div>
    <div className="object-move-bar">
      <span role="status"><Move size={13} />{moveState.dragging ? (mode === 'rotate' ? '물건을 돌리는 중이에요' : '물건을 옮기는 중이에요') : moveState.selected ? '물건 위의 손잡이를 드래그하세요' : '물건을 클릭하거나 탭해 선택하세요'}</span>
      <button aria-label="물건 위치 초기화" title="물건의 위치와 회전 초기화" disabled={!moveState.moved} onClick={() => engine.current?.resetProductPosition()}><RotateCcw size={12} />위치 초기화</button>
    </div>
    {moveState.selected && <div className="move-controls" role="group" aria-label={`${moveState.selected} 조작`}>
      <div className="move-controls-header"><span>{moveState.selected}</span><button aria-label="물건 선택 해제" onClick={() => engine.current?.clearSelection()}>×</button></div>
      <div className="object-transform-modes" aria-label="물건 조작 방식">
        <button aria-pressed={mode === 'translate'} onClick={() => setMode('translate')}><Move size={14} />이동</button>
        <button aria-pressed={mode === 'rotate'} onClick={() => setMode('rotate')}><RotateCcw size={14} />회전</button>
      </div>
    </div>}
    <div className="viewer-tools">
      <button title="확대" aria-label="확대" onClick={() => engine.current?.zoom(1.25)}><Plus size={18} /></button>
      <button title="축소" aria-label="축소" onClick={() => engine.current?.zoom(.8)}><Minus size={18} /></button>
      <span />
      <button title="전체 맞춤" aria-label="전체 맞춤" onClick={() => engine.current?.fit()}><Focus size={18} /></button>
      <button title="이름 표시" aria-label="이름 표시" aria-pressed={names} onClick={() => setNames(v => !v)}><Tags size={18} /></button>
      <button title="치수 표시" aria-label="치수 표시" aria-pressed={dimensions} onClick={() => setDimensions(v => !v)}><Ruler size={18} /></button>
      <button title="격자 표시" aria-label="격자 표시" aria-pressed={grid} onClick={() => setGrid(v => !v)}><Grid2X2 size={18} /></button>
    </div>
    <div className="viewer-bottom"><span><Rotate3D size={14} />빈 공간 드래그로 회전</span><span><Maximize2 size={13} />스크롤·핀치로 확대</span><span className="pan-hint"><Move size={13} />우클릭 드래그로 화면 이동</span></div>
    <div className="grid-caption">격자 한 칸 = 10 cm</div>
  </section>;
}
