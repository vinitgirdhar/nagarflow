'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowUpRight, ArrowRight, ArrowDown, Activity, Layers3, Route, Radio, ShieldCheck, Check, Search, FileText, ChartNoAxesCombined, CircleDot, MoveUpRight, Pause, Play, Truck, MapPin, Sparkles } from 'lucide-react';
import styles from './landing.module.css';

const capabilities = [
  { icon: Radio, number: '01', title: 'Every report. A starting point.', text: 'Bring complaint deliveries into a durable inbox. Classify, review and turn a resident’s concern into a clear next step.', tag: 'COMPLAINT INTELLIGENCE', href: '/complaints' },
  { icon: Route, number: '02', title: 'The right resource. In motion.', text: 'Connect service needs to available vehicles. Confirm assignments, record arrivals and keep the next team in the loop.', tag: 'FLEET & FIELD OPERATIONS', href: '/dispatch' },
  { icon: Search, number: '03', title: 'Answers with a paper trail.', text: 'Search approved municipal documents. See the exact source behind an answer, with clear limits when evidence is missing.', tag: 'GROUNDED KNOWLEDGE', href: '/knowledge' },
  { icon: ChartNoAxesCombined, number: '04', title: 'Look ahead. Stay grounded.', text: 'Explore demand forecasts, compare models against history and test what-if scenarios before changing the operational plan.', tag: 'PLANNING & FORECASTS', href: '/predictions' },
];
const previews = [
  { tab: 'Intake', icon: Radio, eyebrow: '01 / LISTEN', title: 'A concern becomes a clear next step.', text: 'Review incoming complaints, confirm the location and create a linked work order. One record connects the handoff.', label: 'Complaint review', rows: [['Incoming report', 'Received'], ['Location & service', 'Review'], ['Linked work order', 'Next step']] },
  { tab: 'Dispatch', icon: Route, eyebrow: '02 / COORDINATE', title: 'Give every assignment a destination.', text: 'Check resource compatibility and availability before dispatch. Confirm the field result and keep an auditable assignment history.', label: 'Assignment lifecycle', rows: [['Resource availability', 'Checked'], ['Dispatch assignment', 'Confirmed'], ['Field arrival', 'Operator review']] },
  { tab: 'Knowledge', icon: Search, eyebrow: '03 / UNDERSTAND', title: 'Make the source part of the answer.', text: 'Retrieve excerpts from approved documents with citations. Retired documents leave the search index, and unsupported questions get an honest abstention.', label: 'Grounded retrieval', rows: [['Approved documents', 'Searchable'], ['Supporting excerpt', 'Cited'], ['Missing evidence', 'Abstain']] },
  { tab: 'Forecasts', icon: ChartNoAxesCombined, eyebrow: '04 / PLAN', title: 'See the forecast. Inspect the reasoning.', text: 'Compare seasonal, rolling-mean and fitted regression models using historical backtests. Stale or insufficient data stays visibly unavailable.', label: 'Model comparison', rows: [['Historical demand', 'Time-based'], ['Baseline comparison', 'Evaluated'], ['Data freshness', 'Visible']] },
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


function ServiceNetwork() {
  const nodes = [{x:95,y:180,icon:Radio,label:'Receive'}, {x:350,y:70,icon:MapPin,label:'Classify'}, {x:350,y:290,icon:Search,label:'Understand'}, {x:650,y:70,icon:Truck,label:'Assign'}, {x:650,y:290,icon:FileText,label:'Verify'}, {x:905,y:180,icon:ShieldCheck,label:'Review'}];
  const paths = ['M95 180 C200 180 220 70 350 70 L650 70 C780 70 790 180 905 180','M95 180 C200 180 220 290 350 290 L650 290 C780 290 790 180 905 180','M350 70 C450 70 550 290 650 290','M350 290 C450 290 550 70 650 70'];
  return <div className={styles.networkStage} aria-hidden="true">
    <div className={styles.networkHalo}/>
    <svg viewBox="0 0 1000 360" fill="none" className={styles.networkSvg}><g stroke="#dac9ae">{paths.map(d=><path key={d} d={d}/>)}</g><g className={styles.networkBeams} stroke="#b84925" strokeWidth="2">{paths.map((d,i)=><path key={d} d={d} style={{animationDelay:`${-i*2}s`}}/>)}</g>{paths.map((d,i)=><circle key={d} r="5" fill={i%2?'#7d895f':'#b84925'} className={styles.networkPacket} style={{offsetPath:`path("${d}")`,animationDelay:`${-i*3}s`}}/>)}</svg>
    {nodes.map((n,i)=><div className={styles.networkNode} key={n.label} style={{left:`${n.x/10}%`,'--node-y':`${n.y/3.6}%`,'--node-delay':`${-i*1.2}s`} as CSSProperties}><span><n.icon size={23} strokeWidth={1.4}/></span><small>{n.label}</small></div>)}
  </div>;
}

export default function Home() {
  const reduced = useReducedMotion();
  const { scrollYProgress, scrollY } = useScroll();
  const cityY = useTransform(scrollY,[0,900],[0,140]);
  const cityX = useSpring(0,{stiffness:65,damping:22});
  const cityTilt = useSpring(0,{stiffness:65,damping:22});
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const preview = previews[active];
  const reveal = { initial: reduced ? false as const : { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .12 }, transition: { duration: .65 } };
  return <main className={styles.landing} data-motion={paused?'paused':'playing'}>
    <motion.div className={styles.progress} style={{scaleX:scrollYProgress}} aria-hidden="true"/>
    <header className={styles.nav}><Link href="/" className={styles.brand} aria-label="NagarFlow home"><span><Layers3 size={21}/></span>NagarFlow<span className={styles.brandDot}>®</span></Link><nav aria-label="Main navigation"><a href="#platform">The platform</a><a href="#workflow">How it flows</a><button className={styles.motionToggle} type="button" aria-label={paused?'Resume background animations':'Pause background animations'} aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?<Play size={14}/>:<Pause size={14}/>}</button><Link className={styles.navCta} href="/login">Enter workspace <ArrowUpRight size={15}/></Link></nav></header>
    <section className={styles.hero} aria-labelledby="hero-heading" onPointerMove={event=>{if(reduced||paused||event.pointerType!=='mouse')return;const box=event.currentTarget.getBoundingClientRect();cityX.set((event.clientX-box.left-box.width/2)/box.width*30);cityTilt.set((event.clientY-box.top-box.height/2)/box.height*-12);}} onPointerLeave={()=>{cityX.set(0);cityTilt.set(0);}}>
      <div className={styles.heroGlow} aria-hidden="true"/><div className={styles.heroRings} aria-hidden="true"><i/><i/><i/></div><div className={styles.heroParticles} aria-hidden="true">{Array.from({length:18},(_,i)=><span key={i} style={{left:`${4+(i*17)%92}%`,top:`${10+(i*23)%70}%`,animationDelay:`${i*-.7}s`,animationDuration:`${8+i%5}s`}}/>)}</div><motion.div className={styles.cityStage} style={{x:reduced||paused?0:cityX,y:reduced||paused?0:cityY,rotateZ:reduced||paused?0:cityTilt}} aria-hidden="true"><City/></motion.div>
      <motion.div className={styles.heroContent} {...reveal}>
        <div key="part-1" className={styles.eyebrow}><span className={styles.statusDot}/> A MORE CONNECTED CITY STARTS HERE</div>
        <h1 key="part-3" id="hero-heading">{['A','city','in','motion.'].map((word,i)=><span key={word} className={styles.titleWord} style={{animationDelay:`${i*.1}s`}}>{word}{i<3?' ':''}</span>)}<br/><em>{['A','system','in','sync.'].map((word,i)=><span key={word} className={styles.titleWord} style={{animationDelay:`${.3+i*.1}s`}}>{word}{i<3?' ':''}</span>)}</em></h1>
        <p key="part-5" className={styles.heroIntro}>Big cities. A million moving parts.<br/>One connected workspace to bring it all together.</p>
        <div key="part-7" className={styles.actions}><Link className={styles.primary} href="/login" aria-label="Sign in to your workspace">Enter your workspace <ArrowUpRight size={18}/></Link><a className={styles.textLink} href="#platform">Explore NagarFlow <ArrowDown size={16}/></a></div>
      </motion.div>
      <div className={`${styles.floatingLabel} ${styles.labelOne}`} aria-hidden="true"><span className={styles.labelIcon}><Radio size={17}/></span><div>Listen to your city<small>COMPLAINT INTAKE</small></div><span className={styles.miniDots}>•••</span></div>
      <div className={`${styles.floatingLabel} ${styles.labelTwo}`} aria-hidden="true"><span className={styles.labelIcon}><Route size={17}/></span><div>Connect the next step<small>COORDINATED OPERATIONS</small></div><ArrowUpRight size={16}/></div>
      <div className={styles.heroBottom}><span>BUILT FOR THE PEOPLE<br/>WHO KEEP A CITY MOVING.</span><a href="#platform" aria-label="Scroll to the platform"><ArrowDown size={20}/></a><span>MUNICIPAL OPERATIONS<br/>WITH PEOPLE IN CONTROL.</span></div>
    </section>
    <div className={styles.marquee} aria-label="Connected municipal services"><div aria-hidden="true">{[0,1,2,3].map(i=><span key={i}>COMPLAINTS <span>✳</span> FLEET & FIELD <span>✳</span> GROUNDED KNOWLEDGE <span>✳</span> DEMAND PLANNING <span>✳</span> ACCOUNTABILITY <span>✳</span></span>)}</div></div>
    <section id="platform" className={styles.section}>
      <motion.div className={styles.sectionHeading} {...reveal}><div key="part-0"><p className={styles.eyebrow}>01 — THE CONNECTED PLATFORM</p><h2>Less scattered.<br/><em>More in sync.</em></h2></div><p key="part-1">From the first report to the final field review, keep the people, resources and evidence connected. Thoughtful tools for work that matters.</p></motion.div>
      <div className={styles.featureGrid}>{capabilities.map((f,i)=><motion.div {...reveal} transition={{duration:.6,delay:reduced?0:i%2*.1}} key={f.number}><Link key="part-0" href={f.href} className={styles.featureCard}><div className={styles.cardTop}><f.icon size={25} strokeWidth={1.4}/><span>{f.number} / 04</span></div><div className={styles.cardSignal} aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/></div><p className={styles.cardTag}>{f.tag}</p><h3>{f.title}</h3><p>{f.text}</p><span className={styles.cardLink}>Explore workspace <ArrowUpRight size={18}/></span><div className={styles.cardOrbit} aria-hidden="true"/></Link></motion.div>)}</div>
    </section>
    <section id="workflow" className={styles.darkSection}>
      <div className={styles.darkGrid} aria-hidden="true"/><div className={styles.showcaseSweep} aria-hidden="true"/>
      <motion.div className={styles.darkHeading} {...reveal}><p key="part-0" className={styles.eyebrow}>02 — FROM SIGNAL TO SERVICE</p><h2 key="part-1">Good cities don’t stand still.<br/><em>Neither should their systems.</em></h2><p key="part-2">A connected flow. A clear owner at every handoff.</p></motion.div>
      <div className={styles.tabs} role="tablist" aria-label="Explore the service workflow">{previews.map((p,i)=><button key={p.tab} id={`flow-tab-${i}`} type="button" role="tab" aria-selected={active===i} aria-controls="flow-panel" tabIndex={active===i?0:-1} onClick={()=>setActive(i)} onKeyDown={e=>{let next=active;if(e.key==='ArrowRight')next=(active+1)%previews.length;else if(e.key==='ArrowLeft')next=(active+previews.length-1)%previews.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=previews.length-1;else return;e.preventDefault();setActive(next);document.getElementById(`flow-tab-${next}`)?.focus();}}><p.icon size={17}/>{p.tab}<span>0{i+1}</span></button>)}</div>
      <div id="flow-panel" role="tabpanel" aria-labelledby={`flow-tab-${active}`} className={styles.previewPanel} tabIndex={0}><motion.div key={preview.tab} initial={reduced?false:{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:.3}} className={styles.previewCopy}><p key="part-0" className={styles.eyebrow}>{preview.eyebrow}</p><h3 key="part-1">{preview.title}</h3><p key="part-2">{preview.text}</p><Link key="part-3" href={capabilities[active].href} className={styles.darkLink}>See it in your workspace <ArrowUpRight size={17}/></Link></motion.div><div className={styles.previewCard}><div className={styles.previewHeader}><span><Activity size={16}/> {preview.label}</span><span>WORKFLOW PREVIEW</span></div><div className={styles.previewDiagram}><div className={styles.radarSweep}/><div className={styles.diagramRing}/><div className={styles.diagramRing}/><span><preview.icon size={35} strokeWidth={1.3}/></span><i/><i/><i/></div><div className={styles.previewRows} key={preview.tab}>{preview.rows.map(([title,status],i)=><div key={title} style={{animationDelay:`${i*.16}s`}}><span><CircleDot size={12}/>{title}</span><span>{status}<Check size={12}/></span></div>)}</div><p className={styles.previewNote}>Illustrative workflow · your workspace shows your records</p></div></div>
    </section>
    <section className={`${styles.section} ${styles.principles}`}>
      <motion.div {...reveal}><p key="part-0" className={styles.eyebrow}>03 — HUMAN BY DESIGN</p><h2 key="part-1">Technology that helps.<br/><em>People who decide.</em></h2><p key="part-2">Behind every service request is a person. Behind every decision, there should be context.</p><Link key="part-3" href="/login" className={styles.textLink}>Find your workspace <ArrowUpRight size={17}/></Link></motion.div>
      <div className={styles.principleList}>{[{icon:ShieldCheck,title:'Your municipality. Your workspace.',text:'Protected accounts, role-based permissions and separate municipality data.'},{icon:FileText,title:'Show the evidence. Keep the context.',text:'Source citations, field photographs and recorded decisions keep work traceable.'},{icon:MoveUpRight,title:'Plan forward. Stay accountable.',text:'Inspect model comparisons and data freshness. Operators confirm the real-world actions.'}].map(p=><motion.div {...reveal} key={p.title}><p.icon key="part-0" size={23} strokeWidth={1.4}/><div key="part-1"><h3>{p.title}</h3><p>{p.text}</p></div></motion.div>)}</div>
    </section>
    <section className={styles.connectionSection}>
      <motion.div {...reveal} className={styles.connectionHeading}><p key="label" className={styles.eyebrow}><Sparkles size={13}/> BUILT TO WORK TOGETHER</p><h2 key="heading">Every handoff.<br/><em>A little more connected.</em></h2><p key="description">Intake, people and resources moving through one shared workflow.</p></motion.div>
      <ServiceNetwork/>
      <p className={styles.networkCaption}>CONNECTED SERVICE WORKFLOW · ILLUSTRATION</p>
    </section>
    <section className={styles.closing}><div className={styles.closingOrb} aria-hidden="true"/><div className={styles.closingOrbit} aria-hidden="true"><i/><i/><i/></div><svg className={styles.closingWaves} viewBox="0 0 1200 300" fill="none" preserveAspectRatio="none" aria-hidden="true">{[0,1,2,3].map(i=><path key={i} d={`M-50 ${100+i*32} C200 ${-80+i*32} 390 ${360-i*20} 660 ${160+i*20} S1000 ${10+i*35} 1250 ${120+i*28}`} style={{animationDelay:`${i*-3}s`}}/>)}</svg><motion.div {...reveal}><p key="part-0" className={styles.eyebrow}>THE NEXT HANDOFF STARTS HERE</p><h2 key="part-1">Let’s keep your<br/><em>city moving.</em></h2><Link key="part-2" href="/login" className={styles.primary}>Enter your workspace <ArrowUpRight size={18}/></Link><p key="part-3">Need access? Your municipality administrator can help.</p></motion.div></section>
    <div className={styles.footerWordmark} aria-hidden="true"><span>NagarFlow</span><span className={styles.wordmarkGlint}/></div>
    <footer className={styles.footer}><Link href="/" className={styles.brand}><Layers3 size={22}/> NagarFlow</Link><span>Connected civic operations.<br/>Built around the work. And the people.</span><a href="#hero-heading">Back to top <ArrowUpRight size={15}/></a><Link href="/login">Secure sign-in <ArrowRight size={15}/></Link></footer>
  </main>;
}
