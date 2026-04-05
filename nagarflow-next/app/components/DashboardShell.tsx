'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import PageTransition from './PageTransition';
import NextImage from 'next/image';
import {
  LayoutDashboard,
  MapPin,
  LineChart,
  Truck,
  AlertTriangle,
  Dna,
  Network,
  FileText,
  MessagesSquare,
  Menu,
  ChevronLeft,
  ArrowLeftRight,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  Image,
  HardHat
} from 'lucide-react';

type NavItem =
  | { href: string; icon: React.ElementType; label: string; children?: never }
  | { href?: never; icon: React.ElementType; label: string; children: { href: string; icon: React.ElementType; label: string }[] };

const ADMIN_LINKS: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  {
    icon: MapPin,
    label: 'Complaints',
    children: [
      { href: '/complaints', icon: MapPin, label: 'All Complaints' },
      { href: '/visual-complaints', icon: Image, label: 'Visual Complaints' },
    ],
  },
  { href: '/complaint-simulator', icon: MessagesSquare, label: 'Complaint Simulator' },
  { href: '/predictions', icon: LineChart, label: 'Predictions' },
  { href: '/dispatch', icon: Truck, label: 'Dispatch' },
  { href: '/emergency', icon: AlertTriangle, label: 'Emergency' },
  { href: '/simulation', icon: Dna, label: 'Simulation' },
  { href: '/agencies', icon: Network, label: 'Agencies' },
  { href: '/reports', icon: FileText, label: 'Reports' },
];

const MAINTENANCE_LINKS: NavItem[] = [
  { href: '/maintenance', icon: Truck, label: 'Active Dispatch' },
];

const WORKER_LINKS: NavItem[] = [
  { href: '/worker-portal', icon: HardHat, label: 'My Tasks' },
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
  const [openGroups, setOpenGroups] = useState<string[]>(['Complaints']);

  useEffect(() => {
    const stored = sessionStorage.getItem('nagarflow_role') || 'admin';
    setRole(stored);
    if (stored === 'maintenance' && pathname !== '/maintenance' && pathname !== '/login') {
      router.push('/maintenance');
    }
    if (stored === 'worker' && !pathname.startsWith('/worker-portal') && pathname !== '/login') {
      router.push('/worker-portal');
    }
    if (stored === 'admin' && pathname === '/maintenance') {
      router.push('/dashboard');
    }
  }, [pathname, router]);

  // Auto-open group if current path is one of its children
  useEffect(() => {
    ADMIN_LINKS.forEach(item => {
      if (item.children) {
        const isChildActive = item.children.some(c => c.href === pathname);
        if (isChildActive) {
          setOpenGroups(prev => prev.includes(item.label) ? prev : [...prev, item.label]);
        }
      }
    });
  }, [pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev =>
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  const roleLabel = role === 'worker' ? 'Field Worker' : role.charAt(0).toUpperCase() + role.slice(1);
  const initials = role.charAt(0).toUpperCase();
  const linksToShow = role === 'admin' ? ADMIN_LINKS : role === 'worker' ? WORKER_LINKS : MAINTENANCE_LINKS;

  return (
    <div className={`app ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} id="sidebar">
        <div className="sidebar__logo">
          <NextImage src="/nagarflow.png" alt="NagarFlow" width={28} height={28} className="sidebar__logo-icon" />
          <span className="sidebar__logo-text">NagarFlow</span>
        </div>
        <nav className="sidebar__nav">
          {linksToShow.map(item => {
            const Icon = item.icon;

            // Group with children (dropdown)
            if (item.children) {
              const isOpen = openGroups.includes(item.label);
              const isGroupActive = item.children.some(c => c.href === pathname);
              return (
                <div key={item.label}>
                  <motion.button
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleGroup(item.label)}
                    className={`sidebar__link ${isGroupActive ? 'active' : ''}`}
                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div className="sidebar__link-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={isCollapsed ? 22 : 18} strokeWidth={isGroupActive ? 2.5 : 2} />
                    </div>
                    <span className="sidebar__link-label">{item.label}</span>
                    {!isCollapsed && (
                      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', opacity: 0.5 }}>
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </span>
                    )}
                  </motion.button>
                  <AnimatePresence initial={false}>
                    {isOpen && !isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        style={{ overflow: 'hidden' }}
                      >
                        {item.children.map(child => {
                          const ChildIcon = child.icon;
                          const isActive = pathname === child.href;
                          return (
                            <motion.div key={child.href} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
                              <Link
                                href={child.href}
                                className={`sidebar__link ${isActive ? 'active' : ''}`}
                                style={{ paddingLeft: '2.4rem' }}
                                onClick={() => setSidebarOpen(false)}
                              >
                                <div className="sidebar__link-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <ChildIcon size={15} strokeWidth={isActive ? 2.5 : 2} />
                                </div>
                                <span className="sidebar__link-label" style={{ fontSize: '12px' }}>{child.label}</span>
                              </Link>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }

            // Regular link
            const isActive = pathname === item.href;
            return (
              <motion.div key={item.href} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href={item.href}
                  className={`sidebar__link ${isActive ? 'active' : ''}`}
                  id={`nav-${item.href.replace('/', '')}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="sidebar__link-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={isCollapsed ? 22 : 18} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className="sidebar__link-label">{item.label}</span>
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
