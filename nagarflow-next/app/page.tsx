"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowUpRight, Layers3, Radio, Route, Search, ChartNoAxesCombined, Pause, Play, Check } from "lucide-react";
import styles from "./landing.module.css";

const tools = [
  { icon: Radio, title: "Complaints", text: "Review reports. Assign work.", href: "/complaints" },
  { icon: Route, title: "Fleet & teams", text: "Send the right people and vehicles.", href: "/dispatch" },
  { icon: Search, title: "Knowledge", text: "Find guidance with sources.", href: "/knowledge" },
  { icon: ChartNoAxesCombined, title: "Forecasts", text: "Plan for upcoming demand.", href: "/predictions" },
];
const previews = [
  { tab: "Reports", title: "Know what needs fixing.", text: "Check the location and service, then create a work order.", rows: [["Incoming report", "Received"], ["Location & service", "Review"], ["Work order", "Next step"]] },
  { tab: "Dispatch", title: "Send the right team.", text: "Check availability, assign work and confirm arrival.", rows: [["Available resources", "Checked"], ["Assignment", "Confirmed"], ["Arrival", "Operator review"]] },
  { tab: "Knowledge", title: "Find the right guidance.", text: "Search approved documents and open the source.", rows: [["Approved documents", "Searchable"], ["Supporting excerpt", "Cited"], ["Missing evidence", "Unavailable"]] },
  { tab: "Forecasts", title: "Plan the next day’s work.", text: "Compare expected demand with past results.", rows: [["Past demand", "Compared"], ["Expected volume", "Estimated"], ["Old or sparse data", "Unavailable"]] },
];

function City() {
  return <svg className={styles.city} viewBox="0 0 1200 620" fill="none" aria-hidden="true">
    <defs><linearGradient id="cityFade" x1="600" y1="30" x2="600" y2="620" gradientUnits="userSpaceOnUse"><stop stopColor="#c1440e" stopOpacity=".02"/><stop offset=".6" stopColor="#c1440e" stopOpacity=".2"/><stop offset="1" stopColor="#c1440e" stopOpacity=".04"/></linearGradient></defs>
    <g stroke="url(#cityFade)" strokeWidth="1">{Array.from({length:17},(_,i)=><path key={i} d={`M ${-400+i*100} 0 l 1100 635 M ${500+i*100} 0 l -1100 635`}/>)}</g>
    <g className={styles.cityBlocks}>{Array.from({length:26},(_,i)=>{const x=110+(i%9)*122+(Math.floor(i/9)%2)*40;const y=250+Math.floor(i/9)*132-(i%3)*25;const h=22+(i*37)%100;return <g key={i} style={{animationDelay:`${i*-.37}s`}}><path d={`M${x} ${y-h} l34 -19 34 19 -34 20Z`} fill="#f3e7d8" stroke="#cfbba5"/><path d={`M${x} ${y-h} l34 20 v${h} l-34 -20Z`} fill="#eee0cc" stroke="#d3c0a8"/><path d={`M${x+34} ${y-h+20} l34 -20 v${h} l-34 20Z`} fill="#f9f3e8" stroke="#d3c0a8"/><path d={`M${x+43} ${y-h+27} l17 -10 m-17 24 17 -10 m-17 24 17 -10`} stroke="#bb9c7e" opacity=".55"/></g>})}</g>
    <g className={styles.cityRoutes} stroke="#c1440e" strokeWidth="2"><path d="M150 400 430 240 720 407 1000 245"/><path d="M230 240 520 407 800 245 1090 412"/><path d="M350 520 630 358 910 520"/></g>
    <g className={styles.cityTraffic}>{['M150 400 430 240 720 407 1000 245','M230 240 520 407 800 245 1090 412','M350 520 630 358 910 520'].map((path,i)=><g key={path}><circle data-testid="city-courier" r="8" fill="#fff5df" stroke="#b84925" strokeWidth="2" className={styles.courier} style={{offsetPath:`path("${path}")`,animationDelay:`${i*-4}s`}}/><circle r="3" fill="#b84925" className={styles.courier} style={{offsetPath:`path("${path}")`,animationDelay:`${i*-4}s`}}/></g>)}</g>
    {[[430,240],[720,407],[800,245],[350,520]].map(([x,y],i)=><g key={x}><circle cx={x} cy={y} r="16" fill="#c1440e" opacity=".08" className={styles.mapPulse} style={{animationDelay:`${i*.7}s`}}/><circle cx={x} cy={y} r="4" fill="#c1440e" stroke="#fff9ed" strokeWidth="3"/></g>)}
  </svg>;
}


export default function Home() {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const cityY = useTransform(scrollY, [0, 700], [0, 70]);
  const cityX = useSpring(0, { stiffness: 65, damping: 22 });
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const preview = previews[active];
  const reveal = { initial: reduced ? false as const : { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .1 }, transition: { duration: .35 } };

  return <main className={styles.landing} data-motion={paused ? "paused" : "playing"}>
    <header className={styles.nav}>
      <Link href="/" className={styles.brand} aria-label="NagarFlow home"><Layers3 size={23} />NagarFlow</Link>
      <nav aria-label="Main navigation">
        <a href="#workflow" className={styles.navExplore}>How it works</a>
        <button type="button" className={styles.motionToggle} aria-label={paused ? "Resume background animations" : "Pause background animations"} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={13} /> : <Pause size={13} />}</button>
        <Link href="/login" className={styles.navCta}>Sign in <ArrowUpRight size={14} /></Link>
      </nav>
    </header>

    <section className={styles.hero} aria-labelledby="hero-heading" onPointerMove={e => { if (reduced || paused || e.pointerType !== "mouse") return; const box = e.currentTarget.getBoundingClientRect(); cityX.set((e.clientX - box.left - box.width / 2) / box.width * 22); }} onPointerLeave={() => cityX.set(0)}>
      <div className={styles.heroGlow} aria-hidden="true" />
      <motion.div className={styles.cityStage} style={{ x: reduced || paused ? 0 : cityX, y: reduced || paused ? 0 : cityY }} aria-hidden="true"><City /></motion.div>
      <div className={styles.heroContent}>
        <p className={styles.eyebrow}>FOR MUNICIPAL TEAMS</p>
        <h1 id="hero-heading"><span className={styles.titleWord}>City complaints.</span><br /><em className={styles.titleWord}>Clear action.</em></h1>
        <p className={styles.heroIntro}><strong>Complaints get lost between teams.</strong><br />Track reports, assign work and verify the result.</p>
        <Link href="/login" className={styles.primary} aria-label="Sign in to your workspace">Open your workspace <ArrowUpRight size={17} /></Link>
      </div>
    </section>

    <ol className={styles.steps} aria-label="From complaint to resolution">
      <li><span>01</span><div><strong>Report</strong><small>Know the issue</small></div></li>
      <li><span>02</span><div><strong>Assign</strong><small>Give it an owner</small></div></li>
      <li><span>03</span><div><strong>Verify</strong><small>Check the result</small></div></li>
    </ol>

    <section id="platform" className={styles.platform}>
      <h2>The tools to get it done.</h2>
      <div className={styles.toolGrid}>{tools.map(tool => <motion.div key={tool.title} {...reveal}><Link href={tool.href} className={styles.toolCard}><tool.icon size={21} strokeWidth={1.5} /><h3>{tool.title}</h3><p>{tool.text}</p><ArrowUpRight size={15} className={styles.toolArrow} /></Link></motion.div>)}</div>
    </section>

    <section id="workflow" className={styles.workflow}>
      <div className={styles.workflowHeading}><h2>See how it works.</h2><span>WORKFLOW PREVIEW</span></div>
      <div className={styles.tabs} role="tablist" aria-label="Explore the service workflow">{previews.map((item, i) => <button key={item.tab} id={`flow-tab-${i}`} type="button" role="tab" aria-selected={active === i} aria-controls="flow-panel" tabIndex={active === i ? 0 : -1} onClick={() => setActive(i)} onKeyDown={e => { let next = active; if (e.key === "ArrowRight") next = (active + 1) % previews.length; else if (e.key === "ArrowLeft") next = (active + previews.length - 1) % previews.length; else if (e.key === "Home") next = 0; else if (e.key === "End") next = previews.length - 1; else return; e.preventDefault(); setActive(next); document.getElementById(`flow-tab-${next}`)?.focus(); }}>{item.tab}</button>)}</div>
      <div id="flow-panel" role="tabpanel" aria-labelledby={`flow-tab-${active}`} tabIndex={0} className={styles.preview}>
        <div><h3>{preview.title}</h3><p>{preview.text}</p><Link href={tools[active].href}>Open {tools[active].title.toLowerCase()} <ArrowUpRight size={14} /></Link></div>
        <div className={styles.previewRows} key={preview.tab}>{preview.rows.map(([label, status], i) => <div key={label} style={{ animationDelay: `${i * .1}s` }}><span>{label}</span><span>{status} <Check size={12} /></span></div>)}</div>
      </div>
    </section>

    <section className={styles.closing}><div><h2>Keep work moving.</h2><p>One record, from report to result.</p></div><Link href="/login" className={styles.primary}>Sign in <ArrowUpRight size={16} /></Link></section>
    <footer className={styles.footer}><span>NagarFlow · City work, connected.</span><p>Need access? Contact your administrator.</p></footer>
  </main>;
}
