let csrf = "";
export async function session() {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok)
    throw new Error("Cannot connect to sign-in service. Please retry.");
  const data = await response.json();
  csrf = data.csrf_token;
  return data;
}
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
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
