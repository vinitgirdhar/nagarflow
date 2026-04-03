'use client';
import { useState } from 'react';
import DashboardShell from '../components/DashboardShell';
import { MessageSquareText, MessageCircle } from 'lucide-react';

const STATS = [
  { label: 'Total Complaints', value: '247', sub: 'last 24 hours' },
  { label: 'NLP Processed', value: '100%', sub: 'real-time classification' },
  { label: 'Critical Flagged', value: '5', sub: 'auto-escalated' },
  { label: 'Social Signals', value: '38', sub: 'Twitter + Reddit mined' },
];

const COMPLAINTS = [
  { id: 'C-1047', text: 'Road collapsed near Dadar station, cars stuck', urgency: 'critical', category: 'road', emotion: 'angry', ward: 'Ward 5', time: '2m ago' },
  { id: 'C-1046', text: 'Garbage overflowing at ward 7 junction since 3 days', urgency: 'critical', category: 'waste', emotion: 'frustrated', ward: 'Ward 7', time: '8m ago' },
  { id: 'C-1045', text: 'Water supply stopped at Marol pipeline area', urgency: 'critical', category: 'water', emotion: 'distressed', ward: 'Ward 7', time: '15m ago' },
  { id: 'C-1044', text: 'Streetlight not working near Andheri station', urgency: 'high', category: 'electrical', emotion: 'neutral', ward: 'Ward 7', time: '22m ago' },
  { id: 'C-1043', text: 'Drainage overflowing causing flood in lane', urgency: 'critical', category: 'drainage', emotion: 'angry', ward: 'Ward 9', time: '35m ago' },
  { id: 'C-1042', text: 'Large pothole on western express highway', urgency: 'high', category: 'road', emotion: 'concerned', ward: 'Ward 8', time: '45m ago' },
  { id: 'C-1041', text: 'Garbage truck not visiting since Tuesday', urgency: 'high', category: 'waste', emotion: 'frustrated', ward: 'Ward 2', time: '1h ago' },
  { id: 'C-1040', text: 'Water tanker needed urgently in slum area', urgency: 'critical', category: 'water', emotion: 'urgent', ward: 'Ward 11', time: '1h ago' },
  { id: 'C-1039', text: 'Grass overgrown in park, needs trimming', urgency: 'low', category: 'waste', emotion: 'neutral', ward: 'Ward 4', time: '2h ago' },
  { id: 'C-1038', text: 'Minor crack in sidewalk near school', urgency: 'low', category: 'road', emotion: 'calm', ward: 'Ward 3', time: '2h ago' },
  { id: 'C-1037', text: 'Broken pipe leaking water on street', urgency: 'medium', category: 'water', emotion: 'concerned', ward: 'Ward 6', time: '3h ago' },
  { id: 'C-1036', text: 'Construction debris not cleared from road', urgency: 'medium', category: 'waste', emotion: 'neutral', ward: 'Ward 1', time: '3h ago' },
];

const SOCIAL = [
  { platform: 'twitter', handle: '@mumbai_citizen', text: 'Massive garbage pileup at Ward 7 crossing, been here for 4 days now! @BMCMumbai do something!', time: '5m ago', location: 'Ward 7, Andheri' },
  { platform: 'reddit', handle: 'r/mumbai', text: 'Anyone else having water supply issues in Ghatkopar? No water since morning.', time: '12m ago', location: 'Ward 11, Ghatkopar' },
  { platform: 'twitter', handle: '@road_warrior_mum', text: 'AVOID Dadar station area — road completely collapsed, major traffic jam building up.', time: '18m ago', location: 'Ward 5, Dadar' },
  { platform: 'reddit', handle: 'r/mumbai', text: 'The new drainage near Kurla station is already overflowing after just light rain. Horrible planning.', time: '25m ago', location: 'Ward 9, Kurla' },
  { platform: 'twitter', handle: '@clean_mumbai', text: 'Great work by BMC cleaning Juhu Beach yesterday! But Ward 2 still neglected.', time: '40m ago', location: 'Ward 2, Sandhurst' },
  { platform: 'twitter', handle: '@flood_watch', text: "Water logging starting near Andheri subway. Rain hasn't even been heavy. Drainage blocked?", time: '55m ago', location: 'Ward 7, Andheri' },
  { platform: 'reddit', handle: 'r/IndiaInfra', text: 'Broken water pipe flooding entire lane in Mahim. Nobody from water dept responding.', time: '1h ago', location: 'Ward 6, Mahim' },
];

export default function ComplaintsPage() {
  const [search, setSearch] = useState('');
  const [urgency, setUrgency] = useState('all');
  const [cat, setCat] = useState('all');

  const filtered = COMPLAINTS.filter(c => {
    if (search && !c.text.toLowerCase().includes(search) && !c.id.toLowerCase().includes(search)) return false;
    if (urgency !== 'all' && c.urgency !== urgency) return false;
    if (cat !== 'all' && c.category !== cat) return false;
    return true;
  });

  return (
    <DashboardShell title="Complaint Insights" badges={[{ type: 'live', text: 'NLP Active' }, { type: 'alert', text: '5 Critical' }]}>
      <div className="page-header">
        <h1 className="page-header__title">Complaint Insights</h1>
        <p className="page-header__sub">NLP-processed 311 complaints + social media signals</p>
      </div>

      <div className="stat-grid">
        {STATS.map((s, i) => (
          <div key={i} className="card"><div className="card__label">{s.label}</div><div className="card__value">{s.value}</div><div className="card__sub">{s.sub}</div></div>
        ))}
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input className="input" type="text" placeholder="Search complaints..." style={{ maxWidth: '300px' }} value={search} onChange={e => setSearch(e.target.value.toLowerCase())} />
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <select className="input" style={{ maxWidth: '150px' }} value={urgency} onChange={e => setUrgency(e.target.value)}>
            <option value="all">All Urgency</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className="input" style={{ maxWidth: '160px' }} value={cat} onChange={e => setCat(e.target.value)}>
            <option value="all">All Categories</option>
            <option value="waste">Waste</option>
            <option value="road">Road</option>
            <option value="water">Water</option>
            <option value="drainage">Drainage</option>
            <option value="electrical">Electrical</option>
          </select>
        </div>
      </div>

      <div className="grid-2-1">
        {/* Complaints Table */}
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>311 Complaints — NLP Processed</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Complaint</th><th>NLP Tags</th><th>Ward</th><th>Time</th></tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td><span className="mono" style={{ fontSize: '11px', color: 'var(--accent)' }}>{c.id}</span></td>
                    <td style={{ maxWidth: '280px' }}>{c.text}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontFamily: "'Space Mono',monospace", fontSize: '10px', padding: '2px 7px', borderRadius: '3px', marginRight: '.3rem', background: 'rgba(193,68,14,.12)', color: 'var(--glow)', border: '1px solid rgba(193,68,14,.2)' }}>{c.urgency}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontFamily: "'Space Mono',monospace", fontSize: '10px', padding: '2px 7px', borderRadius: '3px', marginRight: '.3rem', background: 'rgba(122,140,94,.12)', color: 'var(--accent)', border: '1px solid rgba(122,140,94,.2)' }}>{c.category}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontFamily: "'Space Mono',monospace", fontSize: '10px', padding: '2px 7px', borderRadius: '3px', background: 'rgba(90,140,160,.12)', color: 'var(--info)', border: '1px solid rgba(90,140,160,.2)' }}>{c.emotion}</span>
                    </td>
                    <td>{c.ward}</td>
                    <td><span className="mono" style={{ fontSize: '11px' }}>{c.time}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Social Feed */}
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>Social Media Feed</div>
          <div className="feed">
            {SOCIAL.map((s, i) => (
              <div key={i} className="feed-item">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: s.platform === 'twitter' ? 'rgba(29,161,242,.15)' : 'rgba(255,69,0,.15)', color: s.platform === 'twitter' ? '#1da1f2' : '#ff4500' }}>
                    {s.platform === 'twitter' ? <MessageSquareText size={16} /> : <MessageCircle size={16} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="feed-item__header">
                      <span className="mono" style={{ fontSize: '10px', color: 'var(--accent)' }}>{s.handle}</span>
                      <span className="feed-item__time">{s.time}</span>
                    </div>
                    <div className="feed-item__text">{s.text}</div>
                    <div className="mono" style={{ fontSize: '10px', color: '#5a4a3a', marginTop: '.35rem' }}>📍 {s.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
