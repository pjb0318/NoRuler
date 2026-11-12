/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import { exampleDimensions, imageSizeLimit, imageTypes } from './imageDimensions';
import type { ReactNode } from 'react';
import type { ImageAnalysis, ImageSubject, SizeCandidate } from './imageDimensions';

export type ImageChoice = { id: string; candidate: SizeCandidate; subject?: ImageSubject };

export default function ImageInput({ onRead, review }: { onRead: (result: ImageChoice | null, reset?: boolean) => void; review: ReactNode }) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [example, setExample] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [subjectId, setSubjectId] = useState<string>();
  const candidates = (analysis?.candidates ?? []).filter(candidate => candidate.subjectId === subjectId);
  const subject = analysis?.subjects.find(item => item.id === subjectId);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => request.current?.abort(), []);

  function chooseFile(next?: File) {
    dialog.current?.close();
    setZoom(1);
    request.current?.abort();
    setPending(false);
    setExample(false);
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

  async function analyze() {
    if (!file || pending) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    setAnalysis(null);
    setSubjectId(undefined);
    setSelectedCandidate(null);
    onRead(null, true);
    try {
      const response = await fetch('/api/image-dimensions', {
        method: 'POST', body: file, signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!Array.isArray(result.candidates)) throw new Error('분석 결과를 읽지 못했어요. 다시 시도해 주세요.');
      if (!controller.signal.aborted) {
        const next: ImageAnalysis = { ...result, subjects: result.subjects ?? [] };
        setAnalysis(next);
        if (next.subjects.length <= 1) chooseSubject(next, next.subjects[0]?.id, true);
        if (!next.candidates.length) setError('상품이나 치수 정보를 찾지 못했어요. 치수를 직접 입력해 주세요.');
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '이미지를 분석하지 못했어요.');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function chooseOption(option: SizeCandidate, index: number, parent?: ImageSubject, reset = false) {
    setSelectedCandidate(index);
    onRead({ id: option.id ?? String(index), candidate: option, subject: parent }, reset);
  }

  function chooseSubject(result: ImageAnalysis, id?: string, reset = false) {
    setSubjectId(id);
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
    if (pasted) { event.preventDefault(); chooseFile(pasted); }
  }}>
    <label className="field-label" htmlFor="measurement-image">이미지에서 치수 가져오기</label>
    <input id="measurement-image" type="file" accept={imageTypes.join(',')} onChange={event => {
      chooseFile(event.target.files?.[0]);
      event.target.value = '';
    }} />
    <div className="image-paste" tabIndex={0}>캡처를 붙여넣을 수 있어요</div>
    {source && <>
      <div className={review ? "image-shape-review" : undefined}>
      <button className="image-preview-button" type="button" onClick={() => { setZoom(1); dialog.current?.showModal(); }}>
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
        <div className="image-review-viewport"><img src={source} alt="확대한 원본 도면" style={{ width: `${zoom * 100}%` }} /></div>
      </dialog>
    </>}
    <div className="image-input-actions">
      {file && <button type="button" disabled={pending} onClick={analyze}>{pending ? '분석 중…' : '이미지 분석'}</button>}
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
    {file && <p>분석할 때 이미지 한 장을 Gemini로 보냅니다.</p>}
    {example && <p>예시 결과입니다. 아래에서 높이를 확인하고 깊이를 입력해 보세요.</p>}
    {error && <p className="input-error" role="alert">{error}</p>}
  </section>;
}
