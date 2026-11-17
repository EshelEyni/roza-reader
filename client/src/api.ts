export class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new RequestError(body?.error ?? `Request failed (${response.status})`, response.status);
  }

  const hasNoContent = response.status === 204;
  return hasNoContent ? (undefined as T) : response.json();
}
