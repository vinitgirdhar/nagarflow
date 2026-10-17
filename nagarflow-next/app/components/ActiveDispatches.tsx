"use client";
import { useCallback, useEffect, useState } from "react";
import ObservationCorrection from "./ObservationCorrection";
import { apiFetch } from "../lib/api";
import { dispatchMutation, type DispatchRecord } from "../lib/dispatch";
import { CheckCircle2, Truck, XCircle } from "lucide-react";

export default function ActiveDispatches() {
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    operation: "arrive" | "cancel";
  } | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/dispatch/assignments");
      if (!r.ok) throw new Error("Unable to load assignments.");
      const data = await r.json();
      setRecords(data.dispatches);
      setLoadError("");
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Unable to load assignments.",
      );
    }
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4000);
    window.addEventListener("nagarflow-dispatch-changed", load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("nagarflow-dispatch-changed", load);
    };
  }, [load]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    const payload =
      editing.operation === "cancel"
        ? { dispatch_id: editing.id, reason: form.get("reason") }
        : {
            dispatch_id: editing.id,
            actual_demand:
              form.get("demand") === "" ? null : Number(form.get("demand")),
            notes: form.get("notes") || "",
          };
    try {
      const result = await dispatchMutation(editing.operation, payload);
      setEditing(null);
      setMessage(
        result.dispatch.status === "ARRIVED"
          ? "Arrival confirmed. Vehicle is available."
          : "Dispatch cancelled. Vehicle is available.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  const active = records.filter((r) => r.status === "EN_ROUTE");
  return (
    <section
      className="card"
      style={{ padding: "1.5rem", marginBottom: "1.5rem" }}
      aria-label="Dispatch assignments"
    >
      <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Truck size={21} />
        Active assignments
      </h2>
      <p style={{ margin: ".75rem 0", color: "var(--secondary)" }}>
        Confirm arrival when the vehicle reaches its assigned destination.
        Arrival records a visit; it does not approve a maintenance task.
      </p>
      {loadError && (
        <p role="alert">
          {loadError}{" "}
          <button className="btn" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!active.length && <p>No active fleet assignments.</p>}
      {active.map((record) => (
        <article
          key={record.id}
          className="dispatch-assignment"
          aria-label={`Assignment ${record.truck_name}`}
          style={{
            border: "1px solid var(--border-subtle)",
            padding: "1rem",
            borderRadius: 12,
            marginTop: "1rem",
          }}
        >
          <h3>
            {record.truck_name} → {record.zone}
          </h3>
          <p className="mono" style={{ fontSize: 12, margin: ".5rem 0" }}>
            En route ·{" "}
            {record.accepted_at
              ? new Date(record.accepted_at).toLocaleString()
              : "Legacy route: acceptance time unavailable"}
          </p>
          {editing?.id === record.id ? (
            <form
              aria-label={`${editing.operation === "arrive" ? "Arrival" : "Cancellation"} for ${record.truck_name}`}
              className="account-form"
              onSubmit={submit}
              style={{ maxWidth: 520 }}
            >
              {editing.operation === "arrive" ? (
                <>
                  <label>
                    Observed demand score (optional, 0–100)
                    <input
                      className="input"
                      name="demand"
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                    />
                  </label>
                  <p>
                    Leave blank if demand was not observed. This is an operator
                    report, not GPS verification or validated model accuracy.
                  </p>
                  <label>
                    Arrival notes
                    <input className="input" name="notes" maxLength={2000} />
                  </label>
                </>
              ) : (
                <label>
                  Cancellation reason
                  <input
                    className="input"
                    name="reason"
                    required
                    maxLength={1000}
                  />
                </label>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn--primary" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : editing.operation === "arrive"
                      ? "Record arrival"
                      : "Cancel dispatch"}
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Keep assignment
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn--primary"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setEditing({ id: record.id, operation: "arrive" });
                }}
                aria-label={`Confirm arrival for ${record.truck_name}`}
              >
                <CheckCircle2 size={16} />
                Confirm arrival
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setEditing({ id: record.id, operation: "cancel" });
                }}
                aria-label={`Cancel assignment for ${record.truck_name}`}
              >
                <XCircle size={16} />
                Cancel assignment
              </button>
            </div>
          )}
        </article>
      ))}
      <details style={{ marginTop: "1rem" }}>
        <summary>Recent dispatch history</summary>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left", marginTop: 12 }}>
            <thead>
              <tr>
                <th>Vehicle / zone</th>
                <th>Status</th>
                <th>Recorded at</th>
                <th>Observation review</th>
              </tr>
            </thead>
            <tbody>
              {records
                .filter((r) => r.status !== "EN_ROUTE")
                .slice(0, 10)
                .map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.truck_name} / {r.zone}
                    </td>
                    <td>{r.status}</td>
                    <td>{r.arrived_at || r.cancelled_at || "Unavailable"}</td>
                    <td><ObservationCorrection record={r}/></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
