"use client";

import { useEffect, useState, useCallback } from "react";

interface ServiceStatus {
  id: number;
  service: string;
  status: "HEALTHY" | "CRITICAL" | "INVESTIGATING" | "DEGRADED";
  error_type: string;
  last_updated: string;
  resolved_by: string | null;
}

interface Incident {
  id: number;
  service: string;
  status: string;
  error_type: string;
  timestamp: string;
  resolved_at: string | null;
  fix_description: string | null;
}

interface DashboardData {
  services: ServiceStatus[];
  incidents: Incident[];
  resolvedToday: number;
  criticalCount: number;
  healthyCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  HEALTHY: "#00ff9d",
  CRITICAL: "#ff2d55",
  INVESTIGATING: "#ffd60a",
  DEGRADED: "#ff9f0a",
};

const STATUS_GLOW: Record<string, string> = {
  HEALTHY: "0 0 12px #00ff9d55",
  CRITICAL: "0 0 16px #ff2d5577",
  INVESTIGATING: "0 0 12px #ffd60a55",
  DEGRADED: "0 0 12px #ff9f0a55",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function SentinelDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tick, setTick] = useState(0);
  const [pulse, setPulse] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const json = await res.json();
      setData(json);
      setPulse((p) => !p);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
      setTick((t) => t + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const activeIncidents = data?.incidents.filter((i) => !i.resolved_at) ?? [];
  const resolvedIncidents = data?.incidents.filter((i) => i.resolved_at) ?? [];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c12",
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: "0",
    }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid #1e2a3a",
        padding: "20px 40px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "linear-gradient(90deg, #080c12 0%, #0d1520 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: "#00ff9d",
            boxShadow: "0 0 10px #00ff9d",
            animation: "blink 1.5s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.15em", color: "#00ff9d" }}>
            SENTINEL
          </span>
          <span style={{ fontSize: 11, color: "#4a6080", letterSpacing: "0.1em" }}>
            AUTONOMOUS INCIDENT RESOLUTION ENGINE
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#4a6080" }}>
          POLL INTERVAL: 5s &nbsp;|&nbsp; TICK #{tick}
        </div>
      </header>

      <main style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>

        {/* KPI Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 32 }}>
          {[
            { label: "SYSTEM HEALTH", value: data ? `${data.healthyCount}/${data.services.length}`, color: "#00ff9d", sub: "services healthy" },
            { label: "ACTIVE INCIDENTS", value: data?.criticalCount ?? "—", color: "#ff2d55", sub: "require resolution" },
            { label: "RESOLVED BY CLAUDE", value: data?.resolvedToday ?? "—", color: "#7c6bff", sub: "today" },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              background: "#0d1520",
              border: "1px solid #1e2a3a",
              borderRadius: 8,
              padding: "24px 28px",
            }}>
              <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#4a6080", marginBottom: 8 }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 40, fontWeight: 700, color: kpi.color, lineHeight: 1 }}>
                {kpi.value}
              </div>
              <div style={{ fontSize: 11, color: "#4a6080", marginTop: 6 }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Service Status Grid */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 11, letterSpacing: "0.15em", color: "#4a6080", marginBottom: 16 }}>
            ◈ SERVICE STATUS
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {(data?.services ?? []).map((svc) => (
              <div key={svc.id} style={{
                background: "#0d1520",
                border: `1px solid ${STATUS_COLORS[svc.status] ?? "#1e2a3a"}33`,
                borderRadius: 8,
                padding: "18px 20px",
                boxShadow: STATUS_GLOW[svc.status] ?? "none",
                transition: "all 0.3s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#c8d8e8" }}>
                    {svc.service}
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: STATUS_COLORS[svc.status] ?? "#fff",
                    background: `${STATUS_COLORS[svc.status] ?? "#fff"}18`,
                    border: `1px solid ${STATUS_COLORS[svc.status] ?? "#fff"}44`,
                    borderRadius: 4,
                    padding: "2px 8px",
                  }}>
                    {svc.status}
                  </span>
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: "#4a6080" }}>
                  {svc.error_type !== "NONE" && (
                    <span style={{ color: "#ff6b6b" }}>ERR: {svc.error_type} &nbsp;</span>
                  )}
                  <span>{timeAgo(svc.last_updated)}</span>
                </div>
                {svc.resolved_by && (
                  <div style={{ marginTop: 6, fontSize: 10, color: "#7c6bff" }}>
                    ✦ Resolved by {svc.resolved_by}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Active Incidents */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 11, letterSpacing: "0.15em", color: "#4a6080", marginBottom: 16 }}>
            ◈ ACTIVE INCIDENTS
          </h2>
          {activeIncidents.length === 0 ? (
            <div style={{
              background: "#0d1520", border: "1px solid #1e2a3a", borderRadius: 8,
              padding: "28px", textAlign: "center", color: "#4a6080", fontSize: 13,
            }}>
              ✓ No active incidents — all systems nominal
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeIncidents.map((inc) => (
                <div key={inc.id} style={{
                  background: "#120a0e",
                  border: "1px solid #ff2d5533",
                  borderLeft: "3px solid #ff2d55",
                  borderRadius: 8,
                  padding: "16px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div>
                    <span style={{ color: "#ff2d55", fontWeight: 600 }}>{inc.service}</span>
                    <span style={{ color: "#4a6080", fontSize: 12 }}> — {inc.error_type}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#4a6080" }}>{timeAgo(inc.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Resolved by Claude */}
        <section>
          <h2 style={{ fontSize: 11, letterSpacing: "0.15em", color: "#4a6080", marginBottom: 16 }}>
            ◈ RESOLVED BY CLAUDE
          </h2>
          {resolvedIncidents.length === 0 ? (
            <div style={{
              background: "#0d1520", border: "1px solid #1e2a3a", borderRadius: 8,
              padding: "28px", textAlign: "center", color: "#4a6080", fontSize: 13,
            }}>
              No resolved incidents yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {resolvedIncidents.map((inc) => (
                <div key={inc.id} style={{
                  background: "#08120e",
                  border: "1px solid #00ff9d22",
                  borderLeft: "3px solid #00ff9d",
                  borderRadius: 8,
                  padding: "16px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div>
                    <span style={{ color: "#00ff9d", fontWeight: 600 }}>{inc.service}</span>
                    <span style={{ color: "#4a6080", fontSize: 12 }}> — {inc.fix_description ?? "Fixed"}</span>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "#4a6080" }}>
                    <div>opened: {timeAgo(inc.timestamp)}</div>
                    {inc.resolved_at && <div style={{ color: "#00ff9d88" }}>closed: {timeAgo(inc.resolved_at)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #080c12; }
        ::-webkit-scrollbar-thumb { background: #1e2a3a; border-radius: 3px; }
      `}</style>
    </div>
  );
}
