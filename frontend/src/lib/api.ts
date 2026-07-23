/** Thin fetch wrapper + JWT storage. Every API call in the app goes through `apiFetch`, which
 * attaches the bearer token and prefixes `/api` — no component talks to `fetch` directly. */
const TOKEN_KEY = "casewright_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** A 401 here means the stored token is missing/expired/invalid, not that this particular
 * request was malformed — every route requires auth, so the token is bad for every future
 * request too. `RequireAuth` (App.tsx) only checks that a token exists, not that it's still
 * valid, so without this the app would otherwise render normally and every query would just
 * fail silently forever. Full navigation (not react-router) so the stale React Query cache
 * doesn't survive into the re-login. */
function handleUnauthorized(): never {
  clearToken();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
  throw new Error("401 Unauthorized");
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Incorrect email or password");
  const data = (await res.json()) as { access_token: string };
  setToken(data.access_token);
  return data.access_token;
}

export async function uploadDocument<T>(caseId: string, kind: string, file: File): Promise<T> {
  const token = getToken();
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", file);

  const res = await fetch(`/api/cases/${caseId}/documents`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
