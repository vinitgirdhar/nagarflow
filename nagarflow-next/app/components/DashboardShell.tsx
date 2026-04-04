'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import PageTransition from './PageTransition';
import { 
  LayoutDashboard, 
  MapPin, 
  LineChart, 
  Truck, 
  AlertTriangle, 
  Dna, 
  Network, 
  FileText,
  Menu,
  ChevronLeft,
  ArrowLeftRight,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

const ADMIN_LINKS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/complaints', icon: MapPin, label: 'Complaints' },
  { href: '/predictions', icon: LineChart, label: 'Predictions' },
  { href: '/dispatch', icon: Truck, label: 'Dispatch' },
  { href: '/emergency', icon: AlertTriangle, label: 'Emergency' },
  { href: '/simulation', icon: Dna, label: 'Simulation' },
  { href: '/agencies', icon: Network, label: 'Agencies' },
  { href: '/reports', icon: FileText, label: 'Reports' },
];

const MAINTENANCE_LINKS = [
  { href: '/maintenance', icon: Truck, label: 'Active Dispatch' },
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
  const router = useRouter();
  const [role, setRole] = useState('admin');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('nagarflow_role') || 'admin';
    setRole(stored);
    
    // Redirect logic if wrong role for path
    if (stored === 'maintenance' && pathname !== '/maintenance' && pathname !== '/login') {
      router.push('/maintenance');
    }
    if (stored === 'admin' && pathname === '/maintenance') {
      router.push('/dashboard');
    }
  }, [pathname, router]);

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const initials = role.charAt(0).toUpperCase();

  const linksToShow = role === 'admin' ? ADMIN_LINKS : MAINTENANCE_LINKS;

  return (
    <div className={`app ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} id="sidebar">
        <div className="sidebar__logo">
          <span className="sidebar__logo-dot"></span>
          <span className="sidebar__logo-text">NagarFlow</span>
        </div>
        <nav className="sidebar__nav">
          {linksToShow.map(l => {
            const Icon = l.icon;
            const isActive = pathname === l.href;
            return (
              <motion.div key={l.href} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href={l.href}
                  className={`sidebar__link ${isActive ? 'active' : ''}`}
                  id={`nav-${l.href.replace('/', '')}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="sidebar__link-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={isCollapsed ? 22 : 18} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className="sidebar__link-label">{l.label}</span>
                </Link>
              </motion.div>
            );
          })}
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__footer-content">
            <div style={{ marginBottom: '8px' }}>Role: <span style={{ color: 'var(--text-heading)' }}>{roleLabel}</span></div>
            <Link href="/login" style={{ color: 'var(--secondary)', textDecoration: 'none', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeftRight size={12} /> Switch Role
            </Link>
            <Link href="/" style={{ color: 'var(--secondary)', textDecoration: 'none', fontSize: '11px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ChevronLeft size={12} /> Landing Page
            </Link>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main" id="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="hamburger" id="hamburger" aria-label="Toggle menu" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Menu size={22} />
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1, color: 'var(--primary)' }} 
              whileTap={{ scale: 0.9 }} 
              className="collapse-toggle" 
              onClick={() => setIsCollapsed(!isCollapsed)} 
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              suppressHydrationWarning={true}
            >
              {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </motion.button>
            <span className="topbar__title">{title}</span>
          </div>
          <div className="topbar__right">
            {(badges || []).map((b, i) => (
              <span key={i} className={`topbar__badge topbar__badge--${b.type}`}>{b.text}</span>
            ))}
            <div className="topbar__user">
              <div className="topbar__avatar">{initials}</div>
              <span className="mono" style={{ fontSize: '11px', fontWeight: 600 }}>{role.toUpperCase()}</span>
            </div>
          </div>
        </header>

        <div className="content">
          <PageTransition>
            {children}
          </PageTransition>
        </div>
      </div>
    </div>
  );
}
