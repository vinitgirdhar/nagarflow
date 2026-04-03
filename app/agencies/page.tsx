'use client';
import { useState } from 'react';
import DashboardShell from '../components/DashboardShell';
import { Truck, Droplets, Wrench, AlertTriangle, CheckCircle2, AlertOctagon, LucideIcon } from 'lucide-react';


const AGENCY_STATS = [
  { label: 'Active Departments', value: '3', sub: 'Sanitation, Water, Maintenance' },
  { label: 'Active Conflicts', value: '2', sub: 'scheduling overlaps' },
  { label: 'Auto-Resolved', value: '5', sub: 'today by graph algo' },
  { label: 'Shared Resources', value: '8', sub: 'cross-dept vehicles' },
];

interface DeptData { id: string; name: string; icon: LucideIcon; color: string; vehicles: any[]; zones: string[]; schedule: number[]; }

const DEPTS: DeptData[] = [
  {
    id: 'sanitation', name: 'Sanitation', icon: Truck, color: '#C1440E',
    vehicles: [
      { id: 'T-100', type: 'Garbage Truck', zone: 'Ward 5', status: 'active', load: '72%' },
      { id: 'T-101', type: 'Garbage Truck', zone: 'Ward 1', status: 'active', load: '85%' },
      { id: 'T-105', type: 'Garbage Truck', zone: 'Depot 2', status: 'idle', load: '0%' },
      { id: 'T-108', type: 'Garbage Truck', zone: 'Ward 4', status: 'active', load: '45%' },
    ],
    zones: ['Ward 1', 'Ward 2', 'Ward 4', 'Ward 5', 'Ward 7', 'Ward 12'],
    schedule: [1, 1, 2, 2, 1, 0, 0, 1, 2, 1, 1, 0],
  },
  {
    id: 'water', name: 'Water Supply', icon: Droplets, color: '#5a8ca0',
    vehicles: [
      { id: 'T-102', type: 'Water Tanker', zone: 'Ward 9', status: 'active', load: '90%' },
      { id: 'T-103', type: 'Water Tanker', zone: 'Depot 1', status: 'idle', load: '0%' },
      { id: 'T-106', type: 'Water Tanker', zone: 'Ward 7', status: 'active', load: '88%' },
    ],
    zones: ['Ward 2', 'Ward 7', 'Ward 8', 'Ward 9', 'Ward 11'],
    schedule: [0, 1, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1],
  },
  {
    id: 'maintenance', name: 'Maintenance', icon: Wrench, color: '#D4A96A',
    vehicles: [
      { id: 'T-104', type: 'Maintenance Van', zone: 'Ward 3', status: 'active', load: '65%' },
      { id: 'T-107', type: 'Maintenance Van', zone: 'Workshop', status: 'maintenance', load: '0%' },
      { id: 'T-109', type: 'Maintenance Van', zone: 'Ward 6', status: 'active', load: '70%' },
    ],
    zones: ['Ward 3', 'Ward 5', 'Ward 6', 'Ward 9', 'Ward 10'],
    schedule: [0, 0, 1, 1, 2, 1, 0, 0, 1, 1, 2, 0],
  },
];

const CONFLICTS_INIT = [
  { title: 'Route Overlap: Ward 5 — Sanitation vs Maintenance', detail: 'Both departments scheduled heavy vehicles on SV Road between 10:00–12:00. Traffic blockage likely.', resolved: false },
  { title: 'Resource Conflict: Water Tanker T-106 double-booked', detail: 'Water dept and Sanitation dept both assigned T-106 for Ward 7 at 14:00.', resolved: false },
  { title: 'Zone Access: Ward 9 drainage work blocks garbage route', detail: 'Maintenance drainage work on Lane 4 blocks default garbage truck access path.', resolved: true },
];

const HOURS = Array.from({ length: 12 }, (_, i) => `${i + 6}:00`);
const SCHED_COLORS = ['#1a1309', '#3a5a2e', '#C1440E'];
const SCHED_LABELS = ['', 'busy', 'surge'];

export default function AgenciesPage() {
  const [activeTab, setActiveTab] = useState('sanitation');
  const [conflicts, setConflicts] = useState(CONFLICTS_INIT);

  const resolve = (i: number) => setConflicts(prev => prev.map((c, j) => j === i ? { ...c, resolved: true } : c));
  const dept = DEPTS.find(d => d.id === activeTab)!;

  return (
    <DashboardShell title="Agencies" badges={[{ type: 'alert', text: '2 Conflicts' }]}>
      <div className="page-header">
        <h1 className="page-header__title">Multi-Agency Coordination</h1>
        <p className="page-header__sub">Cross-department schedule, conflict detection & resolution</p>
      </div>

      <div className="stat-grid">
        {AGENCY_STATS.map((s, i) => <div key={i} className="card"><div className="card__label">{s.label}</div><div className="card__value">{s.value}</div><div className="card__sub">{s.sub}</div></div>)}
      </div>

      {/* Conflicts */}
      <div className="card__title" style={{ marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <AlertTriangle size={18} color="var(--danger)" /> Active Conflict Alerts
      </div>
      {conflicts.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem 1rem', background: 'rgba(185,45,45,.06)', border: `1px solid ${c.resolved ? 'var(--accent)' : 'rgba(185,45,45,.2)'}`, borderRadius: '8px', marginBottom: '.75rem', opacity: c.resolved ? 0.5 : 1 }}>
          <div style={{ display: 'flex' }}>{c.resolved ? <CheckCircle2 size={20} color="var(--accent)" /> : <AlertOctagon size={20} color="var(--danger)" />}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', color: c.resolved ? 'var(--accent)' : 'var(--danger)', fontWeight: 500 }}>{c.title}</div>
            <div style={{ fontSize: '11px', color: 'var(--secondary)', marginTop: '.15rem' }}>{c.detail}</div>
          </div>
          <div>
            {c.resolved
              ? <span className="badge badge--active">Resolved</span>
              : <button className="btn btn--primary btn--sm" onClick={() => resolve(i)}>Resolve</button>
            }
          </div>
        </div>
      ))}

      {/* Department Tabs */}
      <div className="tabs" style={{ marginTop: '2rem' }}>
        {DEPTS.map(d => {
          const Icon = d.icon;
          return (
          <button key={d.id} className={`tab ${d.id === activeTab ? 'active' : ''}`} onClick={() => setActiveTab(d.id)}>
            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
              <Icon size={16} /> {d.name}
            </div>
          </button>
          );
        })}
      </div>

      {/* Dept Content */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1rem' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: dept.color, background: dept.color + '22' }}>
          <dept.icon size={22} />
        </div>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '18px', color: 'var(--text-heading)' }}>{dept.name} Department</div>
          <span className="badge badge--info">{dept.vehicles.length} vehicles · {dept.zones.length} zones</span>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="card__title" style={{ marginBottom: '.5rem' }}>Vehicles</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Type</th><th>Zone</th><th>Status</th><th>Load</th></tr></thead>
              <tbody>
                {dept.vehicles.map(v => (
                  <tr key={v.id}>
                    <td><span className="mono" style={{ fontSize: '11px' }}>{v.id}</span></td>
                    <td>{v.type}</td>
                    <td>{v.zone}</td>
                    <td><span className={`badge badge--${v.status === 'active' ? 'active' : v.status === 'idle' ? 'medium' : 'critical'}`}>{v.status}</span></td>
                    <td>{v.load}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="card__title" style={{ marginBottom: '.5rem' }}>Assigned Zones</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            {dept.zones.map(z => (
              <div key={z} className="card" style={{ padding: '.75rem 1rem', minWidth: '100px', textAlign: 'center' }}>
                <span style={{ fontSize: '13px' }}>{z}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 12-hour schedule */}
      <div style={{ marginTop: '2rem' }}>
        <div className="card__title" style={{ marginBottom: '.75rem' }}>Cross-Agency 12-Hour Schedule</div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: '2px', marginBottom: '.25rem' }}>
            {HOURS.map(h => <div key={h} className="mono" style={{ fontSize: '9px', color: '#5a4a3a', textAlign: 'center' }}>{h}</div>)}
          </div>
          {DEPTS.map(d => {
            const Icon = d.icon;
            return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '4px' }}>
              <div className="mono" style={{ width: '80px', fontSize: '10px', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Icon size={12} /> {d.name.slice(0, 4)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: '2px', flex: 1 }}>
                {d.schedule.map((s, i) => (
                  <div key={i} style={{ height: '28px', borderRadius: '3px', background: SCHED_COLORS[s], border: s === 2 ? '1px solid rgba(193,68,14,.4)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Mono',monospace", fontSize: '8px', color: 'rgba(242,232,217,.6)' }}>{SCHED_LABELS[s]}</div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
