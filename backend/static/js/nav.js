/* ════════════════════════════════════════════
   URBANPULSE AI — SHARED NAV COMPONENT
   ════════════════════════════════════════════ */
const NAV_LINKS = [
  { href: 'dashboard.html', icon: '📊', label: 'Dashboard' },
  { href: 'complaints.html', icon: '📍', label: 'Complaints' },
  { href: 'predictions.html', icon: '📈', label: 'Predictions' },
  { href: 'dispatch.html', icon: '🚚', label: 'Dispatch' },
  { href: 'emergency.html', icon: '🌧️', label: 'Emergency' },
  { href: 'simulation.html', icon: '🧪', label: 'Simulation' },
  { href: 'agencies.html', icon: '🤝', label: 'Agencies' },
  { href: 'reports.html', icon: '📄', label: 'Reports' }
];

function buildSidebar() {
  const currentPage = location.pathname.split('/').pop() || 'dashboard.html';
  const role = sessionStorage.getItem('urbanpulse_role') || 'admin';
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.id = 'sidebar';
  sidebar.innerHTML = `
    <div class="sidebar__logo"><span class="sidebar__logo-dot"></span> UrbanPulse AI</div>
    <nav class="sidebar__nav">
      ${NAV_LINKS.map(l => `
        <a href="${l.href}" class="sidebar__link ${currentPage === l.href ? 'active' : ''}" id="nav-${l.href.replace('.html', '')}">
          <span class="sidebar__link-icon">${l.icon}</span>${l.label}
        </a>
      `).join('')}
    </nav>
    <div class="sidebar__footer">
      Role: ${roleLabel}<br/>
      <a href="login.html" style="color:var(--secondary);text-decoration:none;font-size:10px">↩ Switch Role</a><br/>
      <a href="index.html" style="color:var(--secondary);text-decoration:none;font-size:10px;margin-top:4px;display:inline-block">← Landing Page</a>
    </div>
  `;
  document.body.prepend(sidebar);
}

function buildTopbar(title, badges) {
  const role = sessionStorage.getItem('urbanpulse_role') || 'admin';
  const initials = role.charAt(0).toUpperCase();
  const topbar = document.createElement('header');
  topbar.className = 'topbar';
  const badgeHTML = (badges || []).map(b =>
    `<span class="topbar__badge topbar__badge--${b.type}">${b.text}</span>`
  ).join('');
  topbar.innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem">
      <button class="hamburger" id="hamburger" aria-label="Toggle menu">☰</button>
      <span class="topbar__title">${title}</span>
    </div>
    <div class="topbar__right">
      ${badgeHTML}
      <div class="topbar__user">
        <div class="topbar__avatar">${initials}</div>
        <span class="mono" style="font-size:11px">${role}</span>
      </div>
    </div>
  `;
  document.querySelector('.main').prepend(topbar);

  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  buildSidebar();
});
