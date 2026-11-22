import type { Connect } from 'vite';
import { handleImageDimensionsRequest, requestLimit } from './analyzeCore.ts';

function replyJson(res: Parameters<Connect.NextHandleFunction>[1], status: number, body: object) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function toWebHeaders(rawHeaders: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === 'string') {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    }
  }
  return headers;
}

export function imageDimensionsMiddleware(apiKey: string | undefined): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.url?.split('?')[0] === '/api/analysis-config' && req.method === 'GET') {
      return replyJson(res, 200, { turnstileRequired: false, turnstileSiteKey: '' });
    }
    if (req.url?.split('?')[0] !== '/api/image-dimensions') return next();

    const controller = new AbortController();
    const onResponseClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', onResponseClose);

    try {
      const headers = toWebHeaders(req.headers);
      const host = req.headers.host || 'localhost';
      const url = `http://${host}${req.url || '/api/image-dimensions'}`;
      const method = req.method || 'GET';

      let body: Uint8Array<ArrayBuffer> | undefined;
      if (method === 'POST') {
        const declaredLength = Number(req.headers['content-length']);
        if (!Number.isFinite(declaredLength) || declaredLength <= requestLimit) {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req.iterator({ destroyOnReturn: false })) {
            size += chunk.length;
            if (size > requestLimit) {
              req.resume();
              return replyJson(res, 413, { error: '8 MB 이하의 이미지를 선택해 주세요.' });
            }
            chunks.push(chunk);
          }
          if (size > 0) {
            const merged = Buffer.concat(chunks);
            body = new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength) as Uint8Array<ArrayBuffer>;
          }
        }
      }

      const webRequest = new Request(url, {
        method,
        headers,
        signal: controller.signal,
        ...(body ? { body } : {}),
      });

      const response = await handleImageDimensionsRequest(webRequest, {
        apiKey,
        mode: 'local',
        clientIp: req.socket.remoteAddress ?? '',
        requireTurnstile: false,
      });

      if (res.destroyed || res.writableEnded) return;
      const outHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        outHeaders[key] = value;
      });
      const text = await response.text();
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(response.status, outHeaders);
      res.end(text);
    } catch {
      replyJson(res, 502, { error: '이미지를 분석하지 못했어요. 다시 시도하거나 치수를 직접 입력해 주세요.' });
    } finally {
      res.off('close', onResponseClose);
    }
  };
}
