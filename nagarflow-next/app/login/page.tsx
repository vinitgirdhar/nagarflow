"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, session, home } from "../lib/api";
export default function LoginPage() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState(false),
    [mfaAvailable, setMfaAvailable] = useState(false),
    [demo, setDemo] = useState<{ email: string; password: string } | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  useEffect(() => {
    session()
      .then((d) => {
        setSetup(d.setup_required);
        setMfaAvailable(d.mfa_available === true);
        setDemo(d.demo || null);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
          otp: f.get("otp") || "",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sign-in failed.");
      window.location.assign(
        d.user.must_change_password ? "/account" : home(d.user.role),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/">NagarFlow</Link>
        <h1>Welcome back</h1>
        <p>Sign in to your municipality workspace.</p>
        {setup && (
          <p role="status">
            Your administrator must provision the first account before sign-in
            is available.
          </p>
        )}
        <form onSubmit={submit}>
          <label>
            Email
            <input
              className="input"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              className="input"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          {mfaAvailable && <label>Authenticator or recovery code (if enabled)<input className="input" name="otp" type="text" autoComplete="one-time-code" maxLength={40}/></label>}
          {error && <p role="alert">{error}</p>}
          <button className="btn btn--primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {demo ? (
          <section className="demo-credentials" aria-label="Prototype demo credentials">
            <h2>Try the prototype</h2>
            <p>Use these public credentials to explore the sample workspace. No authenticator or password change needed.</p>
            <dl>
              <div><dt>Email</dt><dd><code>{demo.email}</code></dd></div>
              <div><dt>Password</dt><dd><code>{demo.password}</code></dd></div>
            </dl>
            <button className="btn" type="button" disabled={busy} onClick={() => {
              setEmail(demo.email);
              setPassword(demo.password);
              setError("");
            }}>Use demo credentials</button>
            <p className="demo-note">Shared sample data. Changes are visible to other visitors and may reset. Please don’t enter personal information.</p>
          </section>
        ) : <p>Need access? Contact your municipality administrator.</p>}
      </section>
    </main>
  );
}
