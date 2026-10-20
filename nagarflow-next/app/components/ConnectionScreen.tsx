import { Building2, ShieldCheck } from "lucide-react";
import styles from "./connection-screen.module.css";

export default function ConnectionScreen({ error, retry }: { error?: string; retry?: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.card} role={error ? "alert" : "status"} aria-live="polite" aria-labelledby="connection-title">
        <div className={styles.brand}><Building2 size={20} aria-hidden="true" /> NagarFlow</div>
        <div className={styles.city} aria-hidden="true">
          <svg viewBox="0 0 280 152" fill="none">
            <path className={styles.roads} d="M12 50h70l30 26h60l28-34h68M40 134l42-84V12m30 64 20 64m40-64 42 58m-2-92V10" />
            <path className={styles.route} d="M12 50h70l30 26h60l28-34h68" />
            <circle cx="82" cy="50" r="6" /><circle cx="172" cy="76" r="6" /><circle cx="212" cy="42" r="6" />
            <rect x="122" y="20" width="35" height="34" rx="4" /><path d="M132 30h15m-15 9h15" />
            <rect x="36" y="84" width="25" height="25" rx="4" />
          </svg>
          <span className={styles.seal}><ShieldCheck size={25} /></span>
        </div>
        <h1 id="connection-title">{error ? "Connection interrupted" : "Connecting securely"}</h1>
        <p className={styles.description}>{error || "Getting your workspace ready. Just a moment."}</p>
        {!error && <div className={styles.progress} aria-hidden="true"><span /></div>}
        <p className={styles.hostNote}>(Free-plan hosting: after inactivity, the server may take about a minute to wake up.)</p>
        {error && <button className="btn btn--primary" onClick={retry}>Try again</button>}
        <span className={styles.footer}>Civic work, connected.</span>
      </section>
    </main>
  );
}
