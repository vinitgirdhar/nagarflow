"use client";
import { useState } from "react";
import { useUser } from "../components/AuthBoundary";
import { apiFetch, home } from "../lib/api";
import Link from "next/link";
import MfaSettings from "../components/MfaSettings";
export default function Account() {
  const user = useUser();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("new") !== f.get("confirm")) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: f.get("current"),
          new_password: f.get("new"),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      window.location.assign("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-card" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        <h1>Account security</h1>
        <p>
          {user?.display_name} · {user?.email}
        </p>
        {user?.demo && <p>This is a public prototype account. Its shared credentials stay the same for every visitor.</p>}
        {!user?.demo && <details open={user?.must_change_password || undefined} style={{ margin: "20px 0" }}>
        <summary>Update your password</summary>
        <p>
          {user?.must_change_password
            ? "Change your temporary password to enter your workspace."
            : "Changing your password signs you out on every device."}
        </p>
        <form onSubmit={submit}>
          <label>
            Current password
            <input
              className="input"
              type="password"
              name="current"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <label>
            New passphrase
            <input
              className="input"
              type="password"
              name="new"
              autoComplete="new-password"
              required
              minLength={15}
              maxLength={128}
            />
          </label>
          <label>
            Confirm passphrase
            <input
              className="input"
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              minLength={15}
              maxLength={128}
            />
          </label>
          <p>Use 15–128 characters.</p>
          {error && <p role="alert">{error}</p>}
          <button className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </button>
        </form>
        </details>}
        {!user?.must_change_password && user?.mfa_available && <MfaSettings initialEnabled={user?.mfa_enabled || false} policyRequired={user?.mfa_policy_required || false} />}
        {!user?.must_change_password && !user?.mfa_required && (
          <Link href={home(user?.role || "")}>Back to workspace</Link>
        )}
        <button
          className="btn"
          onClick={async () => {
            const r = await apiFetch("/api/auth/logout", { method: "POST" });
            if (r.ok) window.location.assign("/login");
          }}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
