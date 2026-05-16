"use client";
import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Service { id:number; service:string; status:"HEALTHY"|"CRITICAL"|"INVESTIGATING"|"DEGRADED"; error_type:string; last_updated:string; resolved_by:string|null; }
interface Incident { id:number; service:string; status:string; error_type:string; timestamp:string; resolved_at:string|null; fix_description:string|null; }
interface DashboardData { services:Service[]; incidents:Incident[]; resolvedToday:number; criticalCount:number; healthyCount:number; }
interface LogEntry { timestamp:string; agent:"Main"|"Alpha"|"Beta"|string; action:string; }
interface PostMortem { generatedAt:string; stats:{ totalIncidents:number; totalResolved:number; totalFailed:number; resolutionRate:number; avgResolutionSeconds:number|null; mostCommonErrorType:string; mostAffectedService:string; }; errorBreakdown:{type:string;count:number;resolved:number;failed:number}[]; serviceSummaries:{service:string;totalIncidents:number;resolved:number;failed:number;avgResolutionSec:number|null}[]; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ago(iso:string) { const m=Math.floor((Date.now()-new Date(iso).getTime())/60000); return m<1?"just now":m<60?`${m}m ago`:`${Math.floor(m/60)}h ago`; }

const statusColor:Record<string,string> = { HEALTHY:"text-cyan-400", CRITICAL:"text-red-400", INVESTIGATING:"text-yellow-400", DEGRADED:"text-orange-400" };
const agentColor:Record<string,string>  = { Main:"text-cyan-400",   Alpha:"text-yellow-400", Beta:"text-purple-400" };

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthRing({ pct }:{ pct:number }) {
  const r=54, c=2*Math.PI*r, fill=(pct/100)*c;
  const col = pct===100?"#22d3ee":pct>60?"#facc15":"#f87171";
  return (
    <svg width={130} height={130} className="-rotate-90">
      <circle cx={65} cy={65} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={10}/>
      <circle cx={65} cy={65} r={r} fill="none" stroke={col} strokeWidth={10}
        strokeDasharray={`${fill} ${c}`} strokeLinecap="round"
        style={{filter:`drop-shadow(0 0 8px ${col})`,transition:"stroke-dasharray 1s ease"}}/>
      <text x={65} y={65} textAnchor="middle" dominantBaseline="central"
        className="rotate-90" style={{transform:"rotate(90deg)",transformOrigin:"65px 65px",fill:"#fff",fontSize:22,fontWeight:700,fontFamily:"Inter,sans-serif"}}>
        {pct}%
      </text>
    </svg>
  );
}

function Toast({ msg, type }:{ msg:string; type:"ok"|"err" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-xs font-bold animate-slide-up border backdrop-blur-md
      ${type==="ok" ? "bg-cyan-400/10 border-cyan-400/40 text-cyan-300" : "bg-red-400/10 border-red-400/40 text-red-300"}`}>
      {msg}
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data,    setData]    = useState<DashboardData|null>(null);
  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [pm,      setPm]      = useState<PostMortem|null>(null);
  const [tab,     setTab]     = useState<"services"|"agents"|"postmortem">("services");
  const [selected,setSelected]= useState<string|null>(null);
  const [busy,    setBusy]    = useState<string|null>(null);
  const [toast,   setToast]   = useState<{msg:string;type:"ok"|"err"}|null>(null);
  const [tick,    setTick]    = useState(0);

  const showToast = (msg:string, type:"ok"|"err"="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const load = useCallback(async () => {
    try { setData(await (await fetch("/api/status")).json()); } catch {}
  }, []);

  const loadLogs = useCallback(async () => {
    try { const r = await (await fetch("/api/agent-log?lines=60")).json(); setLogs(r.entries ?? []); } catch {}
  }, []);

  const loadPm = useCallback(async () => {
    try { setPm(await (await fetch("/api/post-mortem")).json()); } catch {}
  }, []);

  useEffect(() => {
    load(); loadLogs(); loadPm();
    const iv = setInterval(() => { load(); loadLogs(); setTick(t=>t+1); }, 5000);
    return () => clearInterval(iv);
  }, [load, loadLogs]);

  useEffect(() => { if (tab === "postmortem") loadPm(); }, [tab, loadPm]);

  const triggerChaos = async (svc?:string) => {
    const key = svc ?? "chaos";
    setBusy(key);
    try {
      const r = await fetch("/api/chaos?action=chaos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service:svc})});
      const j = await r.json();
      if(j.ok) { showToast(`🐒 ${j.service} → ${j.error_type}`); await load(); await loadLogs(); }
      else showToast(j.error??"Failed","err");
    } catch { showToast("Request failed","err"); }
    setBusy(null);
  };

  const resolve = async (svc:string) => {
    const key = svc+"_resolve";
    setBusy(key);
    showToast(`⚙ Sentinel fixing ${svc}… (may take 30-60s)`);
    try {
      const r = await fetch("/api/resolve",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({service:svc})
      });
      const j = await r.json().catch(()=>({}));
      await load();
      await loadLogs();
      if(r.status === 200 && j.ok) {
        showToast(`✅ ${svc} is HEALTHY — Sentinel fixed it!`);
      } else if(r.status === 202) {
        showToast(`⚙ ${svc} fix running in background — watch the dashboard`);
      } else {
        showToast(`⚠ Fix failed for ${svc} — check Agent Log tab`,"err");
      }
    } catch {
      showToast("Could not reach the resolve API","err");
    }
    setBusy(null);
  };


  const services  = data?.services ?? [];
  const active    = data?.incidents.filter(i=>!i.resolved_at) ?? [];
  const resolved  = data?.incidents.filter(i=>i.resolved_at) ?? [];
  const healthPct = services.length ? Math.round(((data?.healthyCount??0)/services.length)*100) : 100;

  return (
    <div className="min-h-screen bg-navy-900 text-slate-200 font-mono">
      {/* Background grid */}
      <div className="fixed inset-0 bg-grid pointer-events-none opacity-100" />
      {/* Orb glows */}
      <div className="fixed -top-48 -left-32 w-[600px] h-[600px] rounded-full bg-blue-600/5 blur-3xl pointer-events-none" />
      <div className="fixed -bottom-32 -right-20 w-[500px] h-[500px] rounded-full bg-cyan-400/5 blur-3xl pointer-events-none" />

      {toast && <Toast msg={toast.msg} type={toast.type}/>}

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 bg-navy-900/90 backdrop-blur-xl border-b border-white/[0.07] px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="relative w-9 h-9 flex-shrink-0">
            <div className="absolute inset-0 border border-cyan-400/50 rounded-full animate-spin-slow"/>
            <div className="absolute inset-1.5 border border-blue-400/30 rounded-full animate-spin-rev"/>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee] animate-pulse"/>
            </div>
          </div>
          <div>
            <div className="text-lg font-bold tracking-[0.22em] text-cyan-400 animate-glow">SENTINEL</div>
            <div className="text-[8px] tracking-[0.2em] text-cyan-400/30 font-sans">AUTONOMOUS INCIDENT RESOLUTION ENGINE</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-chaos" onClick={()=>triggerChaos()} disabled={!!busy}>
            {busy==="chaos" ? "INJECTING…" : "🐒 CHAOS"}
          </button>
          <div className="text-[10px] text-slate-600">TICK <span className="text-cyan-400/40">#{tick}</span></div>
          <div className="flex items-center gap-2 text-[10px] text-cyan-400/50">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]"/>LIVE
          </div>
        </div>
      </header>

      <main className="relative z-10 px-8 py-6 max-w-[1440px] mx-auto space-y-6">

        {/* ── TOP ROW: ring + KPIs + error bars ── */}
        <div className="grid grid-cols-[200px_1fr_260px] gap-5">
          {/* Health ring */}
          <div className="sentinel-card p-5 flex flex-col items-center justify-center gap-3">
            <HealthRing pct={healthPct}/>
            <span className="section-label">SYSTEM HEALTH</span>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label:"SERVICES UP",   val: data ? `${data.healthyCount}/${services.length}` : "—", sub:"operational",      color:"text-cyan-400" },
              { label:"INCIDENTS",     val: data?.criticalCount ?? "—",                              sub:"active now",       color:"text-red-400" },
              { label:"AUTO-RESOLVED", val: data?.resolvedToday ?? "—",                              sub:"by Sentinel today", color:"text-purple-400" },
            ].map((k,i) => (
              <div key={k.label} className={`sentinel-card p-5 animate-slide-up`} style={{animationDelay:`${i*80}ms`}}>
                <div className="section-label mb-3">{k.label}</div>
                <div className={`text-4xl font-bold font-sans ${k.color}`}>{String(k.val)}</div>
                <div className="text-[10px] text-slate-500 mt-2 font-sans">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Error breakdown bars */}
          <div className="sentinel-card p-5">
            <div className="section-label mb-4">ERROR BREAKDOWN</div>
            <div className="space-y-3">
              {["SYNTAX","TYPE","LOGIC","DEPENDENCY","CONFIG"].map(e => {
                const cnt = (data?.incidents??[]).filter(i=>i.error_type===e).length;
                const max = Math.max(1,...(data?.incidents??[]).map(()=>1));
                return (
                  <div key={e}>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-sans">
                      <span>{e}</span><span className="text-blue-400">{cnt}</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full transition-all duration-700 shadow-[0_0_6px_#60a5fa]"
                        style={{width:max?`${(cnt/max)*100}%`:"0%"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex gap-0 border-b border-white/[0.07]">
          {(["services","agents","postmortem"] as const).map(t => (
            <button key={t} className={`tab ${tab===t?"tab-active":"tab-inactive"}`} onClick={()=>setTab(t)}>
              {t==="services"?"◈ SERVICES":t==="agents"?"⚡ AGENT LOG":"📋 POST-MORTEM"}
            </button>
          ))}
        </div>

        {/* ══ TAB: SERVICES ══ */}
        {tab === "services" && (
          <div className="space-y-5">
            {/* Service cards */}
            <div className="grid grid-cols-3 gap-4">
              {services.map((svc,i) => {
                const isCrit = svc.status==="CRITICAL";
                const isSel  = selected===svc.service;
                return (
                  <div key={svc.id} onClick={()=>setSelected(isSel?null:svc.service)}
                    className={`service-card animate-slide-up ${isSel?"selected":""} ${isCrit?"critical":""}`}
                    style={{animationDelay:`${i*60}ms`}}>
                    {/* Top row */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative w-3 h-3 flex-shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full m-0.5 ${isCrit?"bg-red-400 shadow-[0_0_10px_#f87171] animate-pulse-fast":"bg-cyan-400 shadow-[0_0_8px_#22d3ee]"}`}/>
                          {isCrit && <div className="absolute inset-0 rounded-full border border-red-400 animate-ripple"/>}
                        </div>
                        <span className="text-sm font-bold text-slate-100 font-sans">{svc.service}</span>
                      </div>
                      <span className={`status-badge status-${svc.status}`}>{svc.status}</span>
                    </div>
                    {/* Error + time */}
                    <div className="flex justify-between items-center">
                      {svc.error_type!=="NONE"
                        ? <span className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 rounded px-2 py-0.5">ERR:{svc.error_type}</span>
                        : <span className="text-[10px] text-slate-600">no errors</span>}
                      <span className="text-[10px] text-slate-600">{ago(svc.last_updated)}</span>
                    </div>
                    {/* Expanded */}
                    {isSel && (
                      <div className="mt-4 pt-4 border-t border-white/[0.07] space-y-3 animate-slide-up">
                        {svc.resolved_by && <div className="text-[10px] text-purple-400 font-sans">✦ {svc.resolved_by}</div>}
                        <div className="text-[10px] text-slate-600 font-sans">
                          Port: {svc.service==="auth-service"?"3001":svc.service==="data-service"?"3002":"3003"} · {new Date(svc.last_updated).toLocaleTimeString()}
                        </div>
                        <div className="flex gap-2">
                          <button className="btn-chaos flex-1 text-[10px]" onClick={e=>{e.stopPropagation();triggerChaos(svc.service);}} disabled={!!busy}>
                            {busy===svc.service?"…":"🐒 INJECT"}
                          </button>
                          {svc.status!=="HEALTHY" && (
                            <button className="btn-resolve flex-1 text-[10px]" onClick={e=>{e.stopPropagation();resolve(svc.service);}} disabled={!!busy}>
                              {busy===svc.service+"_resolve"?"FIXING (≈20s)…":"✦ AUTO-FIX"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Incidents */}
            <div className="grid grid-cols-2 gap-5">
              {/* Active */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="section-label">⚠ ACTIVE INCIDENTS</span>
                  <div className="flex-1 sentinel-divider"/>
                  {active.length>0 && <span className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/30 rounded-full px-2.5 py-0.5 animate-pulse-fast">{active.length}</span>}
                </div>
                {active.length===0 ? (
                  <div className="sentinel-card p-8 text-center">
                    <div className="text-2xl mb-2">✓</div>
                    <div className="text-xs text-cyan-400/50 font-sans">All systems nominal</div>
                    <div className="text-[10px] text-slate-600 mt-1 font-sans">Click 🐒 CHAOS to trigger an incident</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {active.map(inc => (
                      <div key={inc.id} className="incident-active">
                        <div className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_8px_#f87171] animate-pulse-fast mt-1 flex-shrink-0"/>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-sm font-bold text-red-300 font-sans">{inc.service}</span>
                            <span className="text-[10px] text-slate-600">{ago(inc.timestamp)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 rounded px-2 py-0.5">{inc.error_type}</span>
                            <button className="btn-resolve text-[9px] px-2.5 py-1" onClick={()=>resolve(inc.service)} disabled={!!busy}>
                              {busy===inc.service+"_resolve"?"FIXING (≈20s)…":"✦ AUTO-FIX"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resolved */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="section-label">✦ RESOLVED BY SENTINEL</span>
                  <div className="flex-1 sentinel-divider"/>
                  {resolved.length>0 && <span className="text-[10px] text-purple-400 bg-purple-400/10 border border-purple-400/30 rounded-full px-2.5 py-0.5">{resolved.length}</span>}
                </div>
                {resolved.length===0 ? (
                  <div className="sentinel-card p-8 text-center">
                    <div className="text-[11px] text-slate-600 font-sans">No resolved incidents yet</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {resolved.slice(-5).map(inc => (
                      <div key={inc.id} className="incident-resolved">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] mt-1 flex-shrink-0"/>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-cyan-300 font-sans">{inc.service}</span>
                            <span className="text-[9px] text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 rounded px-2 py-0.5">FIXED</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-slate-500 font-sans truncate">{inc.fix_description ?? "Auto-fixed by Sentinel"}</span>
                            <span className="text-[10px] text-slate-600 ml-2 flex-shrink-0">{inc.resolved_at ? ago(inc.resolved_at) : ""}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: AGENT LOG ══ */}
        {tab === "agents" && (
          <div className="sentinel-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="section-label">AGENT SESSION LOG — LAST 60 ACTIONS</div>
              <button className="btn-ghost text-[9px]" onClick={loadLogs}>↻ REFRESH</button>
            </div>
            {logs.length===0 ? (
              <div className="text-center py-12">
                <div className="text-[11px] text-slate-600 font-sans">No agent sessions yet</div>
                <div className="text-[10px] text-slate-700 mt-1 font-sans">Trigger chaos + auto-fix to generate entries</div>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-2">
                {logs.map((e,i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                    <span className="text-[9px] text-slate-600 font-sans pt-0.5 flex-shrink-0 w-20 truncate" title={e.timestamp}>
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`agent-${e.agent} flex-shrink-0`}>{e.agent}</span>
                    <span className={`text-[11px] font-sans leading-relaxed ${
                      e.action.includes("FAILED")||e.action.includes("❌") ? "text-red-400" :
                      e.action.includes("HEALTHY")||e.action.includes("PASSED")||e.action.includes("✓") ? "text-cyan-400" :
                      e.action.includes("INVESTIGATING")||e.action.includes("Thinking Mode") ? "text-yellow-400" :
                      "text-slate-400"
                    }`}>{e.action}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: POST-MORTEM ══ */}
        {tab === "postmortem" && pm && (
          <div className="space-y-5">
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label:"TOTAL INCIDENTS",   val: pm.stats.totalIncidents,                        color:"text-slate-300" },
                { label:"RESOLUTION RATE",   val: `${pm.stats.resolutionRate}%`,                  color:"text-cyan-400"  },
                { label:"AVG FIX TIME",      val: pm.stats.avgResolutionSeconds ? `${pm.stats.avgResolutionSeconds}s` : "—", color:"text-yellow-400" },
                { label:"MOST COMMON ERROR", val: pm.stats.mostCommonErrorType,                   color:"text-purple-400" },
              ].map(k => (
                <div key={k.label} className="sentinel-card p-5">
                  <div className="section-label mb-3">{k.label}</div>
                  <div className={`text-2xl font-bold font-sans ${k.color}`}>{k.val}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-5">
              {/* Error breakdown */}
              <div className="sentinel-card p-5">
                <div className="section-label mb-4">ERROR TYPE BREAKDOWN</div>
                <div className="space-y-3">
                  {pm.errorBreakdown.map(e => {
                    const rate = e.count ? Math.round((e.resolved/e.count)*100) : 0;
                    return (
                      <div key={e.type} className="flex items-center gap-3">
                        <div className="w-24 text-[10px] text-slate-500 flex-shrink-0 font-sans">{e.type}</div>
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{width:`${rate}%`,background:rate===100?"#22d3ee":rate>50?"#a78bfa":"#f87171",
                              boxShadow:`0 0 6px ${rate===100?"#22d3ee":rate>50?"#a78bfa":"#f87171"}`}}/>
                        </div>
                        <div className="text-[10px] text-slate-500 w-12 text-right font-sans">{e.resolved}/{e.count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Service summaries */}
              <div className="sentinel-card p-5">
                <div className="section-label mb-4">SERVICE RELIABILITY</div>
                <div className="space-y-3">
                  {pm.serviceSummaries.map(s => {
                    const rate = s.totalIncidents ? Math.round((s.resolved/s.totalIncidents)*100) : 100;
                    return (
                      <div key={s.service}>
                        <div className="flex justify-between text-[10px] mb-1 font-sans">
                          <span className="text-slate-400">{s.service}</span>
                          <span className={rate===100?"text-cyan-400":rate>60?"text-yellow-400":"text-red-400"}>{rate}%</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{width:`${rate}%`,background:rate===100?"#22d3ee":rate>60?"#facc15":"#f87171"}}/>
                        </div>
                        <div className="text-[9px] text-slate-600 mt-0.5 font-sans">
                          {s.resolved} resolved · {s.failed} failed {s.avgResolutionSec!=null?`· avg ${s.avgResolutionSec}s`:""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="text-[9px] text-slate-700 font-sans text-center">
              Generated at {new Date(pm.generatedAt).toLocaleString()} · Source: docs/incident-history.log + store.json
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t border-white/[0.04] flex justify-between text-[9px] text-slate-700">
          <span>SENTINEL v1.0 · MONOREPO MONITOR</span>
          <span>3 SERVICES · POLL 5s · JSON STORE</span>
        </div>
      </main>
    </div>
  );
}
