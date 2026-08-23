import type { ErrorResponse } from './generated/types';

// Same-origin BFF proxy (see src/proxy.ts). The browser hits this path with
// just its httpOnly session cookie; proxy.ts reads the access token from that
// cookie server-side and forwards to NestJS with a Bearer header — so no token
// ever touches client JS and there's no /api/auth/token round-trip.
const BASE_URL = '/api/backend';

/**
 * Error thrown by customFetch on a non-2xx response. Extends Error (so
 * `.message` works everywhere) while carrying the parsed API error body, whose
 * shape matches the `ErrorResponse` the backend's global filter returns.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: string[] | null;

  constructor(body: ErrorResponse) {
    super(body.message);
    this.name = 'ApiError';
    this.statusCode = body.statusCode;
    this.code = body.code;
    this.details = body.details ?? null;
  }
}

/**
 * The single HTTP client for the app.
 *
 * - Used directly for hand-written calls (`customFetch('/candidates')`).
 * - Wired into Orval as the `mutator`, so generated React Query hooks route
 *   through here too — inheriting the base URL. Orval passes a relative `url`
 *   (it has no `baseUrl` configured), which we prefix with the /api/backend
 *   proxy path.
 */
export const customFetch = async <T>(
  url: string,
  options?: RequestInit,
): Promise<T> => {
  // A FormData body (the generated multipart-upload hooks, e.g. importClients)
  // must NOT get an explicit Content-Type here — the browser computes its own
  // `multipart/form-data; boundary=...` from the FormData instance, and an
  // explicit header (even the "default" below) overrides that and breaks the
  // multipart body's boundary marker, which the server can't then parse.
  const isFormData = options?.body instanceof FormData;
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
    credentials: 'include', // send the session cookie so proxy.ts can auth us
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorResponse | null;
    throw new ApiError(
      body ?? {
        statusCode: response.status,
        code: 'ERROR',
        message: `Request failed with ${response.status}`,
        details: null,
        path: url,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // The generated client types every response as an { data, status, headers }
  // envelope (Orval's fetch-client convention), so return that shape — not the
  // bare body — or status-based narrowing in callers never matches at runtime.
  return {
    data: response.status === 204 ? undefined : await response.json(),
    status: response.status,
    headers: response.headers,
  } as T;
};

/**
 * Sibling to `customFetch` for binary responses (currently: the .xlsx export
 * endpoints) — `customFetch` unconditionally calls `response.json()`, which
 * throws on a binary body, and every generated hook depends on that JSON
 * contract, so this is a separate function rather than a branch inside it.
 * Same base URL / credentials handling; triggers a browser download instead
 * of returning parsed data.
 */
export async function downloadFile(url: string, options?: RequestInit): Promise<void> {
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    credentials: 'include',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorResponse | null;
    throw new ApiError(
      body ?? {
        statusCode: response.status,
        code: 'ERROR',
        message: `Request failed with ${response.status}`,
        details: null,
        path: url,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // Prefer the server's own filename (Content-Disposition) over guessing one
  // client-side — the two can disagree on date/timezone/format drift.
  const disposition = response.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? 'download.xlsx';

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
