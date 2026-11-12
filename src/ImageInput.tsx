/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import MeasurementReview from './MeasurementReview';
import ProductRegion from './ProductRegion';
import type { Region } from './ProductRegion';
import { exampleDimensions, imageSizeLimit, imageTypes, specTextLimit, suggestedSpecRow } from './imageDimensions';
import type { ReactNode } from 'react';
import type { ImageAnalysis, ImageSubject, Measurement, SizeCandidate, SpecRow } from './imageDimensions';

export type ImageChoice = { id: string; candidate: SizeCandidate; subject?: ImageSubject };

export default function ImageInput({ onRead, onMeasurements, review }: {
  onRead: (result: ImageChoice | null, reset?: boolean) => void;
  onMeasurements: (measurements: Measurement[]) => void;
  review: ReactNode;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [specFile, setSpecFile] = useState<File>();
  const [specText, setSpecText] = useState('');
  const [specRows, setSpecRows] = useState<SpecRow[]>([]);
  const [selectedSpecId, setSelectedSpecId] = useState('');
  const [specPreview, setSpecPreview] = useState('');
  const [showSpecImage, setShowSpecImage] = useState(false);
  const [regions, setRegions] = useState<Record<string, Region>>({});
  const [reviewSession, setReviewSession] = useState(0);
  const [example, setExample] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [subjectId, setSubjectId] = useState<string>();
  const candidates = (analysis?.candidates ?? []).filter(candidate => candidate.subjectId === subjectId);
  const subject = analysis?.subjects.find(item => item.id === subjectId);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const option = selectedCandidate === null ? undefined : candidates[selectedCandidate];
  const suggestedSpecId = suggestedSpecRow(specRows, subject, option);
  const selectedSpec = specRows.find(row => row.id === selectedSpecId);
  const code = (value?: string) => value?.trim().toLowerCase();
  const mismatchedSpec = !!selectedSpec && (
    !!subject?.modelCode && !!selectedSpec.modelCode && code(subject.modelCode) !== code(selectedSpec.modelCode) ||
    !!option?.optionCode && !!selectedSpec.optionCode && code(option.optionCode) !== code(selectedSpec.optionCode)
  );
  const [zoom, setZoom] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!specFile) { setSpecPreview(''); return; }
    const url = URL.createObjectURL(specFile);
    setSpecPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [specFile]);
  useEffect(() => () => request.current?.abort(), []);

  function changeSpec() {
    request.current?.abort();
    setPending(false);
    setSpecRows([]);
    setSelectedSpecId('');
    setError('');
  }

  function chooseSpec(next?: File) {
    changeSpec();
    if (next && (!imageTypes.includes(next.type) || !next.size || next.size > imageSizeLimit)) {
      setError('사양표는 8 MB 이하의 PNG, JPG, WebP 이미지를 선택해 주세요.');
      return;
    }
    setSpecFile(next);
  }

  function openOriginal(showSpec: boolean) {
    setShowSpecImage(showSpec);
    setReviewSession(value => value + 1);
    setZoom(1);
    dialog.current?.showModal();
  }

  function chooseFile(next?: File) {
    dialog.current?.close();
    setZoom(1);
    request.current?.abort();
    setPending(false);
    setExample(false);
    setRegions({});
    setSpecFile(undefined);
    setSpecText('');
    setSpecRows([]);
    setSelectedSpecId('');
    setFile(undefined);
    setError('');
    setAnalysis(null);
    setSubjectId(undefined);
    setSelectedCandidate(null);
    onRead(null, true);
    if (!next) return;
    if (!imageTypes.includes(next.type) || next.size === 0 || next.size > imageSizeLimit) {
      setError('8 MB 이하의 PNG, JPG, WebP 이미지를 선택해 주세요.');
      return;
    }
    setFile(next);
  }

  async function analyze(specOnly = false) {
    const hasSpec = !!specFile || !!specText.trim();
    if (pending || (specOnly ? !hasSpec || !option : !file)) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    if (!specOnly) {
      setRegions({});
      setAnalysis(null);
      setSubjectId(undefined);
      setSelectedCandidate(null);
      onRead(null, true);
    }
    try {
      let body: File | FormData = file!;
      if (hasSpec) {
        body = new FormData();
        if (!specOnly && file) body.set('photo', file);
        if (specFile) body.set('spec-image', specFile);
        if (specText.trim()) body.set('spec-text', specText.trim());
      }
      const response = await fetch('/api/image-dimensions', {
        method: 'POST', body, signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!Array.isArray(result.candidates)) throw new Error('분석 결과를 읽지 못했어요. 다시 시도해 주세요.');
      if (!controller.signal.aborted) {
        const next: ImageAnalysis = { ...result, subjects: result.subjects ?? [] };
        setSpecRows(next.specRows ?? []);
        setSelectedSpecId('');
        if (specOnly) {
          if (!next.specRows?.length) setError('사양에서 치수 항목을 찾지 못했어요.');
        } else {
          setAnalysis(next);
          if (next.subjects.length <= 1) chooseSubject(next, next.subjects[0]?.id, true);
          if (!next.candidates.length) setError('상품이나 치수 정보를 찾지 못했어요. 치수를 직접 입력해 주세요.');
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '이미지를 분석하지 못했어요.');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function chooseOption(option: SizeCandidate, index: number, parent?: ImageSubject, reset = false) {
    setSelectedCandidate(index);
    setSelectedSpecId('');
    onRead({ id: option.id ?? String(index), candidate: option, subject: parent }, reset);
  }

  function chooseSubject(result: ImageAnalysis, id?: string, reset = false) {
    setSubjectId(id);
    setSelectedSpecId('');
    const options = result.candidates.filter(candidate => candidate.subjectId === id);
    if (options.length === 1) {
      chooseOption(options[0], 0, result.subjects.find(item => item.id === id), reset);
    } else {
      setSelectedCandidate(null);
      onRead(null, reset);
    }
  }

  const source = example ? import.meta.env.BASE_URL + 'measurement-example.png' : preview;
  return <section className="image-input" aria-label="이미지에서 치수 가져오기" onPaste={event => {
    const pasted = Array.from(event.clipboardData.files).find(item => item.type.startsWith('image/'));
    if (pasted) {
      event.preventDefault();
      if (event.target instanceof HTMLElement && event.target.closest('.spec-input')) chooseSpec(pasted);
      else chooseFile(pasted);
    }
  }}>
    <label className="field-label" htmlFor="measurement-image">이미지에서 치수 가져오기</label>
    <input id="measurement-image" type="file" accept={imageTypes.join(',')} onChange={event => {
      chooseFile(event.target.files?.[0]);
      event.target.value = '';
    }} />
    <div className="image-paste" tabIndex={0}>캡처를 붙여넣을 수 있어요</div>
    {source && <>
      <div className={review ? "image-shape-review" : undefined}>
      <button className="image-preview-button" type="button" onClick={() => openOriginal(false)}>
        <img src={source} alt="치수를 확인할 원본 도면" />
        <span>원본 확대</span>
      </button>
      {review}
      </div>
      <dialog ref={dialog} className="image-review-dialog" aria-label="원본 도면 확대">
        <div className="image-review-toolbar">
          <button type="button" disabled={zoom <= 1} onClick={() => setZoom(value => value - .5)} aria-label="원본 축소">−</button>
          <output>{zoom * 100}%</output>
          <button type="button" disabled={zoom >= 3} onClick={() => setZoom(value => value + .5)} aria-label="원본 더 확대">+</button>
          <button type="button" onClick={() => dialog.current?.close()}>닫기</button>
        </div>
        <ProductRegion key={reviewSession} src={showSpecImage && specPreview ? specPreview : source} zoom={zoom}
          region={showSpecImage || !subject ? null : regions[subject.id] ?? subject.shapeEvidence?.region}
          onRegion={showSpecImage || !subject ? undefined : next => setRegions(current => ({ ...current, [subject.id]: next }))} />
      </dialog>
    </>}
    {file && <details className="spec-input">
      <summary>별도 치수 자료 추가</summary>
      <label htmlFor="spec-image">사양표 캡처</label>
      <input id="spec-image" type="file" accept={imageTypes.join(',')} onChange={event => {
        if (event.target.files?.[0]) chooseSpec(event.target.files[0]);
        event.target.value = '';
      }} />
      {specPreview && <button className="image-preview-button" type="button" onClick={() => openOriginal(true)}><img src={specPreview} alt="첨부한 사양표" /><span>사양표 확대</span></button>}
      {specFile && <button type="button" onClick={() => chooseSpec()}>사양표 제거</button>}
      <label htmlFor="spec-text">치수 또는 사양 텍스트</label>
      <textarea id="spec-text" maxLength={specTextLimit} rows={3} value={specText} onChange={event => {
        changeSpec();
        setSpecText(event.target.value);
      }} placeholder="모델명, 옵션, 치수 표기를 붙여넣으세요" />
      {option && <button type="button" disabled={pending || (!specFile && !specText.trim())} onClick={() => analyze(true)}>추가 사양 분석</button>}
    </details>}
    <div className="image-input-actions">
      {file && <button type="button" disabled={pending} onClick={() => analyze()}>{pending ? '분석 중…' : '이미지 분석'}</button>}
      {pending && <button type="button" onClick={() => {
        request.current?.abort();
        setPending(false);
      }}>분석 취소</button>}
      <button type="button" onClick={() => {
        chooseFile();
        setExample(true);
        onRead({ id: 'example', candidate: { label: '예시 도면', dimensions: exampleDimensions } });
      }}>예시 도면 써보기</button>
    </div>
    {analysis && analysis.subjects.length > 1 && <fieldset className="size-candidates">
      <legend>어떤 상품을 비교할까요?</legend>
      {analysis.subjects.map(item => <label key={item.id}>
        <input type="radio" name="image-subject" checked={subjectId === item.id} onChange={() => chooseSubject(analysis, item.id)} />
        <span>{item.label}</span>
      </label>)}
    </fieldset>}
    {subject && <p>선택한 상품 · <strong>{subject.label}</strong></p>}
    {candidates.length > 1 && <fieldset className="size-candidates">
      <legend>비교할 크기 한 개를 선택하세요</legend>
      {candidates.map((candidate, index) => <label key={index}>
        <input type="radio" name="size-candidate" checked={selectedCandidate === index} onChange={() => chooseOption(candidate, index, subject)} />
        <span><strong>{candidate.label}</strong><small>
          {(['width', 'depth', 'height'] as const).map((axis, i) =>
            `${['가로', '깊이', '높이'][i]} ${candidate.dimensions[axis].mm ?? '미확인'}`
          ).join(' · ')} mm
        </small></span>
      </label>)}
    </fieldset>}
    {option && specRows.length > 0 && <fieldset className="size-candidates">
      <legend>{option.label}에 적용할 사양을 선택하세요</legend>
      {specRows.map(row => <label key={row.id}>
        <input type="radio" name="spec-row" checked={selectedSpecId === row.id} onChange={() => setSelectedSpecId(row.id)} />
        <span><strong>{row.label}{row.id === suggestedSpecId ? ' · 연결 후보' : ''}</strong>
          <small>{row.measurements.map(item => item.quote).join(' · ')}</small>
        </span>
      </label>)}
    </fieldset>}
    {option && mismatchedSpec && <p>모델 번호 또는 옵션이 달라 연결할 수 없어요.</p>}
    {option && selectedSpec && !mismatchedSpec
      ? <MeasurementReview key={`${option.id}-${selectedSpec.id}`} fromSpec
          measurements={[...(option.measurements ?? []), ...selectedSpec.measurements]} onApply={onMeasurements} />
      : option?.measurements && <MeasurementReview key={option.id} fromSpec={false}
          measurements={option.measurements} onApply={onMeasurements} />}
    {file && <p>분석할 때 선택한 자료를 Gemini로 보냅니다.</p>}
    {example && <p>예시 결과입니다. 아래에서 높이를 확인하고 깊이를 입력해 보세요.</p>}
    {error && <p className="input-error" role="alert">{error}</p>}
  </section>;
}
