import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "nagarflow-next" / "public" / "mock-api"
sys.path.insert(0, str(ROOT))

from app import app, ensure_tables_exist

ENDPOINTS = {
    "agencies.json": "/api/agencies",
    "complaints.json": "/api/complaints",
    "dashboard.json": "/api/dashboard",
    "dispatch.json": "/api/dispatch",
    "maintenance-data.json": "/api/maintenance/data",
    "predictions.json": "/api/predictions",
    "reports.json": "/api/reports",
    "simulation-baseline.json": "/api/simulation/baseline",
    "weather-zones.json": "/api/weather/zones",
}


def main() -> None:
    ensure_tables_exist()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    client = app.test_client()

    for filename, route in ENDPOINTS.items():
        response = client.get(route)
        if response.status_code != 200:
            raise RuntimeError(f"{route} returned {response.status_code}")

        payload = response.get_json()
        output_path = OUTPUT_DIR / filename
        output_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=True),
            encoding="utf-8",
        )
        print(f"Wrote {output_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
