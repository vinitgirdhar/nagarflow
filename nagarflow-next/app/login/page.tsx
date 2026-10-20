"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, session, home } from "../lib/api";
import { Building2, HardHat, Users, KeyRound } from "lucide-react";
import styles from "./login.module.css";
type DemoAccount = { email: string; role: string; label: string };
type Demo = { email: string; password: string; accounts?: DemoAccount[] };
export default function LoginPage() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState(false),
    [mfaAvailable, setMfaAvailable] = useState(false),
    [demo, setDemo] = useState<Demo | null>(null),
    [selectedEmail, setSelectedEmail] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  useEffect(() => {
    session()
      .then((d) => {
        setSetup(d.setup_required);
        setMfaAvailable(d.mfa_available === true);
        setDemo(d.demo || null);
        setSelectedEmail(d.demo?.email || "");
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
      <section className={`auth-card ${styles.card}`}>
        <Link href="/" className={styles.brand}><Building2 size={19} aria-hidden="true" />NagarFlow</Link>
        <h1>Welcome back</h1>
        <p>Choose a demo workspace or sign in to your own account.</p>
        {demo?.accounts && <fieldset className={styles.roles}>
          <legend>Explore the prototype</legend>
          <div className={styles.roleGrid}>{demo.accounts.map((account) => {
            const Icon = account.role === "admin" ? Building2 : account.role === "maintenance" ? Users : HardHat;
            return <label key={account.email} className={styles.role}>
              <input type="radio" name="demo-role" value={account.email} checked={selectedEmail === account.email} onChange={() => setSelectedEmail(account.email)} />
              <span><Icon size={19} aria-hidden="true" />{account.label}</span>
            </label>;
          })}</div>
          <p>{demo.accounts.find((account) => account.email === selectedEmail)?.role === "worker"
            ? "View your assigned tasks and send field updates."
            : demo.accounts.find((account) => account.email === selectedEmail)?.role === "maintenance"
              ? "Assign field teams and review completed work."
              : "Explore the city dashboard, fleet and reports."}</p>
        </fieldset>}
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
          <button className={`btn btn--primary ${styles.signIn}`} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {demo && <button className={`btn ${styles.demoButton}`} type="button" disabled={busy} onClick={() => {
            setEmail(selectedEmail || demo.email);
            setPassword(demo.password);
            setError("");
          }}><KeyRound size={17} aria-hidden="true" />Use demo credentials</button>}
        </form>
        {demo ? (
          <section className="demo-credentials" aria-label="Prototype demo credentials">
            <h2>Public demo credentials</h2>
            <p>No authenticator or password setup needed.</p>
            <dl>
              <div><dt>Email</dt><dd><code>{selectedEmail || demo.email}</code></dd></div>
              <div><dt>Password</dt><dd><code>{demo.password}</code></dd></div>
            </dl>
            <p className="demo-note">Shared sample data. Changes are visible to other visitors and may reset. Please don’t enter personal information.</p>
          </section>
        ) : <p>Need access? Contact your municipality administrator.</p>}
      </section>
    </main>
  );
}
