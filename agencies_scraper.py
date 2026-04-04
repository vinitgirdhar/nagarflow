import datetime as dt
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import requests
from bs4 import BeautifulSoup

REQUEST_TIMEOUT_SECONDS = 12
CACHE_TTL_SECONDS = 60 * 60 * 6

_CACHE_LOCK = threading.Lock()
_CACHE: dict[str, Any] = {
    "expires_at": None,
    "payload": None,
}


OFFICIAL_AGENCY_SEEDS = [
    {
        "id": "bmc-swm",
        "city": "Mumbai",
        "municipal_body": "BMC",
        "agency_name": "Solid Waste Management Department",
        "category": "Garbage Pickup",
        "services": [
            "Garbage lifting and transport",
            "Bulk waste coordination",
            "Transfer stations and processing escalation",
        ],
        "source_url": "https://portal.mcgm.gov.in/irj/portal/anonymous/qlcleancontactdetails?guest_user=english",
        "source_label": "BMC SWM contact page",
        "dashboard_url": "https://mcgm.gov.in/",
        "description": "Primary municipal waste collection and solid-waste operations contact point for Mumbai.",
        "contact": {
            "phone": "022-24962125",
            "email": "mcgm.swmproject@gmail.com",
            "helpline": "1916",
        },
    },
    {
        "id": "bmc-water",
        "city": "Mumbai",
        "municipal_body": "BMC",
        "agency_name": "Hydraulic Engineer / Water Supply",
        "category": "Water Supply",
        "services": [
            "Water network supply",
            "Water tanker escalation",
            "Hydraulic operations and outages",
        ],
        "source_url": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/HomePage%20Data/Contact%20us/02091530_PublicationPRODepartment2015_E.pdf",
        "source_label": "BMC department contact directory",
        "dashboard_url": "https://mcgm.gov.in/",
        "description": "BMC water-supply operations and hydraulic engineering contacts used for supply and tanker escalations.",
        "contact": {
            "phone": "24955294",
            "email": "hemcgm1@gmail.com",
            "helpline": "1916",
        },
    },
    {
        "id": "bmc-sewerage",
        "city": "Mumbai",
        "municipal_body": "BMC",
        "agency_name": "Sewerage Operations",
        "category": "Drainage & Sewerage",
        "services": [
            "Sewerage operations",
            "Overflow and blockage response",
            "Sewerage planning and construction escalation",
        ],
        "source_url": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/HomePage%20Data/Contact%20us/02091530_PublicationPRODepartment2015_E.pdf",
        "source_label": "BMC department contact directory",
        "dashboard_url": "https://mcgm.gov.in/",
        "description": "Operational agency for sewerage complaints, overflow response, and sewerage network planning.",
        "contact": {
            "phone": "24911819",
            "email": "che.so@mcgm.gov.in",
            "helpline": "1916",
        },
    },
    {
        "id": "bmc-stormwater",
        "city": "Mumbai",
        "municipal_body": "BMC",
        "agency_name": "Storm Water Drains Department",
        "category": "Flooding & Drains",
        "services": [
            "Storm-water drain maintenance",
            "Desilting escalation",
            "Monsoon flood-response coordination",
        ],
        "source_url": "https://portal.mcgm.gov.in/irj/portal/anonymous/qlwrdfs",
        "source_label": "BMC storm-water page",
        "dashboard_url": "https://mcgm.gov.in/",
        "description": "BMC monsoon and storm-water department for desilting and flooding-related civic operations.",
        "contact": {
            "phone": "1916",
            "email": "",
            "helpline": "1916",
        },
    },
    {
        "id": "nmmc-swm",
        "city": "Navi Mumbai",
        "municipal_body": "NMMC",
        "agency_name": "Solid Waste Management",
        "category": "Garbage Pickup",
        "services": [
            "Ward-level waste collection",
            "Transport and disposal coordination",
            "Solid-waste service information",
        ],
        "source_url": "https://www.nmmc.gov.in/solid-waste-manegement",
        "source_label": "NMMC solid waste page",
        "dashboard_url": "https://app.nmmconline.in/module-details-dashboard?moduleName=solidWasteManagement",
        "description": "Official Navi Mumbai solid-waste service page and operations dashboard reference.",
        "contact": {
            "phone": "1800 222 309",
            "email": "",
            "helpline": "1800 222 310",
        },
    },
    {
        "id": "nmmc-water",
        "city": "Navi Mumbai",
        "municipal_body": "NMMC",
        "agency_name": "Water Supply Department",
        "category": "Water Supply",
        "services": [
            "Water distribution information",
            "Supply complaint escalation",
            "Water-bill and service navigation",
        ],
        "source_url": "https://www.nmmc.gov.in/navimumbai/water-supply-department",
        "source_label": "NMMC water supply page",
        "dashboard_url": "https://app.nmmconline.in/water-tax/WaterTaxDashboardNewComponent",
        "description": "Official Navi Mumbai water-supply service directory and related service dashboard.",
        "contact": {
            "phone": "1800 222 309",
            "email": "",
            "helpline": "1800 222 310",
        },
    },
    {
        "id": "nmmc-sewerage",
        "city": "Navi Mumbai",
        "municipal_body": "NMMC",
        "agency_name": "Sewerage Services",
        "category": "Drainage & Sewerage",
        "services": [
            "Sewerage service information",
            "Drain and blockage complaints",
            "Network maintenance coordination",
        ],
        "source_url": "https://www.nmmc.gov.in/sewerage-services",
        "source_label": "NMMC sewerage services page",
        "dashboard_url": "https://app.nmmconline.in/grievance-management",
        "description": "Official Navi Mumbai sewerage-services page for underground drainage and complaint routing.",
        "contact": {
            "phone": "1800 222 309",
            "email": "",
            "helpline": "1800 222 310",
        },
    },
    {
        "id": "nmmc-engineering",
        "city": "Navi Mumbai",
        "municipal_body": "NMMC",
        "agency_name": "City Engineering Department",
        "category": "Roads & Engineering",
        "services": [
            "Road and civil works",
            "City engineering projects",
            "Works-management dashboards",
        ],
        "source_url": "https://www.nmmc.gov.in/city-engineering-department",
        "source_label": "NMMC city engineering page",
        "dashboard_url": "https://app.nmmconline.in/module-details-dashboard?moduleName=Works-Management",
        "description": "Official Navi Mumbai engineering department for roads, civil works, and municipal infrastructure projects.",
        "contact": {
            "phone": "1800 222 309",
            "email": "",
            "helpline": "1800 222 310",
        },
    },
    {
        "id": "nmmc-departments",
        "city": "Navi Mumbai",
        "municipal_body": "NMMC",
        "agency_name": "Central Departments Directory",
        "category": "Citizen Services",
        "services": [
            "Department directory",
            "Citizen service navigation",
            "Cross-department grievance routing",
        ],
        "source_url": "https://www.nmmc.gov.in/departments",
        "source_label": "NMMC departments index",
        "dashboard_url": "https://app.nmmconline.in/grievance-management",
        "description": "Official directory entry point for Navi Mumbai municipal departments and citizen services.",
        "contact": {
            "phone": "1800 222 309",
            "email": "",
            "helpline": "1800 222 310",
        },
    },
]


def _fetch_page_metadata(url: str) -> dict[str, Any]:
    try:
        response = requests.get(
            url,
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        # Skip parsing if it's a PDF or too large
        content_type = response.headers.get("Content-Type", "").lower()
        if "pdf" in content_type or len(response.content) > 5 * 1024 * 1024:
            return {
                "status_code": response.status_code,
                "ok": response.ok,
                "title": url.split("/")[-1],
                "description": "Binary or large document source.",
                "text": "",
            }

        soup = BeautifulSoup(response.text, "html.parser")
        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()

        description = ""
        description_tag = soup.find("meta", attrs={"name": "description"})
        if description_tag and description_tag.get("content"):
            description = str(description_tag["content"]).strip()

        text = soup.get_text("\n", strip=True)

        return {
            "status_code": response.status_code,
            "ok": response.ok,
            "title": title,
            "description": description,
            "text": text,
        }
    except Exception as e:
        return {
            "status_code": 0,
            "ok": False,
            "title": "Error",
            "description": str(e),
            "text": "",
        }


def _extract_bmc_swm_contact(text: str) -> dict[str, str]:
    compact = re.sub(r"\s+", " ", text)
    phone_match = re.search(r"Phone No\.?\s*0?22\s*[–-]?\s*(\d{8})", compact, re.IGNORECASE)
    email_match = re.search(r"E mail\s*[–-]?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})", compact, re.IGNORECASE)

    return {
        "phone": f"022-{phone_match.group(1)}" if phone_match else "022-24962125",
        "email": email_match.group(1) if email_match else "mcgm.swmproject@gmail.com",
        "helpline": "1916",
    }


def _enrich_seed(seed: dict[str, Any]) -> dict[str, Any]:
    record = {
        **seed,
        "source_status": "offline",
        "source_status_code": None,
        "source_title": "",
        "source_description": "",
        "last_checked": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }

    try:
        metadata = _fetch_page_metadata(seed["source_url"])
        if metadata["ok"]:
            record["source_status"] = "online"
            record["source_status_code"] = metadata["status_code"]
            record["source_title"] = metadata["title"] or seed["source_label"]
            record["source_description"] = metadata["description"] or seed["description"]
            
            if seed["id"] == "bmc-swm" and metadata["text"]:
                record["contact"] = _extract_bmc_swm_contact(metadata["text"])
        else:
            record["source_status"] = "degraded"
            record["source_status_code"] = metadata["status_code"]
            record["source_title"] = seed["source_label"]
            record["source_description"] = metadata["description"] or seed["description"]

    except Exception:
        record["source_status"] = "offline"
        record["source_title"] = seed["source_label"]
        record["source_description"] = seed["description"]

    return record


def _build_payload() -> dict[str, Any]:
    agencies: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=6) as executor:
        future_map = {
            executor.submit(_enrich_seed, seed): seed["id"]
            for seed in OFFICIAL_AGENCY_SEEDS
        }
        for future in as_completed(future_map):
            try:
                res = future.result()
                if res:
                    agencies.append(res)
            except Exception as e:
                print(f"⚠️  Scraper Thread Error for {future_map[future]}: {e}")

    agencies.sort(key=lambda agency: (agency["city"], agency["category"], agency["agency_name"]))

    stats = {
        "agency_count": len(agencies),
        "city_count": len({agency["city"] for agency in agencies}),
        "category_count": len({agency["category"] for agency in agencies}),
        "online_sources": sum(1 for agency in agencies if agency["source_status"] == "online"),
    }

    return {
        "generated_at": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "stats": stats,
        "agencies": agencies,
    }


def get_agency_registry(force_refresh: bool = False) -> dict[str, Any]:
    now = dt.datetime.utcnow()

    with _CACHE_LOCK:
        if (
            not force_refresh
            and _CACHE["payload"] is not None
            and _CACHE["expires_at"] is not None
            and now < _CACHE["expires_at"]
        ):
            return _CACHE["payload"]

    payload = _build_payload()

    with _CACHE_LOCK:
        _CACHE["payload"] = payload
        _CACHE["expires_at"] = now + dt.timedelta(seconds=CACHE_TTL_SECONDS)

    return payload
