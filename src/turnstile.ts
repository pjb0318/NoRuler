/// <reference types="vite/client" />

export const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TOKEN_TIMEOUT_MS = 12_000;

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
  appearance?: 'always' | 'execute' | 'interaction-only';
  execution?: 'render' | 'execute';
  'refresh-expired'?: 'auto' | 'manual' | 'never';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  'timeout-callback'?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileController {
  getToken: (signal: AbortSignal) => Promise<string>;
  reset: () => void;
  destroy: () => void;
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstileApi(): Promise<TurnstileApi> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('브라우저 환경에서만 보안 확인을 실행할 수 있어요.'));
  }
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (scriptPromise) {
    return scriptPromise;
  }
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
    const script = existing ?? document.createElement('script');

    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const onLoad = () => {
      cleanup();
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        scriptPromise = null;
        reject(new Error('보안 확인 위젯을 초기화하지 못했어요. 광고 차단기를 확인하거나 치수를 직접 입력해 주세요.'));
      }
    };
    const onError = () => {
      cleanup();
      scriptPromise = null;
      reject(new Error('보안 확인 위젯을 불러오지 못했어요. 광고 차단기를 끄거나 치수를 직접 입력해 주세요.'));
    };

    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);

    if (!existing) {
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}

function makeAbortError(): Error {
  return typeof DOMException !== 'undefined'
    ? new DOMException('Aborted', 'AbortError')
    : new Error('Aborted');
}

/** Mounts an interaction-only Turnstile widget and resolves tokens on demand. */
export function mountTurnstile(
  container: HTMLElement,
  siteKey: string,
  theme: 'light' | 'dark' = 'light',
): TurnstileController {
  let destroyed = false;
  let widgetId: string | null = null;
  let token = '';
  let lastError: Error | null = null;
  const waiters = new Set<{ resolve: (value: string) => void; reject: (error: Error) => void }>();

  const flushWaiters = (nextToken: string) => {
    const pending = [...waiters];
    waiters.clear();
    for (const waiter of pending) waiter.resolve(nextToken);
  };

  const rejectWaiters = (error: Error) => {
    const pending = [...waiters];
    waiters.clear();
    for (const waiter of pending) waiter.reject(error);
  };

  const renderWidget = () => {
    loadTurnstileApi()
      .then(api => {
        if (destroyed) return;
        lastError = null;
        widgetId = api.render(container, {
          sitekey: siteKey,
          theme,
          appearance: 'interaction-only',
          execution: 'render',
          'refresh-expired': 'auto',
          callback: nextToken => {
            if (destroyed) return;
            token = nextToken;
            lastError = null;
            flushWaiters(nextToken);
          },
          'expired-callback': () => {
            token = '';
          },
          'error-callback': () => {
            token = '';
            lastError = new Error('브라우저 보안 확인을 통과하지 못했어요. 페이지를 새로고침하거나 치수를 직접 입력해 주세요.');
            rejectWaiters(lastError);
          },
          'timeout-callback': () => {
            token = '';
          },
        });
      })
      .catch(error => {
        if (destroyed) return;
        lastError = error instanceof Error ? error : new Error('보안 확인 위젯을 불러오지 못했어요.');
        rejectWaiters(lastError);
      });
  };

  renderWidget();

  return {
    getToken(signal: AbortSignal) {
      if (destroyed || signal.aborted) {
        return Promise.reject(makeAbortError());
      }
      if (token) {
        return Promise.resolve(token);
      }
      if (lastError) {
        lastError = null;
        if (widgetId !== null && window.turnstile) {
          window.turnstile.reset(widgetId);
        } else {
          renderWidget();
        }
      }
      return new Promise<string>((resolve, reject) => {
        const entry = {
          resolve: (value: string) => {
            cleanup();
            resolve(value);
          },
          reject: (error: Error) => {
            cleanup();
            reject(error);
          },
        };
        const onAbort = () => {
          waiters.delete(entry);
          entry.reject(makeAbortError());
        };
        const timer = window.setTimeout(() => {
          waiters.delete(entry);
          entry.reject(new Error('보안 확인 응답 시간이 초과됐어요. 광고 차단기를 확인하거나 치수를 직접 입력해 주세요.'));
        }, TOKEN_TIMEOUT_MS);
        const cleanup = () => {
          window.clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
        };

        signal.addEventListener('abort', onAbort, { once: true });
        waiters.add(entry);
      });
    },
    reset() {
      token = '';
      lastError = null;
      if (widgetId !== null && window.turnstile) {
        window.turnstile.reset(widgetId);
      }
    },
    destroy() {
      destroyed = true;
      token = '';
      rejectWaiters(makeAbortError());
      if (widgetId !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // Ignore teardown errors if DOM node was already removed.
        }
        widgetId = null;
      }
    },
  };
}
