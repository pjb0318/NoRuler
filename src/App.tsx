import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Box,
  ChevronDown,
  CircleHelp,
  Copy,
  File,
  Info,
  Keyboard,
  Laptop,
  Layers,
  LayoutGrid,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  PlusSquare,
  Redo2,
  RotateCcw,
  Smartphone,
  Sun,
  Undo2,
  X,
} from 'lucide-react';
import SceneViewer from './SceneViewer';
import ModelLibrary from './ModelLibrary';
import ImageInput from './ImageInput';
import type { ImageChoice } from './ImageInput';
import DeskPreview from './DeskPreview';
import { deskPreviewDimensions, makeDeskShape } from './deskModel';
import { measurementSourceLabel, reconcileMeasurements, supportsDesk, supportsParametric } from './imageDimensions';
import type { ImageDimensions, Measurement } from './imageDimensions';
import { MODEL_PALETTE, getModelAccent } from './modelPalette';
import { parametricPreviewDimensions, sameParametricShape } from './parametricModel';
import { AXES, DEFAULT_PRODUCT, PRESETS, dimensionText, displayValue, formatNumber, parseDimensions } from './domain';
import type { Dimensions, PresetId, SavedModel, Unit } from './domain';
import { addInstance, changeScene, initialInstances, placeInstance, resetLayout, stepScene, updateSceneMetadata } from './workspace';
import type { Pose, SceneHistory, SceneInstance } from './workspace';
import { readWorkspace, writeWorkspace } from './storage';
import type { CameraState, Preferences, ThemeMode, Workspace } from './storage';

type PanelId = 'add' | 'presets' | 'objects' | 'library';

const panelTitles: Record<PanelId, string> = {
  add: '제품 추가',
  presets: '익숙한 물건 프리셋',
  objects: '놓인 물건',
  library: '내 모델',
};

function PresetIcon({ id, size = 22 }: { id: PresetId; size?: number }) {
  if (id === 'bottle') return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 3h6v4l3 4v12a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V11l3-4V3Z" /><path d="M11 6h6M8 14h12M8 20h12M12 3h4" /></svg>;
  if (id.startsWith('custom-')) return <Box size={size} />;
  const Icon = { a4: File, phone: Smartphone, laptop: Laptop, keyboard: Keyboard, monitor: Monitor }[id as 'a4' | 'phone' | 'laptop' | 'keyboard' | 'monitor'];
  return <Icon size={size} strokeWidth={1.5} />;
}

const axisLabels = { width: ['가로', 'W'], depth: ['깊이', 'D'], height: ['높이', 'H'] };
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
  const [activePanel, setActivePanel] = useState<PanelId>('add');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [inputMode, setInputMode] = useState<'image' | 'manual'>('image');
  const [imageSession, setImageSession] = useState<{ active: boolean; showForm: boolean }>({ active: false, showForm: false });
  const [toast, setToast] = useState('');
  const [library, setLibrary] = useState(initial.library);
  const [history, setHistory] = useState<SceneHistory>({ present: initial.instances, past: [], future: [] });
  const instances = history.present;
  const [preferences, setPreferences] = useState(initial.preferences);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const resolvedTheme: ThemeMode = preferences.theme ?? (systemDark ? 'dark' : 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#1e1e2e' : '#eff1f5');
  }, [resolvedTheme]);
  function toggleTheme() {
    setPreferences(current => ({ ...current, theme: resolvedTheme === 'dark' ? 'light' : 'dark' }));
  }
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
  const manualDraft = useRef<{ name: string; draft: Record<keyof Dimensions, string>; unit: Unit } | null>(null);
  const colorSlots = useRef(new Map<string, number>());
  const [frontFlipped, setFrontFlipped] = useState(false);
  const [swapAxes, setSwapAxes] = useState('width-depth');

  const { instanceColorIndices, nextColorSlot } = useMemo(() => {
    const counts = new Array(MODEL_PALETTE.length).fill(0);
    const nonPreset = instances.filter(item => !item.shape);
    for (const item of nonPreset) {
      const existing = colorSlots.current.get(item.id);
      if (existing !== undefined) counts[existing] += 1;
    }
    const indices = new Map<string, number>();
    for (const item of nonPreset) {
      let slot = colorSlots.current.get(item.id);
      if (slot === undefined) {
        slot = counts.indexOf(Math.min(...counts));
        colorSlots.current.set(item.id, slot);
        counts[slot] += 1;
      }
      indices.set(item.id, slot);
    }
    return {
      instanceColorIndices: indices,
      nextColorSlot: counts.indexOf(Math.min(...counts)),
    };
  }, [instances]);
  const previewAccent = getModelAccent(nextColorSlot);

  const parsed = parseDimensions(draft, unit);
  const needsAxisReview = (axis: keyof Dimensions) => !!readings && (
    reviewedAxes[axis] === 'pending' && draft[axis].trim() !== '' ||
    !reviewedAxes[axis] && readings[axis].mm !== null && readings[axis].needsReview
  );
  const evidence = choice?.subject?.shapeEvidence;
  const clearance = choice?.candidate.clearance;
  const deskShape = useMemo(() => (
    supportsDesk(evidence) && readings
      ? { ...makeDeskShape(clearance?.mm, choice?.candidate.dimensions.height.mm ?? null), frontFlipped }
      : undefined
  ), [evidence, readings, clearance?.mm, choice?.candidate.dimensions.height.mm, frontFlipped]);
  const parametricShape = useMemo(() => (
    !deskShape && supportsParametric(evidence) && readings
      ? { ...evidence!.parametric!, frontFlipped }
      : undefined
  ), [deskShape, evidence, readings, frontFlipped]);
  const draftShape = deskShape ?? parametricShape;
  const reviewedDimensions = !!parsed && !AXES.some(needsAxisReview);
  const previewDimensions = parametricShape
    ? parametricPreviewDimensions(parametricShape, draft, unit)
    : Object.fromEntries(AXES.map(axis => {
        const mm = Number(draft[axis]) * (unit === 'cm' ? 10 : 1);
        return [axis, mm >= .1 && mm <= 10000 ? mm : deskPreviewDimensions[axis]];
      })) as Dimensions;
  const dirty = !editing || name.trim() !== editing.snapshot.name || !parsed || AXES.some(axis => parsed[axis] !== editing.snapshot[axis]);

  function selectPanel(id: PanelId) {
    if (drawerOpen && activePanel === id) {
      setDrawerOpen(false);
      return;
    }
    setActivePanel(id);
    setDrawerOpen(true);
  }

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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
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
    if (next && !choice && !manualDraft.current) {
      manualDraft.current = { name, draft, unit };
    }
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
    if (next.subject) {
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

  function applyMeasurements(measurements: Measurement[]) {
    if (!choice || !readings) return;
    const merged = reconcileMeasurements(choice.candidate.dimensions, measurements);
    setReadings(merged);
    setDraft(current => {
      const updated = { ...current };
      for (const axis of AXES) {
        if (reviewedAxes[axis] && current[axis].trim()) continue;
        const mm = merged[axis].mm;
        updated[axis] = mm === null ? '' : displayValue(mm, unit);
      }
      return updated;
    });
    setError('');
  }

  function chooseMeasurement(axis: keyof Dimensions, mm: number) {
    setDraft(current => ({ ...current, [axis]: displayValue(mm, unit) }));
    setReviewedAxes(current => ({ ...current, [axis]: 'confirmed' }));
    setError('');
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

  function exitImageInput() {
    setChoice(null);
    setReadings(null);
    optionDrafts.current.clear();
    setFrontFlipped(false);
    setReviewedAxes({});
    setError('');
    if (manualDraft.current) {
      setName(manualDraft.current.name);
      setDraft(manualDraft.current.draft);
      setUnit(manualDraft.current.unit);
      manualDraft.current = null;
    }
    setStatus('직접 입력으로 돌아왔어요.');
  }

  function resetInput() {
    setEditingId(null);
    setImageKey(key => key + 1);
    setReadings(null);
    setChoice(null);
    optionDrafts.current.clear();
    manualDraft.current = null;
    setFrontFlipped(false);
    setReviewedAxes({});
    setError('');
  }

  function closeEdit() {
    resetInput();
    setActivePanel('objects');
    setDrawerOpen(true);
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('제품명을 입력해 주세요.'); return; }
    if (!parsed) { setError(`각 치수는 ${unit === 'cm' ? '0.01~1,000 cm' : '0.1~10,000 mm'} 사이의 숫자로 입력해 주세요.`); return; }
    if (AXES.some(needsAxisReview)) {
      setError('확인 필요로 표시된 치수를 확인하거나 수정해 주세요.');
      return;
    }
    if (editing) {
      if (AXES.every(axis => editing.snapshot[axis] === parsed[axis])) {
        closeEdit();
        return;
      }
      const candidate = placeInstance({
        ...editing, shape: undefined, snapshot: { ...editing.snapshot, ...parsed },
      }, instances);
      if (!candidate) {
        setError('크기를 바꾸면 주변 물건과 겹쳐요. 먼저 물건을 옮겨 주세요.');
        return;
      }
      setInstances(current => current.map(item => item.id === editing.id ? candidate : item));
      setEditingId(null);
      setError('');
      const msg = '선택한 물건의 치수를 수정했어요.';
      setStatus(msg);
      setToast(msg);
      setActivePanel('objects');
      return;
    }
    const existing = library.find(model => model.name === name.trim() &&
      AXES.every(axis => model[axis] === parsed[axis]) &&
      model.deskShape?.kind === deskShape?.kind &&
      model.deskShape?.frontFlipped === deskShape?.frontFlipped &&
      model.deskShape?.clearanceRatio === deskShape?.clearanceRatio &&
      sameParametricShape(model.parametricShape, parametricShape));
    const id = existing?.id ?? `custom-${crypto.randomUUID()}`;
    const nextModel: SavedModel = {
      ...parsed,
      id,
      name: name.trim(),
      history: true,
      preset: existing?.preset ?? false,
      ...(deskShape ? { deskShape } : {}),
      ...(parametricShape ? { parametricShape } : {}),
    };
    setLibrary(current => [nextModel, ...current.filter(model => model.id !== id)]);
    setInstances(current => addInstance(current, nextModel, nextModel.id));
    setError('');
    const msg = deskShape ? '책상 모델을 비교 공간에 추가했어요.' : parametricShape ? '3D 모델을 비교 공간에 추가했어요.' : '입력한 크기를 3D 공간에 반영했어요.';
    setStatus(msg);
    setToast(msg);
  }

  function openModel(model: SavedModel) {
    setInstances(current => addInstance(current, model, model.id));
    const msg = `${model.name}을 3D 공간에 추가했어요.`;
    setStatus(msg);
    setToast(msg);
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
    setActivePanel('add');
    setDrawerOpen(true);
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
    const msg = '수정한 물건을 새 모델로 저장했어요.';
    setStatus(msg);
    setToast(msg);
  }

  function reset() {
    resetInput();
    colorSlots.current.clear();
    setResetKey(value => value + 1);
    setSelectedId(null);
    setInstances(() => initialInstances(DEFAULT_PRODUCT, PRESETS.filter(item => item.id === 'bottle' || item.id === 'phone')));
    setName(DEFAULT_PRODUCT.name);
    setUnit('cm');
    setDraft(makeDraft(DEFAULT_PRODUCT, 'cm'));
    const msg = '처음 예시로 돌아왔어요.';
    setStatus(msg);
    setToast(msg);
  }

  function renderDimensionFields() {
    return (
      <div className="dimension-fields">
        {AXES.map(axis => (
          <div className="dimension-field" key={axis}>
            <label htmlFor={axis}>
              <span className={`axis-dot ${axis}`} />
              {axisLabels[axis][0]}
              <span aria-hidden="true">{axisLabels[axis][1]}</span>
            </label>
            <div>
              <input
                id={axis}
                type="number"
                inputMode="decimal"
                step="any"
                min={unit === 'cm' ? .01 : .1}
                max={unit === 'cm' ? 1000 : 10000}
                value={draft[axis]}
                onChange={e => {
                  setDraft({ ...draft, [axis]: e.target.value });
                  if (readings) {
                    setReviewedAxes(current => ({ ...current, [axis]: e.target.value.trim() ? 'edited' : undefined }));
                    setError('');
                  }
                }}
                aria-invalid={!!error && !parsed}
                aria-describedby={error ? 'input-error' : undefined}
              />
              <span>{unit}</span>
            </div>
            {readings && (
              <small className="image-reading">
                {reviewedAxes[axis] === 'edited' ? (readings[axis].mm === null ? '직접 입력함' : '사용자 수정') :
                  reviewedAxes[axis] === 'confirmed' ? '확인함' : needsAxisReview(axis) ? '확인 필요' :
                    readings[axis].mm === null ? (readings[axis].measurements?.length ? '값 충돌 · 출처 확인' : '직접 입력') : '자료에서 읽음'}
                {readings[axis].evidence && <span>{readings[axis].evidence}</span>}
                {needsAxisReview(axis) && (
                  <button
                    className="confirm-axis"
                    type="button"
                    aria-label={`${axisLabels[axis][0]} 치수 확인`}
                    onClick={() => {
                      setReviewedAxes(current => ({ ...current, [axis]: 'confirmed' }));
                      setError('');
                    }}
                  >
                    이 값 확인
                  </button>
                )}
              </small>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="header-left">
            <a href="/" className="brand" aria-label="NoRuler 홈">
              <span className="brand-mark">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <path d="M5 19V5l14 14V5" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />
                </svg>
              </span>
              NoRuler
            </a>
            <button
              type="button"
              className="sidebar-toggle-button"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(value => !value)}
            >
              {drawerOpen ? <><PanelLeftClose size={16} />사이드바 접기</> : <><PanelLeftOpen size={16} />사이드바 열기</>}
            </button>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="theme-toggle-button"
              aria-pressed={resolvedTheme === 'dark'}
              aria-label={resolvedTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              title={resolvedTheme === 'dark' ? '라이트 모드 (Catppuccin Latte)' : '다크 모드 (Catppuccin Mocha)'}
              onClick={toggleTheme}
            >
              {resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span>{resolvedTheme === 'dark' ? '라이트' : '다크'}</span>
            </button>
            <button className="help-button" onClick={() => setHelp(v => !v)} aria-expanded={help}>
              <CircleHelp size={16} />사용 방법
            </button>
          </div>
        </div>
      </header>

      <main className={drawerOpen ? 'studio-shell' : 'studio-shell is-collapsed'}>
        <nav className="studio-rail" aria-label="작업 패널">
          <button
            type="button"
            title="제품 추가"
            aria-pressed={drawerOpen && activePanel === 'add'}
            onClick={() => selectPanel('add')}
          >
            <PlusSquare size={20} strokeWidth={1.7} />
            <span className="rail-label">제품 추가</span>
          </button>
          <button
            type="button"
            title="프리셋"
            aria-pressed={drawerOpen && activePanel === 'presets'}
            onClick={() => selectPanel('presets')}
          >
            <LayoutGrid size={20} strokeWidth={1.7} />
            <span className="rail-label">프리셋</span>
          </button>
          <button
            type="button"
            title="놓인 물건"
            aria-pressed={drawerOpen && activePanel === 'objects'}
            onClick={() => selectPanel('objects')}
          >
            <Layers size={20} strokeWidth={1.7} />
            <span className="rail-label">놓인 물건</span>
            <span className="rail-badge" aria-hidden="true">{instances.length}</span>
          </button>
          <button
            type="button"
            title="내 모델"
            aria-pressed={drawerOpen && activePanel === 'library'}
            onClick={() => selectPanel('library')}
          >
            <Bookmark size={20} strokeWidth={1.7} />
            <span className="rail-label">내 모델</span>
            {library.length > 0 && <span className="rail-badge" aria-hidden="true">{library.length}</span>}
          </button>
        </nav>

        <aside className="studio-drawer" aria-label="도구 패널" hidden={!drawerOpen}>
          <div className="drawer-header">
            <div className="drawer-title">
              <h2>{editing && activePanel === 'add' ? '치수 수정' : panelTitles[activePanel]}</h2>
              {!editing && activePanel === 'objects' && <span className="count-badge">{instances.length}</span>}
            </div>
            <button
              type="button"
              className="drawer-close-button"
              aria-label="패널 닫기"
              onClick={() => setDrawerOpen(false)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="drawer-body">
            <div className="drawer-panel" hidden={activePanel !== 'add'}>
              {editing ? (
                <div className="drawer-edit-panel">
                  <div className="drawer-edit-bar">
                    <button type="button" className="image-back-button" onClick={closeEdit}>
                      <ArrowLeft size={14} />놓인 물건으로
                    </button>
                  </div>
                  <form className="dimension-form" onSubmit={apply} noValidate>
                    <div className="form-row-top">
                      <div className="form-name-group">
                        <label className="field-label" htmlFor="product-name">제품명</label>
                        <input
                          id="product-name"
                          className="name-input"
                          value={name}
                          readOnly
                          maxLength={60}
                          autoComplete="off"
                        />
                      </div>
                      <div className="form-unit-group">
                        <span className="field-label">치수 단위</span>
                        <div className="unit-switch" aria-label="치수 단위">
                          {(['mm', 'cm'] as Unit[]).map(value => (
                            <button type="button" key={value} aria-pressed={unit === value} onClick={() => switchUnit(value)}>{value}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {renderDimensionFields()}
                    {error && <p id="input-error" className="input-error" role="alert">{error}</p>}
                    <div className="drawer-submit-stack">
                      <button className="primary-button" type="submit">
                        <Box size={17} />치수 수정 적용<ArrowRight size={17} />
                      </button>
                      <button type="button" className="secondary-action-button save-edited-model" onClick={() => saveEditedModel(editing)}>
                        현재 치수를 새 모델로 저장
                      </button>
                    </div>
                    <p className="form-helper-note">
                      {!dirty ? '선택한 물건에 반영되어 있어요.' : '수정한 치수를 물건에 반영합니다.'}
                    </p>
                  </form>
                </div>
              ) : (
                <>
                  {!(inputMode === 'image' && imageSession.active) && (
                    <div className="mode-tabs" aria-label="제품 입력 방식">
                      <button
                        type="button"
                        aria-pressed={inputMode === 'image'}
                        onClick={() => setInputMode('image')}
                      >
                        사진·도면으로 가져오기
                      </button>
                      <button
                        type="button"
                        aria-pressed={inputMode === 'manual'}
                        onClick={() => setInputMode('manual')}
                      >
                        치수 직접 입력
                      </button>
                    </div>
                  )}

                  <div hidden={inputMode !== 'image'}>
                    <ImageInput
                      key={`${resetKey}-${imageKey}`}
                      onRead={useImageChoice}
                      onMeasurements={applyMeasurements}
                      onBack={exitImageInput}
                      onSessionChange={setImageSession}
                      review={draftShape ? (
                        <DeskPreview
                          dimensions={previewDimensions}
                          shape={draftShape}
                          complete={reviewedDimensions}
                          view={evidence?.view}
                          unseen={evidence?.unseen}
                          accent={previewAccent}
                          theme={resolvedTheme}
                          onFlip={() => setFrontFlipped(value => !value)}
                        />
                      ) : null}
                    />
                  </div>

                  {(inputMode === 'manual' || (inputMode === 'image' && imageSession.showForm)) && (
                    <form className="dimension-form" onSubmit={apply} noValidate>
                      <div className="form-row-top">
                        <div className="form-name-group">
                          <label className="field-label" htmlFor="product-name">제품명</label>
                          <input
                            id="product-name"
                            className="name-input"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            maxLength={60}
                            placeholder="예: 사고 싶은 수납함"
                            autoComplete="off"
                          />
                        </div>
                        <div className="form-unit-group">
                          <span className="field-label">치수 단위</span>
                          <div className="unit-switch" aria-label="치수 단위">
                            {(['mm', 'cm'] as Unit[]).map(value => (
                              <button type="button" key={value} aria-pressed={unit === value} onClick={() => switchUnit(value)}>{value}</button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {readings && (
                        <div className="axis-swap">
                          <select aria-label="교환할 치수 축" value={swapAxes} onChange={event => setSwapAxes(event.target.value)}>
                            <option value="width-depth">가로 ↔ 깊이</option>
                            <option value="width-height">가로 ↔ 높이</option>
                            <option value="depth-height">깊이 ↔ 높이</option>
                          </select>
                          <button type="button" onClick={exchangeImageAxes}>축 교환</button>
                        </div>
                      )}

                      {renderDimensionFields()}

                      {readings && AXES.some(axis => readings[axis].measurements?.length) && (
                        <details
                          className="measurement-evidence"
                          open={AXES.some(axis =>
                            readings[axis].mm === null && !!readings[axis].measurements?.length && !reviewedAxes[axis]
                          ) || undefined}
                        >
                          <summary>치수 출처 확인</summary>
                          {AXES.map(axis => {
                            const measurements = readings[axis].measurements;
                            if (!measurements?.length) return null;
                            const conflict = new Set(measurements.map(item => item.mm)).size > 1;
                            return (
                              <div key={axis}>
                                <strong>{axisLabels[axis][0]}{conflict && ' · 값 충돌'}</strong>
                                <ul>
                                  {measurements.map(item => (
                                    <li key={item.id}>
                                      {measurementSourceLabel(item)} · {item.location || '치수 표기'} · {item.quote}
                                      {conflict && (
                                        <button type="button" className="confirm-axis" onClick={() => chooseMeasurement(axis, item.mm)}>
                                          {displayValue(item.mm, unit)} {unit} 사용
                                        </button>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                        </details>
                      )}

                      {clearance?.mm != null && (
                        <p className="clearance-note">하부 여유 높이 약 {displayValue(clearance.mm, unit)} {unit}</p>
                      )}

                      {inputMode === 'manual' && (
                        <div className="dimension-guide">
                          <svg viewBox="0 0 100 70" width="76" height="56" fill="none" aria-hidden="true">
                            <path d="m25 24 32-12 25 16-32 13-25-17v24l25 17 32-13V28M50 41v24" stroke="var(--ink-muted)" strokeWidth="1.4" />
                            <path d="m23 54 23 15M85 32v22M54 69l28-12" stroke="var(--accent)" strokeWidth="1.2" />
                            <text x="26" y="68" fill="var(--accent)" fontSize="10" fontFamily="IBM Plex Mono, monospace">W</text>
                            <text x="89" y="47" fill="var(--accent)" fontSize="10" fontFamily="IBM Plex Mono, monospace">H</text>
                            <text x="70" y="69" fill="var(--accent)" fontSize="10" fontFamily="IBM Plex Mono, monospace">D</text>
                          </svg>
                          <p>상세 페이지의 치수를 입력하면 오른쪽 3D 공간에 바로 놓여요.</p>
                        </div>
                      )}

                      {error && <p id="input-error" className="input-error" role="alert">{error}</p>}

                      <div className="drawer-submit-stack">
                        <button className="primary-button" type="submit" disabled={!!draftShape && !reviewedDimensions}>
                          <Box size={17} />
                          {deskShape ? '책상을 비교 공간에 추가' : parametricShape ? '3D 모델을 비교 공간에 추가' : '3D로 크기 비교하기'}
                          <ArrowRight size={17} />
                        </button>
                        <p className="form-helper-note">
                          {deskShape
                            ? '비교 공간에서는 책상의 전체 외곽을 기준으로 배치해요.'
                            : parametricShape
                              ? '비교 공간에서는 모델의 전체 외곽을 기준으로 배치해요.'
                              : '입력한 크기의 3D 상자를 공간에 추가해요.'}
                        </p>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>

            {activePanel === 'presets' && (
              <div className="drawer-panel">
                <p className="drawer-subtitle">클릭하면 오른쪽 3D 비교 공간에 바로 놓여요.</p>
                <div className="preset-grid">
                  {PRESETS.map(preset => {
                    const count = instances.filter(item => item.shape === preset.id).length;
                    return (
                      <button
                        className="preset-card"
                        key={preset.id}
                        aria-label={`${preset.name} 공간에 추가`}
                        onClick={() => {
                          setInstances(current => addInstance(current, preset, preset.id, preset.id));
                          setToast(`${preset.name}을 공간에 추가했어요.`);
                        }}
                      >
                        <PresetIcon id={preset.id} />
                        <strong>{preset.name}</strong>
                        <small>{count ? `공간에 ${count}개 · 추가` : '공간에 추가'}</small>
                      </button>
                    );
                  })}
                </div>
                <div className="preset-notice">
                  <Info size={14} />
                  <span>프리셋은 대표 치수예요. 실제 제품에 따라 크기가 다를 수 있어요.</span>
                </div>
              </div>
            )}

            {activePanel === 'objects' && (
              <div className="drawer-panel">
                <div className="objects-toolbar">
                  <div className="scene-history-actions">
                    <button disabled={!history.past.length} onClick={() => setHistory(current => stepScene(current, 'undo'))}><Undo2 size={14} />실행 취소</button>
                    <button disabled={!history.future.length} onClick={() => setHistory(current => stepScene(current, 'redo'))}><Redo2 size={14} />다시 실행</button>
                    <button onClick={reset}><RotateCcw size={14} />초기화</button>
                  </div>
                </div>

                {storageFailed && <p role="alert" className="input-error">이번 배치를 브라우저에 저장하지 못했어요.</p>}

                {instances.length > 0 ? (
                  <>
                    <div className="object-list">
                      {instances.map(item => {
                        const accentStyle = item.shape
                          ? undefined
                          : ({ '--accent': getModelAccent(instanceColorIndices.get(item.id) ?? 0).badge } as CSSProperties);
                        return (
                          <div className="object-row" key={item.id}>
                            <button
                              className={item.shape ? 'object-icon' : 'object-icon is-product'}
                              style={accentStyle}
                              aria-label={`${item.snapshot.name} 선택`}
                              aria-pressed={selectedId === item.id}
                              onClick={() => setSelectedId(item.id)}
                            >
                              <PresetIcon id={item.shape ?? 'custom-box'} size={19} />
                            </button>
                            <div className="object-name">
                              <strong title={item.snapshot.name}>{item.snapshot.name}</strong>
                              <small>{item.shape ? '기본 프리셋' : item.snapshot.deskShape ? '사진에서 만든 책상' : item.snapshot.parametricShape ? '사진에서 만든 3D 모델' : '내 제품'}</small>
                            </div>
                            <span className="object-dimensions">{dimensionText(item.snapshot, unit)}</span>
                            <button className="row-action-button" onClick={() => editInstance(item)}>치수 수정</button>
                            <button className="remove-object" aria-label={`${item.snapshot.name} 복제`} onClick={() => setInstances(current => addInstance(current, item.snapshot, item.assetId, item.shape))}><Copy size={14} /></button>
                            <button
                              className="remove-object"
                              aria-label={`${item.snapshot.name} 공간에서 제거`}
                              onClick={() => {
                                if (editingId === item.id) resetInput();
                                if (selectedId === item.id) setSelectedId(null);
                                setInstances(current => current.filter(other => other.id !== item.id));
                              }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="objects-footer">
                      <p className="dimension-order">치수 순서: 가로(W) × 깊이(D) × 높이(H)</p>
                      <button
                        type="button"
                        className="secondary-action-button drawer-add-button"
                        onClick={() => setActivePanel('add')}
                      >
                        <Plus size={14} />새 제품 추가
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="dock-empty">
                    <p>비교 공간에 놓인 물건이 없어요. 새 제품이나 프리셋을 추가해 보세요.</p>
                    <div className="dock-empty-actions">
                      <button type="button" className="secondary-action-button" onClick={() => setActivePanel('add')}>새 제품 추가</button>
                      <button type="button" className="secondary-action-button" onClick={() => setActivePanel('presets')}>프리셋 보기</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activePanel === 'library' && (
              <div className="drawer-panel">
                <ModelLibrary
                  models={library}
                  unit={unit}
                  onOpen={openModel}
                  onRename={renameModel}
                  onChange={changeLibrary}
                  onGoPrepare={() => { setActivePanel('add'); setDrawerOpen(true); }}
                />
              </div>
            )}
          </div>
        </aside>

        <section className="studio-stage">
          <SceneViewer
            instances={instances}
            unit={unit}
            resetKey={resetKey}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPoseCommit={commitPose}
            onResetOne={resetOne}
            initialCamera={initial.camera}
            onCamera={recordCamera}
            preferences={preferences}
            onPreferences={(patch: Partial<Preferences>) => setPreferences(current => ({ ...current, ...patch }))}
            colorIndices={instanceColorIndices}
            theme={resolvedTheme}
            onReset={() => { setInstances(resetLayout); setResetKey(value => value + 1); }}
          />
          <div className="studio-footer">
            <span>NoRuler · 자의 빈자리를 채우다</span>
            <span>실제 치수 비율로 비교합니다. 화면에 보이는 크기가 실물 크기는 아니에요.</span>
          </div>
        </section>

        <span className="sr-only" role="status">{status}</span>
      </main>

      {toast && <div className="stage-toast" role="status">{toast}</div>}

      {help && (
        <div className="help-backdrop" onClick={() => setHelp(false)}>
          <section className="help-popover" role="dialog" aria-modal="true" aria-label="사용 방법" onClick={e => e.stopPropagation()}>
            <button className="close-help" autoFocus onClick={() => setHelp(false)} aria-label="사용 방법 닫기"><X size={20} /></button>
            <h2>3D 크기 비교 방법</h2>
            <ol>
              <li>
                <strong>왼쪽 ‘제품 추가’ 패널에서 치수를 준비하세요.</strong>
                <p>사진·도면에서 치수와 3D 초안을 읽어 오거나, 가로·깊이·높이를 직접 입력하면 오른쪽 3D 공간에 바로 놓여요.</p>
              </li>
              <li>
                <strong>‘프리셋’·‘놓인 물건’·‘내 모델’ 탭으로 주제를 전환하세요.</strong>
                <p>필요한 패널만 열어 비교 대상을 추가·수정하고, ‘사이드바 접기’를 눌러 3D 비교 공간을 넓게 볼 수도 있어요.</p>
              </li>
              <li>
                <strong>돌려 보고, 가까이 보세요.</strong>
                <p>물건을 클릭하거나 탭해 선택하세요. 이동 화살표나 회전 링으로 위치와 방향을 바꾸고, 빈 공간을 드래그해 시점을 바꿀 수 있어요.</p>
              </li>
            </ol>
            <p className="help-footnote"><Info size={16} />물건끼리 실제 치수 비율로 비교해요. 제품 치수는 최대 {formatNumber(10000)} mm까지 입력할 수 있어요.</p>
            <button className="primary-button" onClick={() => setHelp(false)}>비교 시작하기<ChevronDown size={17} /></button>
          </section>
        </div>
      )}
    </>
  );
}
