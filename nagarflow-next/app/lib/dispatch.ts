import { apiFetch } from "./api";
export type DispatchRecord = {
  id: string;
  truck_id: number;
  truck_name: string;
  zone: string;
  status: "EN_ROUTE" | "ARRIVED" | "CANCELLED";
  accepted_at: string | null;
  arrived_at: string | null;
  cancelled_at: string | null;
  is_legacy: number;
  observation_revision: number;
  actual_demand: number | null;
  predicted_score: number | null;
  arrival_notes: string | null;
  cancel_reason: string | null;
};
export type DispatchSuggestion = {
  prediction_id: number;
  prediction_version: string;
  truck_id: number;
  zone: string;
};
const pendingRequests = new Map<string, string>();
export async function dispatchMutation(
  operation: "accept" | "arrive" | "cancel" | "observation",
  payload: object,
) {
  const fingerprint = operation + JSON.stringify(payload);
  const key = pendingRequests.get(fingerprint) || crypto.randomUUID();
  pendingRequests.set(fingerprint, key);
  const response = await apiFetch("/api/dispatch/" + operation, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (response.ok || response.status < 500) pendingRequests.delete(fingerprint);
  if (!response.ok)
    throw new Error(
      data.error || "The dispatch could not be updated. Please retry.",
    );
  window.dispatchEvent(new Event("nagarflow-dispatch-changed"));
  return data as { dispatch: DispatchRecord; replayed: boolean };
}
export async function acceptDispatch(suggestion: DispatchSuggestion) {
  const result = await dispatchMutation("accept", {
    truck_id: suggestion.truck_id,
    zone: suggestion.zone,
    prediction_id: suggestion.prediction_id,
    prediction_version: suggestion.prediction_version,
  });
  if (result.dispatch.status !== 'EN_ROUTE') throw new Error('This request belongs to a closed dispatch. Refresh suggestions before creating a new assignment.');
  return result;
}
