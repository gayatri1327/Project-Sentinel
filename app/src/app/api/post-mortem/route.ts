/**
 * app/api/post-mortem/route.ts
 *
 * GET /api/post-mortem?service=<name>&limit=N
 *   Reads docs/incident-history.log + the JSON store incidents table.
 *   Generates a structured post-mortem JSON report.
 *
 * Query params:
 *   service  (optional) — filter to one service
 *   limit    (optional) — max incidents to include (default 50)
 */

import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import path from "path";

const REPO_ROOT    = path.join(process.cwd(), "..");
const HISTORY_LOG  = path.join(REPO_ROOT, "docs", "incident-history.log");
const STORE_PATH   = path.join(process.cwd(), "data", "store.json");

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  timestamp: string;
  service:   string;
  errorType: string;
  status:    "RESOLVED" | "FAILED";
  fix:       string;
}

interface StoreIncident {
  id:              number;
  service:         string;
  status:          string;
  error_type:      string;
  timestamp:       string;
  resolved_at:     string | null;
  fix_description: string | null;
}

interface PostMortemIncident {
  service:         string;
  errorType:       string;
  startedAt:       string;
  resolvedAt:      string | null;
  durationSeconds: number | null;
  fixAttempts:     number;
  finalStatus:     "RESOLVED" | "FAILED" | "OPEN";
  fixDescription:  string | null;
}

interface ErrorBreakdown { type: string; count: number; resolved: number; failed: number; }
interface ServiceSummary { service: string; totalIncidents: number; resolved: number; failed: number; open: number; avgResolutionSec: number | null; }

// ─── Parsers ──────────────────────────────────────────────────────────────────

// History log format: [ISO] SERVICE=x ERROR_TYPE=y STATUS=z FIX=desc
const HISTORY_PATTERN = /^\[(.+?)\] SERVICE=(\S+) ERROR_TYPE=(\S+) STATUS=(\S+) FIX=(.+)$/;

function parseHistoryLog(filterService?: string): HistoryEntry[] {
  if (!existsSync(HISTORY_LOG)) return [];
  const lines = readFileSync(HISTORY_LOG, "utf8").split("\n").filter(l => l.trim() && !l.startsWith("#"));
  const entries: HistoryEntry[] = [];
  for (const line of lines) {
    const m = line.match(HISTORY_PATTERN);
    if (!m) continue;
    if (filterService && m[2] !== filterService) continue;
    entries.push({ timestamp: m[1], service: m[2], errorType: m[3], status: m[4] as "RESOLVED" | "FAILED", fix: m[5] });
  }
  return entries;
}

function readStoreIncidents(filterService?: string): StoreIncident[] {
  if (!existsSync(STORE_PATH)) return [];
  const store = JSON.parse(readFileSync(STORE_PATH, "utf8"));
  const incidents: StoreIncident[] = store.incidents ?? [];
  return filterService ? incidents.filter(i => i.service === filterService) : incidents;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

function buildPostMortem(filterService?: string, limit = 50) {
  const historyEntries  = parseHistoryLog(filterService);
  const storeIncidents  = readStoreIncidents(filterService).slice(-limit);

  // Build incident timeline enriched with history log fix attempts
  const incidents: PostMortemIncident[] = storeIncidents.map(si => {
    // Count how many history entries reference this service+errorType
    const attempts = historyEntries.filter(h => h.service === si.service && h.errorType === si.error_type);
    const resolved = attempts.find(a => a.status === "RESOLVED");

    const durationMs = si.resolved_at
      ? new Date(si.resolved_at).getTime() - new Date(si.timestamp).getTime()
      : null;

    return {
      service:         si.service,
      errorType:       si.error_type,
      startedAt:       si.timestamp,
      resolvedAt:      si.resolved_at,
      durationSeconds: durationMs !== null ? Math.round(durationMs / 1000) : null,
      fixAttempts:     attempts.length,
      finalStatus:     si.resolved_at ? "RESOLVED" : (attempts.some(a => a.status === "FAILED") ? "FAILED" : "OPEN"),
      fixDescription:  resolved?.fix ?? si.fix_description ?? null,
    } satisfies PostMortemIncident;
  });

  // Error type breakdown
  const errorBreakdownMap = new Map<string, ErrorBreakdown>();
  for (const h of historyEntries) {
    if (!errorBreakdownMap.has(h.errorType)) {
      errorBreakdownMap.set(h.errorType, { type: h.errorType, count: 0, resolved: 0, failed: 0 });
    }
    const entry = errorBreakdownMap.get(h.errorType)!;
    entry.count++;
    if (h.status === "RESOLVED") entry.resolved++;
    else entry.failed++;
  }
  const errorBreakdown = [...errorBreakdownMap.values()].sort((a, b) => b.count - a.count);

  // Per-service summary
  const serviceMap = new Map<string, ServiceSummary>();
  for (const inc of incidents) {
    if (!serviceMap.has(inc.service)) {
      serviceMap.set(inc.service, { service: inc.service, totalIncidents: 0, resolved: 0, failed: 0, open: 0, avgResolutionSec: null });
    }
    const s = serviceMap.get(inc.service)!;
    s.totalIncidents++;
    if (inc.finalStatus === "RESOLVED") s.resolved++;
    else if (inc.finalStatus === "FAILED") s.failed++;
    else s.open++;
  }
  // Compute average resolution time per service
  for (const [svc, summary] of serviceMap) {
    const durations = incidents
      .filter(i => i.service === svc && i.durationSeconds !== null)
      .map(i => i.durationSeconds as number);
    if (durations.length > 0) {
      summary.avgResolutionSec = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }
  }
  const serviceSummaries = [...serviceMap.values()];

  // Top-level stats
  const totalResolved  = incidents.filter(i => i.finalStatus === "RESOLVED").length;
  const totalFailed    = incidents.filter(i => i.finalStatus === "FAILED").length;
  const totalOpen      = incidents.filter(i => i.finalStatus === "OPEN").length;
  const allDurations   = incidents.filter(i => i.durationSeconds !== null).map(i => i.durationSeconds as number);
  const avgResolution  = allDurations.length > 0
    ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
    : null;

  const mostCommonError = errorBreakdown[0]?.type ?? "N/A";
  const worstService    = serviceSummaries.sort((a, b) => b.totalIncidents - a.totalIncidents)[0]?.service ?? "N/A";

  return {
    generatedAt: new Date().toISOString(),
    filter:      { service: filterService ?? "all", limit },
    stats: {
      totalIncidents:       incidents.length,
      totalResolved,
      totalFailed,
      totalOpen,
      resolutionRate:       incidents.length > 0 ? Math.round((totalResolved / incidents.length) * 100) : 100,
      avgResolutionSeconds: avgResolution,
      mostCommonErrorType:  mostCommonError,
      mostAffectedService:  worstService,
    },
    errorBreakdown,
    serviceSummaries,
    incidents: incidents.slice(-limit),
  };
}

// ─── GET /api/post-mortem ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url     = new URL(req.url);
  const service = url.searchParams.get("service") ?? undefined;
  const limit   = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  try {
    const report = buildPostMortem(service, limit);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
