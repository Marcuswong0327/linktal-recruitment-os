const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) {
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
