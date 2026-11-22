# Cloudflare Pages 배포 및 API 보호 가이드

NoRuler를 **무료 티어**로 공개 배포하면서 봇이나 무단 스크립트의 Gemini API 호출을 막기 위한 설정 절차입니다.

---

## 1. Google AI Studio 무료 티어 확인 (과금 0원 확인)

1. [Google AI Studio](https://aistudio.google.com/)에서 사용할 API 키의 프로젝트 상태를 확인합니다.
2. 프로젝트가 **Free tier(결제 수단 미연결)**인지 확인합니다. 결제 수단이 연결되어 있지 않으면 요청량이 많아져도 과금되지 않고 `429` 한도 응답만 반환됩니다.
3. 제출·평가 기간 전용으로 새 API 키를 하나 발급해 두면, 평가가 끝난 뒤 해당 키만 비활성화·삭제해 안전하게 종료할 수 있습니다.

---

## 2. Cloudflare Pages 프로젝트 생성

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**을 선택합니다.
2. NoRuler 저장소를 연결하고 빌드 설정을 입력합니다.
   - **Production branch**: `main`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Node version** (필요 시 환경 변수): `NODE_VERSION` = `22` (또는 이상)
3. 먼저 1차 배포를 진행해 기본 배포 주소(예: `https://noruler.pages.dev`)를 확보합니다.

> **참고:** 저장소의 [`functions/api/image-dimensions.ts`](../functions/api/image-dimensions.ts), [`public/robots.txt`](../public/robots.txt), [`public/_headers`](../public/_headers)가 자동으로 함께 적용됩니다.

---

## 3. Cloudflare Turnstile 위젯 발급 (무클릭 봇 차단)

1. Cloudflare Dashboard → **Turnstile** → **Add Widget**으로 이동합니다.
2. **Hostname**에 배포된 도메인을 추가합니다 (예: `noruler.pages.dev`, 커스텀 도메인을 연결할 경우 해당 도메인도 추가).
3. **Widget Mode**는 **Managed** 또는 **Non-interactive**를 선택합니다.
   - 앱 코드([`src/turnstile.ts`](../src/turnstile.ts))는 `appearance: 'interaction-only'`로 렌더링하므로, 정상 브라우저에서는 퍼즐이나 체크박스 없이 자동 통과합니다.
4. 생성된 **Site Key**와 **Secret Key**를 복사해 둡니다.

---

## 4. 환경 변수 및 Secret 설정

Cloudflare Pages 프로젝트 → **Settings** → **Variables and Secrets**에서 아래 값을 등록합니다.

| 이름 | 종류 | 설명 |
| --- | --- | --- |
| `VITE_TURNSTILE_SITE_KEY` | Text | Turnstile **Site Key** (빌드에 포함되며, 누락 시 서버 설정 API에서도 읽음) |
| `TURNSTILE_SITE_KEY` | Text (선택) | 빌드 변수 대신 서버에서 제공할 공개 **Site Key** |
| `TURNSTILE_SECRET_KEY` | **Secret** (암호화) | Turnstile **Secret Key** (`functions/` 서버 검증용) |
| `GEMINI_API_KEY` | **Secret** (암호화) | Google AI Studio Gemini API 키 |

### 선택 조정 변수 (미설정 시 기본값 적용)

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `RATE_LIMIT_PER_MIN` | `4` | IP당 1분 최대 분석 요청 수 |
| `RATE_LIMIT_PER_DAY` | `20` | IP당 하루(UTC) 최대 분석 요청 수 |
| `RATE_LIMIT_GLOBAL_PER_DAY` | `150` | 전체 공개 데모 하루(UTC) 최대 분석 요청 수 |
| `MAX_CONCURRENT_REQUESTS` | `3` | 동시 Gemini 호출 상한 |
| `ALLOWED_ORIGINS` | *(없음)* | 설정 시 허용할 Origin 고정 목록 (쉼표 구분, 프리뷰·해시 서브도메인 차단용) |

> **중요:** 변수 등록·수정 후 **Retry deployment** 또는 새 커밋으로 **재배포**하세요. 빌드에 Site Key가 없으면 브라우저가 `/api/analysis-config`에서 `TURNSTILE_SITE_KEY` 또는 `VITE_TURNSTILE_SITE_KEY`를 읽습니다. 두 값 모두 없으면 관리자 설정 누락을 안내하고 분석 요청을 보내지 않습니다. Site Key는 공개 값이며 Secret Key에서 유도할 수 없으므로 별도로 등록해야 합니다. `GEMINI_API_KEY`와 `TURNSTILE_SECRET_KEY`는 절대 `VITE_` 접두사를 붙이지 마세요. 불필요한 노출을 막기 위해 Preview 배포는 끄거나(`None`) Preview 환경에 Secret과 KV 바인딩을 두지 않는 것을 권장합니다.

---

## 5. (선택) 일일 한도 공유용 KV 바인딩 & WAF

기본 상태에서도 엣지 인스턴스 메모리의 분당·일일·동시 요청 제한이 동작하지만, 여러 지역 엣지에 걸쳐 일일 한도(`RATE_LIMIT_PER_DAY`, `RATE_LIMIT_GLOBAL_PER_DAY`)를 더 정확히 공유하려면 KV를 연결할 수 있습니다.

1. Cloudflare Dashboard → **Storage & Databases** → **KV** → 새 Namespace 생성 (예: `noruler-rate-limit`).
2. Pages 프로젝트 → **Settings** → **Bindings** → **Add** → **KV namespace**:
   - **Variable name**: `RATE_LIMIT_KV`
   - **KV namespace**: 방금 만든 Namespace 선택
3. 무료 티어 KV 쓰기 한도는 일 1,000회입니다. 기본 `RATE_LIMIT_GLOBAL_PER_DAY=150` 기준 요청당 최대 2회(일 300회 이하)만 기록하며, KV 오류 시 자동으로 메모리 제한으로 폴백합니다.
4. 커스텀 도메인을 연결해 Cloudflare Zone을 쓰는 경우, **Security → WAF → Rate limiting rules**에서 `/api/image-dimensions` 경로에 무료 1개 룰을 추가로 걸 수 있습니다.

---

## 6. 배포 후 동작 및 보안 점검

배포 주소에서 아래 항목을 순서대로 확인합니다.

- [ ] **검색 차단 확인**: `<배포주소>/robots.txt`에서 `Disallow: /` 응답 확인, 응답 헤더에 `X-Robots-Tag: noindex, nofollow` 포함 확인.
- [ ] **외부 직접 호출 차단 확인**: 터미널에서 Turnstile 토큰 없이 호출 시 `403`이 반환되는지 확인합니다.
  ```sh
  curl -i -X POST https://<배포주소>/api/image-dimensions \
    -H "Content-Type: image/png" \
    --data-binary @public/measurement-example.png
  ```
- [ ] **내장 예시 및 직접 입력**: **예시 도면 써보기**와 **치수 직접 입력**이 정상 동작하는지 확인합니다.
- [ ] **실제 이미지 분석**: 상품 사진(고해상도 스마트폰 사진 포함) 업로드 → **이미지 분석** → 치수 검토 → 3D 공간 추가·이동·회전 → 새로고침 후 복원을 확인합니다.
- [ ] **Windows Chrome / Edge 확인**: Windows 환경의 Chrome과 Edge에서 WebGL 3D 렌더링, Turnstile 자동 통과, 분석·배치를 확인합니다.

---

## 7. 평가 종료 후 정리

평가·성적 확인이 끝나면 다음 중 하나로 정리합니다.

1. **공개 데모 유지 + AI 분석만 중단**: Cloudflare Pages에서 `GEMINI_API_KEY` Secret을 삭제하거나 Google AI Studio에서 해당 키를 삭제합니다. 방문자는 계속 **예시 도면 써보기**와 **치수 직접 입력**을 체험할 수 있습니다.
2. **배포 완전 종료**: Cloudflare Pages 프로젝트를 삭제하고, `README.md`의 체험 링크 안내를 갱신합니다.
3. **제출용 소스코드 ZIP 생성**: `.env.local` 등 추적되지 않는 파일이 포함되지 않도록 `git archive -o NoRuler.zip HEAD`로 패키징하고 압축 목록을 확인합니다.
