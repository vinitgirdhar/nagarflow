'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import styles from './workspace-motion.module.css';

const REVEAL_TARGETS = 'h1, .page-header, .card, .table-wrap, .dispatch-card-premium';
const MOTION_EXCLUSIONS = '.map-container, .leaflet-container, [data-workspace-motion="off"], [role="dialog"], [aria-modal="true"]';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scope.current;
    if (
      !root ||
      reduceMotion ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) return;

    // Observe panels once, including panels that arrive after an API response.
    // Polling the same records never replays entrances or animates their values.
    const observed = new WeakSet<Element>();
    let order = 0;
    const viewport = new IntersectionObserver((entries) => {
      entries.forEach(({ isIntersecting, target }) => {
        if (!isIntersecting) return;
        target.setAttribute('data-workspace-reveal', 'visible');
        viewport.unobserve(target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });

    const observePanels = () => {
      root.querySelectorAll<HTMLElement>(REVEAL_TARGETS).forEach((panel) => {
        if (observed.has(panel)) return;
        observed.add(panel);
        // Do not transform Leaflet layers, a map's measured parent, dialogs,
        // or nested cards already entering together with their parent panel.
        const parentPanel = panel.parentElement?.closest(REVEAL_TARGETS);
        if (
          (parentPanel && root.contains(parentPanel)) ||
          panel.closest(MOTION_EXCLUSIONS) ||
          panel.querySelector(MOTION_EXCLUSIONS)
        ) return;
        panel.style.setProperty('--workspace-reveal-delay', `${(order++ % 4) * 65}ms`);
        viewport.observe(panel);
      });
    };

    observePanels();
    const additions = new MutationObserver(observePanels);
    additions.observe(root, { childList: true, subtree: true });
    return () => {
      viewport.disconnect();
      additions.disconnect();
    };
  }, [pathname, reduceMotion]);

  return (
    <motion.div
      ref={scope}
      key={pathname}
      className={styles.workspace}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
