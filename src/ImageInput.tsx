/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileText, Upload, ZoomIn } from 'lucide-react';
import DraftStatusPanel from './DraftStatusPanel';
import MeasurementReview from './MeasurementReview';
import ProductRegion from './ProductRegion';
import type { Region } from './ProductRegion';
import { exampleAnalysis, imageSizeLimit, imageTypes, specTextLimit, suggestedSpecRow } from './imageDimensions';
import { prepareUploadImage } from './imageUpload';
import { mountTurnstile, turnstileSiteKey } from './turnstile';
import type { TurnstileController } from './turnstile';
import type { ReactNode } from 'react';
import type { ImageAnalysis, ImageSubject, Measurement, SizeCandidate, SpecRow } from './imageDimensions';

export type ImageChoice = { id: string; candidate: SizeCandidate; subject?: ImageSubject };

const analysisFailure = '이미지를 분석하지 못했어요. 다시 시도하거나 치수를 직접 입력해 주세요.';

export default function ImageInput({ onRead, onMeasurements, onBack, onSessionChange, review, theme = 'light' }: {
  onRead: (result: ImageChoice | null, reset?: boolean) => void;
  onMeasurements: (measurements: Measurement[]) => void;
  onBack: () => void;
  onSessionChange?: (state: { active: boolean; showForm: boolean }) => void;
  review: ReactNode;
  theme?: 'light' | 'dark';
}) {
  const [file, setFile] = useState<File>();
  const [siteKey, setSiteKey] = useState(turnstileSiteKey);
  const [securityLoading, setSecurityLoading] = useState(!turnstileSiteKey);
  const [securityError, setSecurityError] = useState('');
  const [preview, setPreview] = useState('');
  const [dragging, setDragging] = useState(false);
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
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstile = useRef<TurnstileController | null>(null);
  const sessionCallback = useRef(onSessionChange);
  sessionCallback.current = onSessionChange;

  useEffect(() => {
    if (turnstileSiteKey) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    fetch('/api/analysis-config', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('분석 보안 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        const config = await response.json();
        if (!active) return;
        if (config.turnstileRequired === false) return;
        if (typeof config.turnstileSiteKey !== 'string' || !config.turnstileSiteKey.trim()) {
          throw new Error('배포 서버의 보안 설정이 누락됐어요. 관리자에게 Turnstile Site Key 설정을 요청해 주세요.');
        }
        setSiteKey(config.turnstileSiteKey.trim());
      })
      .catch(error => {
        if (active) setSecurityError(error instanceof Error && error.name !== 'AbortError'
          ? error.message : '분석 보안 설정을 불러오지 못했어요. 페이지를 새로고침해 주세요.');
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (active) setSecurityLoading(false);
      });
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, []);

  useEffect(() => {
    if (!siteKey || !file || !turnstileContainer.current) {
      turnstile.current?.destroy();
      turnstile.current = null;
      return;
    }
    const controller = mountTurnstile(turnstileContainer.current, siteKey, theme);
    turnstile.current = controller;
    return () => {
      controller.destroy();
      if (turnstile.current === controller) turnstile.current = null;
    };
    // The widget container is rendered only after the preview URL is ready.
  }, [file, preview, theme, siteKey]);

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
  useEffect(() => {
    sessionCallback.current?.({
      active: example || !!file || !!analysis,
      showForm: example || !!analysis || !!error,
    });
  }, [example, file, analysis, error]);

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

  function clearLocalState() {
    dialog.current?.close();
    setZoom(1);
    request.current?.abort();
    setPending(false);
    setExample(false);
    setDragging(false);
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
  }

  function chooseFile(next?: File) {
    clearLocalState();
    onRead(null, true);
    if (!next) return;
    if (!imageTypes.includes(next.type) || next.size === 0 || next.size > imageSizeLimit) {
      setError('8 MB 이하의 PNG, JPG, WebP 이미지를 선택해 주세요.');
      return;
    }
    setFile(next);
  }

  function exitImageMode() {
    clearLocalState();
    onBack();
  }

  function startExample() {
    clearLocalState();
    setExample(true);
    setAnalysis(exampleAnalysis);
    const exampleSubject = exampleAnalysis.subjects[0];
    setSubjectId(exampleSubject.id);
    chooseOption(exampleAnalysis.candidates[0], 0, exampleSubject, true);
  }

  async function analyze(specOnly = false) {
    const hasSpec = !!specFile || !!specText.trim();
    if (securityLoading) return;
    if (securityError) { setError(securityError); return; }
    if (siteKey && !turnstile.current) {
      setError('보안 확인을 준비 중이에요. 잠시 후 다시 시도해 주세요.');
      return;
    }
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
    let usedTurnstile = false;
    try {
      let turnstileToken = '';
      if (siteKey && turnstile.current) {
        try {
          turnstileToken = await turnstile.current.getToken(controller.signal);
        } catch (turnstileError) {
          if (!controller.signal.aborted) {
            setError(turnstileError instanceof Error && turnstileError.message
              ? turnstileError.message
              : '자동 요청 방지 확인을 완료하지 못했어요. 광고 차단기를 확인하거나 치수를 직접 입력해 주세요.');
          }
          return;
        }
        if (controller.signal.aborted) return;
      }

      const uploadFile = !specOnly && file ? await prepareUploadImage(file) : undefined;
      if (controller.signal.aborted) return;
      const uploadSpecFile = specFile ? await prepareUploadImage(specFile) : undefined;
      if (controller.signal.aborted) return;

      let body: File | FormData = uploadFile!;
      if (hasSpec) {
        body = new FormData();
        if (!specOnly && uploadFile) body.set('photo', uploadFile);
        if (uploadSpecFile) body.set('spec-image', uploadSpecFile);
        if (specText.trim()) body.set('spec-text', specText.trim());
      }
      if (turnstileToken) usedTurnstile = true;
      const response = await fetch('/api/image-dimensions', {
        method: 'POST',
        body,
        ...(turnstileToken ? { headers: { 'X-Turnstile-Token': turnstileToken } } : {}),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setError(typeof result?.error === 'string' && result.error.trim() ? result.error : analysisFailure);
        return;
      }
      if (!Array.isArray(result?.candidates)) {
        setError('분석 결과를 읽지 못했어요. 다시 시도하거나 치수를 직접 입력해 주세요.');
        return;
      }
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
    } catch {
      if (!controller.signal.aborted) setError(analysisFailure);
    } finally {
      if (usedTurnstile) turnstile.current?.reset();
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
  return (
    <section
      className="image-input"
      aria-label="이미지에서 치수 가져오기"
      onPaste={event => {
        const pasted = Array.from(event.clipboardData.files).find(item => item.type.startsWith('image/'));
        if (pasted) {
          event.preventDefault();
          if (event.target instanceof HTMLElement && event.target.closest('.spec-input')) chooseSpec(pasted);
          else chooseFile(pasted);
        }
      }}
    >
      <input
        id="measurement-image"
        className="sr-only"
        type="file"
        accept={imageTypes.join(',')}
        onChange={event => {
          chooseFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {!source ? (
        <div className="upload-entry">
          <label
            htmlFor="measurement-image"
            className={dragging ? 'upload-dropzone is-dragging' : 'upload-dropzone'}
            onDragOver={event => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files[0];
              if (dropped) chooseFile(dropped);
            }}
          >
            <span className="upload-dropzone-icon" aria-hidden="true"><Upload size={22} strokeWidth={1.7} /></span>
            <strong>상품 사진 또는 치수 도면 올리기</strong>
            <span>클릭해서 선택 · 끌어다 놓기 · 캡처 붙여넣기 (⌘V)</span>
            <small>8 MB 이하 PNG · JPG · WebP</small>
          </label>
          <div className="entry-example-bar">
            <div className="entry-example-copy">
              <strong>책상 예시 도면 체험</strong>
              <span>API 키 없이 도면 검토와 3D 초안 확인</span>
            </div>
            <button type="button" className="secondary-action-button" onClick={startExample}>
              <FileText size={15} />예시 도면 써보기
            </button>
          </div>
          {error && <p className="input-error" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="review-workspace">
          <div className="review-topbar">
            <div className="review-topbar-left">
              <button type="button" className="image-back-button" onClick={exitImageMode}>
                <ArrowLeft size={14} />뒤로가기
              </button>
              <span className="review-stage-label">{example ? '예시 도면 검토' : '사진 치수 검토'}</span>
            </div>
            {file && (
              <div className="review-topbar-actions">
                <label htmlFor="measurement-image" className="secondary-action-button">다른 사진 선택</label>
                <button type="button" className="analyze-button" disabled={pending || securityLoading} onClick={() => analyze()}>
                  {pending ? '분석 중…' : '이미지 분석'}
                </button>
                {pending && (
                  <button
                    type="button"
                    className="secondary-action-button"
                    onClick={() => {
                      request.current?.abort();
                      setPending(false);
                    }}
                  >
                    분석 취소
                  </button>
                )}
              </div>
            )}
          </div>

          {siteKey && file && <div className="turnstile-slot" ref={turnstileContainer} />}

          <div className="review-stage-grid">
            <div className="review-source-card">
              <div className="review-card-header">
                <strong>{example ? '원본 도면' : '업로드한 사진'}</strong>
                <button className="image-preview-button" type="button" onClick={() => openOriginal(false)}>
                  <ZoomIn size={14} />원본 확대
                </button>
              </div>
              <button
                type="button"
                className="review-image-frame"
                onClick={() => openOriginal(false)}
                aria-label="원본 도면 크게 보기"
              >
                <img src={source} alt="치수를 확인할 원본 도면" />
              </button>
              {file && (
                <details className="spec-input">
                  <summary>별도 치수 자료 추가</summary>
                  <div className="spec-input-controls">
                    <label htmlFor="spec-image" className="secondary-action-button spec-file-trigger">
                      사양표 이미지 선택
                    </label>
                    <input
                      id="spec-image"
                      className="sr-only"
                      type="file"
                      accept={imageTypes.join(',')}
                      onChange={event => {
                        if (event.target.files?.[0]) chooseSpec(event.target.files[0]);
                        event.target.value = '';
                      }}
                    />
                    {specFile && <button type="button" onClick={() => chooseSpec()}>사양표 제거</button>}
                  </div>
                  {specPreview && (
                    <button className="image-preview-button" type="button" onClick={() => openOriginal(true)}>
                      <img src={specPreview} alt="첨부한 사양표" />
                      <span>사양표 확대</span>
                    </button>
                  )}
                  <label htmlFor="spec-text">치수 또는 사양 텍스트</label>
                  <textarea
                    id="spec-text"
                    maxLength={specTextLimit}
                    rows={3}
                    value={specText}
                    onChange={event => {
                      changeSpec();
                      setSpecText(event.target.value);
                    }}
                    placeholder="모델명, 옵션, 치수 표기를 붙여넣으세요"
                  />
                  {option && (
                    <button
                      type="button"
                      disabled={pending || securityLoading || (!specFile && !specText.trim())}
                      onClick={() => analyze(true)}
                    >
                      추가 사양 분석
                    </button>
                  )}
                </details>
              )}
            </div>

            <div className="review-draft-card">
              {review ?? (
                <DraftStatusPanel
                  pending={pending}
                  error={error}
                  hasAnalysis={!!analysis}
                  hasCandidates={!!analysis?.candidates.length}
                  hasChoice={!!option}
                  evidence={subject?.shapeEvidence}
                  onTryExample={startExample}
                />
              )}
            </div>
          </div>

          <dialog ref={dialog} className="image-review-dialog" aria-label="원본 도면 확대">
            <div className="image-review-toolbar">
              <button type="button" disabled={zoom <= 1} onClick={() => setZoom(value => value - .5)} aria-label="원본 축소">−</button>
              <output>{zoom * 100}%</output>
              <button type="button" disabled={zoom >= 3} onClick={() => setZoom(value => value + .5)} aria-label="원본 더 확대">+</button>
              <button type="button" onClick={() => dialog.current?.close()}>닫기</button>
            </div>
            <ProductRegion
              key={reviewSession}
              src={showSpecImage && specPreview ? specPreview : source}
              zoom={zoom}
              region={showSpecImage || !subject ? null : regions[subject.id] ?? subject.shapeEvidence?.region}
              onRegion={showSpecImage || !subject ? undefined : next => setRegions(current => ({ ...current, [subject.id]: next }))}
            />
          </dialog>

          {analysis && analysis.subjects.length > 1 && (
            <fieldset className="size-candidates is-grid">
              <legend>어떤 상품을 비교할까요?</legend>
              {analysis.subjects.map(item => (
                <label key={item.id}>
                  <input
                    type="radio"
                    name="image-subject"
                    checked={subjectId === item.id}
                    onChange={() => chooseSubject(analysis, item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>
          )}
          {subject && <p className="selected-subject-note">선택한 상품 · <strong>{subject.label}</strong></p>}
          {candidates.length > 1 && (
            <fieldset className="size-candidates is-grid">
              <legend>비교할 크기 한 개를 선택하세요</legend>
              {candidates.map((candidate, index) => (
                <label key={index}>
                  <input
                    type="radio"
                    name="size-candidate"
                    checked={selectedCandidate === index}
                    onChange={() => chooseOption(candidate, index, subject)}
                  />
                  <span>
                    <strong>{candidate.label}</strong>
                    <small>
                      {(['width', 'depth', 'height'] as const).map((axis, i) =>
                        `${['가로', '깊이', '높이'][i]} ${candidate.dimensions[axis].mm ?? '미확인'}`
                      ).join(' · ')} mm
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {option && specRows.length > 0 && (
            <fieldset className="size-candidates">
              <legend>{option.label}에 적용할 사양을 선택하세요</legend>
              {specRows.map(row => (
                <label key={row.id}>
                  <input
                    type="radio"
                    name="spec-row"
                    checked={selectedSpecId === row.id}
                    onChange={() => setSelectedSpecId(row.id)}
                  />
                  <span>
                    <strong>{row.label}{row.id === suggestedSpecId ? ' · 연결 후보' : ''}</strong>
                    <small>{row.measurements.map(item => item.quote).join(' · ')}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {option && mismatchedSpec && <p className="spec-mismatch-note">모델 번호 또는 옵션이 달라 연결할 수 없어요.</p>}
          {option && selectedSpec && !mismatchedSpec ? (
            <MeasurementReview
              key={`${option.id}-${selectedSpec.id}`}
              fromSpec
              measurements={[...(option.measurements ?? []), ...selectedSpec.measurements]}
              onApply={onMeasurements}
            />
          ) : option?.measurements && (
            <MeasurementReview
              key={option.id}
              fromSpec={false}
              measurements={option.measurements}
              onApply={onMeasurements}
            />
          )}
          {example && (
            <p className="example-guide-note">예시 책상 결과입니다. 크기 옵션과 3D 초안을 확인한 뒤 비교 공간에 추가해 보세요.</p>
          )}
          {!!review && error && <p className="input-error" role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
