let csrf = "";
let pendingSession: Promise<Awaited<ReturnType<typeof readSession>>> | null = null;
async function readSession() {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    } catch {
      if (attempt === 3) throw new Error("Cannot connect to the sign-in service. Please retry.");
    }
    if (response?.ok) {
      const data = await response.json();
      csrf = data.csrf_token;
      return data;
    }
    if (response && ![502, 503, 504].includes(response.status)) break;
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error("The server is taking longer than expected. Please retry.");
}
export function session() {
  // The boundary and login form both read sessions. One response must own the
  // anonymous cookie challenge, otherwise their tokens can overwrite each other.
  if (!pendingSession) pendingSession = readSession().finally(() => { pendingSession = null; });
  return pendingSession;
}
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  if (pendingSession) await pendingSession;
  if (!csrf) await session();
  const headers = new Headers(init.headers);
  if (
    !["GET", "HEAD", "OPTIONS"].includes((init.method || "GET").toUpperCase())
  )
    headers.set("X-CSRF-Token", csrf);
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401 && String(input) !== "/api/auth/login") {
    window.location.assign("/login");
    throw new Error("Please sign in again.");
  }
  if (response.status === 403) {
    const data = await response
      .clone()
      .json()
      .catch(() => ({}));
    if (data.code === "password_change_required" || data.code === "mfa_enrollment_required")
      window.location.assign("/account");
  }
  return response;
}
export function home(role: string) {
  return role === "worker"
    ? "/worker-portal"
    : role === "maintenance"
      ? "/maintenance"
      : "/dashboard";
}
