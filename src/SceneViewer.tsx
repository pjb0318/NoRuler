import { useEffect, useRef, useState } from 'react';
import { Box, Focus, Grid2X2, Maximize2, Minus, Move, Plus, Rotate3D, RotateCcw, Ruler, Tags, TriangleAlert } from 'lucide-react';
import { ComparisonScene } from './scene';
import type { MoveState, TransformMode, View } from './scene';
import type { Unit } from './domain';
import type { CameraState, Preferences } from './storage';
import type { Pose, SceneInstance } from './workspace';

const views: { id: View; label: string }[] = [
  { id: 'perspective', label: '3D' },
  { id: 'front', label: '정면' },
  { id: 'right', label: '오른쪽' },
  { id: 'back', label: '뒤' },
  { id: 'left', label: '왼쪽' },
  { id: 'top', label: '위에서' },
];

export default function SceneViewer({ instances, unit, resetKey, selectedId, onSelect, onPoseCommit, onReset, onResetOne, initialCamera, onCamera, preferences, onPreferences }: {
  instances: SceneInstance[];
  unit: Unit;
  resetKey: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPoseCommit: (id: string, pose: Pose) => void;
  onReset: () => void;
  onResetOne: (id: string) => boolean;
  initialCamera: CameraState | null;
  onCamera: (camera: CameraState) => void;
  preferences: Preferences;
  onPreferences: (patch: Partial<Preferences>) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<ComparisonScene | null>(null);
  const [resetError, setResetError] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<View | null>('perspective');
  const [mode, setMode] = useState<TransformMode>('translate');
  const { grid, dimensions, names, snap } = preferences;
  const firstUpdate = useRef(true);
  const restoreCamera = useRef(initialCamera);
  const [moveState, setMoveState] = useState<MoveState>({ moved: false, dragging: false, selected: null });
  const callbacks = useRef({ onSelect, onPoseCommit, onCamera });
  useEffect(() => { callbacks.current = { onSelect, onPoseCommit, onCamera }; }, [onSelect, onPoseCommit, onCamera]);
  useEffect(() => {
    firstUpdate.current = true;
    try { engine.current = new ComparisonScene(host.current!, () => setError(true), state => {
      setMoveState(state);
      callbacks.current.onSelect(state.id ?? null);
    }, setView, (id, pose) => callbacks.current.onPoseCommit(id, pose), camera => {
      restoreCamera.current = camera;
      callbacks.current.onCamera(camera);
    }); }
    catch { setError(true); }
    return () => { engine.current?.destroy(); engine.current = null; };
  }, [retry]);
  useEffect(() => {
    const scene = engine.current;
    if (!scene) return;
    const camera = restoreCamera.current;
    scene.update(instances, unit, dimensions, grid);
    if (firstUpdate.current && camera) scene.restoreCamera(camera);
    firstUpdate.current = false;
  }, [instances, unit, dimensions, grid, retry]);
  useEffect(() => { if (resetKey) engine.current?.fit(); }, [resetKey]);
  useEffect(() => { setResetError(false); engine.current?.selectObject(selectedId); }, [selectedId, retry]);
  useEffect(() => { engine.current?.setSnapEnabled(snap); }, [snap, retry]);
  useEffect(() => { engine.current?.setTransformMode(mode); }, [mode, retry]);
  return <div className="viewer-shell"><section className={`viewer${moveState.dragging ? ' is-moving-product' : ''}${names ? '' : ' hide-object-names'}`} aria-label="3D 비교 공간">
    <div className="viewer-top"><span className="live-badge"><span /> LIVE COMPARISON</span><span className="scale-badge">모든 물건, 같은 축척</span></div>
    <div className="scene" ref={host} />
    {error && <div className="scene-error"><TriangleAlert size={30} /><h3>3D 화면을 불러오지 못했어요</h3><p>브라우저의 하드웨어 가속을 켜거나<br />WebGL을 지원하는 브라우저에서 열어 주세요.</p><button onClick={() => { setError(false); setRetry(v => v + 1); }}>다시 시도</button></div>}
    <div className="view-switch" aria-label="시점 선택">
      {views.map(({ id, label }) => <button key={id} aria-pressed={view === id} onClick={() => engine.current?.setView(id)}>
        {id === 'perspective' && <Box size={14} />}{label}
      </button>)}
    </div>
    <div className="view-indicator" aria-label="현재 시점">{views.find(option => option.id === view)?.label ?? '자유 시점'}</div>
    <div className="object-move-bar">
      <span role="status"><Move size={13} />{moveState.dragging ? (mode === 'rotate' ? '물건을 돌리는 중이에요' : '물건을 옮기는 중이에요') : moveState.placementMessage || (moveState.selected ? '물건 위의 손잡이를 드래그하세요' : '물건을 클릭하거나 탭해 선택하세요')}</span>
      <button aria-label="물건 위치 초기화" title="물건의 위치와 회전 초기화" disabled={!moveState.moved} onClick={onReset}><RotateCcw size={12} />위치 초기화</button>
    </div>
    <div className="viewer-tools">
      <button title="확대" aria-label="확대" onClick={() => engine.current?.zoom(1.25)}><Plus size={18} /></button>
      <button title="축소" aria-label="축소" onClick={() => engine.current?.zoom(.8)}><Minus size={18} /></button>
      <span />
      <button title="전체 맞춤" aria-label="전체 맞춤" onClick={() => engine.current?.fit()}><Focus size={18} /></button>
      <button title="이름 표시" aria-label="이름 표시" aria-pressed={names} onClick={() => onPreferences({ names: !names })}><Tags size={18} /></button>
      <button title="치수 표시" aria-label="치수 표시" aria-pressed={dimensions} onClick={() => onPreferences({ dimensions: !dimensions })}><Ruler size={18} /></button>
      <button title="격자 표시" aria-label="격자 표시" aria-pressed={grid} onClick={() => onPreferences({ grid: !grid })}><Grid2X2 size={18} /></button>
    </div>
    <div className="viewer-bottom"><span><Rotate3D size={14} />빈 공간 드래그로 회전</span><span><Maximize2 size={13} />스크롤·핀치로 확대</span><span className="pan-hint"><Move size={13} />우클릭 드래그로 화면 이동</span></div>
    <div className="grid-caption">격자 한 칸 = 10 cm</div>
  </section>
    {moveState.selected && <div className="move-controls" role="group" aria-label={`${moveState.selected} 조작`}>
      <div className="move-controls-header"><span>{moveState.selected}</span><button aria-label="물건 선택 해제" onClick={() => engine.current?.clearSelection()}>×</button></div>
      <div className="object-transform-modes" aria-label="물건 조작 방식">
        <button aria-pressed={mode === 'translate'} onClick={() => setMode('translate')}><Move size={14} />이동</button>
        <button aria-pressed={mode === 'rotate'} onClick={() => setMode('rotate')}><RotateCcw size={14} />회전</button>
      </div>
      <button className="snap-toggle" aria-pressed={snap} onClick={() => onPreferences({ snap: !snap })}>자동 붙이기 {snap ? '켜짐' : '꺼짐'}</button>
      <div className="axis-guide" aria-label="이동 축"><span>X 좌우</span><span>Y 높이</span><span>Z 앞뒤</span></div>
      <form className="pose-form" key={JSON.stringify([moveState.id, moveState.heightMm, moveState.yawDeg])} onSubmit={event => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        engine.current?.setSelectedPose(Number(values.get('height')), Number(values.get('yaw')));
      }}>
        <label>높이 (mm)<input name="height" type="number" min="0" max="10000" step="any" required defaultValue={Number((moveState.heightMm ?? 0).toFixed(2))} /></label>
        <label>회전 (°)<input name="yaw" type="number" step="any" required defaultValue={Number((moveState.yawDeg ?? 0).toFixed(2))} /></label>
        <button type="submit">적용</button>
      </form>
      <div className="pose-actions">
        {[-90, 90].map(angle => <button key={angle} type="button" onClick={() => engine.current?.setSelectedPose(moveState.heightMm ?? 0, (moveState.yawDeg ?? 0) + angle)}>{angle > 0 ? '+' : '−'}90°</button>)}
        <button type="button" onClick={() => engine.current?.fitSelected()}>선택 맞춤</button>
        <button type="button" onClick={() => setResetError(!!moveState.id && !onResetOne(moveState.id))}>선택 위치 초기화</button>
      </div>
      {resetError && <p className="pose-error" role="alert">초기 위치에 놓을 공간이 없어요.</p>}
    </div>}
  </div>;
}
