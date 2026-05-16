/**
 * app/api/chaos/route.ts
 * POST /api/chaos  { service? }  → calls chaos-monkey.js CLI (writes log + store)
 * POST /api/chaos?action=resolve { service } → calls sentinel-resolve.js CLI
 *
 * Using the actual CLI scripts ensures the service log is always written,
 * which sentinel-resolve.js depends on to identify the bug type and file.
 */

import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import path from "path";

// ─── Paths (relative to the Next.js app CWD = sentinel/app/) ─────────────────
const REPO_ROOT   = path.join(process.cwd(), "..");
const SCRIPTS_DIR = path.join(REPO_ROOT, "scripts");
const DATA_DIR    = path.join(process.cwd(), "data");
const STORE_PATH  = path.join(DATA_DIR, "store.json");
const LOG_DIR     = path.join(REPO_ROOT, "services", "logs");

// ─── JSON store helpers ───────────────────────────────────────────────────────
type Status    = "HEALTHY" | "CRITICAL" | "INVESTIGATING" | "DEGRADED";
type ErrorType = "SYNTAX" | "TYPE" | "LOGIC" | "DEPENDENCY" | "CONFIG" | "NONE";

interface Service  { id: number; service: string; status: Status; error_type: string; last_updated: string; resolved_by: string | null; }
interface Incident { id: number; service: string; status: string; error_type: string; timestamp: string; resolved_at: string | null; fix_description: string | null; }
interface Store    { services: Service[]; incidents: Incident[]; nextServiceId: number; nextIncidentId: number; }

function readStore(): Store {
  if (!existsSync(STORE_PATH)) {
    mkdirSync(DATA_DIR, { recursive: true });
    const now = new Date().toISOString();
    const s: Store = {
      services: [
        { id: 1, service: "auth-service",   status: "HEALTHY", error_type: "NONE", last_updated: now, resolved_by: null },
        { id: 2, service: "data-service",   status: "HEALTHY", error_type: "NONE", last_updated: now, resolved_by: null },
        { id: 3, service: "notify-service", status: "HEALTHY", error_type: "NONE", last_updated: now, resolved_by: null },
      ],
      incidents: [], nextServiceId: 4, nextIncidentId: 1,
    };
    writeFileSync(STORE_PATH, JSON.stringify(s, null, 2));
    return s;
  }
  return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Store;
}
function writeStore(s: Store) { writeFileSync(STORE_PATH, JSON.stringify(s, null, 2)); }

const ERROR_TYPES: ErrorType[] = ["SYNTAX", "TYPE", "LOGIC", "DEPENDENCY", "CONFIG"];

// ─── Write a chaos log entry directly (fallback when CLI can't inject) ────────
function writeChaosLog(service: string, errorType: string) {
  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `${service}.log`);
  const ts      = new Date().toISOString();
  appendFileSync(logPath, `[${ts}] CHAOS INJECTED | TYPE=${errorType} | FILE=index.ts | DESC=Simulated ${errorType} error via dashboard\n`);
}

// ─── POST /api/chaos ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const url    = new URL(req.url);
  const action = url.searchParams.get("action") ?? "chaos";
  const body   = await req.json().catch(() => ({})) as { service?: string };

  // ── ACTION: chaos ─────────────────────────────────────────────────────────
  if (action === "chaos") {
    const store    = readStore();
    const services = store.services.map(s => s.service);
    const target   = body.service ?? services[Math.floor(Math.random() * services.length)];
    const svc      = store.services.find(s => s.service === target);
    if (!svc) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    // Try real chaos-monkey.js first (writes source-level bug + log)
    const chaosScript = path.join(SCRIPTS_DIR, "chaos-monkey.js");
    let   cliInjected = false;
    let   detectedType = ERROR_TYPES[Math.floor(Math.random() * ERROR_TYPES.length)];

    if (existsSync(chaosScript)) {
      const result = spawnSync("node", [`"${chaosScript}"`, `"${target}"`], {
        cwd: REPO_ROOT, shell: true, timeout: 30_000, encoding: "utf8",
      });
      const out = (result.stdout ?? "") + (result.stderr ?? "");
      if (result.status === 0 && out.includes("CHAOS MONKEY STRUCK")) {
        cliInjected = true;
        // The CLI also updates the store — re-read it
        const fresh = readStore();
        const freshSvc = fresh.services.find(s => s.service === target);
        if (freshSvc) {
          detectedType = freshSvc.error_type as ErrorType;
        }
        return NextResponse.json({ ok: true, service: target, error_type: detectedType, source: "cli", output: out.slice(-600) });
      }
    }

    // Fallback: update store + write log directly (chaos-monkey couldn't inject source bug)
    if (!cliInjected) {
      const now = new Date().toISOString();
      svc.status      = "CRITICAL";
      svc.error_type  = detectedType;
      svc.last_updated = now;
      svc.resolved_by  = null;
      store.incidents.push({ id: store.nextIncidentId++, service: target, status: "CRITICAL", error_type: detectedType, timestamp: now, resolved_at: null, fix_description: null });
      writeStore(store);
      writeChaosLog(target, detectedType);
    }

    return NextResponse.json({ ok: true, service: target, error_type: detectedType, source: "fallback" });
  }

  // ── ACTION: resolve (quick store-only resolve for the card button) ─────────
  if (action === "resolve") {
    const target = body.service;
    if (!target) return NextResponse.json({ error: "service required" }, { status: 400 });
    const store = readStore();
    const svc   = store.services.find(s => s.service === target);
    if (!svc) return NextResponse.json({ error: "Service not found" }, { status: 404 });
    const now = new Date().toISOString();
    svc.status       = "HEALTHY";
    svc.error_type   = "NONE";
    svc.last_updated = now;
    svc.resolved_by  = "Claude Sentinel";
    const open = store.incidents.filter(i => i.service === target && !i.resolved_at);
    open.forEach(i => { i.resolved_at = now; i.fix_description = "Auto-fixed by Sentinel Agent"; });
    writeStore(store);
    return NextResponse.json({ ok: true, service: target, resolved: open.length });
  }

  return NextResponse.json({ error: "Unknown action. Use ?action=chaos or ?action=resolve" }, { status: 400 });
}
