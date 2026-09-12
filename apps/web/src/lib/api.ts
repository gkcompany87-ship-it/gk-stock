export const apiBase = "/api/v1";
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly requestId?: string, readonly details?: unknown) { super(message); this.name = "ApiError"; }
}
type ApiOptions = RequestInit & { json?: unknown; responseType?: "json" | "blob"; noRefresh?: boolean };
let localLock: Promise<unknown> = Promise.resolve();
/** Serialize cookie rotations across tabs. No token is stored in localStorage. */
function authLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return new Promise<T>((resolve, reject) => {
      void navigator.locks
        .request("as-tino-auth", async () => {
          try {
            resolve(await fn());
          } catch (error) {
            reject(error);
          }
        })
        .catch(reject);
    });
  }
  const next = localLock.then(fn, fn); localLock = next.catch(() => undefined); return next;
}
async function csrf(): Promise<string> {
  const response = await fetch(`${apiBase}/auth/csrf`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new ApiError("La connexion au serveur est indisponible.", response.status);
  const body = await response.json() as { csrfToken: string }; return body.csrfToken;
}
async function refreshInsideLock() {
  // Another tab may have already rotated the cookies while this request waited.
  const me = await fetch(`${apiBase}/auth/me`, { credentials: "include", cache: "no-store" });
  if (me.ok) return;
  if (me.status !== 401) throw new ApiError("Le serveur est temporairement indisponible.", me.status);
  const token = await csrf();
  const response = await fetch(`${apiBase}/auth/refresh`, { method: "POST", credentials: "include", cache: "no-store", headers: { "x-csrf-token": token } });
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("as-tino-session-expired"));
    throw new ApiError(response.status === 401 ? "Votre session a expir\u00e9. Reconnectez-vous." : "Le renouvellement de session est indisponible.", response.status);
  }
}
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { json, responseType = "json", noRefresh = false, ...init } = options;
  const method = (init.method ?? "GET").toUpperCase(); const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const execute = async () => {
    if (mutation && typeof navigator !== "undefined" && !navigator.onLine) throw new ApiError("Connexion Internet requise. Aucune op\u00e9ration n'a \u00e9t\u00e9 mise en attente.", 0);
    const send = async () => {
      const headers = new Headers(init.headers);
      if (json !== undefined) headers.set("Content-Type", "application/json");
      if (mutation) headers.set("x-csrf-token", await csrf());
      return fetch(`${apiBase}${path}`, { ...init, method, headers, credentials: "include", cache: "no-store", body: json !== undefined ? JSON.stringify(json) : init.body });
    };
    let response = await send();
    if (response.status === 401 && !noRefresh && !path.startsWith("/auth/login") && !path.startsWith("/auth/password-reset")) {
      if (mutation) await refreshInsideLock(); else await authLock(refreshInsideLock);
      response = await send();
    }
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: { message?: string; requestId?: string; details?: unknown }; requestId?: string } | null;
      throw new ApiError(result?.error?.message ?? `Erreur serveur (${response.status}).`, response.status, result?.requestId ?? result?.error?.requestId, result?.error?.details);
    }
    if (response.status === 204) return undefined as T;
    return (responseType === "blob" ? await response.blob() : await response.json()) as T;
  };
  try { return mutation ? await authLock(execute) : await execute(); }
  catch (error) { if (error instanceof TypeError) throw new ApiError("Connexion interrompue. R\u00e9essayez sans modifier l'op\u00e9ration : elle ne sera pas doubl\u00e9e.", 0); throw error; }
}
export function queryString(values: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  return params.size ? `?${params}` : "";
}
export async function download(path: string, filename: string) {
  const blob = await apiFetch<Blob>(path, { responseType: "blob" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
