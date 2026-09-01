/** Helpers HTTP: JSON com timeout, retry e backoff exponencial. */

export interface HttpOptions extends RequestInit {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
}

export async function httpFetch(url: string, opts: HttpOptions = {}): Promise<Response> {
  const { fetchImpl = globalThis.fetch, timeoutMs = 15_000, retries = 3, ...init } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      // 429 / 5xx => retry com backoff (respeita Retry-After quando presente).
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 500;
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) await sleep(2 ** attempt * 500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`httpFetch failed: ${url}`);
}

export async function httpJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const res = await httpFetch(url, {
    ...opts,
    headers: { accept: 'application/json', ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

export async function httpText(url: string, opts: HttpOptions = {}): Promise<string> {
  const res = await httpFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
