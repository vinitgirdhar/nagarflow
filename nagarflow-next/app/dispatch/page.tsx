'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, Truck, X } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';

type TruckRecord = {
  id: number;
  lat: number;
  lon: number;
  name: string;
  status: string;
};

type PredictionRecord = {
  action: string;
  lat: number;
  lon: number;
  priority_score: number;
  zone: string;
};

type SuggestionRecord = {
  action: string;
  distance_km: number;
  eta_mins: number;
  priority_score: number;
  reason: string;
  truck_id: number;
  truck_name: string;
  zone: string;
};

type DashboardPayload = {
  predictions: PredictionRecord[];
  trucks: TruckRecord[];
};

type LeafletMapLike = {
  remove: () => void;
  setView: (coords: [number, number], zoom: number) => LeafletMapLike;
};

type LeafletLayerGroupLike = {
  clearLayers: () => void;
  addTo: (target: LeafletMapLike) => LeafletLayerGroupLike;
};

type LeafletLike = {
  map: (element: HTMLDivElement, options: { zoomControl: boolean }) => LeafletMapLike;
  tileLayer: (
    url: string,
    options: { attribution: string; maxZoom: number },
  ) => { addTo: (target: LeafletMapLike) => void };
  layerGroup: () => LeafletLayerGroupLike;
  marker: (coords: [number, number], options: { icon: unknown }) => {
    addTo: (target: LeafletLayerGroupLike) => { bindPopup: (content: string) => void };
  };
  polyline: (
    coords: [number, number][],
    options: { color: string; weight: number; dashArray: string; opacity: number },
  ) => { addTo: (target: LeafletLayerGroupLike) => void };
  divIcon: (options: { className: string; html: string; iconSize: number[]; iconAnchor: number[] }) => unknown;
};

const BACKEND_URL = 'http://127.0.0.1:5000';

export default function DispatchPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMapLike | null>(null);
  const layerGroupRef = useRef<LeafletLayerGroupLike | null>(null);

  const [vehicles, setVehicles] = useState<TruckRecord[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [activeTruckId, setActiveTruckId] = useState<number | null>(null);
  const [dismissedSuggestionKeys, setDismissedSuggestionKeys] = useState<string[]>([]);

  const getSuggestionKey = (suggestion: SuggestionRecord) =>
    `${suggestion.truck_id}-${suggestion.zone}`;

  const getLeaflet = () => (window as Window & { L?: LeafletLike }).L;

  const redrawMap = useCallback((truckData: TruckRecord[], predictionData: PredictionRecord[]) => {
    const L = getLeaflet();
    if (!L || !mapRef.current || !mapInstanceRef.current || !layerGroupRef.current) {
      return;
    }

    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    const zoneIcon = L.divIcon({
      className: '',
      html: '<div style="width:24px;height:24px;border-radius:50%;background:rgba(193,68,14,.18);border:2px solid #C1440E;display:flex;align-items:center;justify-content:center;font-size:10px;color:#C1440E;font-weight:bold">!</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    predictionData.forEach((prediction) => {
      if (prediction.lat && prediction.lon) {
        L.marker([prediction.lat, prediction.lon], { icon: zoneIcon })
          .addTo(layerGroup)
          .bindPopup(`<b>${prediction.zone}</b><br>${prediction.action}<br>Priority: ${prediction.priority_score}`);
      }
    });

    truckData.forEach((truck) => {
      if (!truck.lat || !truck.lon) {
        return;
      }

      const isEnRoute = truck.status.startsWith('en_route_to_');
      const iconHtml = isEnRoute
        ? '<div style="font-size:20px;line-height:20px;text-shadow:0 0 12px rgba(122,140,94,0.9)">&#128666;</div>'
        : '<div style="font-size:18px;line-height:18px;text-shadow:0 2px 4px rgba(0,0,0,0.5)">&#128666;</div>';
      const truckIcon = L.divIcon({
        className: '',
        html: iconHtml,
        iconSize: isEnRoute ? [20, 20] : [18, 18],
        iconAnchor: isEnRoute ? [10, 10] : [9, 9],
      });

      L.marker([truck.lat, truck.lon], { icon: truckIcon })
        .addTo(layerGroup)
        .bindPopup(`<b>${truck.name}</b><br>Status: ${truck.status}`);

      if (isEnRoute) {
        const targetZone = truck.status.replace('en_route_to_', '');
        const targetPrediction = predictionData.find((prediction) => prediction.zone === targetZone);
        if (targetPrediction) {
          L.polyline(
            [
              [truck.lat, truck.lon],
              [targetPrediction.lat, targetPrediction.lon],
            ],
            {
              color: '#7A8C5E',
              weight: 4,
              dashArray: '8, 6',
              opacity: 0.85,
            },
          ).addTo(layerGroup);
        }
      }
    });
  }, []);

  const ensureMap = useCallback((truckData: TruckRecord[], predictionData: PredictionRecord[]) => {
    const L = getLeaflet();
    if (!L || !mapRef.current) {
      return;
    }

    if (!mapInstanceRef.current) {
      // Aggressive guard against Leaflet internal registry errors
      if ((mapRef.current as any)._leaflet_id) {
        return; 
      }
      
      try {
        mapInstanceRef.current = L.map(mapRef.current, { zoomControl: false }).setView([19.076, 72.8777], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OSM &copy; CARTO',
          maxZoom: 18,
        }).addTo(mapInstanceRef.current);
        layerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      } catch (e) {
        console.warn("NagarFlow Map Sync Error:", e);
        return;
      }
    }

    redrawMap(truckData, predictionData);
  }, [redrawMap]);

  const loadData = useCallback(async () => {
    try {
      const [dashboardResponse, dispatchResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/api/dashboard`),
        fetch(`${BACKEND_URL}/api/dispatch`),
      ]);

      if (!dashboardResponse.ok || !dispatchResponse.ok) {
        throw new Error('Dispatch feed unavailable');
      }

      const dashboardData = (await dashboardResponse.json()) as DashboardPayload;
      const dispatchData = (await dispatchResponse.json()) as SuggestionRecord[];

      const nextVehicles = dashboardData.trucks || [];
      const nextPredictions = dashboardData.predictions || [];
      const nextSuggestions = (dispatchData || []).filter(
        (suggestion) => !dismissedSuggestionKeys.includes(getSuggestionKey(suggestion)),
      );

      setVehicles(nextVehicles);
      setSuggestions(nextSuggestions);
      setErrorText('');

      const L = getLeaflet();
      if (L) {
        ensureMap(nextVehicles, nextPredictions);
      } else if (!document.querySelector('script[src*="leaflet@1.9.4"]')) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => ensureMap(nextVehicles, nextPredictions);
        document.head.appendChild(script);
      }
    } catch {
      setErrorText('Live dispatch data is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, [dismissedSuggestionKeys, ensureMap]);

  useEffect(() => {
    if (!document.querySelector('link[href*="leaflet@1.9.4"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    loadData();
    const intervalId = window.setInterval(loadData, 4000);

    return () => {
      window.clearInterval(intervalId);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, [loadData]);

  const handleAccept = async (suggestion: SuggestionRecord) => {
    setActiveTruckId(suggestion.truck_id);

    try {
      const response = await fetch(`${BACKEND_URL}/api/dispatch/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truck_id: suggestion.truck_id,
          zone: suggestion.zone,
        }),
      });

      if (!response.ok) {
        throw new Error('Dispatch accept failed');
      }

      setDismissedSuggestionKeys((current) => [...current, getSuggestionKey(suggestion)]);
      await loadData();
    } catch {
      setErrorText('The route could not be accepted. Please try again.');
    } finally {
      setActiveTruckId(null);
    }
  };

  const handleSkip = (suggestion: SuggestionRecord) => {
    setDismissedSuggestionKeys((current) => [...current, getSuggestionKey(suggestion)]);
    setSuggestions((current) =>
      current.filter((item) => getSuggestionKey(item) !== getSuggestionKey(suggestion)),
    );
  };

  const activeVehicles = vehicles.filter((vehicle) => vehicle.status !== 'idle').length;
  const enRouteVehicles = vehicles.filter((vehicle) => vehicle.status.startsWith('en_route_to_')).length;
  const avgEta = suggestions.length
    ? `${Math.round(suggestions.reduce((sum, suggestion) => sum + suggestion.eta_mins, 0) / suggestions.length)}m`
    : '0m';

  return (
    <DashboardShell
      title="Dispatch"
      badges={[
        { type: 'live', text: 'PPO Active' },
        { type: 'alert', text: `${suggestions.length} Pending` },
      ]}
    >
      <div className="page-header">
        <h1 className="page-header__title">Dispatch & Routing</h1>
        <p className="page-header__sub">Live dispatch suggestions with direct route acceptance and en-route truck tracking.</p>
      </div>

      <div className="stat-grid">
        <div className="card">
          <div className="card__label">Trucks Active</div>
          <div className="card__value">{activeVehicles}</div>
          <div className="card__sub">of {vehicles.length} fleet</div>
        </div>
        <div className="card">
          <div className="card__label">Routes Pending</div>
          <div className="card__value">{suggestions.length}</div>
          <div className="card__sub">live RL-generated suggestions</div>
        </div>
        <div className="card">
          <div className="card__label">En Route</div>
          <div className="card__value">{enRouteVehicles}</div>
          <div className="card__sub">accepted trucks moving now</div>
        </div>
        <div className="card">
          <div className="card__label">Avg Response</div>
          <div className="card__value">{avgEta}</div>
          <div className="card__sub">average ETA across pending routes</div>
        </div>
      </div>

      {errorText ? (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'rgba(193,68,14,0.25)' }}>
          <div className="card__title">Dispatch Status</div>
          <p className="card__sub" style={{ marginTop: '.5rem' }}>{errorText}</p>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>Live Fleet GPS Tracker</div>
          <div className="map-container map-container--lg" ref={mapRef}></div>
        </div>

        <div>
          <div className="card__title" style={{ marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={18} color="var(--primary)" /> AiRLLM Live Dispatcher Matcher
          </div>

          {!loading && suggestions.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--secondary)', border: '1px dashed var(--border-subtle)', borderRadius: '12px', fontSize: '13px', marginBottom: '1.5rem' }}>
              All high-priority zones are currently handled. Fleet is synchronized.
            </div>
          ) : null}

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--secondary)', border: '1px dashed var(--border-subtle)', borderRadius: '12px', fontSize: '13px', marginBottom: '1.5rem' }}>
              Loading live dispatch suggestions...
            </div>
          ) : null}

          {suggestions.map((suggestion, index) => {
            const suggestionKey = getSuggestionKey(suggestion);
            const acceptingThis = activeTruckId === suggestion.truck_id;

            return (
              <div key={suggestionKey} style={{ background: 'rgba(193,68,14,.06)', border: '1px solid rgba(193,68,14,.2)', borderRadius: '12px', padding: '1.25rem', marginBottom: '.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '15px', color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                    <Truck size={16} /> SG-{1403 + index}: {suggestion.truck_name} → {suggestion.zone}
                  </div>
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--glow)' }}>Priority: {suggestion.priority_score}</div>
                </div>

                <div className="mono" style={{ fontSize: '10px', color: 'var(--text-body)', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border-subtle)', borderRadius: '6px', marginBottom: '.75rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span><b style={{ color: 'var(--primary)' }}>TRACKER:</b> {acceptingThis ? 'LOCKING ROUTE' : 'IDLE'}</span>
                  <span><b style={{ color: 'var(--primary)' }}>ETA:</b> {suggestion.eta_mins}m</span>
                  <span><b style={{ color: 'var(--primary)' }}>DIST:</b> {suggestion.distance_km}km</span>
                </div>

                <div style={{ fontSize: '13px', color: 'var(--secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
                  <b>Context:</b> {suggestion.reason}
                </div>

                <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn--success btn--sm"
                    onClick={() => handleAccept(suggestion)}
                    disabled={acceptingThis}
                    style={{ opacity: acceptingThis ? 0.7 : 1 }}
                  >
                    <Check size={14} /> {acceptingThis ? 'Accepting...' : 'Accept Route'}
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
                    onClick={() => handleSkip(suggestion)}
                    disabled={acceptingThis}
                    style={{ opacity: acceptingThis ? 0.7 : 1 }}
                  >
                    <X size={14} /> Skip
                  </button>
                </div>
              </div>
            );
          })}

          <div className="card__title" style={{ margin: '1.5rem 0 .75rem' }}>Vehicles Stream</div>
          <div className="table-wrap" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th>ID</th>
                  <th>Truck</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => {
                  const isEnRoute = vehicle.status.startsWith('en_route_to_');
                  const badgeType = isEnRoute ? 'active' : vehicle.status === 'idle' ? 'info' : 'critical';

                  return (
                    <tr key={vehicle.id}>
                      <td><span className="mono" style={{ fontSize: '11px' }}>{vehicle.id}</span></td>
                      <td>{vehicle.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isEnRoute ? 'var(--accent)' : vehicle.status === 'idle' ? 'var(--secondary)' : 'var(--danger)' }}></div>
                          <span className={`badge badge--${badgeType}`} style={{ whiteSpace: 'nowrap' }}>
                            {vehicle.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
