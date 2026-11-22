import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Box, Focus, Grid2X2, Minus, Move, Plus, RotateCcw, Ruler, Tags, TriangleAlert } from 'lucide-react';
import { ComparisonScene } from './scene';
import type { MoveState, TransformMode, View } from './scene';
import type { Unit } from './domain';
import type { CameraState, Preferences, ThemeMode } from './storage';
import type { Pose, SceneInstance } from './workspace';

function moveStatusText(moveState: MoveState, mode: TransformMode) {
  if (moveState.dragging) {
    const suffix = moveState.snapStatus ? ` · ${moveState.snapStatus}` : '';
    if (mode === 'rotate' || moveState.dragMode === 'rotate') {
      return `회전 중 · ${Math.round(moveState.yawDeg ?? 0)}°${suffix}`;
    }
    if (moveState.dragMode === 'axis-y') {
      return `높이 조절 중 · ${Math.round(moveState.heightMm ?? 0)} mm${suffix}`;
    }
    return `바닥에서 이동 중${suffix}`;
  }
  if (moveState.placementMessage) return moveState.placementMessage;
  if (!moveState.selected) return '물건을 선택해 드래그로 옮기세요';
  if (mode === 'rotate') return '물건이나 초록 고리를 드래그해 회전하세요';
  const heightMm = moveState.heightMm ?? 0;
  if (heightMm >= 0.5) return `바닥에서 ${Math.round(heightMm)} mm 떠 있음 · '바닥에 놓기' 버튼이나 이 안내를 눌러 내려놓으세요`;
  return '물건을 드래그해 바닥에서 이동 · 초록 화살표로 높이 조절';
}

const views: { id: View; label: string }[] = [
  { id: 'perspective', label: '3D' },
  { id: 'front', label: '정면' },
  { id: 'right', label: '오른쪽' },
  { id: 'back', label: '뒤' },
  { id: 'left', label: '왼쪽' },
  { id: 'top', label: '위에서' },
];

export default function SceneViewer({ instances, unit, resetKey, selectedId, onSelect, onPoseCommit, onReset, onResetOne, initialCamera, onCamera, preferences, onPreferences, colorIndices, theme }: {
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
  colorIndices: ReadonlyMap<string, number>;
  theme: ThemeMode;
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
    scene.update(instances, unit, dimensions, grid, colorIndices);
    if (firstUpdate.current && camera) scene.restoreCamera(camera);
    firstUpdate.current = false;
  }, [instances, unit, dimensions, grid, colorIndices, retry]);
  useEffect(() => { if (resetKey) engine.current?.fit(); }, [resetKey]);
  useEffect(() => { setResetError(false); engine.current?.selectObject(selectedId); }, [selectedId, retry]);
  useEffect(() => { engine.current?.setSnapEnabled(snap); }, [snap, retry]);
  useEffect(() => { engine.current?.setTransformMode(mode); }, [mode, retry]);
  useEffect(() => { engine.current?.setTheme(theme); }, [theme, retry]);
  const isFloating = (moveState.heightMm ?? 0) >= 0.05;
  const canGroundFromStatus = !moveState.dragging && !moveState.placementMessage
    && !!moveState.selected && mode === 'translate' && (moveState.heightMm ?? 0) >= 0.5;
  const groundSelected = () => engine.current?.groundSelected();
  const viewerClass = [
    'viewer',
    moveState.dragging ? 'is-moving-product' : '',
    moveState.dragging && moveState.snapTone === 'snapped' ? 'is-snap-active' : '',
    moveState.dragging && moveState.snapTone === 'blocked' ? 'is-snap-blocked' : '',
    names ? '' : 'hide-object-names',
  ].filter(Boolean).join(' ');
  return <div className="viewer-shell"><section className={viewerClass} aria-label="3D 비교 공간">
    <div className="viewer-top-right">
      <span className="scale-badge">1:1 실제 축척</span>
      <div className="view-indicator" aria-label="현재 시점">{views.find(option => option.id === view)?.label ?? '자유 시점'}</div>
    </div>
    <div className="scene" ref={host} />
    {!error && !instances.length && <p className="scene-empty" role="status">비교할 물건을 공간에 추가해 주세요.</p>}
    {error && <div className="scene-error"><TriangleAlert size={30} /><h3>3D 화면을 불러오지 못했어요</h3><p>브라우저의 하드웨어 가속을 켜거나<br />WebGL을 지원하는 브라우저에서 열어 주세요.</p><button onClick={() => { setError(false); setRetry(v => v + 1); }}>다시 시도</button></div>}
    <div className="view-switch" aria-label="시점 선택">
      {views.map(({ id, label }) => <button key={id} aria-pressed={view === id} onClick={() => engine.current?.setView(id)}>
        {id === 'perspective' && <Box size={14} />}{label}
      </button>)}
    </div>
    {instances.length > 0 && <div className="object-move-bar">
      <span role="status" className={canGroundFromStatus ? 'is-actionable' : undefined}>
        {canGroundFromStatus
          ? <button type="button" className="move-status-action" onClick={groundSelected}>{moveStatusText(moveState, mode)}</button>
          : moveStatusText(moveState, mode)}
      </span>
      <button aria-label="물건 위치 초기화" title="물건의 위치와 회전 초기화" disabled={!moveState.moved} onClick={onReset}><RotateCcw size={12} />위치 초기화</button>
    </div>}
    <div className="viewer-tools">
      <button title="확대" aria-label="확대" onClick={() => engine.current?.zoom(1.25)}><Plus size={18} /></button>
      <button title="축소" aria-label="축소" onClick={() => engine.current?.zoom(.8)}><Minus size={18} /></button>
      <span />
      <button title="전체 맞춤" aria-label="전체 맞춤" onClick={() => engine.current?.fit()}><Focus size={18} /></button>
      <button title="이름 표시" aria-label="이름 표시" aria-pressed={names} onClick={() => onPreferences({ names: !names })}><Tags size={18} /></button>
      <button title="치수 표시" aria-label="치수 표시" aria-pressed={dimensions} onClick={() => onPreferences({ dimensions: !dimensions })}><Ruler size={18} /></button>
      <button title="격자 표시" aria-label="격자 표시" aria-pressed={grid} onClick={() => onPreferences({ grid: !grid })}><Grid2X2 size={18} /></button>
    </div>
    <div className="viewer-bottom">
      <span>빈 공간 드래그로 회전</span>
      <span>스크롤·핀치로 확대</span>
      <span className="pan-hint">우클릭 드래그로 화면 이동</span>
    </div>
    <div className="grid-caption">격자 한 칸 = 10 cm</div>
  </section>
    {moveState.selected && <div className="move-controls" role="group" aria-label={`${moveState.selected} 조작`}>
      <div className="move-controls-primary">
        <div className="move-controls-header">
          <span className="selected-pill">선택됨</span>
          <strong>{moveState.selected}</strong>
        </div>
        <div className="object-transform-modes" aria-label="물건 조작 방식">
          <button aria-pressed={mode === 'translate'} onClick={() => setMode('translate')}><Move size={14} />이동</button>
          <button aria-pressed={mode === 'rotate'} onClick={() => setMode('rotate')}><RotateCcw size={14} />회전</button>
        </div>
        <button className="snap-toggle" aria-pressed={snap} onClick={() => onPreferences({ snap: !snap })}>자동 붙이기 {snap ? '켜짐' : '꺼짐'}</button>
        <div className="axis-guide" aria-label="이동 축"><span>X 좌우</span><span>Y 높이</span><span>Z 앞뒤</span></div>
      </div>
      <div className="move-controls-secondary">
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
          <button type="button" className={isFloating ? 'ground-button is-floating-action' : 'ground-button'} disabled={!isFloating} onClick={groundSelected}><ArrowDownToLine size={13} />바닥에 놓기</button>
          <button type="button" onClick={() => engine.current?.fitSelected()}>선택 맞춤</button>
          <button type="button" onClick={() => setResetError(!!moveState.id && !onResetOne(moveState.id))}>선택 위치 초기화</button>
        </div>
      </div>
      <button type="button" className="deselect-button" aria-label="물건 선택 해제" onClick={() => engine.current?.clearSelection()}>×</button>
      {resetError && <p className="pose-error" role="alert">초기 위치에 놓을 공간이 없어요.</p>}
    </div>}
  </div>;
}
