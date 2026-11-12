import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Box, Copy, ChevronDown, CircleHelp, File, Info, Keyboard, Laptop, Monitor, Redo2, RotateCcw, Undo2, Smartphone, Sparkles, X } from 'lucide-react';
import SceneViewer from './SceneViewer';
import ModelLibrary from './ModelLibrary';
import ImageInput from './ImageInput';
import type { ImageChoice } from './ImageInput';
import DeskPreview from './DeskPreview';
import { deskPreviewDimensions, makeDeskShape } from './deskModel';
import { supportsDesk } from './imageDimensions';
import type { ImageDimensions } from './imageDimensions';
import { AXES, DEFAULT_PRODUCT, PRESETS, dimensionText, displayValue, formatNumber, parseDimensions } from './domain';
import type { Dimensions, PresetId, SavedModel, Unit } from './domain';
import { addInstance, changeScene, initialInstances, placeInstance, resetLayout, stepScene, updateSceneMetadata } from './workspace';
import type { Pose, SceneHistory, SceneInstance } from './workspace';
import { readWorkspace, writeWorkspace } from './storage';
import type { CameraState, Preferences, Workspace } from './storage';

function PresetIcon({ id, size = 26 }: { id: PresetId; size?: number }) {
  if (id === 'bottle') return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 3h6v4l3 4v12a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V11l3-4V3Z" /><path d="M11 6h6M8 14h12M8 20h12M12 3h4" /></svg>;
  if (id.startsWith('custom-')) return <Box size={size} />;
  const Icon = { a4: File, phone: Smartphone, laptop: Laptop, keyboard: Keyboard, monitor: Monitor }[id as 'a4' | 'phone' | 'laptop' | 'keyboard' | 'monitor'];
  return <Icon size={size} strokeWidth={1.45} />;
}
const axisLabels = { width: ['가로', 'Width', 'W'], depth: ['깊이', 'Depth', 'D'], height: ['높이', 'Height', 'H'] };
type AxisReview = Partial<Record<keyof Dimensions, 'confirmed' | 'edited' | 'pending'>>;
type OptionDraft = {
  name: string;
  draft: Record<keyof Dimensions, string>;
  unit: Unit;
  readings: ImageDimensions;
  reviewedAxes: AxisReview;
  frontFlipped: boolean;
};

const makeDraft = (d: Dimensions, unit: Unit) => Object.fromEntries(AXES.map(axis => [axis, displayValue(d[axis], unit)])) as Record<keyof Dimensions, string>;

export default function App() {
  const [initial] = useState(readWorkspace);
  const [library, setLibrary] = useState(initial.library);
  const [history, setHistory] = useState<SceneHistory>({ present: initial.instances, past: [], future: [] });
  const instances = history.present;
  const [preferences, setPreferences] = useState(initial.preferences);
  const [storageFailed, setStorageFailed] = useState(false);
  const pendingSave = useRef<number | undefined>(undefined);
  const saved = useRef<Workspace>(initial);
  function setInstances(change: (items: SceneInstance[]) => SceneInstance[]) {
    setHistory(current => changeScene(current, change));
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = instances.find(item => item.id === editingId);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const [name, setName] = useState((initial.instances.find(item => !item.shape)?.snapshot ?? DEFAULT_PRODUCT).name);
  const [draft, setDraft] = useState(() => makeDraft(initial.instances.find(item => !item.shape)?.snapshot ?? DEFAULT_PRODUCT, initial.unit));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [help, setHelp] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [imageKey, setImageKey] = useState(0);
  const [readings, setReadings] = useState<ImageDimensions | null>(null);
  const [reviewedAxes, setReviewedAxes] = useState<AxisReview>({});
  const [choice, setChoice] = useState<ImageChoice | null>(null);
  const optionDrafts = useRef(new Map<string, OptionDraft>());
  const [frontFlipped, setFrontFlipped] = useState(false);
  const [swapAxes, setSwapAxes] = useState('width-depth');
  const parsed = parseDimensions(draft, unit);
  const needsAxisReview = (axis: keyof Dimensions) => !!readings && (
    reviewedAxes[axis] === 'pending' && draft[axis].trim() !== '' ||
    !reviewedAxes[axis] && readings[axis].mm !== null && readings[axis].needsReview
  );
  const evidence = choice?.subject?.shapeEvidence;
  const clearance = choice?.candidate.clearance;
  const deskShape = supportsDesk(evidence) && readings
    ? { ...makeDeskShape(clearance?.mm, choice?.candidate.dimensions.height.mm ?? null), frontFlipped }
    : undefined;
  const reviewedDimensions = !!parsed && !AXES.some(needsAxisReview);
  const previewDimensions = Object.fromEntries(AXES.map(axis => {
    const mm = Number(draft[axis]) * (unit === 'cm' ? 10 : 1);
    return [axis, mm >= .1 && mm <= 10000 ? mm : deskPreviewDimensions[axis]];
  })) as Dimensions;
  const dirty = !editing || name.trim() !== editing.snapshot.name || !parsed || AXES.some(axis => parsed[axis] !== editing.snapshot[axis]);
  function save() {
    window.clearTimeout(pendingSave.current);
    try {
      writeWorkspace(saved.current);
      setStorageFailed(false);
    } catch { setStorageFailed(true); }
  }
  function recordCamera(camera: CameraState) {
    saved.current = { ...saved.current, camera };
    window.clearTimeout(pendingSave.current);
    pendingSave.current = window.setTimeout(save, 160);
  }
  useEffect(() => {
    saved.current = { ...saved.current, instances, unit, library, preferences };
    save();
  }, [instances, unit, library, preferences]);
  useEffect(() => {
    window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('pagehide', save); window.clearTimeout(pendingSave.current); };
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey ||
          (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]'))) return;
      if (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y') {
        event.preventDefault();
        setHistory(current => stepScene(current, event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo'));
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    if (!help) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelp(false);
      if (event.key === 'Tab') {
        const buttons = document.querySelectorAll<HTMLButtonElement>('.help-popover button');
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); document.querySelector<HTMLButtonElement>('.help-button')?.focus(); };
  }, [help]);
  function useImageChoice(next: ImageChoice | null, reset = false) {
    if (reset) optionDrafts.current.clear();
    else if (choice && readings) optionDrafts.current.set(choice.id, { name, draft, unit, readings, reviewedAxes, frontFlipped });
    setChoice(next);
    setReviewedAxes({});
    setFrontFlipped(false);
    setError('');
    if (!next) {
      setReadings(null);
      if (choice) setDraft({ width: '', depth: '', height: '' });
      return;
    }
    const previous = optionDrafts.current.get(next.id);
    if (previous) {
      setName(previous.name);
      setDraft(previous.draft);
      setUnit(previous.unit);
      setReadings(previous.readings);
      setReviewedAxes(previous.reviewedAxes);
      setFrontFlipped(previous.frontFlipped);
      return;
    }
    if (next.subject && supportsDesk(next.subject.shapeEvidence)) {
      const label = next.candidate.label;
      const subject = next.subject.label;
      setName((subject === label ? subject : `${subject} · ${label}`).slice(0, 60));
    }
    const result = next.candidate.dimensions;
    setReadings(result);
    setUnit('mm');
    setDraft(Object.fromEntries(AXES.map(axis => [
      axis, result[axis].mm === null ? '' : displayValue(result[axis].mm, 'mm'),
    ])) as Record<keyof Dimensions, string>);
    setStatus('선택한 상품의 치수를 원본과 비교해 확인해 주세요.');
  }
  function exchangeImageAxes() {
    if (!readings) return;
    const [a, b] = swapAxes.split('-') as [keyof Dimensions, keyof Dimensions];
    setReadings({
      ...readings,
      [a]: { ...readings[b], needsReview: true },
      [b]: { ...readings[a], needsReview: true },
    });
    setDraft(current => ({ ...current, [a]: current[b], [b]: current[a] }));
    setReviewedAxes(current => ({ ...current, [a]: 'pending', [b]: 'pending' }));
    setError('');
  }
  function switchUnit(next: Unit) {
    if (next === unit) return;
    const factor = next === 'mm' ? 10 : .1;
    setDraft(previous => Object.fromEntries(AXES.map(axis => [axis, previous[axis].trim() === '' ? '' : Number.isFinite(Number(previous[axis])) ? String(Number((Number(previous[axis]) * factor).toFixed(8))) : previous[axis]])) as Record<keyof Dimensions, string>);
    setUnit(next);
  }
  function apply(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('제품명을 입력해 주세요.'); return; }
    if (!parsed) { setError(`각 치수는 ${unit === 'cm' ? '0.01~1,000 cm' : '0.1~10,000 mm'} 사이의 숫자로 입력해 주세요.`); return; }
    if (AXES.some(needsAxisReview)) {
      setError('확인 필요로 표시된 치수를 확인하거나 수정해 주세요.');
      return;
    }
    if (editing) {
      if (AXES.every(axis => editing.snapshot[axis] === parsed[axis])) return;
      const candidate = placeInstance({
        ...editing, shape: undefined, snapshot: { ...editing.snapshot, ...parsed },
      }, instances);
      if (!candidate) {
        setError('크기를 바꾸면 주변 물건과 겹쳐요. 먼저 물건을 옮겨 주세요.');
        return;
      }
      setInstances(current => current.map(item => item.id === editing.id ? candidate : item));
      setError('');
      setStatus('선택한 물건의 치수를 수정했어요.');
      return;
    }
    const existing = library.find(model => model.name === name.trim() &&
      AXES.every(axis => model[axis] === parsed[axis]) &&
      model.deskShape?.kind === deskShape?.kind &&
      model.deskShape?.frontFlipped === deskShape?.frontFlipped &&
      model.deskShape?.clearanceRatio === deskShape?.clearanceRatio);
    const id = existing?.id ?? `custom-${crypto.randomUUID()}`;
    const saved: SavedModel = { ...parsed, id, name: name.trim(), history: true, preset: existing?.preset ?? false, ...(deskShape ? { deskShape } : {}) };
    setLibrary(current => [saved, ...current.filter(model => model.id !== id)]);
    setInstances(current => addInstance(current, saved, saved.id));
    setError('');
    setStatus(deskShape ? '책상 모델을 비교 공간에 추가했어요.' : '입력한 크기를 3D 공간에 반영했어요.');
  }
  function resetInput() {
    setEditingId(null);
    setImageKey(key => key + 1);
    setReadings(null);
    setChoice(null);
    optionDrafts.current.clear();
    setFrontFlipped(false);
    setReviewedAxes({});
    setError('');
  }
  function openModel(model: SavedModel) {
    setInstances(current => addInstance(current, model, model.id));
    setStatus(`${model.name}을 3D 공간에 추가했어요.`);
  }
  function renameModel(id: SavedModel['id'], nextName: string) {
    setLibrary(current => current.map(model => model.id === id ? { ...model, name: nextName } : model));
    setHistory(current => updateSceneMetadata(current, item => item.assetId === id ? { ...item, snapshot: { ...item.snapshot, name: nextName } } : item));
    if (editing?.assetId === id) setName(nextName);
  }
  function changeLibrary(id: SavedModel['id'], field: 'history' | 'preset', enabled: boolean) {
    const next = library.map(model => model.id === id ? { ...model, [field]: enabled } : model)
      .filter(model => model.history || model.preset);
    setLibrary(next);
    if (!next.some(model => model.id === id)) {
      setHistory(current => updateSceneMetadata(current, item => item.assetId === id ? { ...item, assetId: null } : item));
    }
  }
  function editInstance(item: SceneInstance) {
    resetInput();
    setSelectedId(item.id);
    setEditingId(item.id);
    setName(item.snapshot.name);
    setDraft(makeDraft(item.snapshot, unit));
  }
  function commitPose(id: string, pose: Pose) {
    setInstances(current => {
      const item = current.find(other => other.id === id);
      if (!item || Math.abs(item.yawDeg - pose.yawDeg) < 1e-6 &&
          (['x', 'y', 'z'] as const).every(axis => Math.abs(item.positionMm[axis] - pose.positionMm[axis]) < 1e-6)) return current;
      return current.map(other => other.id === id ? { ...other, ...pose } : other);
    });
  }
  function resetOne(id: string) {
    const home = resetLayout(instances).find(item => item.id === id);
    const candidate = home ? placeInstance(home, instances) : null;
    if (!candidate) return false;
    commitPose(id, candidate);
    return true;
  }
  function saveEditedModel(item: SceneInstance) {
    const id = `custom-${crypto.randomUUID()}` as const;
    setLibrary(current => [{ ...item.snapshot, id, history: true, preset: false }, ...current]);
    setHistory(current => updateSceneMetadata(current, instance => instance.id === item.id ? { ...instance, assetId: id } : instance));
    setStatus('수정한 물건을 새 모델로 저장했어요.');
  }
  function reset() {
    resetInput();
    setResetKey(value => value + 1);
    setSelectedId(null);
    setInstances(() => initialInstances(DEFAULT_PRODUCT, PRESETS.filter(item => item.id === 'bottle' || item.id === 'phone')));
    setName(DEFAULT_PRODUCT.name);
    setUnit('cm');
    setDraft(makeDraft(DEFAULT_PRODUCT, 'cm'));
    setStatus('처음 예시로 돌아왔어요.');
  }
  return <>
    <header className="site-header"><div className="header-inner">
      <a href="/" className="brand" aria-label="NoRuler 홈"><span className="brand-mark"><svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M5 19V5l14 14V5" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" /></svg></span>NoRuler<span className="beta">BETA</span></a>
      <span className="header-tagline">I don’t want to find a ruler.</span>
      <button className="help-button" onClick={() => setHelp(v => !v)} aria-expanded={help}><CircleHelp size={17} />사용 방법</button>
    </div></header>
    <main>
      <section className="intro"><div><div className="eyebrow"><span /> LESS GUESSING, MORE KNOWING</div><h1>숫자였던 크기가,<br className="mobile-break" /> <span>감각이 되는 순간.</span></h1><p>자를 찾지 마세요. 익숙한 물건과 나란히 놓아보면 알 수 있어요.</p></div><div className="intro-note"><Box size={19} strokeWidth={1.4} /><span>크기 비교를 위한<br /><strong>작은 3D 작업실</strong></span></div></section>
      <div className="workspace">
        <aside className="sidebar">
          <section className="product-panel">
            <div className="section-heading"><span className="step">01</span><h2>어떤 제품인가요?</h2><Box size={18} /></div>
            {editing ? <button className="edit-mode" onClick={resetInput}>치수 수정 닫기</button> : <ImageInput key={`${resetKey}-${imageKey}`} onRead={useImageChoice} review={deskShape
              ? <DeskPreview dimensions={previewDimensions} shape={deskShape} complete={reviewedDimensions} view={evidence?.view} unseen={evidence?.unseen}
                  onFlip={() => setFrontFlipped(value => !value)} />
              : null} />}
            <form onSubmit={apply} noValidate>
              <label className="field-label" htmlFor="product-name">제품명</label>
              <input id="product-name" className="name-input" value={name} readOnly={!!editing} onChange={e => setName(e.target.value)} maxLength={60} placeholder="예: 사고 싶은 수납함" autoComplete="off" />
              <div className="dimensions-heading"><span className="field-label">제품 치수</span><div className="unit-switch" aria-label="치수 단위">{(['mm', 'cm'] as Unit[]).map(value => <button type="button" key={value} aria-pressed={unit === value} onClick={() => switchUnit(value)}>{value}</button>)}</div></div>
              <div className="dimension-fields">{AXES.map(axis => <div className="dimension-field" key={axis}><label htmlFor={axis}><span className={`axis-dot ${axis}`} />{axisLabels[axis][0]}<span>{axisLabels[axis][1]}</span></label><div><input id={axis} type="number" inputMode="decimal" step="any" min={unit === 'cm' ? .01 : .1} max={unit === 'cm' ? 1000 : 10000} value={draft[axis]} onChange={e => {
                setDraft({ ...draft, [axis]: e.target.value });
                if (readings) {
                  setReviewedAxes(current => ({ ...current, [axis]: e.target.value.trim() ? 'edited' : undefined }));
                  setError('');
                }
              }} aria-invalid={!!error && !parsed} aria-describedby={error ? 'input-error' : undefined} /><span>{unit}</span></div>{readings && <small className="image-reading">
                {reviewedAxes[axis] === 'edited' ? (readings[axis].mm === null ? '직접 입력함' : '사용자 수정') :
                  reviewedAxes[axis] === 'confirmed' ? '확인함' : needsAxisReview(axis) ? '확인 필요' :
                    readings[axis].mm === null ? '직접 입력' : '이미지에서 읽음'}
                {readings[axis].evidence && <span>{readings[axis].evidence}</span>}
                {needsAxisReview(axis) &&
                  <button className="confirm-axis" type="button" aria-label={`${axisLabels[axis][0]} 치수 확인`} onClick={() => {
                    setReviewedAxes(current => ({ ...current, [axis]: 'confirmed' }));
                    setError('');
                  }}>이 값 확인</button>}
              </small>}</div>)}</div>
              {deskShape && <p className="input-caption">비교 공간에서는 책상의 전체 외곽을 기준으로 배치해요.</p>}
              {clearance?.mm != null && <p className="input-caption">하부 여유 높이 약 {displayValue(clearance.mm, unit)} {unit}</p>}
              {evidence?.readiness === 'needs_view' && <p className="input-caption">
                {evidence.nextView ? `형태를 확인하려면 ${evidence.nextView} 사진이 필요해요.` : '형태를 확인하려면 다른 각도의 사진이 필요해요.'} 치수를 입력하면 상자로 비교할 수 있어요.
              </p>}
              {evidence?.readiness === 'ready' && !deskShape && <p className="input-caption">이 형태는 아직 3D 초안을 지원하지 않아요. 치수를 입력하면 상자로 비교할 수 있어요.</p>}
              {readings && <div className="axis-swap">
                <select aria-label="교환할 치수 축" value={swapAxes} onChange={event => setSwapAxes(event.target.value)}>
                  <option value="width-depth">가로 ↔ 깊이</option>
                  <option value="width-height">가로 ↔ 높이</option>
                  <option value="depth-height">깊이 ↔ 높이</option>
                </select>
                <button type="button" onClick={exchangeImageAxes}>축 교환</button>
              </div>}
              <div className="dimension-guide"><svg viewBox="0 0 100 70" width="83" height="63" fill="none"><path d="m25 24 32-12 25 16-32 13-25-17v24l25 17 32-13V28M50 41v24" stroke="#b5bfce" strokeWidth="1.4" /><path d="m23 54 23 15M85 32v22M54 69l28-12" stroke="#a7b9da" strokeWidth="1.2" /><text x="26" y="68" fill="#6380aa" fontSize="10">W</text><text x="89" y="47" fill="#6380aa" fontSize="10">H</text><text x="70" y="69" fill="#6380aa" fontSize="10">D</text></svg><p>상세 페이지의 치수를<br />그대로 입력해 주세요.</p></div>
              {error && <p id="input-error" className="input-error" role="alert">{error}</p>}
              <button className="primary-button" type="submit" disabled={!!deskShape && !reviewedDimensions}><Box size={17} />{editing ? '치수 수정 적용' : deskShape ? '책상을 비교 공간에 추가' : '3D로 크기 비교하기'}<ArrowRight size={17} /></button>
              {editing && <button type="button" className="edit-mode save-edited-model" onClick={() => saveEditedModel(editing)}>현재 치수를 새 모델로 저장</button>}
              <p className="input-caption">{editing && !dirty ? '선택한 물건에 반영되어 있어요' : '확인한 치수를 공간에 반영할 수 있어요'}</p>
            </form>
          </section>
          <section className="presets-panel"><div className="section-heading"><span className="step">02</span><h2>익숙한 물건과 비교</h2><span className="count-badge">{instances.length}</span></div><p className="section-description">함께 놓아볼 물건을 추가해 주세요.</p>
            <div className="preset-grid">{PRESETS.map(preset => {
              const count = instances.filter(item => item.shape === preset.id).length;
              return <button className="preset-card" key={preset.id} aria-label={`${preset.name} 공간에 추가`} onClick={() => setInstances(current => addInstance(current, preset, preset.id, preset.id))}>
                <PresetIcon id={preset.id} /><strong>{preset.name}</strong><small>{count ? `공간에 ${count}개 · 추가` : '공간에 추가'}</small>
              </button>;
            })}</div>
            <div className="preset-notice"><Info size={14} /><span>프리셋은 대표 치수예요.<br />실제 제품에 따라 크기가 다를 수 있어요.</span></div>
          </section>
        </aside>
        <div className="comparison-column"><SceneViewer instances={instances} unit={unit} resetKey={resetKey} selectedId={selectedId} onSelect={setSelectedId} onPoseCommit={commitPose} onResetOne={resetOne} initialCamera={initial.camera} onCamera={recordCamera}
            preferences={preferences} onPreferences={(patch: Partial<Preferences>) => setPreferences(current => ({ ...current, ...patch }))}
            onReset={() => { setInstances(resetLayout); setResetKey(value => value + 1); }} />
          <section className="comparison-details"><div className="details-heading"><h2><span className="blue-dot" />지금 비교 중인 물건</h2><div className="scene-history-actions">
              <button disabled={!history.past.length} onClick={() => setHistory(current => stepScene(current, 'undo'))}><Undo2 size={13} />실행 취소</button>
              <button disabled={!history.future.length} onClick={() => setHistory(current => stepScene(current, 'redo'))}><Redo2 size={13} />다시 실행</button>
              <button onClick={reset}><RotateCcw size={13} />초기화</button></div></div>
            {storageFailed && <p role="alert" className="input-error">이번 배치를 브라우저에 저장하지 못했어요.</p>}
            <div className="object-list">{instances.map(item => <div className="object-row" key={item.id}>
              <button className="object-icon" aria-label={`${item.snapshot.name} 선택`} aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}><PresetIcon id={item.shape ?? 'custom-box'} size={19} /></button>
              <div className="object-name"><strong title={item.snapshot.name}>{item.snapshot.name}</strong><small>{item.shape ? '기본 프리셋' : item.snapshot.deskShape ? '사진에서 만든 책상' : '내 제품'}</small></div>
              <span className="object-dimensions">{dimensionText(item.snapshot, unit)}</span>
              <button className="remove-object" onClick={() => editInstance(item)}>치수 수정</button>
              <button className="remove-object" aria-label={`${item.snapshot.name} 복제`} onClick={() => setInstances(current => addInstance(current, item.snapshot, item.assetId, item.shape))}><Copy size={14} /></button>
              <button className="remove-object" aria-label={`${item.snapshot.name} 공간에서 제거`} onClick={() => {
                if (editingId === item.id) resetInput();
                if (selectedId === item.id) setSelectedId(null);
                setInstances(current => current.filter(other => other.id !== item.id));
              }}><X size={14} /></button>
            </div>)}</div>
            {!instances.length && <p className="empty-selection"><ArrowDown size={15} />비교할 물건을 공간에 추가해 주세요.</p>}
            <p className="dimension-order">치수 순서: 가로(W) × 깊이(D) × 높이(H)</p>
          </section>
          <ModelLibrary models={library} unit={unit} onOpen={openModel} onRename={renameModel} onChange={changeLibrary} />
        </div>
      </div>
      <section className="bottom-note"><span className="sparkle-icon"><Sparkles size={18} /></span><div><strong>이 정도 크기였구나.</strong><p>구매 전 작은 확인이, 도착 후 큰 차이를 만듭니다.</p></div><span className="ratio-note">실제 치수 비율로 비교합니다.<br />화면에 보이는 크기가 실물 크기는 아니에요.</span></section>
      <span className="sr-only" role="status">{status}</span>
    </main>
    <footer><span className="footer-brand">NoRuler<span>자의 빈자리를 채우다.</span></span><span>Made for a better sense of size.</span></footer>
    {help && <div className="help-backdrop" onClick={() => setHelp(false)}><section className="help-popover" role="dialog" aria-modal="true" aria-label="사용 방법" onClick={e => e.stopPropagation()}><button className="close-help" autoFocus onClick={() => setHelp(false)} aria-label="사용 방법 닫기"><X size={20} /></button><span className="eyebrow">A LITTLE GUIDE</span><h2>자를 꺼내는 대신, 세 단계.</h2><ol><li><strong>제품 치수를 입력하세요.</strong><p>가로, 깊이, 높이를 mm 또는 cm로 입력해요. 단위를 바꿔도 크기는 유지됩니다.</p></li><li><strong>익숙한 물건을 골라 주세요.</strong><p>6가지 프리셋을 여러 개 함께 비교할 수 있어요. 노트북과 A4 용지는 바닥에 놓인 상태예요.</p></li><li><strong>돌려 보고, 가까이 보세요.</strong><p>물건을 클릭하거나 탭해 선택하세요. 이동 화살표와 평면 손잡이를 당기거나 회전 링으로 방향을 바꿀 수 있어요. 빈 공간을 드래그하면 시점이 바뀌고, 스크롤이나 두 손가락 핀치로 확대할 수 있어요. 위치 초기화로 물건의 위치와 방향을 되돌릴 수 있어요.</p></li></ol><p className="help-footnote"><Info size={16} />화면상의 1:1 실물 크기가 아닌, 객체 간 실제 비율을 보여줍니다. 제품 치수는 최대 {formatNumber(10000)} mm까지 입력할 수 있어요.</p><button className="primary-button" onClick={() => setHelp(false)}>비교 시작하기<ChevronDown size={17} /></button></section></div>}
  </>;
}
