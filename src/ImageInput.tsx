/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import { exampleDimensions, imageSizeLimit, imageTypes } from './imageDimensions';
import type { ImageDimensions, SizeCandidate } from './imageDimensions';

export default function ImageInput({ onRead }: { onRead: (result: ImageDimensions | null) => void }) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [example, setExample] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<SizeCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => request.current?.abort(), []);

  function chooseFile(next?: File) {
    request.current?.abort();
    setPending(false);
    setExample(false);
    setFile(undefined);
    setError('');
    setCandidates([]);
    setSelectedCandidate(null);
    onRead(null);
    if (!next) return;
    if (!imageTypes.includes(next.type) || next.size === 0 || next.size > imageSizeLimit) {
      setError('8 MB 이하의 PNG, JPG, WebP 이미지를 선택해 주세요.');
      return;
    }
    setFile(next);
  }

  async function analyze() {
    if (!file) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    setCandidates([]);
    setSelectedCandidate(null);
    onRead(null);
    try {
      const response = await fetch('/api/image-dimensions', {
        method: 'POST', body: file, signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!Array.isArray(result.candidates)) throw new Error('분석 결과를 읽지 못했어요. 다시 시도해 주세요.');
      if (!controller.signal.aborted) {
        setCandidates(result.candidates);
        if (result.candidates.length === 1) {
          setSelectedCandidate(0);
          onRead(result.candidates[0].dimensions);
        } else if (result.candidates.length === 0) {
          setError('크기 정보를 찾지 못했어요. 치수를 직접 입력해 주세요.');
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '이미지를 분석하지 못했어요.');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return <section className="image-input" aria-label="이미지에서 치수 가져오기">
    <label className="field-label" htmlFor="measurement-image">이미지에서 치수 가져오기</label>
    <input id="measurement-image" type="file" accept={imageTypes.join(',')} onChange={event => {
      chooseFile(event.target.files?.[0]);
      event.target.value = '';
    }} />
    {(example || (file && preview)) && <img src={example ? import.meta.env.BASE_URL + 'measurement-example.png' : preview} alt="치수를 확인할 원본 도면" />}
    <div className="image-input-actions">
      {file && <button type="button" disabled={pending} onClick={analyze}>{pending ? '분석 중…' : '이미지 분석'}</button>}
      <button type="button" onClick={() => {
        chooseFile();
        setExample(true);
        onRead(exampleDimensions);
      }}>예시 도면 써보기</button>
    </div>
    {candidates.length > 1 && <fieldset className="size-candidates">
      <legend>비교할 크기 한 개를 선택하세요</legend>
      {candidates.map((candidate, index) => <label key={index}>
        <input type="checkbox" checked={selectedCandidate === index} onChange={() => {
          setSelectedCandidate(index);
          onRead(candidate.dimensions);
        }} />
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
