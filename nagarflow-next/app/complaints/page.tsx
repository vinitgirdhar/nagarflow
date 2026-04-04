'use client';

import { useEffect, useState } from 'react';
import DashboardShell from '../components/DashboardShell';
import { MessageCircle, MessageSquareText, PhoneCall } from 'lucide-react';

type ComplaintRecord = {
  id: string;
  text: string;
  urgency: string;
  category: string;
  emotion: string;
  ward: string;
  time: string;
  source: string;
  issue_type: string;
  severity: string;
  complaint_count: number;
};

type ComplaintStats = {
  total_complaints: number;
  high_priority_count: number;
  voice_report_count: number;
  text_report_count: number;
  latest_timestamp: string | null;
};

const SOCIAL = [
  { platform: 'twitter', handle: '@mumbai_citizen', text: 'Massive garbage pileup at Ward 7 crossing, been here for 4 days now! @BMCMumbai do something!', time: '5m ago', location: 'Ward 7, Andheri' },
  { platform: 'reddit', handle: 'r/mumbai', text: 'Anyone else having water supply issues in Ghatkopar? No water since morning.', time: '12m ago', location: 'Ward 11, Ghatkopar' },
  { platform: 'twitter', handle: '@road_warrior_mum', text: 'AVOID Dadar station area - road completely collapsed, major traffic jam building up.', time: '18m ago', location: 'Ward 5, Dadar' },
  { platform: 'reddit', handle: 'r/mumbai', text: 'The new drainage near Kurla station is already overflowing after just light rain. Horrible planning.', time: '25m ago', location: 'Ward 9, Kurla' },
  { platform: 'twitter', handle: '@clean_mumbai', text: 'Great work by BMC cleaning Juhu Beach yesterday! But Ward 2 still neglected.', time: '40m ago', location: 'Ward 2, Sandhurst' },
  { platform: 'twitter', handle: '@flood_watch', text: "Water logging starting near Andheri subway. Rain hasn't even been heavy. Drainage blocked?", time: '55m ago', location: 'Ward 7, Andheri' },
  { platform: 'reddit', handle: 'r/IndiaInfra', text: 'Broken water pipe flooding entire lane in Mahim. Nobody from water dept responding.', time: '1h ago', location: 'Ward 6, Mahim' },
];

function formatRelativeTime(timestamp: string | null) {
  if (!timestamp) return 'waiting for sync';

  const parsed = new Date(timestamp.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return timestamp;

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function ComplaintsPage() {
  const [search, setSearch] = useState('');
  const [urgency, setUrgency] = useState('all');
  const [cat, setCat] = useState('all');
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [stats, setStats] = useState<ComplaintStats>({
    total_complaints: 0,
    high_priority_count: 0,
    voice_report_count: 0,
    text_report_count: 0,
    latest_timestamp: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadComplaints = async () => {
      try {
        const response = await fetch('http://127.0.0.1:5000/api/complaints');
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Complaints feed unavailable');
        }

        if (!isMounted) return;
        setComplaints(data.complaints || []);
        setStats(data.stats || {
          total_complaints: 0,
          high_priority_count: 0,
          voice_report_count: 0,
          text_report_count: 0,
          latest_timestamp: null,
        });
        setErrorText('');
      } catch {
        if (!isMounted) return;
        setErrorText('Live complaints feed is unavailable right now.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadComplaints();
    const intervalId = window.setInterval(loadComplaints, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const filtered = complaints.filter((complaint) => {
    const query = search.trim().toLowerCase();

    if (query && !complaint.text.toLowerCase().includes(query) && !complaint.id.toLowerCase().includes(query) && !complaint.ward.toLowerCase().includes(query)) {
      return false;
    }
    if (urgency !== 'all' && complaint.urgency !== urgency) {
      return false;
    }
    if (cat !== 'all' && complaint.category !== cat) {
      return false;
    }
    return true;
  });

  const cards = [
    { label: 'Total Complaints', value: String(stats.total_complaints), sub: 'live backend dataset' },
    { label: 'High Priority', value: String(stats.high_priority_count), sub: 'calls and urgent reports' },
    { label: 'Voice Reports', value: String(stats.voice_report_count), sub: 'Sarvam agent logged' },
    { label: 'Text Reports', value: String(stats.text_report_count), sub: 'simulator chat logged' },
    { label: 'Last Sync', value: formatRelativeTime(stats.latest_timestamp), sub: 'complaints feed refresh' },
  ];

  return (
    <DashboardShell
      title="Complaint Insights"
      badges={[
        { type: 'live', text: 'LIVE DATASET' },
        { type: 'alert', text: `${stats.high_priority_count} High Priority` },
      ]}
    >
      <div className="page-header">
        <h1 className="page-header__title">Complaint Insights</h1>
        <p className="page-header__sub">Live complaint dataset with Sarvam call reports and complaint simulator text chats flowing into the same response queue.</p>
      </div>

      <div className="stat-grid">
        {cards.map((card) => (
          <div key={card.label} className="card">
            <div className="card__label">{card.label}</div>
            <div className="card__value">{card.value}</div>
            <div className="card__sub">{card.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input
          className="input"
          type="text"
          placeholder="Search complaints or area..."
          style={{ maxWidth: '320px' }}
          suppressHydrationWarning
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <select className="input" style={{ maxWidth: '150px' }} suppressHydrationWarning value={urgency} onChange={(event) => setUrgency(event.target.value)}>
            <option value="all">All Urgency</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className="input" style={{ maxWidth: '160px' }} suppressHydrationWarning value={cat} onChange={(event) => setCat(event.target.value)}>
            <option value="all">All Categories</option>
            <option value="waste">Waste</option>
            <option value="road">Road</option>
            <option value="water">Water</option>
            <option value="drainage">Drainage</option>
            <option value="general">General</option>
          </select>
        </div>
      </div>

      {errorText ? (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(193,68,14,0.3)' }}>
          <div className="card__title">Feed Status</div>
          <p className="card__sub" style={{ marginTop: '.5rem' }}>{errorText}</p>
        </div>
      ) : null}

      <div className="grid-2-1">
        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>Unified Complaint Feed</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Complaint</th>
                  <th>Priority</th>
                  <th>Area</th>
                  <th>Source</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="mono" style={{ padding: '1rem', color: 'var(--secondary)' }}>
                      Loading complaint dataset...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="mono" style={{ padding: '1rem', color: 'var(--secondary)' }}>
                      No complaints match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((complaint) => (
                    <tr key={complaint.id}>
                      <td>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--accent)' }}>{complaint.id}</span>
                      </td>
                      <td style={{ maxWidth: '300px' }}>
                        <div style={{ color: 'var(--text-heading)' }}>{complaint.text}</div>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '.2rem' }}>
                          {complaint.issue_type} • weight {complaint.complaint_count}
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontFamily: "'Space Mono', monospace", fontSize: '10px', padding: '2px 7px', borderRadius: '3px', marginRight: '.3rem', background: 'rgba(193,68,14,.12)', color: 'var(--glow)', border: '1px solid rgba(193,68,14,.2)' }}>
                          {complaint.urgency}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontFamily: "'Space Mono', monospace", fontSize: '10px', padding: '2px 7px', borderRadius: '3px', background: 'rgba(122,140,94,.12)', color: 'var(--accent)', border: '1px solid rgba(122,140,94,.2)' }}>
                          {complaint.category}
                        </span>
                      </td>
                      <td>{complaint.ward}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', color: complaint.source === 'voice_call' ? 'var(--text-heading)' : 'var(--secondary)' }}>
                          {complaint.source === 'voice_call' ? <PhoneCall size={14} /> : <MessageSquareText size={14} />}
                          <span className="mono" style={{ fontSize: '10px' }}>
                            {complaint.source === 'voice_call' ? 'voice call' : complaint.source === 'text_chat' ? 'text complaint' : 'dataset'}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: '11px' }}>{formatRelativeTime(complaint.time)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card__title" style={{ marginBottom: '.75rem' }}>Social Media Feed</div>
          <div className="feed">
            {SOCIAL.map((socialItem, index) => (
              <div key={index} className="feed-item">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: socialItem.platform === 'twitter' ? 'rgba(29,161,242,.15)' : 'rgba(255,69,0,.15)', color: socialItem.platform === 'twitter' ? '#1da1f2' : '#ff4500' }}>
                    {socialItem.platform === 'twitter' ? <MessageSquareText size={16} /> : <MessageCircle size={16} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="feed-item__header">
                      <span className="mono" style={{ fontSize: '10px', color: 'var(--accent)' }}>{socialItem.handle}</span>
                      <span className="feed-item__time">{socialItem.time}</span>
                    </div>
                    <div className="feed-item__text">{socialItem.text}</div>
                    <div className="mono" style={{ fontSize: '10px', color: '#5a4a3a', marginTop: '.35rem' }}>{socialItem.location}</div>
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
