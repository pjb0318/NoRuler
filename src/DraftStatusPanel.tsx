import type { ShapeEvidence } from './imageDimensions';

function WireframeBoxIllustration() {
  return (
    <svg
      className="draft-wireframe-svg"
      viewBox="0 0 132 94"
      width="118"
      height="84"
      fill="none"
      aria-hidden="true"
    >
      <path d="M32 30 70 15l34 17-38 16-34-18Z" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" fill="var(--accent-soft)" />
      <path d="M32 30v32l34 18V48M104 32v32L66 80" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M70 15v32M32 62l38-15 34 17" stroke="var(--ink-muted)" strokeWidth="1.1" strokeDasharray="3 3" />
      <path d="M24 68l38 20M111 33v30M72 86l36-15" stroke="var(--ink-secondary)" strokeWidth="1.1" />
      <text x="34" y="88" fill="var(--ink-secondary)" fontSize="9" fontFamily="IBM Plex Mono, monospace">W</text>
      <text x="115" y="51" fill="var(--ink-secondary)" fontSize="9" fontFamily="IBM Plex Mono, monospace">H</text>
      <text x="90" y="87" fill="var(--ink-secondary)" fontSize="9" fontFamily="IBM Plex Mono, monospace">D</text>
    </svg>
  );
}

export default function DraftStatusPanel({
  pending,
  error,
  hasAnalysis,
  hasCandidates,
  hasChoice,
  evidence,
  onTryExample,
}: {
  pending: boolean;
  error: string;
  hasAnalysis: boolean;
  hasCandidates: boolean;
  hasChoice: boolean;
  evidence: ShapeEvidence | null | undefined;
  onTryExample: () => void;
}) {
  if (pending) {
    return (
      <section className="draft-status-panel" aria-label="3D 초안 상태">
        <div className="draft-status-header">
          <strong>3D 형태 초안</strong>
          <span className="draft-badge is-pending">분석 진행 중</span>
        </div>
        <div className="draft-status-body">
          <div className="draft-spinner" aria-hidden="true" />
          <h3>사진에서 형태와 치수를 읽고 있어요…</h3>
          <p>상품 외형과 치수 표기를 확인한 뒤 3D 초안과 외곽 치수를 준비합니다.</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="draft-status-panel is-error" aria-label="3D 초안 상태">
        <div className="draft-status-header">
          <strong>3D 형태 초안</strong>
          <span className="draft-badge is-warning">분석 실패 · 직접 입력 전환</span>
        </div>
        <div className="draft-status-body">
          <WireframeBoxIllustration />
          <h3>이미지를 자동으로 분석하지 못했어요</h3>
          <p className="draft-status-alert" role="alert">{error}</p>
          <p>아래 치수 입력칸에 가로·깊이·높이를 입력하면 실제 크기의 3D 상자로 바로 비교할 수 있어요.</p>
          <button type="button" className="secondary-action-button" onClick={onTryExample}>
            예시 도면 써보기
          </button>
        </div>
      </section>
    );
  }

  if (hasAnalysis && !hasCandidates) {
    return (
      <section className="draft-status-panel" aria-label="3D 초안 상태">
        <div className="draft-status-header">
          <strong>3D 형태 초안</strong>
          <span className="draft-badge is-warning">자동 인식 실패 · 직접 입력 전환</span>
        </div>
        <div className="draft-status-body">
          <WireframeBoxIllustration />
          <h3>사진에서 상품이나 치수를 찾지 못했어요</h3>
          <p>제품 전체가 보이는 다른 사진을 올리거나 아래에 치수를 직접 입력해 3D 상자로 비교해 보세요.</p>
        </div>
      </section>
    );
  }

  if (hasAnalysis && hasCandidates && !hasChoice) {
    return (
      <section className="draft-status-panel" aria-label="3D 초안 상태">
        <div className="draft-status-header">
          <strong>3D 형태 초안</strong>
          <span className="draft-badge is-pending">옵션 선택 대기</span>
        </div>
        <div className="draft-status-body">
          <WireframeBoxIllustration />
          <h3>비교할 상품이나 크기 옵션을 선택해 주세요</h3>
          <p>아래 목록에서 옵션을 선택하면 3D 초안과 치수가 표시돼요.</p>
        </div>
      </section>
    );
  }

  if (evidence?.readiness === 'needs_view') {
    return (
      <section className="draft-status-panel" aria-label="3D 초안 상태">
        <div className="draft-status-header">
          <strong>3D 형태 초안</strong>
          <span className="draft-badge is-box">다른 각도 필요 · 상자 기준 비교</span>
        </div>
        <div className="draft-status-body">
          <WireframeBoxIllustration />
          <h3>형태 초안을 만들려면 다른 각도 사진이 필요해요</h3>
          <p>
            {evidence.nextView
              ? `${evidence.nextView} 사진이 있으면 형태를 더 정확히 만들 수 있어요.`
              : '다른 각도의 사진이 있으면 형태를 더 정확히 만들 수 있어요.'}
          </p>
          {evidence.unseen && <p className="draft-status-detail">확인하기 어려운 부분 · {evidence.unseen}</p>}
          <p>지금 치수만 확인해도 실제 외곽 크기의 3D 상자로 비교할 수 있어요.</p>
        </div>
      </section>
    );
  }

  if (evidence?.readiness === 'ready') {
    return (
      <section className="draft-status-panel" aria-label="3D 초안 상태">
        <div className="draft-status-header">
          <strong>3D 형태 초안</strong>
          <span className="draft-badge is-box">3D 초안 미지원 · 상자 기준 비교</span>
        </div>
        <div className="draft-status-body">
          <WireframeBoxIllustration />
          <h3>이 형태는 아직 3D 초안을 지원하지 않아요.</h3>
          <p>복잡하거나 비정형인 형태는 정밀 초안 대신 가로·깊이·높이 외곽 기준의 3D 상자로 정확하게 비교할 수 있어요.</p>
        </div>
      </section>
    );
  }

  if (hasChoice) {
    return (
      <section className="draft-status-panel" aria-label="3D 초안 상태">
        <div className="draft-status-header">
          <strong>3D 형태 초안</strong>
          <span className="draft-badge is-box">형태 정보 없음 · 상자 기준 비교</span>
        </div>
        <div className="draft-status-body">
          <WireframeBoxIllustration />
          <h3>치수는 읽었지만 3D 형태 정보는 포함되지 않았어요</h3>
          <p>아래 치수를 확인하면 실제 외곽 크기의 3D 상자로 익숙한 물건과 비교할 수 있어요.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="draft-status-panel" aria-label="3D 초안 상태">
      <div className="draft-status-header">
        <strong>3D 형태 초안</strong>
        <span className="draft-badge">분석 대기</span>
      </div>
      <div className="draft-status-body">
        <WireframeBoxIllustration />
        <h3>사진을 분석해 형태와 치수를 읽어 보세요</h3>
        <p>상단의 ‘이미지 분석’을 누르면 선택한 자료를 Gemini로 보내 치수와 3D 형태를 확인합니다.</p>
      </div>
    </section>
  );
}
