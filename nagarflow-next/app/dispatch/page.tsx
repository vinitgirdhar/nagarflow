'use client';
import { apiFetch } from '../lib/api';
import { htmlText } from '../lib/html';
import { OPENSTREETMAP_TILE_URL, OPENSTREETMAP_OPTIONS } from '../lib/map-tiles';
import { acceptDispatch } from '../lib/dispatch';
import ActiveDispatches from '../components/ActiveDispatches';
import FleetRegistration from '../components/FleetRegistration';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, Truck, X, MapPin, Activity } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import DashboardShell from '../components/DashboardShell';
import layout from '../components/operational-layout.module.css';

const STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } }
};

type TruckRecord = {
  id: number;
  lat: number;
  lon: number;
  name: string;
  status: string;
  truck_type: string;
  truck_type_label: string;
};

type PredictionRecord = {
  action: string;
  lat: number;
  lon: number;
  priority_score: number;
  reason: string;
  zone: string;
};

type SuggestionRecord = {
  prediction_id: number;
  prediction_version: string;
  action: string;
  distance_km: number;
  eta_mins: number;
  preferred_truck_type: string;
  preferred_truck_type_label: string;
  priority_score: number;
  reason: string;
  truck_id: number;
  truck_name: string;
  truck_type: string;
  truck_type_label: string;
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
  circleMarker: (coords: [number, number], options: any) => {
    addTo: (target: LeafletLayerGroupLike) => { bindPopup: (content: string) => void };
  };
  divIcon: (options: { className: string; html: string; iconSize: number[]; iconAnchor: number[] }) => unknown;
};

const BACKEND_URL = '';

function getTruckTypeBadgeStyle(truckType: string) {
  if (truckType === 'water') {
    return {
      background: 'rgba(25,118,210,0.12)',
      border: '1px solid rgba(25,118,210,0.25)',
      color: '#1f5fae',
    };
  }

  return {
    background: 'rgba(193,68,14,0.10)',
    border: '1px solid rgba(193,68,14,0.18)',
    color: 'var(--primary)',
  };
}

export default function DispatchPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMapLike | null>(null);
  const layerGroupRef = useRef<LeafletLayerGroupLike | null>(null);

  const [vehicles, setVehicles] = useState<TruckRecord[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapUnavailable,setMapUnavailable]=useState(false);
  const [mutationError, setMutationError] = useState('');
  const [errorText, setErrorText] = useState('');
  const [activeTruckId, setActiveTruckId] = useState<number | null>(null);
  const [dismissedSuggestionKeys, setDismissedSuggestionKeys] = useState<string[]>([]);
  const [hotspots, setHotspots] = useState<any[]>([]);

  const getSuggestionKey = (suggestion: SuggestionRecord) =>
    `${suggestion.truck_id}-${suggestion.prediction_version}`;

  const getLeaflet = () => (window as Window & { L?: LeafletLike }).L;

  const redrawMap = useCallback((truckData: TruckRecord[], predictionData: PredictionRecord[]) => {
    const L = getLeaflet();
    if (!L || !mapRef.current || !mapInstanceRef.current || !layerGroupRef.current) {
      return;
    }

    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    // Locality Hotspots
    hotspots.forEach(h => {
      const radius = 5 + Math.min(15, h.count / 2000.0);
      L.circleMarker([h.lat, h.lon], {
        radius: radius,
        fillColor: '#C1440E',
        fillOpacity: 0.2,
        color: '#C1440E',
        weight: 1,
        opacity: 0.4
      }).addTo(layerGroup).bindPopup(`<b>Locality Hotspot</b><br>${htmlText(h.locality)}<br>Complaints: ${htmlText(h.count)}`);
    });

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
          .bindPopup(`<b>${htmlText(prediction.zone)}</b><br>${htmlText(prediction.action)}<br>Priority: ${htmlText(prediction.priority_score)}<br><small>${htmlText(prediction.reason || '')}</small>`);
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
        .bindPopup(`<b>${htmlText(truck.name)}</b><br>Type: ${htmlText(truck.truck_type_label)}<br>Status: ${htmlText(truck.status)}`);

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
        setMapUnavailable(false);
        mapInstanceRef.current = L.map(mapRef.current, { zoomControl: false }).setView([19.076, 72.8777], 12);
        L.tileLayer(OPENSTREETMAP_TILE_URL, OPENSTREETMAP_OPTIONS).addTo(mapInstanceRef.current);
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
        apiFetch(`${BACKEND_URL}/api/dashboard`),
        apiFetch(`${BACKEND_URL}/api/dispatch`),
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
        script.onerror = () => setMapUnavailable(true);
        document.head.appendChild(script);
      }

      // Fetch Hotspots separately
      const hotspotsRes = await apiFetch(`${BACKEND_URL}/api/hotspots`);
      if (hotspotsRes.ok) {
        setHotspots(await hotspotsRes.json());
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
    window.addEventListener('nagarflow-dispatch-changed', loadData);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('nagarflow-dispatch-changed', loadData);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, [loadData]);

  const handleAccept = async (suggestion: SuggestionRecord) => {
    setActiveTruckId(suggestion.truck_id);
    setMutationError('');

    try {
      await acceptDispatch(suggestion);

      await loadData();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'The route could not be accepted. Please retry.');
    } finally {
      setActiveTruckId(null);
    }
  };

  const handleSkip = (suggestion: SuggestionRecord) => {
    setDismissedSuggestionKeys((current: string[]) => [...current, getSuggestionKey(suggestion)]);
    setSuggestions((current: SuggestionRecord[]) =>
      current.filter((item: SuggestionRecord) => getSuggestionKey(item) !== getSuggestionKey(suggestion)),
    );
  };

  const activeVehicles = vehicles.filter((vehicle: TruckRecord) => vehicle.status !== 'idle').length;
  const enRouteVehicles = vehicles.filter((vehicle: TruckRecord) => vehicle.status.startsWith('en_route_to_')).length;
  const avgEta = suggestions.length
    ? `${Math.round(suggestions.reduce((sum: number, suggestion: SuggestionRecord) => sum + suggestion.eta_mins, 0) / suggestions.length)}m`
    : '0m';

  return (
    <DashboardShell
      title="Dispatch"
      badges={[
        { type: 'live', text: 'Fleet operations' },
        { type: 'alert', text: `${suggestions.length} Pending` },
      ]}
    >
      <div className="page-header">
        <h1 className="page-header__title">Vehicle dispatch</h1>
        <p className="page-header__sub">Assign a vehicle, confirm arrival and track each trip.</p>
      </div>

      {mutationError && <p role="alert">{mutationError}</p>}
      <FleetRegistration />
      <ActiveDispatches />
      <div className={`stat-grid ${layout.compactStats}`}>
        <div className="card">
          <div className="card__label">Vehicles on duty</div>
          <div className="card__value">{activeVehicles}</div>
          <div className="card__sub">of {vehicles.length} registered</div>
        </div>
        <div className="card">
          <div className="card__label">Suggested assignments</div>
          <div className="card__value">{suggestions.length}</div>
          <div className="card__sub">Waiting for your review</div>
        </div>
        <div className="card">
          <div className="card__label">En Route</div>
          <div className="card__value">{enRouteVehicles}</div>
          <div className="card__sub">Arrival not yet confirmed</div>
        </div>
        <div className="card">
          <div className="card__label">Est. travel time</div>
          <div className="card__value">{avgEta}</div>
          <div className="card__sub">Average for suggested trips</div>
        </div>
      </div>

      {errorText ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card" style={{ marginBottom: '1.5rem', borderColor: 'var(--danger)' }}>
          <div className="card__title" style={{ color: 'var(--danger)' }}>Could not load dispatch data</div>
          <p className="card__sub" style={{ marginTop: '.5rem' }}>{errorText}</p>
        </motion.div>
      ) : null}

      <motion.div 
        variants={STAGGER_CONTAINER} 
        initial="hidden" 
        animate="show" 
        className={layout.dispatchColumns}
      >
        {/* Left Column: Primary Operations */}
        <motion.div variants={FADE_UP} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <div className="card card--glass" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <MapPin size={18} color="var(--primary)" />
              <div className="card__title">Vehicle map</div>
              <div className="badge badge--low" style={{ marginLeft: 'auto' }}>Stored positions</div>
            </div>
            {mapUnavailable && <p role="status">Map unavailable. You can still assign vehicles below.</p>}
            <div className="map-container map-container--lg" ref={mapRef} style={{ height: '500px', border: 'none', borderRadius: '0' }}></div>
          </div>

          <div className="card card--glass" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Activity size={18} color="var(--accent)" />
              <div className="card__title">Registered vehicles</div>
            </div>
            <div className="table-wrap" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--dark-surface)' }}>
                  <tr>
                    <th style={{ padding: '1rem' }}>ID</th>
                    <th style={{ padding: '1rem' }}>Truck</th>
                    <th style={{ padding: '1rem' }}>Type</th>
                    <th style={{ padding: '1rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((vehicle: TruckRecord) => {
                    const isEnRoute = vehicle.status.startsWith('en_route_to_');
                    const badgeType = isEnRoute ? 'active' : vehicle.status === 'idle' ? 'info' : 'critical';

                    return (
                      <tr key={vehicle.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '1rem' }}><span className="mono" style={{ fontSize: '11px' }}>{vehicle.id}</span></td>
                        <td style={{ padding: '1rem', fontWeight: 600 }}>{vehicle.name}</td>
                        <td style={{ padding: '1rem' }}>
                          <span
                            className="mono"
                            style={{
                              ...getTruckTypeBadgeStyle(vehicle.truck_type),
                              fontSize: '10px',
                              padding: '4px 8px',
                              borderRadius: '999px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {vehicle.truck_type_label}
                          </span>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isEnRoute ? 'var(--accent)' : vehicle.status === 'idle' ? 'var(--secondary)' : 'var(--danger)' }}></div>
                            <span className={`badge badge--${badgeType}`} style={{ whiteSpace: 'nowrap', fontSize: '10px' }}>
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
        </motion.div>

        {/* Right Column: AI Suggestions */}
        <motion.div variants={FADE_UP} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
            <Bot size={22} color="var(--primary)" /> 
            <div className="card__title" style={{ fontSize: '18px' }}>Suggested assignments</div>
          </div>

          {!loading && suggestions.length === 0 ? (
            <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--secondary)', border: '1px dashed var(--border-subtle)', borderRadius: '12px', fontSize: '13px', background: 'rgba(255,255,255,0.02)' }}>
              No assignments suggested right now.
            </div>
          ) : null}

          {loading ? (
            <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--secondary)', border: '1px dashed var(--border-subtle)', borderRadius: '12px', fontSize: '13px' }}>
              Loading suggestions...
            </div>
          ) : null}

          {suggestions.map((suggestion: SuggestionRecord, index: number) => {
            const suggestionKey = getSuggestionKey(suggestion);
            const acceptingThis = activeTruckId === suggestion.truck_id;

            return (
              <motion.div 
                key={suggestionKey}
                role="article"
                aria-label={`Dispatch suggestion for ${suggestion.zone}`}
                whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(193,68,14,0.1)' }}
                style={{ 
                  background: 'var(--dark-surface)', 
                  border: '1px solid rgba(193,68,14,.2)', 
                  borderRadius: '12px', 
                  padding: '1.5rem', 
                  position: 'relative',
                  overflow: 'hidden'
                 }}
              >
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '16px', color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                    <Truck size={18} color="var(--primary)" /> SG-{1403 + index}
                  </div>
                  <div className="mono" style={{ fontSize: '12px', color: 'var(--glow)', fontWeight: 800 }}>P:{suggestion.priority_score}</div>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                   <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)' }}>{suggestion.truck_name}</div>
                   <div style={{ fontSize: '12px', color: 'var(--secondary)', marginTop: '2px' }}>Zone: <b style={{ color: 'var(--text-heading)' }}>{suggestion.zone}</b></div>
                </div>

                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <span className="badge badge--dark" style={{ background: 'rgba(255,255,255,0.05)', fontSize: '9px' }}>{suggestion.truck_type_label}</span>
                  <span className="badge badge--low" style={{ fontSize: '9px' }}>ETA: {suggestion.eta_mins}m</span>
                  <span className="badge badge--low" style={{ fontSize: '9px' }}>Distance: {suggestion.distance_km}km</span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--secondary)', lineHeight: 1.5, marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.05)', borderRadius: '8px' }}>
                  {suggestion.reason}
                </div>

                <div style={{ display: 'flex', gap: '.75rem' }}>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => handleAccept(suggestion)}
                    disabled={acceptingThis}
                    style={{ flex: 2, borderRadius: '8px', fontWeight: 700 }}
                  >
                    {acceptingThis ? 'LOCKING...' : 'DISPATCH'}
                  </button>
                  <button
                    className="btn btn--outline btn--sm"
                    onClick={() => handleSkip(suggestion)}
                    disabled={acceptingThis}
                    style={{ flex: 1, borderRadius: '8px' }}
                  >
                    SKIP
                  </button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </motion.div>
    </DashboardShell>
  );
}
