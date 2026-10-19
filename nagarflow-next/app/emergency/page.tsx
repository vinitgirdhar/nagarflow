'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import DashboardShell from '../components/DashboardShell';
import {apiFetch} from '../lib/api';
type Weather={snapshot:{temperature:number;wind_speed:number;weather_code:number;observed_at:string;latitude:number;longitude:number;source:string}|null;notice:string};
type Priority={name:string;demand:number;category:string;reason:string};
export default function Emergency(){
 const [data,setData]=useState<Weather|null>(null),[zones,setZones]=useState<Priority[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;async function load(){try{const [weather,priorities]=await Promise.all([apiFetch('/api/weather/status'),apiFetch('/api/predictions')]);if(!weather.ok||!priorities.ok)throw new Error('Cannot load risk information.');const [w,p]=await Promise.all([weather.json(),priorities.json()]);if(active){setData(w);setZones(p.filter((z:Priority)=>z.demand>=75));}}catch(e){if(active)setError(String(e));}}load();const id=setInterval(load,30000);return()=>{active=false;clearInterval(id);};},[]);
 const stale=!data?.snapshot||Date.now()-Date.parse(data.snapshot.observed_at)>3600000;
 return <DashboardShell title="Risk review"><h1>Risk review</h1><p>Check urgent zones and the latest weather before assigning work.</p>{error&&<p role="alert">{error}</p>}<section className="card" style={{padding:24,margin:'20px 0'}}><h2>Weather observations</h2>{!data?.snapshot?<p>No weather observation is available yet.</p>:<><p>Freshness: {stale?'Stale — do not treat as current':'Within the last hour'}</p><p>Temperature: {data.snapshot.temperature} °C · Wind: {data.snapshot.wind_speed} km/h</p><p>Observed: {new Date(data.snapshot.observed_at).toLocaleString()}</p><details><summary>Weather source</summary><p>{data.snapshot.source} · Location: {data.snapshot.latitude}, {data.snapshot.longitude} · Weather code: {data.snapshot.weather_code}</p></details></>}<p>{data?.notice}</p></section><section className="card" style={{padding:24}}><h2>High-priority records</h2>{!zones.length?<p>No zones have a recorded priority score of 75 or more.</p>:zones.map(z=><article key={z.name} style={{padding:'16px 0',borderBottom:'1px solid var(--border-subtle)'}}><h3>{z.name} · {z.demand}/100</h3><p>{z.category}</p><p>{z.reason}</p></article>)}<p>Review each score before acting. It is a priority signal, not an emergency probability.</p><Link href="/dispatch">Open dispatch</Link> · <Link href="/maintenance">Open field work</Link> · <Link href="/operations">Check intake</Link></section></DashboardShell>;
}
