export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

export const BROWSER_SEC_CH_UA = '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"';

export const BROWSER_ACCEPT_LANGUAGE = 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7';

export interface CreateBrowserHeadersOptions {
  url?: string;
  origin?: string;
  referer?: string;
  headers?: HeadersInit;
  mode?: 'cors' | 'navigate';
}

export function createBrowserHeaders(options: CreateBrowserHeadersOptions = {}): Record<string, string> {
  const isNavigate = options.mode === 'navigate';
  const headers: Record<string, string> = {
    'user-agent': BROWSER_USER_AGENT,
    'accept-language': BROWSER_ACCEPT_LANGUAGE,
    'sec-ch-ua': BROWSER_SEC_CH_UA,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': isNavigate ? 'document' : 'empty',
    'sec-fetch-mode': isNavigate ? 'navigate' : 'cors',
    'sec-fetch-site': isNavigate ? 'none' : 'same-origin',
    priority: isNavigate ? 'u=0, i' : 'u=1, i',
  };

  let origin = options.origin;
  if (!origin && options.url) {
    try {
      origin = new URL(options.url).origin;
    } catch {
      // not a valid absolute url
    }
  }

  if (origin) {
    headers['origin'] = origin;
    headers['referer'] = options.referer ?? `${origin}/`;
  } else if (options.referer) {
    headers['referer'] = options.referer;
  }

  headers['accept'] = isNavigate
    ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
    : 'application/json, text/plain, */*';

  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      for (const [key, value] of options.headers) {
        headers[key] = value;
      }
    } else {
      for (const [key, value] of Object.entries(options.headers)) {
        if (value !== undefined) {
          headers[key] = String(value);
        }
      }
    }
  }

  return headers;
}

export function browserFetch(
  fetchFn: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: Omit<CreateBrowserHeadersOptions, 'url' | 'headers'> = {},
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const mergedHeaders = createBrowserHeaders({
    url,
    origin: options.origin,
    referer: options.referer,
    mode: options.mode,
    headers: init.headers,
  });

  return fetchFn(input, {
    ...init,
    headers: mergedHeaders,
  });
}
