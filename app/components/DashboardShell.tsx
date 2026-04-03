'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/complaints', icon: '📍', label: 'Complaints' },
  { href: '/predictions', icon: '📈', label: 'Predictions' },
  { href: '/dispatch', icon: '🚚', label: 'Dispatch' },
  { href: '/emergency', icon: '🌧️', label: 'Emergency' },
  { href: '/simulation', icon: '🧪', label: 'Simulation' },
  { href: '/agencies', icon: '🤝', label: 'Agencies' },
  { href: '/reports', icon: '📄', label: 'Reports' },
];

interface TopbarBadge {
  type: 'live' | 'alert' | 'info';
  text: string;
}

interface SidebarProps {
  title: string;
  badges?: TopbarBadge[];
}

export default function DashboardShell({ title, badges, children }: SidebarProps & { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState('admin');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('urbanpulse_role') || 'admin';
    setRole(stored);
  }, []);

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const initials = role.charAt(0).toUpperCase();

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} id="sidebar">
        <div className="sidebar__logo">
          <span className="sidebar__logo-dot"></span>
          UrbanPulse AI
        </div>
        <nav className="sidebar__nav">
          {NAV_LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`sidebar__link ${pathname === l.href ? 'active' : ''}`}
              id={`nav-${l.href.replace('/', '')}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="sidebar__link-icon">{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar__footer">
          Role: {roleLabel}<br />
          <Link href="/login" style={{ color: 'var(--secondary)', textDecoration: 'none', fontSize: '10px' }}>↩ Switch Role</Link><br />
          <Link href="/" style={{ color: 'var(--secondary)', textDecoration: 'none', fontSize: '10px', marginTop: '4px', display: 'inline-block' }}>← Landing Page</Link>
        </div>
      </aside>

      {/* Main */}
      <div className="main" id="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="hamburger" id="hamburger" aria-label="Toggle menu" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <span className="topbar__title">{title}</span>
          </div>
          <div className="topbar__right">
            {(badges || []).map((b, i) => (
              <span key={i} className={`topbar__badge topbar__badge--${b.type}`}>{b.text}</span>
            ))}
            <div className="topbar__user">
              <div className="topbar__avatar">{initials}</div>
              <span className="mono" style={{ fontSize: '11px' }}>{role}</span>
            </div>
          </div>
        </header>

        <div className="content">
          {children}
        </div>
      </div>
    </div>
  );
}
