import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, Box, Check, ChevronDown, CircleHelp, File, Info, Keyboard, Laptop, Monitor, RotateCcw, Smartphone, Sparkles, X } from 'lucide-react';
import SceneViewer from './SceneViewer';
import { AXES, DEFAULT_PRODUCT, PRESETS, dimensionText, displayValue, formatNumber, parseDimensions, readSaved } from './domain';
import type { Dimensions, PresetId, Unit } from './domain';

function PresetIcon({ id, size = 26 }: { id: PresetId; size?: number }) {
  if (id === 'bottle') return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 3h6v4l3 4v12a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V11l3-4V3Z" /><path d="M11 6h6M8 14h12M8 20h12M12 3h4" /></svg>;
  const Icon = { a4: File, phone: Smartphone, laptop: Laptop, keyboard: Keyboard, monitor: Monitor }[id];
  return <Icon size={size} strokeWidth={1.45} />;
}
const axisLabels = { width: ['가로', 'Width', 'W'], depth: ['깊이', 'Depth', 'D'], height: ['높이', 'Height', 'H'] };
const makeDraft = (d: Dimensions, unit: Unit) => Object.fromEntries(AXES.map(axis => [axis, displayValue(d[axis], unit)])) as Record<keyof Dimensions, string>;

export default function App() {
  const [initial] = useState(readSaved);
  const [product, setProduct] = useState(initial.product);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const [name, setName] = useState(initial.product.name);
  const [draft, setDraft] = useState(() => makeDraft(initial.product, initial.unit));
  const [selected, setSelected] = useState<PresetId[]>(initial.selected);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [help, setHelp] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const presets = useMemo(() => PRESETS.filter(p => selected.includes(p.id)), [selected]);
  const parsed = parseDimensions(draft, unit);
  const dirty = name.trim() !== product.name || !parsed || AXES.some(axis => parsed[axis] !== product[axis]);
  useEffect(() => {
    try { localStorage.setItem('noruler-v1', JSON.stringify({ product, unit, selected })); } catch { /* Comparison works without browser storage. */ }
  }, [product, unit, selected]);
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
    setProduct({ name: name.trim(), ...parsed });
    setError('');
    setStatus('입력한 크기를 3D 공간에 반영했어요.');
  }
  function reset() {
    setResetKey(value => value + 1);
    setProduct(DEFAULT_PRODUCT); setName(DEFAULT_PRODUCT.name); setUnit('cm');
    setDraft(makeDraft(DEFAULT_PRODUCT, 'cm')); setSelected(['bottle', 'phone']); setError('');
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
            <form onSubmit={apply} noValidate>
              <label className="field-label" htmlFor="product-name">제품명</label>
              <input id="product-name" className="name-input" value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="예: 사고 싶은 수납함" autoComplete="off" />
              <div className="dimensions-heading"><span className="field-label">제품 치수</span><div className="unit-switch" aria-label="치수 단위">{(['mm', 'cm'] as Unit[]).map(value => <button type="button" key={value} aria-pressed={unit === value} onClick={() => switchUnit(value)}>{value}</button>)}</div></div>
              <div className="dimension-fields">{AXES.map(axis => <div className="dimension-field" key={axis}><label htmlFor={axis}><span className={`axis-dot ${axis}`} />{axisLabels[axis][0]}<span>{axisLabels[axis][1]}</span></label><div><input id={axis} type="number" inputMode="decimal" step="any" min={unit === 'cm' ? .01 : .1} max={unit === 'cm' ? 1000 : 10000} value={draft[axis]} onChange={e => setDraft({ ...draft, [axis]: e.target.value })} aria-invalid={!!error && !parsed} aria-describedby={error ? 'input-error' : undefined} /><span>{unit}</span></div></div>)}</div>
              <div className="dimension-guide"><svg viewBox="0 0 100 70" width="83" height="63" fill="none"><path d="m25 24 32-12 25 16-32 13-25-17v24l25 17 32-13V28M50 41v24" stroke="#b5bfce" strokeWidth="1.4" /><path d="m23 54 23 15M85 32v22M54 69l28-12" stroke="#a7b9da" strokeWidth="1.2" /><text x="26" y="68" fill="#6380aa" fontSize="10">W</text><text x="89" y="47" fill="#6380aa" fontSize="10">H</text><text x="70" y="69" fill="#6380aa" fontSize="10">D</text></svg><p>상세 페이지의 치수를<br />그대로 입력해 주세요.</p></div>
              {error && <p id="input-error" className="input-error" role="alert">{error}</p>}
              <button className="primary-button" type="submit"><Box size={17} />3D로 크기 비교하기<ArrowRight size={17} /></button>
              <p className="input-caption">{dirty ? '입력 후 버튼을 눌러 크기를 반영하세요' : '입력한 치수가 3D 공간에 반영되어 있어요'}</p>
            </form>
          </section>
          <section className="presets-panel"><div className="section-heading"><span className="step">02</span><h2>익숙한 물건과 비교</h2><span className="count-badge">{selected.length}</span></div><p className="section-description">함께 놓아볼 물건을 선택해 주세요.</p>
            <div className="preset-grid">{PRESETS.map(preset => <button className={`preset-card ${selected.includes(preset.id) ? 'selected' : ''}`} key={preset.id} aria-pressed={selected.includes(preset.id)} onClick={() => setSelected(current => current.includes(preset.id) ? current.filter(id => id !== preset.id) : [...current, preset.id])}><span className="preset-check">{selected.includes(preset.id) && <Check size={11} strokeWidth={3} />}</span><PresetIcon id={preset.id} /><strong>{preset.name}</strong><small>{preset.id === 'a4' ? '210 × 297 mm' : preset.id === 'bottle' ? '높이 21 cm' : preset.id === 'phone' ? '6.1형 기준' : preset.id === 'laptop' ? '13형 · 닫힌 상태' : preset.id === 'keyboard' ? '텐키리스' : '스탠드 포함'}</small></button>)}</div>
            <div className="preset-notice"><Info size={14} /><span>프리셋은 대표 치수예요.<br />실제 제품에 따라 크기가 다를 수 있어요.</span></div>
          </section>
        </aside>
        <div className="comparison-column"><SceneViewer product={product} presets={presets} unit={unit} resetKey={resetKey} />
          <section className="comparison-details"><div className="details-heading"><h2><span className="blue-dot" />지금 비교 중인 물건</h2><button onClick={reset}><RotateCcw size={13} />초기화</button></div>
            <div className="object-list"><div className="object-row"><span className="object-icon is-product"><Box size={19} /></span><div className="object-name"><strong title={product.name}>{product.name}</strong><small>내 제품</small></div><span className="object-dimensions">{dimensionText(product, unit)}</span><span className="my-tag">MY</span></div>{presets.map(preset => <div className="object-row" key={preset.id}><span className="object-icon"><PresetIcon id={preset.id} size={20} /></span><div className="object-name"><strong>{preset.name}</strong><small>{preset.detail}</small></div><span className="object-dimensions">{dimensionText(preset, unit)}</span><button className="remove-object" aria-label={`${preset.name} 비교에서 제거`} onClick={() => setSelected(current => current.filter(id => id !== preset.id))}><X size={14} /></button></div>)}</div>
            {presets.length === 0 && <p className="empty-selection"><ArrowDown size={15} />비교할 물건을 선택하면 같은 공간에 나타나요.</p>}
            <p className="dimension-order">치수 순서: 가로(W) × 깊이(D) × 높이(H)</p>
          </section>
        </div>
      </div>
      <section className="bottom-note"><span className="sparkle-icon"><Sparkles size={18} /></span><div><strong>이 정도 크기였구나.</strong><p>구매 전 작은 확인이, 도착 후 큰 차이를 만듭니다.</p></div><span className="ratio-note">실제 치수 비율로 비교합니다.<br />화면에 보이는 크기가 실물 크기는 아니에요.</span></section>
      <span className="sr-only" role="status">{status}</span>
    </main>
    <footer><span className="footer-brand">NoRuler<span>자의 빈자리를 채우다.</span></span><span>Made for a better sense of size.</span></footer>
    {help && <div className="help-backdrop" onClick={() => setHelp(false)}><section className="help-popover" role="dialog" aria-modal="true" aria-label="사용 방법" onClick={e => e.stopPropagation()}><button className="close-help" autoFocus onClick={() => setHelp(false)} aria-label="사용 방법 닫기"><X size={20} /></button><span className="eyebrow">A LITTLE GUIDE</span><h2>자를 꺼내는 대신, 세 단계.</h2><ol><li><strong>제품 치수를 입력하세요.</strong><p>가로, 깊이, 높이를 mm 또는 cm로 입력해요. 단위를 바꿔도 크기는 유지됩니다.</p></li><li><strong>익숙한 물건을 골라 주세요.</strong><p>6가지 프리셋을 여러 개 함께 비교할 수 있어요. 노트북과 A4 용지는 바닥에 놓인 상태예요.</p></li><li><strong>돌려 보고, 가까이 보세요.</strong><p>상자를 잡고 드래그하면 바닥 위에서 옮길 수 있어요. 빈 공간을 드래그하면 회전하고, 스크롤이나 두 손가락 핀치로 확대해요. 위치 초기화로 상자를 원래 자리로 되돌릴 수 있어요.</p></li></ol><p className="help-footnote"><Info size={16} />화면상의 1:1 실물 크기가 아닌, 객체 간 실제 비율을 보여줍니다. 제품 치수는 최대 {formatNumber(10000)} mm까지 입력할 수 있어요.</p><button className="primary-button" onClick={() => setHelp(false)}>비교 시작하기<ChevronDown size={17} /></button></section></div>}
  </>;
}
