"use client";
import { useEffect, useState } from "react";
import { FileDown, RefreshCw } from "lucide-react";
import DashboardShell from "../components/DashboardShell";
import { apiFetch } from "../lib/api";
type Report = {
  generated_at: string;
  kpis: { coverage: number | null };
  score_comparison: {
    observed_count: number;
    excluded_legacy_or_simulated_count: number;
    mean_absolute_error: number | null;
    source: string;
    unit: string;
  };
  fleet: {
    total: number;
    busy: number;
    en_route: number;
    arrived: number;
    cancelled: number;
  };
  zone_coverage: {
    zone: string;
    last_confirmed_visit: string | null;
    covered: boolean;
  }[];
  daily_score_comparison: {
    date: string;
    sample_count: number;
    mean_absolute_error: number | null;
  }[];
  definitions: {
    coverage: string;
    score_comparison: string;
    unavailable_kpis: string;
  };
};
const value = (number: number | null | undefined, suffix = "") =>
  number == null ? "Not available" : `${number}${suffix}`;
export default function ReportsPage() {
  const [data, setData] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await apiFetch("/api/reports");
        if (!r.ok) throw new Error("Unable to load operational reports.");
        const d = await r.json();
        if (active) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Please retry.");
      }
    }
    load();
    const id = window.setInterval(load, 10000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);
  async function download() {
    if (!data) return;
    setExporting(true);
    setError("");
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const pdf = new jsPDF();
      pdf.setFontSize(18);
      pdf.text("NagarFlow - Operational report", 14, 20);
      pdf.setFontSize(10);
      pdf.text("Generated: " + data.generated_at, 14, 29);
      autoTable(pdf, {
        startY: 36,
        head: [["Metric", "Recorded value"]],
        body: [
          ["Known zones covered in 48h", value(data.kpis.coverage, "%")],
          ["Fleet vehicles", String(data.fleet.total)],
          ["Active dispatches", String(data.fleet.en_route)],
          ["Confirmed arrivals", String(data.fleet.arrived)],
          ["Cancelled dispatches", String(data.fleet.cancelled)],
          [
            "Operator demand observations",
            String(data.score_comparison.observed_count),
          ],
          [
            "Mean score difference",
            value(data.score_comparison.mean_absolute_error, " points"),
          ],
          [
            "Excluded legacy/synthetic outcomes",
            String(data.score_comparison.excluded_legacy_or_simulated_count),
          ],
        ],
      });
      pdf.addPage();
      pdf.text("Daily operator score comparisons (UTC)", 14, 20);
      autoTable(pdf, {
        startY: 28,
        head: [["Date", "Observations", "Mean absolute difference (points)"]],
        body: data.daily_score_comparison.map((d) => [
          d.date,
          String(d.sample_count),
          value(d.mean_absolute_error),
        ]),
      });
      pdf.addPage();
      pdf.text("Confirmed zone visits", 14, 20);
      autoTable(pdf, {
        startY: 28,
        head: [["Zone", "Last confirmed visit", "Within 48 hours"]],
        body: data.zone_coverage.map((z) => [
          z.zone,
          z.last_confirmed_visit || "Not recorded",
          z.covered ? "Yes" : "No",
        ]),
      });
      pdf.addPage();
      pdf.text("Data sources and limitations", 14, 20);
      let y = 32;
      for (const text of [
        data.definitions.coverage,
        data.definitions.score_comparison,
        data.definitions.unavailable_kpis,
      ]) {
        const lines = pdf.splitTextToSize(text, 180);
        pdf.text(lines, 14, y);
        y += lines.length * 6 + 12;
      }
      pdf.save(`NagarFlow_Operations_${data.generated_at.slice(0, 10)}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report export failed.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <DashboardShell title="Reports">
      <div
        className="page-header"
        style={{
          display: "flex",
          gap: 16,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="page-header__title">Reports</h1>
          <p className="page-header__sub">
            See completed visits, active dispatches and zone coverage.
          </p>
        </div>
        <button
          className="btn btn--primary"
          onClick={download}
          disabled={!data || exporting}
        >
          {exporting ? <RefreshCw size={16} /> : <FileDown size={16} />}{" "}
          {exporting ? "Exporting…" : "Download PDF"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p role="status">Loading report…</p>
      ) : (
        <>
          <p style={{ marginBottom: "1rem" }}>
            Updated {new Date(data.generated_at).toLocaleString()}. Auto-refreshes.
          </p>
          <div className="stat-grid">
            {[
              [
                "Zone coverage",
                value(data.kpis.coverage, "%"),
                "Confirmed visits within 48 hours",
              ],
              [
                "Active dispatches",
                String(data.fleet.en_route),
                "Vehicles awaiting arrival confirmation",
              ],
              [
                "Confirmed arrivals",
                String(data.fleet.arrived),
                "Operator-confirmed dispatch arrivals",
              ],
              [
                "Demand observations",
                String(data.score_comparison.observed_count),
                "Explicitly supplied at arrival",
              ],
            ].map(([label, number, description]) => (
              <div className="card" key={label}>
                <div className="card__label">{label}</div>
                <div className="card__value">{number}</div>
                <p className="card__sub">{description}</p>
              </div>
            ))}
          </div>
          <section
            className="card"
            style={{ padding: "1.5rem", margin: "1.5rem 0" }}
          >
            <h2>Data quality</h2>
            <p style={{ margin: ".75rem 0" }}>
              {data.score_comparison.observed_count === 0
                ? "No observed demand has been recorded. Arrival alone does not create a demand observation."
                : `Mean absolute score difference: ${value(data.score_comparison.mean_absolute_error, " points")}.`}
            </p>
            <p>
              {data.score_comparison.excluded_legacy_or_simulated_count} legacy
              or simulated outcomes excluded.
            </p>
            <p style={{ margin: ".75rem 0" }}>
              Score differences compare operator observations with the recorded priority at dispatch. They do not measure forecast accuracy.
            </p>
            <details><summary>Sources and limitations</summary>
              <p>{data.definitions.score_comparison}</p>
              <p>{data.definitions.unavailable_kpis}</p>
            </details>
          </section>
          <section
            className="card"
            style={{
              padding: "1.5rem",
              marginBottom: "1.5rem",
              overflowX: "auto",
            }}
          >
            <h2>Daily score comparisons</h2>
            <p>UTC dates. Empty days remain unavailable.</p>
            <table style={{ width: "100%", textAlign: "left", marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Observations</th>
                  <th>Mean absolute difference</th>
                </tr>
              </thead>
              <tbody>
                {data.daily_score_comparison.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.sample_count}</td>
                    <td>{value(d.mean_absolute_error, " points")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section
            className="card"
            style={{ padding: "1.5rem", overflowX: "auto" }}
          >
            <h2>Confirmed zone coverage</h2>
            <p style={{ margin: ".75rem 0" }}>Zones with a confirmed visit in the past 48 hours.</p>
            <details style={{ marginBottom: 12 }}><summary>How coverage is counted</summary><p>{data.definitions.coverage}</p></details>
            {!data.zone_coverage.length ? (
              <p>No zones are available yet.</p>
            ) : (
              <table style={{ width: "100%", textAlign: "left" }}>
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Last confirmed visit</th>
                    <th>Covered within 48 hours</th>
                  </tr>
                </thead>
                <tbody>
                  {data.zone_coverage.map((z) => (
                    <tr key={z.zone}>
                      <td>{z.zone}</td>
                      <td>
                        {z.last_confirmed_visit
                          ? new Date(z.last_confirmed_visit).toLocaleString()
                          : "Not recorded"}
                      </td>
                      <td>{z.covered ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </DashboardShell>
  );
}
