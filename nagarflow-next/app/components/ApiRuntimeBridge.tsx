'use client';

import { useLayoutEffect } from 'react';

type DashboardPayload = {
  predictions: Array<Record<string, unknown>>;
  trucks: Array<Record<string, unknown>>;
};

type MaintenancePayload = {
  stats: {
    total_teams: number;
    active: number;
    idle: number;
    pending: number;
  };
  tasks: Array<Record<string, unknown>>;
  teams: Array<Record<string, unknown>>;
};

type ComplaintsPayload = {
  complaints: Array<Record<string, unknown>>;
  stats: {
    total_complaints: number;
    high_priority_count: number;
    voice_report_count: number;
    text_report_count: number;
    latest_timestamp: string | null;
  };
  success: boolean;
};

type DemoState = {
  agencies: Record<string, unknown>;
  complaints: ComplaintsPayload;
  dashboard: DashboardPayload;
  dispatch: Array<Record<string, unknown>>;
  maintenance: MaintenancePayload;
  predictions: Array<Record<string, unknown>>;
  reports: Record<string, unknown>;
  simulationBaseline: Array<Record<string, unknown>>;
  weatherZones: Array<Record<string, unknown>>;
};

type ParsedRequest = {
  method: string;
  pathname: string;
  body: unknown;
};

const LOCAL_API_ORIGINS = new Set(['http://127.0.0.1:5000', 'http://localhost:5000']);
const SNAPSHOT_PATHS = {
  agencies: '/mock-api/agencies.json',
  complaints: '/mock-api/complaints.json',
  dashboard: '/mock-api/dashboard.json',
  dispatch: '/mock-api/dispatch.json',
  maintenance: '/mock-api/maintenance-data.json',
  predictions: '/mock-api/predictions.json',
  reports: '/mock-api/reports.json',
  simulationBaseline: '/mock-api/simulation-baseline.json',
  weatherZones: '/mock-api/weather-zones.json',
} as const;

let patchedFetch: typeof window.fetch | null = null;
let snapshotCache: Partial<Record<keyof typeof SNAPSHOT_PATHS, unknown>> = {};
let demoStatePromise: Promise<DemoState> | null = null;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function shouldUseDemoSnapshots() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  return !isLocal && !process.env.NEXT_PUBLIC_BACKEND_URL;
}

async function loadSnapshot<T, K extends keyof typeof SNAPSHOT_PATHS>(
  key: K,
  originalFetch: typeof window.fetch,
): Promise<T> {
  if (!snapshotCache[key]) {
    const response = await originalFetch(SNAPSHOT_PATHS[key], { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Snapshot ${key} unavailable`);
    }
    snapshotCache[key] = await response.json();
  }

  return cloneJson(snapshotCache[key] as T);
}

async function buildDemoState(originalFetch: typeof window.fetch): Promise<DemoState> {
  return {
    agencies: await loadSnapshot<Record<string, unknown>, 'agencies'>('agencies', originalFetch),
    complaints: await loadSnapshot<ComplaintsPayload, 'complaints'>('complaints', originalFetch),
    dashboard: await loadSnapshot<DashboardPayload, 'dashboard'>('dashboard', originalFetch),
    dispatch: await loadSnapshot<Array<Record<string, unknown>>, 'dispatch'>('dispatch', originalFetch),
    maintenance: await loadSnapshot<MaintenancePayload, 'maintenance'>('maintenance', originalFetch),
    predictions: await loadSnapshot<Array<Record<string, unknown>>, 'predictions'>('predictions', originalFetch),
    reports: await loadSnapshot<Record<string, unknown>, 'reports'>('reports', originalFetch),
    simulationBaseline: await loadSnapshot<Array<Record<string, unknown>>, 'simulationBaseline'>('simulationBaseline', originalFetch),
    weatherZones: await loadSnapshot<Array<Record<string, unknown>>, 'weatherZones'>('weatherZones', originalFetch),
  };
}

async function ensureDemoState(originalFetch: typeof window.fetch) {
  if (!demoStatePromise) {
    demoStatePromise = buildDemoState(originalFetch);
  }

  return demoStatePromise;
}

function getIssueCategory(issueType: string) {
  const normalized = issueType.toLowerCase();
  if (normalized.includes('garbage')) return 'waste';
  if (normalized.includes('water')) return 'water';
  if (normalized.includes('drain')) return 'drainage';
  if (normalized.includes('road') || normalized.includes('pothole')) return 'road';
  return 'general';
}

function getIssueTypeFromText(text: string) {
  const normalized = text.toLowerCase();
  if (/(garbage|trash|waste|dump|smell)/.test(normalized)) return 'Garbage';
  if (/(water supply|no water|pipe|leak|water tanker|water issue)/.test(normalized)) return 'Water';
  if (/(drain|drainage|overflow|waterlogging|flood)/.test(normalized)) return 'Drainage';
  if (/(pothole|road|street|collapse|skidding)/.test(normalized)) return 'Roads';
  return 'General';
}

function getSeverityFromText(text: string) {
  const normalized = text.toLowerCase();
  if (/(urgent|emergency|major|huge|critical|overflowing|flood|collapsed)/.test(normalized)) {
    return 'High';
  }
  if (/(bad|smell|problem|issue|complaint)/.test(normalized)) {
    return 'Medium';
  }
  return 'Low';
}

function getKnownZones(state: DemoState) {
  const zones = new Set<string>();
  state.dashboard.predictions.forEach((prediction) => {
    const zone = String((prediction.zone ?? prediction.name ?? '') || '').trim();
    if (zone) zones.add(zone);
  });
  state.simulationBaseline.forEach((entry) => {
    const zone = String((entry.zone ?? '') || '').trim();
    if (zone) zones.add(zone);
  });
  return Array.from(zones);
}

function getZoneFromText(text: string, state: DemoState) {
  const normalized = text.toLowerCase();
  const knownZones = getKnownZones(state);
  const matched = knownZones.find((zone) => normalized.includes(zone.toLowerCase()));
  return matched || 'Unknown';
}

function getTimestampString() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function appendComplaint(
  state: DemoState,
  source: 'voice_call' | 'text_chat',
  zone: string,
  issueType: string,
  severity: string,
  text: string,
) {
  const prefix = source === 'voice_call' ? 'VOICE' : 'TEXT';
  const nextIndex = state.complaints.complaints.length + 1;
  const timestamp = getTimestampString();
  const category = getIssueCategory(issueType);
  const urgency = severity.toLowerCase() === 'high' ? 'high' : severity.toLowerCase() === 'low' ? 'low' : 'medium';

  state.complaints.complaints.unshift({
    id: `${prefix}-${String(nextIndex).padStart(4, '0')}`,
    text,
    urgency,
    category,
    emotion: 'distressed',
    ward: zone,
    time: timestamp,
    source,
    issue_type: issueType,
    severity,
    complaint_count: 1,
  });

  state.complaints.stats.total_complaints += 1;
  if (urgency === 'high') {
    state.complaints.stats.high_priority_count += 1;
  }
  if (source === 'voice_call') {
    state.complaints.stats.voice_report_count += 1;
  } else {
    state.complaints.stats.text_report_count += 1;
  }
  state.complaints.stats.latest_timestamp = timestamp;
}

function extractComplaintFromText(text: string, state: DemoState) {
  const zone = getZoneFromText(text, state);
  const issue_type = getIssueTypeFromText(text);
  const severity = getSeverityFromText(text);
  const complaintLogged = zone !== 'Unknown' && issue_type !== 'General';

  return {
    complaintLogged,
    extracted: {
      zone,
      issue_type,
      severity,
    },
  };
}

function recalculateMaintenanceStats(maintenance: MaintenancePayload) {
  const active = maintenance.teams.filter((team) => String(team.status) === 'On Field').length;
  const idle = maintenance.teams.filter((team) => String(team.status) === 'Idle').length;
  const pending = maintenance.tasks.filter((task) => String(task.status) === 'PENDING').length;

  maintenance.stats = {
    total_teams: maintenance.teams.length,
    active,
    idle,
    pending,
  };
}

function getZoneMultiplier(zoneFilter: string, zone: string) {
  if (zoneFilter === 'all') return 1;

  const regionMap: Record<string, string[]> = {
    north: ['Andheri', 'Bandra', 'Bhayander', 'Borivali', 'Dahisar', 'Juhu', 'Kandivali', 'Malad', 'Mira Road', 'Powai'],
    central: ['Chembur', 'Dadar', 'Dharavi', 'Ghatkopar', 'Kurla', 'Mahim', 'Matunga', 'Sion'],
    south: ['Byculla', 'Colaba', 'Fort', 'Marine Lines', 'Worli'],
    navi: ['Airoli', 'Belapur', 'Kopar Khairane', 'Nerul', 'Panvel', 'Seawoods', 'Vashi'],
  };

  return regionMap[zoneFilter]?.some((token) => zone.toLowerCase().includes(token.toLowerCase())) ? 1.2 : 0.92;
}

function buildSimulationResponse(state: DemoState, payload: Record<string, unknown>) {
  const demand = Number(payload.demand ?? 0);
  const failures = Number(payload.failures ?? 0);
  const weather = Number(payload.weather ?? 0);
  const duration = Number(payload.duration ?? 24);
  const zoneFilter = String(payload.zone_filter ?? 'all');

  const before = cloneJson(state.simulationBaseline);
  const after = before.map((entry) => {
    const zone = String(entry.zone ?? '');
    const baseline = Number(entry.priority_score ?? 0);
    const zoneMultiplier = getZoneMultiplier(zoneFilter, zone);
    const stressScore =
      baseline * zoneMultiplier +
      demand * 0.55 +
      failures * 0.8 +
      weather * 7 +
      Math.max(0, duration - 24) * 0.18;

    return {
      ...entry,
      priority_score: Math.max(12, Math.min(100, Math.round(stressScore))),
    };
  });

  const overloaded = after.filter((entry) => Number(entry.priority_score ?? 0) >= 80).length;
  const coverage = Math.max(18, Math.min(98, Number((87 - demand * 0.24 - failures * 0.7 - weather * 3.8 - Math.max(0, duration - 24) * 0.12).toFixed(1))));
  const responseTime = Math.max(8, Math.round(18 + demand * 0.16 + failures * 0.33 + weather * 2.4 + duration / 16));
  const missed = Math.max(0.5, Math.min(92, Number((2.1 + demand * 0.06 + failures * 0.19 + weather * 1.6).toFixed(1))));

  return {
    before,
    after,
    stats: {
      coverage,
      response_time: responseTime,
      overloaded,
      missed,
    },
  };
}

function parseRequest(input: RequestInfo | URL, init?: RequestInit): ParsedRequest | null {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : String(input);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl, window.location.origin);
  } catch {
    return null;
  }

  const isLocalApi =
    LOCAL_API_ORIGINS.has(parsedUrl.origin) &&
    parsedUrl.pathname.startsWith('/api/');

  if (!isLocalApi) {
    return null;
  }

  const method =
    (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();

  let body: unknown = null;
  if (typeof init?.body === 'string') {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }

  return {
    method,
    pathname: parsedUrl.pathname,
    body,
  };
}

async function handleDemoRequest(
  request: ParsedRequest,
  originalFetch: typeof window.fetch,
) {
  const state = await ensureDemoState(originalFetch);

  if (request.method === 'GET') {
    switch (request.pathname) {
      case '/api/agencies':
        return jsonResponse(state.agencies);
      case '/api/complaints':
        return jsonResponse(state.complaints);
      case '/api/dashboard':
        return jsonResponse(state.dashboard);
      case '/api/dispatch':
        return jsonResponse(state.dispatch);
      case '/api/maintenance/data':
        return jsonResponse(state.maintenance);
      case '/api/predictions':
        return jsonResponse(state.predictions);
      case '/api/reports':
        return jsonResponse(state.reports);
      case '/api/simulation/baseline':
        return jsonResponse(state.simulationBaseline);
      case '/api/weather/zones':
        return jsonResponse(state.weatherZones);
      case '/api/agent/greet':
        return jsonResponse({
          success: true,
          reply_text:
            'Namaste, NagarFlow mein aapka swagat hai. Area aur issue batayiye, main complaint register kar deta hoon.',
          complaint_logged: false,
          call_ended: false,
          voice_mode: 'browser',
        });
      default:
        return jsonResponse({ error: 'Demo route not found.' }, 404);
    }
  }

  switch (request.pathname) {
    case '/api/dispatch/accept': {
      const payload = (request.body || {}) as { truck_id?: number; zone?: string };
      const truckId = Number(payload.truck_id);
      const zone = String(payload.zone || '');
      state.dispatch = state.dispatch.filter(
        (suggestion) =>
          Number(suggestion.truck_id) !== truckId || String(suggestion.zone) !== zone,
      );
      const targetTruck = state.dashboard.trucks.find((truck) => Number(truck.id) === truckId);
      if (targetTruck) {
        targetTruck.status = `en_route_to_${zone}`;
      }
      return jsonResponse({ success: true, mode: 'demo' });
    }
    case '/api/dispatch/arrive': {
      const payload = (request.body || {}) as { truck_id?: number };
      const truckId = Number(payload.truck_id);
      const targetTruck = state.dashboard.trucks.find((truck) => Number(truck.id) === truckId);
      if (targetTruck) {
        targetTruck.status = 'idle';
      }
      return jsonResponse({ success: true, mode: 'demo' });
    }
    case '/api/simulate-surge': {
      state.dashboard.predictions = state.dashboard.predictions.map((prediction, index) => ({
        ...prediction,
        priority_score: Math.min(100, Number(prediction.priority_score ?? 50) + (index < 4 ? 18 : 6)),
      }));
      return jsonResponse({ success: true, mode: 'demo' });
    }
    case '/api/maintenance/assign': {
      const payload = (request.body || {}) as { task_id?: string; team_id?: string };
      const taskId = String(payload.task_id || '');
      const teamId = String(payload.team_id || '');
      const task = state.maintenance.tasks.find((entry) => String(entry.id) === taskId);
      const team = state.maintenance.teams.find((entry) => String(entry.id) === teamId);
      if (task && team) {
        task.assigned_team_id = teamId;
        task.status = 'ON GROUND';
        team.status = 'On Field';
        team.current_zone = String(task.zone || '');
        recalculateMaintenanceStats(state.maintenance);
      }
      return jsonResponse({ success: true, mode: 'demo' });
    }
    case '/api/maintenance/complete': {
      const payload = (request.body || {}) as { task_id?: string };
      const taskId = String(payload.task_id || '');
      const task = state.maintenance.tasks.find((entry) => String(entry.id) === taskId);
      if (task) {
        task.status = 'COMPLETED';
        task.completed_time = new Date().toISOString();
        const assignedTeam = state.maintenance.teams.find(
          (entry) => String(entry.id) === String(task.assigned_team_id || ''),
        );
        if (assignedTeam) {
          assignedTeam.status = 'Idle';
          assignedTeam.current_zone = null;
        }
        recalculateMaintenanceStats(state.maintenance);
      }
      return jsonResponse({ success: true, mode: 'demo' });
    }
    case '/api/simulation/run':
      return jsonResponse(buildSimulationResponse(state, (request.body || {}) as Record<string, unknown>));
    case '/api/agent/respond-chat':
    case '/api/agent/respond-text': {
      const payload = (request.body || {}) as { message?: string; transcript?: string };
      const rawText = String(payload.message || payload.transcript || '').trim();
      const parsed = extractComplaintFromText(rawText, state);

      if (parsed.complaintLogged) {
        appendComplaint(
          state,
          request.pathname === '/api/agent/respond-text' ? 'voice_call' : 'text_chat',
          parsed.extracted.zone,
          parsed.extracted.issue_type,
          parsed.extracted.severity,
          rawText,
        );
      }

      const replyText = parsed.complaintLogged
        ? `Complaint registered for ${parsed.extracted.zone}. I have marked it as ${parsed.extracted.issue_type} with ${parsed.extracted.severity.toLowerCase()} severity.`
        : 'Please share the exact area and issue so I can register the complaint properly.';

      return jsonResponse({
        success: true,
        complaint_logged: parsed.complaintLogged,
        extracted: parsed.extracted,
        reply_text: replyText,
        call_ended: false,
        voice_mode: 'browser',
      });
    }
    case '/api/agent/respond':
      return jsonResponse(
        {
          success: false,
          error: 'Voice upload is unavailable in the static demo. Use browser voice mode instead.',
        },
        400,
      );
    default:
      return jsonResponse({ success: true, mode: 'demo' });
  }
}

export default function ApiRuntimeBridge() {
  useLayoutEffect(() => {
    if (!shouldUseDemoSnapshots() || patchedFetch) {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    patchedFetch = originalFetch;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const parsedRequest = parseRequest(input, init);
      if (!parsedRequest) {
        return originalFetch(input, init);
      }

      try {
        return await handleDemoRequest(parsedRequest, originalFetch);
      } catch (error) {
        console.error('Demo API bridge failed:', error);
        return originalFetch(input, init);
      }
    };

    return () => {
      if (patchedFetch) {
        window.fetch = patchedFetch;
        patchedFetch = null;
      }
    };
  }, []);

  return null;
}
