<div align="center">

# ⚛️ NagarFlow — Frontend Documentation

**Next.js 16 · React 19 · Three.js · Leaflet · Framer Motion**

[← Back to Main README](../README.md) · [Backend Docs →](../BACKEND.md)

</div>

---

## Overview

The NagarFlow frontend is a **Next.js 16 App Router** application with 11 route-level pages and 4 shared components. It communicates with the Flask backend via REST API calls, rendering real-time civic intelligence data through interactive maps, dispatch cards, simulation sandboxes, and voice interfaces.

### Key Design Decisions

- **No Tailwind** — Custom CSS design system (`globals.css`, 33 KB) with CSS custom properties for theming
- **No state library** — React hooks + component-level state; data fetched directly via `fetch()`
- **Auto-polling** — Dashboard and dispatch pages poll the backend every 10 seconds
- **3D landing page** — Three.js r128 loaded via CDN, renders an animated city skyline
- **Leaflet via CDN** — No npm Leaflet dependency; loaded dynamically in dashboard components
- **Framer Motion** — Page transitions and micro-animations throughout the dashboard shell

---

## Tech Stack

| Package | Version | Purpose |
|:---|:---|:---|
| `next` | 16.2.2 | App Router, SSR, file-based routing |
| `react` | 19.2.4 | Component UI framework |
| `react-dom` | 19.2.4 | DOM rendering |
| `framer-motion` | 12.38.0 | Page transitions, hover animations |
| `lucide-react` | 1.7.0 | Icon system (100+ icons used) |
| `jspdf` | 4.2.1 | Client-side PDF report generation |
| `jspdf-autotable` | 5.0.7 | PDF table formatting |
| `html2canvas` | 1.4.1 | Screenshot capture for PDF reports |
| `typescript` | 5.x | Type safety |

**CDN-loaded (not in package.json):**
- `three.js` r128 — 3D city visualization on landing page
- `leaflet.js` — Interactive heatmap and truck markers on dashboard

---

## Page Routes

| Route | File | Description |
|:---|:---|:---|
| `/` | `app/page.tsx` | **Landing page** — Three.js 3D city, live alert ticker, 10 feature flip-cards, pipeline animation, scenario demos, tech stack marquee |
| `/login` | `app/login/page.tsx` | **Auth gate** — Role selection (Admin / Operator / Viewer) |
| `/dashboard` | `app/dashboard/page.tsx` | **Operations center** — Live Leaflet heatmap, 5 KPI cards, Haversine dispatch array, operator log, surge injection |
| `/complaints` | `app/complaints/page.tsx` | **Complaint insights** — Full complaint feed, AiRLLM breakdown, category filters, voice vs. text split |
| `/complaint-simulator` | `app/complaint-simulator/page.tsx` | **Chat simulator** — Browser-based complaint submission via text with Gemini NLU processing |
| `/predictions` | `app/predictions/page.tsx` | **Zone predictions** — Priority scores table from AiRLLM engine, sortable by score |
| `/dispatch` | `app/dispatch/page.tsx` | **Fleet dispatch** — Dispatch suggestion cards, accept/reject actions, truck type labels |
| `/maintenance` | `app/maintenance/page.tsx` | **Task tracker** — Auto-generated tasks, team assignment dropdowns, status workflow |
| `/simulation` | `app/simulation/page.tsx` | **Digital twin** — Demand/failure/weather sliders, before vs. after zone grids, KPI projections |
| `/reports` | `app/reports/page.tsx` | **KPI reports** — Accuracy trend chart, coverage chart, equity score, retraining alert |
| `/emergency` | `app/emergency/page.tsx` | **Weather overlay** — Per-zone temperature, AQI, wind speed, condition |
| `/agencies` | `app/agencies/page.tsx` | **Agency directory** — Mumbai municipal bodies, contact info, service categories |

---

## Shared Components

### `DashboardShell.tsx`

The primary layout wrapper for all dashboard pages. Provides:

- **Sidebar navigation** — Icon + label for all 11 routes, active state highlighting
- **Top bar** — Page title, polling interval indicator, role badge, live commands button
- **Role system** — Admin / Operator / Viewer with visual indicators
- **Footer actions** — Switch Role, Landing Page link

```
┌─────────────┬──────────────────────────────────────┐
│             │  [📊 Dashboard]    [POLLED 10s] [ADMIN]│
│  NagarFlow  │                                       │
│             │  ┌──────────────────────────────────┐ │
│  Dashboard  │  │                                  │ │
│  Complaints │  │        PAGE CONTENT              │ │
│  Simulator  │  │                                  │ │
│  Predictions│  │                                  │ │
│  Dispatch   │  └──────────────────────────────────┘ │
│  Emergency  │                                       │
│  Simulation │                                       │
│  Agencies   │                                       │
│  Reports    │                                       │
│             │                                       │
│  Role: Admin│                                       │
│  ↕ Switch   │                                       │
└─────────────┴──────────────────────────────────────┘
```

### `VoiceConversation.tsx`

Browser-based voice complaint interface:

1. User clicks **Record** → `MediaRecorder` API captures audio (WebM)
2. Audio blob sent to `POST /api/agent/respond` as multipart form
3. Backend: Sarvam STT → Gemini NLU → extract zone/issue → insert complaint → Sarvam TTS
4. Response: transcript, extracted data, complaint logged status, base64 audio reply
5. Frontend plays TTS audio confirmation in Hindi

**Conversation state machine:**
```
IDLE → RECORDING → PROCESSING → REPLY_PLAYING → IDLE
```

### `ApiRuntimeBridge.tsx`

Dynamic backend URL configuration component. Detects whether the app is running:

- **Locally** → connects to `http://localhost:5001`
- **On Netlify** → connects to configured backend URL
- **Custom** → reads from environment variable `NEXT_PUBLIC_API_URL`

Exposes `getApiUrl()` utility function used by all data-fetching components.

### `PageTransition.tsx`

Framer Motion wrapper that applies fade + slide-up animation on route changes:

```tsx
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.25 }}
>
  {children}
</motion.div>
```

---

## Design System

The entire visual identity lives in `globals.css` (33 KB). Key design tokens:

### Color Palette

| Token | Value | Usage |
|:---|:---|:---|
| `--primary` | `#C1440E` | Accents, CTAs, active navigation, alerts |
| `--secondary` | `#D4A96A` | Gold accents, hover states, secondary text |
| `--surface` | `#F8F5F0` | Page backgrounds, card backgrounds |
| `--text-heading` | `#3A2C1E` | Headings, primary text |
| `--text-body` | `#6B5D4D` | Body text, descriptions |
| `--green` | `#7A8C5E` | Success, low-priority zones, OK status |

### Typography

| Role | Font | Weight |
|:---|:---|:---|
| Headings | Playfair Display | 700 |
| Body | Inter | 400, 500, 600 |
| Monospace / Data | Space Mono | 400, 700 |

### Component Patterns

- **Cards** — `border-radius: 14px`, `background: white`, `box-shadow: 0 1px 3px rgba(0,0,0,0.06)`
- **Buttons** — `background: var(--primary)`, `border-radius: 8px`, hover scale `1.02`
- **Status pills** — Rounded badges with semantic colors (red/amber/green)
- **KPI cards** — Monospace label + large number + sub-description

---

## Landing Page Technical Details

The landing page (`page.tsx`, 514 lines) is a standalone experience with:

### Three.js City (`useEffect` #2)

- **120 buildings** placed on a 20×20 grid with 4px cell size
- Buildings in center (dist < 5) are taller (8-18 units) vs. periphery (2-10 units)
- **Breathing animation**: `scale.y = baseH × (1 + 0.15 × sin(t × speed + offset))`
- **8 truck particles** moving along 4 road paths with additive blending
- **Mouse parallax**: scene rotates ±0.28° based on cursor position
- **Performance**: `pixelRatio: min(devicePixelRatio, 1.5)`, `FogExp2` for draw distance
- **Visibility culling**: animation pauses when hero section leaves viewport

### Interactive Features

| Feature | Implementation |
|:---|:---|
| **Live ticker** | CSS `@keyframes ticker-scroll` infinite loop, 8 pre-built alert messages |
| **Counter animation** | `IntersectionObserver` triggers cubic easing counter from 0 to target value |
| **Feature flip-cards** | Click/Enter toggles `.flipped` class → CSS `rotateY(180deg)` with `backface-visibility` |
| **Pipeline pulse** | `setInterval(800ms)` cycles `.active` class through 7 pipeline circles |
| **Scenario runner** | Click expands card, `setTimeout(200ms × i)` sequentially re-colors grid cells |
| **Tech marquee** | Two rows with `animation-direction: normal | reverse` for opposing scroll |
| **Scroll reveals** | `IntersectionObserver` with `threshold: 0.15` adds `.visible` class |

---

## Data Fetching Pattern

All pages follow the same pattern:

```typescript
// 1. Determine backend URL
const API_URL = getApiUrl();

// 2. Fetch on mount + interval
useEffect(() => {
  const fetchData = async () => {
    const res = await fetch(`${API_URL}/api/dashboard`);
    const data = await res.json();
    setState(data);
  };

  fetchData();
  const interval = setInterval(fetchData, 10000); // 10s polling

  return () => clearInterval(interval);
}, []);
```

**No loading skeletons** — pages render immediately with the previous state, updating seamlessly on each poll cycle.

---

## Development

### Prerequisites

- Node.js 18+
- Backend running on `http://localhost:5001` (see [Backend Docs](../BACKEND.md))

### Install & Run

```bash
cd nagarflow-next
npm install
npm run dev
# → http://localhost:3000
```

### Build for Production

```bash
npm run build
npm start
```

### Deploy to Netlify

The repo includes `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = ".next"
```

The live deployment is at [nagarflow.netlify.app](https://nagarflow.netlify.app/).

---

## File Structure

```
nagarflow-next/
├── app/
│   ├── page.tsx                    # Landing (514 lines — Three.js + features)
│   ├── layout.tsx                  # Root layout with metadata
│   ├── globals.css                 # Design system (33 KB)
│   ├── page.module.css             # Landing page-specific styles
│   ├── favicon.ico                 # NagarFlow icon
│   │
│   ├── login/page.tsx              # Auth gate
│   ├── dashboard/page.tsx          # Operations center
│   ├── complaints/page.tsx         # Complaint insights
│   ├── complaint-simulator/page.tsx# Chat interface
│   ├── predictions/page.tsx        # Zone priority table
│   ├── dispatch/page.tsx           # Fleet dispatch
│   ├── maintenance/page.tsx        # Task tracker
│   ├── simulation/page.tsx         # Digital twin
│   ├── reports/page.tsx            # KPI reports
│   ├── emergency/page.tsx          # Weather overlay
│   ├── agencies/page.tsx           # Agency directory
│   │
│   └── components/
│       ├── DashboardShell.tsx      # Sidebar + layout (6 KB)
│       ├── VoiceConversation.tsx   # Voice agent (24 KB)
│       ├── ApiRuntimeBridge.tsx    # Backend URL config (18 KB)
│       └── PageTransition.tsx      # Framer Motion wrapper
│
├── public/                         # Static assets
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── next.config.ts                  # Next.js config
├── netlify.toml                    # Netlify deploy config
└── eslint.config.mjs               # Linting rules
```

---

## Screenshots

| Landing | Dashboard | Simulation |
|:---:|:---:|:---:|
| <img src="../docs/screenshots/landing.png" alt="Landing" width="100%"/> | <img src="../docs/screenshots/dashboard.png" alt="Dashboard" width="100%"/> | <img src="../docs/screenshots/simulation.png" alt="Simulation" width="100%"/> |

| Complaints | Dispatch | Reports |
|:---:|:---:|:---:|
| <img src="../docs/screenshots/complaints.png" alt="Complaints" width="100%"/> | <img src="../docs/screenshots/dispatch.png" alt="Dispatch" width="100%"/> | <img src="../docs/screenshots/reports.png" alt="Reports" width="100%"/> |

---

<div align="center">

[← Main README](../README.md) · [Backend Docs →](../BACKEND.md) · [Deployment →](../DEPLOYMENT.md)

</div>
