"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardShell from "../components/DashboardShell";
import { apiFetch } from "../lib/api";

type ZoneForecast = {
  zone: string;
  status: string;
  observed_days: number;
  last_recorded_date: string;
  selected_model?: string;
  forecast: {
    date: string;
    expected_complaint_volume: number;
    residual_range_low: number;
    residual_range_high: number;
  }[];
  evaluation: { model: string; mae: number; samples: number }[];
};
type Forecast = {
  as_of: string;
  data_last_date: string | null;
  zones: ZoneForecast[];
  methodology: Record<string, string>;
};
type Priority = { name: string; demand: number; category: string; reason: string };
const readiness = (status: string) =>
  status === "AVAILABLE" ? "Forecast ready" : "Recent history needed";

export default function Predictions() {
  const [data, setData] = useState<Forecast | null>(null),
    [priority, setPriority] = useState<Priority[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [asOf, setAsOf] = useState(""),
    [selectedZone, setSelectedZone] = useState("");

  async function load(date = "") {
    setBusy(true);
    setError("");
    try {
      const [f, p] = await Promise.all([
        apiFetch("/api/forecasts" + (date ? "?as_of=" + encodeURIComponent(date) : "")),
        apiFetch("/api/predictions"),
      ]);
      const result: Forecast & { error?: string } = await f.json();
      if (!f.ok) throw new Error(result.error || "Forecast unavailable.");
      setData(result);
      setSelectedZone((current) =>
        result.zones.some((zone) => zone.zone === current)
          ? current
          : result.zones.find((zone) => zone.status === "AVAILABLE")?.zone ||
            result.zones[0]?.zone || "",
      );
      if (p.ok) setPriority(await p.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Forecast unavailable.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);
  const zone = data?.zones.find((item) => item.zone === selectedZone);

  return (
    <DashboardShell title="Forecasts">
      <h1>Forecasts</h1>
      <p>Plan for expected complaints over the next two days.</p>
      <form
        style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "20px 0" }}
        onSubmit={(event) => { event.preventDefault(); load(asOf); }}
      >
        <label>
          History through (UTC, optional)
          <input className="input" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
        </label>
        <button className="btn btn--primary" disabled={busy}>
          {busy ? "Loading…" : "Update forecasts"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>History through {data.as_of} · Latest record: {data.data_last_date || "No records"}</p>
          {!data.zones.length ? (
            <p>More recent complaint history is needed to show a forecast.</p>
          ) : (
            <div style={{ marginTop: 20, maxWidth: 440 }}>
              <label htmlFor="forecast-zone">Zone</label>
              <select id="forecast-zone" className="input" value={selectedZone} onChange={(event) => setSelectedZone(event.target.value)}>
                {data.zones.map((item) => (
                  <option key={item.zone} value={item.zone}>{item.zone} · {readiness(item.status)}</option>
                ))}
              </select>
            </div>
          )}
          {zone && (
            <section className="card" key={zone.zone} style={{ padding: 20, marginTop: 16, overflowX: "auto" }}>
              <h2>{zone.zone}</h2>
              <p>{readiness(zone.status)} · {zone.observed_days} recorded days · Latest: {zone.last_recorded_date}</p>
              {zone.status === "AVAILABLE" ? (
                <>
                  <table style={{ width: "100%", textAlign: "left" }}>
                    <thead><tr><th>Forecast date (UTC)</th><th>Expected complaints</th><th>Estimated range</th></tr></thead>
                    <tbody>{zone.forecast.map((item) => (
                      <tr key={item.date}><td>{item.date}</td><td>{item.expected_complaint_volume}</td><td>{item.residual_range_low}–{item.residual_range_high}</td></tr>
                    ))}</tbody>
                  </table>
                  <p>The range reflects past errors; it is not a guaranteed confidence interval.</p>
                  <details>
                    <summary>Model comparison</summary>
                    <p>Selected model: {zone.selected_model}</p>
                    <table style={{ width: "100%", textAlign: "left" }}>
                      <thead><tr><th>Model</th><th>Average error</th><th>Days tested</th></tr></thead>
                      <tbody>{zone.evaluation.map((item) => (
                        <tr key={item.model}><td>{item.model}</td><td>{item.mae}</td><td>{item.samples}</td></tr>
                      ))}</tbody>
                    </table>
                    <p>Average error is measured in complaints per day. Lower is better. These are historical checks, not guaranteed future accuracy.</p>
                  </details>
                </>
              ) : <p>Not enough recent history to forecast this zone.</p>}
            </section>
          )}
          <details className="card" style={{ padding: 20, marginTop: 20 }}>
            <summary>Method and limitations</summary>
            <p>Forecasts help with planning. Dispatches still need your approval.</p>
            {Object.entries(data.methodology).map(([key, value]) => <p key={key} style={{ margin: "12px 0" }}>{value}</p>)}
          </details>
        </>
      )}
      <details className="card" style={{ padding: 20, marginTop: 20, overflowX: "auto" }}>
        <summary>Zone priorities</summary>
        <p>Recorded scores help you review where to act. They are separate from complaint forecasts.</p>
        {!priority.length ? <p>No priority records.</p> : (
          <table style={{ width: "100%", textAlign: "left" }}>
            <thead><tr><th>Zone</th><th>Priority</th><th>Category</th><th>Reason</th></tr></thead>
            <tbody>{priority.map((item) => (
              <tr key={item.name}><td>{item.name}</td><td>{item.demand}</td><td>{item.category}</td><td>{item.reason}</td></tr>
            ))}</tbody>
          </table>
        )}
      </details>
      <p style={{ marginTop: 20 }}><Link href="/dispatch">Open dispatch</Link> · <Link href="/maintenance">Open field work</Link></p>
    </DashboardShell>
  );
}
