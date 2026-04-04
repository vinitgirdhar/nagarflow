'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  Network, SlidersHorizontal, MessageSquare, Globe2, TrendingUp, 
  CloudLightning, MonitorPlay, Users, BrainCircuit, FileBarChart,
  Radio, Scale, Calculator, Bot, Map, FileOutput, ChevronDown
} from 'lucide-react';


const TICKER_ALERTS = [
  '⬡ Zone 7 — demand surge +38% — 3 trucks pre-positioned 48hrs ahead',
  '◈ Rainstorm Protocol #3 ACTIVE — 12 routes auto-reconfigured, risky roads avoided',
  '◉ Equity gap corrected: Ward 2 under-served — 2 tankers rerouted before complaints',
  '◆ RL Dispatcher suggestion accepted — avg response time −4.2 min, fuel saved 15%',
  '▲ Surge forecast: Festival Ward 9 — NLP detected social media buzz 48hrs early',
  '✦ Auto report generated — 94.1% prediction accuracy, 72% fewer missed services',
  '⊕ Multi-agency conflict resolved: Sanitation vs Maintenance scheduling overlap fixed',
  '⊛ Digital Twin simulation run — fleet overload at 40% demand increase confirmed',
];

const STATS_DATA = [
  { label: 'Prediction Accuracy', num: 94.1, suffix: '%', sub: 'AI Demand Forecast' },
  { label: 'Missed Services', num: 72, prefix: '−', suffix: '%', sub: 'Reduction vs Reactive' },
  { label: 'Advance Warning Window', num: 48, suffix: 'hr', sub: 'Pre-positioning Lead Time' },
  { label: 'Fleet Fuel Saved', num: 15.5, prefix: '−', suffix: '%', sub: 'Operational Efficiency' },
  { label: 'Operator Adoption', num: 96.3, suffix: '%', sub: 'Platform Accept Rate' },
];

const FEATURES_DATA = [
  { id: 'F01', icon: Scale, name: 'Equity-Corrected Demand Engine', value: 'Poor areas served even without complaints', desc: 'Calculates expected vs actual complaints per ward. When actual < expected, priority is amplified. Systemic under-reporting in low-income wards is corrected to guarantee proportional resource dispatch.', tech: ['XGBoost', 'GeoPandas', 'NetworkX'], wide: true },
  { id: 'F02', icon: SlidersHorizontal, name: 'Dual-Layer Map + Time Slider', value: 'Forecast vs reality time-scrub UI', desc: 'Side-by-side heatmap layers let operators toggle between prediction and live complaint data. Drag the time slider to scrub through 48-hour windows and verify AI accuracy.', tech: ['Leaflet.js', 'React', 'Prophet'] },
  { id: 'F03', icon: MessageSquare, name: 'NLP Complaint Intelligence', value: 'Urgency, emotion & category from 311 text', desc: 'Fine-tuned BERT model classifies incoming 311 service requests by urgency, location, and service type. "Road collapsed" is prioritised; "grass is long" is not.', tech: ['HuggingFace', 'spaCy', 'FastAPI'] },
  { id: 'F04', icon: Globe2, name: 'Social Media Demand Miner', value: 'Twitter & Reddit fill silent reporting gaps', desc: 'Mines geo-tagged posts on Twitter and Reddit using BERT classification. Detects "flood here", "garbage piled up" and other hidden problems where formal 311 reporting is absent.', tech: ['Tweepy', 'PRAW', 'BERT'] },
  { id: 'F05', icon: TrendingUp, name: 'Predictive Surge Forecaster', value: '48-hour calendar-aware pre-positioning', desc: 'Combines historical demand, calendar events (festivals, elections, matches) and weather signals to forecast surge demand 48 hours ahead for proactive fleet staging.', tech: ['XGBoost', 'Prophet', 'NOAA API'] },
  { id: 'F06', icon: CloudLightning, name: 'Weather Emergency Protocols', value: 'Auto fleet reconfiguration on weather triggers', desc: 'State machine (Clear→Alert→Warning→Emergency→Recovery) autonomously reconfigures fleet, avoids risky roads, and pre-deploys resources based on NOAA weather feeds — no human needed.', tech: ['NOAA API', 'OR-Tools', 'Redis'] },
  { id: 'F07', icon: MonitorPlay, name: 'Digital Twin Simulator', value: 'What-if sandbox before committing resources', desc: 'Full discrete-event simulation. Operators run scenarios — "What if demand +40%?", "What if trucks break?" — and see outcomes on a live map before making real-world decisions.', tech: ['SimPy', 'PostgreSQL', 'FastAPI'] },
  { id: 'F08', icon: Users, name: 'Multi-Agency Coordination Hub', value: 'Garbage + Water + Maintenance on one board', desc: 'Graph-based conflict detection identifies resource overlaps between sanitation, water, and maintenance departments. Automatically negotiates priority and prevents duplicate routing.', tech: ['NetworkX', 'GCN', 'OR-Tools'] },
  { id: 'F09', icon: BrainCircuit, name: 'RL Autonomous Dispatcher', value: 'PPO agent: max coverage, min fuel, min time', desc: 'Proximal Policy Optimization agent trained on historical dispatch scenarios. Suggests which truck goes where with full reasoning. Operators can accept or override every suggestion.', tech: ['Stable-Baselines3', 'PyTorch', 'Redis'] },
  { id: 'F10', icon: FileBarChart, name: 'Auto Report Generator', value: 'End-of-day LLM-generated KPI PDF', desc: 'AI pipeline compiles zone coverage, missed deployments, equity scores, prediction accuracy, and operator decisions into a structured PDF daily report with charts and recommendations.', tech: ['Claude API', 'FastAPI', 'PostgreSQL'], full: true },
];

const PIPELINE_NODES = [
  { icon: Radio, label: 'APIs + Social', tip: '311 complaints, Twitter, Reddit, NOAA' },
  { icon: MessageSquare, label: 'NLP Engine', tip: 'Urgency, emotion & category extraction' },
  { icon: Scale, label: 'Equity Engine', tip: 'Bias-corrected demand amplification' },
  { icon: Calculator, label: 'Prediction Index', tip: '48-hr XGBoost + Prophet forecast' },
  { icon: Bot, label: 'RL Dispatcher', tip: 'PPO agent: optimal fleet routing' },
  { icon: Map, label: 'Live Dashboard', tip: 'Heatmap, dispatch, alerts' },
  { icon: FileOutput, label: 'Auto Report', tip: 'LLM-generated daily KPI PDF' },
];

const SCENARIOS_DATA = [
  { name: 'S1 — Normal Day', cells: ['H','H','M','L','H','M','L','L','M','L','L','E','L','E','L','L'], metrics: ['Trucks Active: 4', 'NLP Flags: 1 Critical'], desc: 'Standard weekday. NLP flags 1 critical complaint. Equity toggle reveals Ward 3 reporting gap — 1 tanker rerouted before complaints arrive. RL dispatcher optimises fuel.', runColors: ['H','H','M','L','H','H','L','L','M','L','H','E','L','E','L','H'] },
  { name: 'S2 — Rainstorm Protocol', cells: ['M','M','M','M','M','M','M','M','M','M','M','M','M','M','M','M'], metrics: ['Routes Reconfigured: 12', 'Protocol: AMBER / AUTO'], desc: 'Heavy rain alert triggers Emergency Protocol #3 automatically. 12 routes reconfigured, risky roads flagged, priority zones pre-loaded — no human intervention required.', runColors: ['H','H','H','M','H','H','H','M','H','M','H','H','M','H','H','H'] },
  { name: 'S3 — What-If: +40% Surge', cells: ['L','L','L','L','L','H','H','L','L','H','H','L','L','L','L','L'], metrics: ['Fleet Overload: YES', 'Reserve Suggested: 2'], desc: 'Digital Twin simulation: Zone 5 demand +40%. Fleet overload alert fires. PPO optimizer suggests pre-positioning 2 reserve trucks. Operator reviews — no real resources committed yet.', runColors: ['L','L','L','L','L','H','H','M','L','H','H','H','L','H','L','L'] },
];

const CELL_COLORS: Record<string, string> = { H: '#C1440E', M: '#D4A96A', L: '#7A8C5E', E: '#3a2c1e' };

const TECH_ROW1 = [
  { name: 'PyTorch', cat: 'ml', tip: 'Deep learning framework' },
  { name: 'HuggingFace', cat: 'ml', tip: 'Transformer model hub' },
  { name: 'spaCy', cat: 'ml', tip: 'NLP pipeline' },
  { name: 'XGBoost', cat: 'ml', tip: 'Gradient boosting forecaster' },
  { name: 'Stable-Baselines3', cat: 'ml', tip: 'PPO RL algorithms' },
  { name: 'SimPy', cat: 'ml', tip: 'Discrete event simulation' },
  { name: 'Prophet', cat: 'ml', tip: 'Time-series forecasting' },
  { name: 'BERT', cat: 'ml', tip: 'Complaint classification model' },
  { name: 'GCN', cat: 'ml', tip: 'Graph neural network' },
];
const TECH_ROW2 = [
  { name: 'FastAPI', cat: 'infra', tip: 'Python REST API backend' },
  { name: 'OR-Tools', cat: 'infra', tip: 'Route optimisation solver' },
  { name: 'Redis', cat: 'infra', tip: 'Real-time in-memory store' },
  { name: 'PostgreSQL', cat: 'infra', tip: 'Relational data store' },
  { name: 'React', cat: 'infra', tip: 'Dashboard UI library' },
  { name: 'Leaflet.js', cat: 'infra', tip: 'Interactive heatmap maps' },
  { name: 'GeoPandas', cat: 'infra', tip: 'Geospatial analysis' },
  { name: 'NetworkX', cat: 'infra', tip: 'Multi-agency conflict graph' },
  { name: 'Claude API', cat: 'api', tip: 'LLM daily report generation' },
  { name: 'NOAA API', cat: 'api', tip: 'Weather emergency feed' },
  { name: 'Tweepy', cat: 'api', tip: 'Twitter/X social miner' },
  { name: 'PRAW', cat: 'api', tip: 'Reddit demand signal miner' },
];

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Cursor
    const cursor = cursorRef.current;
    if (!cursor) return;
    const onMove = (e: MouseEvent) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    };
    document.addEventListener('mousemove', onMove);

    // Nav visibility
    const nav = navRef.current;
    const hero = heroRef.current;
    if (nav && hero) {
      const obs = new IntersectionObserver(([e]) => {
        nav.classList.toggle('visible', !e.isIntersecting);
      }, { threshold: 0.1 });
      obs.observe(hero);
    }

    // Scroll reveals
    const revObs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal,.reveal-card').forEach(el => revObs.observe(el));

    // Counters
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const cntObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement;
        const target = parseFloat(el.dataset.target || '0');
        const suffix = el.dataset.suffix || '';
        const prefix = el.dataset.prefix || '';
        const isFloat = (el.dataset.target || '').includes('.');
        const start = performance.now();
        const dur = 1800;
        function step(now: number) {
          const p = Math.min((now - start) / dur, 1);
          const val = target * ease(p);
          el.textContent = prefix + (isFloat ? val.toFixed(1) : Math.round(val)) + suffix;
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        cntObs.unobserve(el);
      });
    }, { threshold: 0.2 });
    document.querySelectorAll('[data-target]').forEach(el => cntObs.observe(el));

    // Pipeline pulse
    const circles = document.querySelectorAll('.pipeline__circle');
    let cur = 0;
    const pulse = () => {
      circles.forEach(c => c.classList.remove('active'));
      if (circles[cur]) circles[cur].classList.add('active');
      cur = (cur + 1) % circles.length;
    };
    pulse();
    const pInterval = setInterval(pulse, 800);

    // Feature cards flip
    document.querySelectorAll('.feature-card').forEach(card => {
      card.addEventListener('click', () => card.classList.toggle('flipped'));
      card.addEventListener('keydown', (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') card.classList.toggle('flipped');
      });
    });

    // Scenario cards
    const scenCards = document.querySelectorAll('.scenario-card');
    const resetScenarios = () => {
      scenCards.forEach((card, i) => {
        card.classList.remove('expanded', 'collapsed');
        const cells = card.querySelectorAll('.scenario-cell');
        SCENARIOS_DATA[i].cells.forEach((c, j) => {
          (cells[j] as HTMLElement).style.background = CELL_COLORS[c];
        });
      });
    };
    scenCards.forEach(card => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('scenario-card__close')) {
          resetScenarios(); return;
        }
        if (card.classList.contains('expanded')) return;
        resetScenarios();
        card.classList.add('expanded');
        scenCards.forEach(c => { if (c !== card) c.classList.add('collapsed'); });
        const idx = +(card as HTMLElement).dataset.idx!;
        const cells = card.querySelectorAll('.scenario-cell');
        SCENARIOS_DATA[idx].runColors.forEach((c, i) => {
          setTimeout(() => { (cells[i] as HTMLElement).style.background = CELL_COLORS[c]; }, i * 200);
        });
      });
    });

    // Nav smooth scroll
    document.querySelectorAll('[data-section]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const href = (link as HTMLAnchorElement).getAttribute('href');
        if (href) document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    return () => {
      document.removeEventListener('mousemove', onMove);
      clearInterval(pInterval);
    };
  }, []);

  // Three.js init
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: any = null;
    let animId: number | null = null;
    let mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
    let resizeHandler: (() => void) | null = null;

    const initThree = () => {
      const THREE = (window as any).THREE;
      if (!THREE || !canvas) return;
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xF8F5F0, 0.018);
      const camera = new THREE.PerspectiveCamera(45, canvas.offsetWidth / canvas.offsetHeight, 0.1, 500);
      camera.position.set(0, 60, 40);
      camera.lookAt(0, 0, 0);
      const ambient = new THREE.AmbientLight(0xC0A888, 0.8);
      scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffd4a0, 1.2);
      dir.position.set(10, 20, 10);
      scene.add(dir);
      const COLS = [0xC1440E, 0x9E3A0C, 0xD4A96A, 0x7A5C3A];
      const GRID = 20, CELL = 4;
      const buildings: any[] = [];
      const roadGeo = new THREE.BufferGeometry();
      const roadPts: number[] = [];
      for (let i = -GRID / 2; i <= GRID / 2; i++) {
        roadPts.push(-GRID * CELL / 2, 0, i * CELL, GRID * CELL / 2, 0, i * CELL);
        roadPts.push(i * CELL, 0, -GRID * CELL / 2, i * CELL, 0, GRID * CELL / 2);
      }
      roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPts, 3));
      const roadMat = new THREE.LineDashedMaterial({ color: 0xC8B89A, opacity: .5, transparent: true, dashSize: 1, gapSize: 1 });
      const roads = new THREE.LineSegments(roadGeo, roadMat);
      roads.computeLineDistances();
      scene.add(roads);
      for (let i = 0; i < 120; i++) {
        const gx = Math.floor(Math.random() * GRID) - GRID / 2;
        const gz = Math.floor(Math.random() * GRID) - GRID / 2;
        const distToCenter = Math.sqrt(gx * gx + gz * gz);
        const isCenter = distToCenter < 5;
        const baseH = isCenter ? 8 + Math.random() * 10 : 2 + Math.random() * 8;
        const geo = new THREE.BoxGeometry(CELL * .7, baseH, CELL * .7);
        const mat = new THREE.MeshLambertMaterial({ color: COLS[Math.floor(Math.random() * COLS.length)] });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(gx * CELL, baseH / 2, gz * CELL);
        mesh.userData = { baseH, offset: Math.random() * Math.PI * 2, fast: isCenter };
        scene.add(mesh);
        buildings.push(mesh);
      }
      const truckMat = new THREE.PointsMaterial({ color: 0xE8933A, size: .8, blending: THREE.AdditiveBlending });
      const roadPaths = [
        [{ x: -GRID * CELL / 2, z: 0 }, { x: GRID * CELL / 2, z: 0 }],
        [{ x: 0, z: -GRID * CELL / 2 }, { x: 0, z: GRID * CELL / 2 }],
        [{ x: -20, z: -20 }, { x: 20, z: 20 }],
        [{ x: 20, z: -20 }, { x: -20, z: 20 }],
      ];
      const trucks: any[] = [];
      for (let t = 0; t < 8; t++) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3), 3));
        const m = new THREE.Points(g, truckMat.clone());
        scene.add(m);
        trucks.push({ mesh: m, t: Math.random(), path: roadPaths[t % roadPaths.length], speed: .0015 + Math.random() * .001 });
      }
      let mx = 0, my = 0, tx = 0, ty = 0;
      mouseMoveHandler = (e: MouseEvent) => {
        mx = (e.clientX / window.innerWidth - .5) * .28;
        my = (e.clientY / window.innerHeight - .5) * .28;
      };
      document.addEventListener('mousemove', mouseMoveHandler);
      const clock = new THREE.Clock();
      let isVisible = true;
      const heroElem = document.getElementById('hero');
      if (heroElem) new IntersectionObserver(([e]) => { isVisible = e.isIntersecting; }, { threshold: 0.01 }).observe(heroElem);
      resizeHandler = () => {
        const W = canvas.offsetWidth, H = canvas.offsetHeight;
        camera.aspect = W / H; camera.updateProjectionMatrix();
        renderer.setSize(W, H);
      };
      window.addEventListener('resize', resizeHandler);
      function animate() {
        animId = requestAnimationFrame(animate);
        if (!isVisible) return;
        const t = clock.getElapsedTime();
        tx += (mx - tx) * .05;
        ty += (my - ty) * .05;
        scene.rotation.y = tx;
        scene.rotation.x = ty;
        buildings.forEach(b => {
          const spd = b.userData.fast ? 2 : 1;
          const h = b.userData.baseH * (1 + .15 * Math.sin(t * spd + b.userData.offset));
          b.scale.y = h / b.userData.baseH;
          b.position.y = h / 2;
        });
        trucks.forEach(tr => {
          tr.t = (tr.t + tr.speed) % 1;
          const p = tr.path;
          const x = p[0].x + (p[1].x - p[0].x) * tr.t;
          const z = p[0].z + (p[1].z - p[0].z) * tr.t;
          const pos = tr.mesh.geometry.attributes.position;
          pos.setXYZ(0, x, .5, z);
          pos.needsUpdate = true;
        });
        renderer.render(scene, camera);
      }
      animate();
    };

    if ((window as any).THREE) {
      initThree();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.defer = true;
      script.onload = initThree;
      document.head.appendChild(script);
    }

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
      if (mouseMoveHandler) document.removeEventListener('mousemove', mouseMoveHandler);
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      if (renderer) { renderer.dispose(); renderer = null; }
    };
  }, []);

  const tickerContent = [...TICKER_ALERTS, ...TICKER_ALERTS].map((t, i) => (
    <span key={i}><span className="ticker__item">{t}</span><span className="ticker__sep">|</span></span>
  ));

  return (
    <>
      <div id="cursor" ref={cursorRef}></div>

      {/* TICKER */}
      <div className="ticker" role="marquee" aria-label="Live city alerts">
        <div className="ticker__track" ref={tickerRef}>{tickerContent}</div>
      </div>

      {/* NAV */}
      <nav className="nav" id="nav" ref={navRef} aria-label="Main navigation">
        <span className="nav__logo">NagarFlow</span>
        <ul className="nav__links">
          <li><a href="#features" data-section="features">Features</a></li>
          <li><a href="#pipeline" data-section="pipeline">Pipeline</a></li>
          <li><a href="#scenarios" data-section="scenarios">Scenarios</a></li>
          <li><a href="#tech" data-section="tech">Tech Stack</a></li>
        </ul>
      </nav>

      {/* HERO */}
      <section className="hero" id="hero" ref={heroRef} aria-label="Hero">
        <canvas id="city-canvas" ref={canvasRef}></canvas>
        <div className="hero__fog"></div>
        <div className="hero__noise" style={{ filter: 'url(#noise-filter)', background: 'var(--text-heading)' }}></div>
        <div className="hero__content reveal">
          <h1 className="hero__title">NagarFlow</h1>
          <p className="hero__tagline">The city&apos;s brain. Predict. Dispatch. Learn.</p>
          <p className="hero__sub">Zero hardware · 48-hr forecast · Equity-first dispatch</p>
          <Link href="/login" className="hero__cta" id="hero-cta">Enter Dashboard →</Link>
        </div>
        <div className="hero__chevron" aria-hidden="true"><ChevronDown size={32} /></div>
      </section>

      {/* STATS */}
      <section className="stats" id="stats" aria-label="Key statistics">
        <div className="stats__grid">
          {STATS_DATA.map((s, i) => (
            <div key={i} className="stats__item reveal">
              <div className="stats__label mono">{s.label}</div>
              <div className="stats__num mono" data-target={s.num} data-suffix={s.suffix || ''} data-prefix={s.prefix || ''}>
                {s.prefix || ''}0{s.suffix || ''}
              </div>
              <div className="stats__sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features" aria-label="Platform features">
        <h2 className="section-title reveal">10 Intelligence Modules</h2>
        <div className="features__grid">
          {FEATURES_DATA.map(f => {
            const Icon = f.icon;
            return (
            <div key={f.id} className={`feature-card reveal-card ${f.wide ? 'feature-card--wide' : ''} ${f.full ? 'feature-card--full' : ''}`} tabIndex={0} role="button" aria-label={f.name}>
              <div className="feature-card__inner">
                <div className="feature-card__front">
                  <div className="card__id mono">{f.id}</div>
                  <div className="card__icon"><Icon size={28} strokeWidth={1.5} /></div>
                  <h3 className="card__name">{f.name}</h3>
                  <p className="card__value-text">{f.value}</p>
                </div>
                <div className="feature-card__back">
                  <div className="card__id mono" style={{ color: 'rgba(242,232,217,.6)' }}>{f.id}</div>
                  <div className="card__icon" style={{ color: 'var(--surface)' }}><Icon size={28} strokeWidth={1.5} /></div>
                  <h3 className="card__back-name">{f.name}</h3>
                  <p className="card__back-desc">{f.desc}</p>
                  <div className="card__pills">
                    {(f.tech || []).map(t => <span key={t} className="card__pill">{t}</span>)}
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </section>

      <hr className="section-divider" />

      {/* PIPELINE */}
      <section className="pipeline" id="pipeline" aria-label="How it works">
        <h2 className="section-title reveal">How It Works</h2>
        <p className="pipeline__subtitle reveal">Seven-stage urban intelligence pipeline — raw data to live dispatch</p>
        <div className="pipeline__row">
          {PIPELINE_NODES.map((n, i) => {
            const Icon = n.icon;
            return (
            <div key={i} className="pipeline__node">
              <div className="pipeline__circle" data-idx={i}>
                <Icon size={26} strokeWidth={1.5} />
                <div className="pipeline__tooltip">{n.tip}</div>
              </div>
              <div className="pipeline__label mono">{n.label}</div>
            </div>
            );
          })}
        </div>
      </section>

      <hr className="section-divider" />

      {/* SCENARIOS */}
      <section className="scenarios" id="scenarios" aria-label="Demo scenarios">
        <h2 className="section-title reveal">Live Demo Scenarios</h2>
        <div className="scenarios__row">
          {SCENARIOS_DATA.map((s, i) => (
            <div key={i} className="scenario-card" data-idx={i} tabIndex={0} role="button" aria-label={s.name}>
              <div className="scenario-card__top"></div>
              <div className="scenario-card__inner">
                <h3 className="scenario-card__name">{s.name}</h3>
                <div className="scenario-card__grid">
                  {s.cells.map((c, j) => (
                    <div key={j} className="scenario-cell" style={{ background: CELL_COLORS[c] }}></div>
                  ))}
                </div>
                <div className="scenario-card__metrics mono">{s.metrics[0]}<br />{s.metrics[1]}</div>
                <div className="scenario-card__status mono">▶ Scenario running...</div>
                <button className="scenario-card__close" aria-label="Close scenario">✕</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TECH MARQUEE */}
      <section className="tech" id="tech" aria-label="Technology stack">
        <div className="tech__row tech__row--fwd">
          {[...TECH_ROW1, ...TECH_ROW1].map((item, i) => (
            <span key={i} className={`tech__item tech__item--${item.cat}`} tabIndex={0}>
              {item.name}<span className="tech__tip">{item.tip}</span>
            </span>
          ))}
        </div>
        <div className="tech__row tech__row--rev">
          {[...TECH_ROW2, ...TECH_ROW2].map((item, i) => (
            <span key={i} className={`tech__item tech__item--${item.cat}`} tabIndex={0}>
              {item.name}<span className="tech__tip">{item.tip}</span>
            </span>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer" id="footer">
        <div className="footer__center reveal">
          <div className="footer__name">NagarFlow</div>
          <div className="footer__sub">Zero Hardware. Total Intelligence. 100% Software.</div>
        </div>
        <div className="footer__bottom">
          <span className="footer__copy">Smart City Platform · Hackathon MVP · 10 Features · 36-Hour Sprint</span>
          <div className="footer__status">
            <span className="footer__dot"></span>
            <span className="mono">System Online</span>
          </div>
        </div>
      </footer>
    </>
  );
}
