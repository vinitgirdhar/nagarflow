'use client';
import { apiFetch } from '../lib/api';

import { useEffect, useMemo, useState } from 'react';
import DashboardShell from '../components/DashboardShell';
import layout from '../components/operational-layout.module.css';
import {
  Building2,
  ClipboardList,
  Droplets,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Truck,
  Waves,
  Wrench,
} from 'lucide-react';

type AgencyRecord = {
  agency_name: string;
  category: string;
  city: string;
  contact: {
    email: string;
    helpline: string;
    phone: string;
  };
  dashboard_url: string;
  description: string;
  id: string;
  last_checked: string;
  municipal_body: string;
  services: string[];
  source_description: string;
  source_label: string;
  source_status: 'online' | 'degraded' | 'offline';
  source_status_code: number | null;
  source_title: string;
  source_url: string;
};

type AgenciesPayload = {
  agencies: AgencyRecord[];
  generated_at: string;
  stats: {
    agency_count: number;
    category_count: number;
    city_count: number;
    online_sources: number;
  };
  success: boolean;
};

const BACKEND_URL = '';

function getCategoryIcon(category: string) {
  switch (category) {
    case 'Garbage Pickup':
      return Truck;
    case 'Water Supply':
      return Droplets;
    case 'Drainage & Sewerage':
    case 'Flooding & Drains':
      return Waves;
    case 'Roads & Engineering':
      return Wrench;
    default:
      return ClipboardList;
  }
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AgenciesPage() {
  const [payload, setPayload] = useState<AgenciesPayload | null>(null);
  const [cityFilter, setCityFilter] = useState('All Cities');
  const [categoryFilter, setCategoryFilter] = useState('All Services');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');

  const loadAgencies = async (forceRefresh = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await apiFetch(`${BACKEND_URL}/api/agencies${forceRefresh ? '?refresh=1' : ''}`);
      const data = (await response.json()) as AgenciesPayload & { error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Agency directory unavailable');
      }

      setPayload(data);
      setErrorText('');
    } catch {
      setErrorText('Agency directory is unavailable right now.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAgencies();
  }, []);

  const categories = useMemo(() => {
    if (!payload) {
      return ['All Services'];
    }

    return ['All Services', ...Array.from(new Set(payload.agencies.map((agency) => agency.category)))];
  }, [payload]);

  const cities = useMemo(() => {
    if (!payload) {
      return ['All Cities'];
    }

    return ['All Cities', ...Array.from(new Set(payload.agencies.map((agency) => agency.city)))];
  }, [payload]);

  const visibleAgencies = useMemo(() => {
    if (!payload) {
      return [];
    }

    const query = search.trim().toLowerCase();

    return payload.agencies.filter((agency) => {
      if (cityFilter !== 'All Cities' && agency.city !== cityFilter) {
        return false;
      }
      if (categoryFilter !== 'All Services' && agency.category !== categoryFilter) {
        return false;
      }
      if (!query) {
        return true;
      }

      return (
        agency.agency_name.toLowerCase().includes(query) ||
        agency.city.toLowerCase().includes(query) ||
        agency.municipal_body.toLowerCase().includes(query) ||
        agency.services.some((service) => service.toLowerCase().includes(query))
      );
    });
  }, [payload, cityFilter, categoryFilter, search]);

  const agenciesByCity = useMemo(() => {
    return visibleAgencies.reduce<Record<string, AgencyRecord[]>>((groups, agency) => {
      if (!groups[agency.city]) {
        groups[agency.city] = [];
      }
      groups[agency.city].push(agency);
      return groups;
    }, {});
  }, [visibleAgencies]);

  const cards = payload
    ? [
        { label: 'Agencies', value: String(payload.stats.agency_count), sub: 'BMC and NMMC directory' },
        { label: 'Cities', value: String(payload.stats.city_count), sub: 'Mumbai and Navi Mumbai' },
        { label: 'Services', value: String(payload.stats.category_count), sub: 'waste, water, drains, roads' },
        { label: 'Websites reachable', value: String(payload.stats.online_sources), sub: 'At the last check' },
      ]
    : [];

  return (
    <DashboardShell
      title="Agencies"
      badges={[
        { type: 'live', text: payload ? `${payload.stats.online_sources} websites reachable` : 'Loading Directory' },
        { type: 'alert', text: payload ? `${visibleAgencies.length} Agencies` : 'Directory' },
      ]}
    >
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-header__title">Agency directory</h1>
          <p className="page-header__sub">Find the right municipal service and its contact details.</p>
        </div>
        <button 
          className="btn btn--outline" 
          onClick={() => loadAgencies(true)} 
          disabled={isRefreshing} 
          style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}
          suppressHydrationWarning={true}
        >
          <RefreshCcw size={15} className={isRefreshing ? 'spin' : ''} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Sources'}
        </button>
      </div>

      {cards.length > 0 ? (
        <div className={`stat-grid ${layout.compactStats}`}>
          {cards.map((card) => (
            <div key={card.label} className="card">
              <div className="card__label">{card.label}</div>
              <div className="card__value">{card.value}</div>
              <div className="card__sub">{card.sub}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input
          className="input"
          type="text"
          placeholder="Search agency, city, or service..."
          style={{ maxWidth: '320px' }}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          suppressHydrationWarning={true}
        />
        <select 
          className="input" 
          style={{ maxWidth: '180px' }} 
          value={cityFilter} 
          onChange={(event) => setCityFilter(event.target.value)}
          suppressHydrationWarning={true}
        >
          {cities.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
        <select 
          className="input" 
          style={{ maxWidth: '220px' }} 
          value={categoryFilter} 
          onChange={(event) => setCategoryFilter(event.target.value)}
          suppressHydrationWarning={true}
        >
          {categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>

      {errorText ? (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(193,68,14,0.25)' }}>
          <div className="card__title">Directory Status</div>
          <p className="card__sub" style={{ marginTop: '.5rem' }}>{errorText}</p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="card__title">Loading agencies...</div>
          <div className="card__sub" style={{ marginTop: '.5rem' }}>Checking official websites.</div>
        </div>
      ) : null}

      {!isLoading && visibleAgencies.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="card__title">No agencies found.</div>
          <div className="card__sub" style={{ marginTop: '.5rem' }}>Try another city, service or search.</div>
        </div>
      ) : null}

      {!isLoading && visibleAgencies.length > 0 ? (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {Object.entries(agenciesByCity).map(([city, agencies]) => (
            <section key={city} style={{ display: 'grid', gap: '1rem' }}>
              <div className="card__title" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <Building2 size={18} color="var(--primary)" /> {city}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1rem' }}>
                {agencies.map((agency) => {
                  const Icon = getCategoryIcon(agency.category);
                  const statusColor = agency.source_status === 'online' ? 'var(--accent)' : agency.source_status === 'degraded' ? 'var(--glow)' : 'var(--danger)';

                  return (
                    <div key={agency.id} className={`card ${layout.agencyCard}`} style={{ padding: '1.1rem', display: 'grid', gap: '.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.75rem' }}>
                        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(193,68,14,0.08)', color: 'var(--primary)', flexShrink: 0 }}>
                            <Icon size={20} />
                          </div>
                          <div>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)' }}>{agency.agency_name}</div>
                            <div className="mono" style={{ fontSize: '11px', color: 'var(--secondary)', marginTop: '.2rem' }}>
                              {agency.municipal_body} • {agency.category}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '11px', color: statusColor }}>
                          <ShieldCheck size={14} />
                          {agency.source_status}
                        </div>
                      </div>

                      <div style={{ fontSize: '13px', color: 'var(--text-body)', lineHeight: 1.6 }}>
                        {agency.source_description || agency.description}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.45rem' }}>
                        {agency.services.map((service) => (
                          <span key={service} className="badge badge--info">{service}</span>
                        ))}
                      </div>

                      <div style={{ display: 'grid', gap: '.35rem', fontSize: '12px', color: 'var(--secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
                          <MapPin size={14} color="var(--primary)" />
                          {agency.city}
                        </div>
                        {agency.contact.phone ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
                            <Phone size={14} color="var(--primary)" />
                            {agency.contact.phone}
                          </div>
                        ) : null}
                        {agency.contact.helpline ? (
                          <div className="mono" style={{ fontSize: '11px', color: 'var(--accent)' }}>
                            Helpline: {agency.contact.helpline}
                          </div>
                        ) : null}
                        {agency.contact.email ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
                            <Mail size={14} color="var(--primary)" />
                            {agency.contact.email}
                          </div>
                        ) : null}
                        <div className="mono" style={{ fontSize: '11px' }}>
                          Checked {formatTimestamp(agency.last_checked)}
                          {agency.source_status_code ? ` • HTTP ${agency.source_status_code}` : ''}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                        <a className="btn btn--primary btn--sm" href={agency.source_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
                          <ExternalLink size={14} /> Open Source
                        </a>
                        <a className="btn btn--outline btn--sm" href={agency.dashboard_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
                          <ClipboardList size={14} /> Open Service
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <details style={{ marginTop: '.5rem' }}>
            <summary className="card__title" style={{ marginBottom: '.75rem', cursor: 'pointer' }}>Website check details</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Agency</th>
                    <th>City</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAgencies.map((agency) => (
                    <tr key={`${agency.id}-row`}>
                      <td>{agency.agency_name}</td>
                      <td>{agency.city}</td>
                      <td>{agency.category}</td>
                      <td>
                        <span className={`badge badge--${agency.source_status === 'online' ? 'active' : agency.source_status === 'degraded' ? 'medium' : 'critical'}`}>
                          {agency.source_status}
                        </span>
                      </td>
                      <td>
                        <a href={agency.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                          {agency.source_title || agency.source_label}
                        </a>
                      </td>
                      <td><span className="mono" style={{ fontSize: '11px' }}>{formatTimestamp(agency.last_checked)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      ) : null}
    </DashboardShell>
  );
}
