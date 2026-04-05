from __future__ import annotations

import sqlite3
from typing import Any, Iterable


def _as_score(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("-inf")


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _prediction_rank(record: dict[str, Any], score_key: str) -> tuple[float, str, int]:
    record_id = record.get("id")
    try:
        numeric_id = int(record_id)
    except (TypeError, ValueError):
        numeric_id = -1

    return (
        _as_score(record.get(score_key)),
        _as_text(record.get("timestamp")),
        numeric_id,
    )


def collapse_prediction_records(
    records: Iterable[dict[str, Any]],
    *,
    zone_key: str = "zone",
    score_key: str = "priority_score",
) -> list[dict[str, Any]]:
    winners: dict[str, dict[str, Any]] = {}

    for raw_record in records:
        zone = _as_text(raw_record.get(zone_key))
        if not zone:
            continue

        record = dict(raw_record)
        record[zone_key] = zone
        current = winners.get(zone)
        if current is None or _prediction_rank(record, score_key) > _prediction_rank(current, score_key):
            winners[zone] = record

    return sorted(
        winners.values(),
        key=lambda record: (-_as_score(record.get(score_key)), _as_text(record.get(zone_key)).lower()),
    )


def fetch_canonical_predictions(
    cursor: sqlite3.Cursor,
    *,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    rows = cursor.execute(
        """
        SELECT id, zone, priority_score, type, action, reason, timestamp, COALESCE(category, 'General') AS category
        FROM predictions
        """
    ).fetchall()

    predictions = collapse_prediction_records([dict(row) for row in rows])
    if limit is not None:
        return predictions[:limit]
    return predictions


def deduplicate_predictions_table(conn: sqlite3.Connection) -> None:
    original_factory = conn.row_factory
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        predictions = fetch_canonical_predictions(cursor)
        keep_ids = {
            int(prediction["id"])
            for prediction in predictions
            if prediction.get("id") is not None
        }

        if keep_ids:
            rows = cursor.execute("SELECT id FROM predictions").fetchall()
            delete_ids = [
                (row["id"],)
                for row in rows
                if row["id"] not in keep_ids
            ]
            if delete_ids:
                cursor.executemany("DELETE FROM predictions WHERE id = ?", delete_ids)

        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_predictions_zone_unique ON predictions(zone)"
        )
    finally:
        conn.row_factory = original_factory
