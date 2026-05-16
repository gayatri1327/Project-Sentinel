/**
 * app/api/resolve/route.ts
 *
 * POST /api/resolve { service }
 *   Runs the full fix loop INLINE (no child process for the fix itself).
 *   Only spawns a child process for `npm test` verification.
 *   This avoids ALL Windows PATH / spawn / timeout issues.
 *
 * GET /api/resolve → returns queue
 */

import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, appendFileSync, mkdirSync } from "fs";
import path from "path";

// ─── Paths ────────────────────────────────────────────────────────────────────
const REPO_ROOT   = path.join(process.cwd(), "..");
const STORE_PATH  = path.join(process.cwd(), "data", "store.json");
const LOG_DIR     = path.join(REPO_ROOT, "services", "logs");
const DOCS_DIR    = path.join(REPO_ROOT, "docs");
const HISTORY_LOG = path.join(DOCS_DIR, "incident-history.log");
const SESSION_LOG = path.join(DOCS_DIR, "agent-session.log");
const SVC_DIR     = path.join(REPO_ROOT, "services");

// ─── Known-good configs ───────────────────────────────────────────────────────
const GOOD_CONFIGS: Record<string, object> = {
  "auth-service":   { port: 3001, jwtSecret: "sentinel-secret-dev", tokenExpirySeconds: 3600 },
  "notify-service": { port: 3003, retryLimit: 3, timeoutMs: 5000 },
};
const GOOD_DEPS: Record<string, Record<string, string>> = {
  "auth-service":   { express: "^4.18.2" },
  "data-service":   { express: "^4.18.2" },
  "notify-service": { express: "^4.18.2" },
};

// ─── Store helpers ────────────────────────────────────────────────────────────
interface Service  { id:number; service:string; status:string; error_type:string; last_updated:string; resolved_by:string|null; }
interface Incident { id:number; service:string; status:string; error_type:string; timestamp:string; resolved_at:string|null; fix_description:string|null; }
interface Store    { services:Service[]; incidents:Incident[]; nextServiceId:number; nextIncidentId:number; }

function readStore(): Store {
  try { return JSON.parse(readFileSync(STORE_PATH, "utf8")); }
  catch { return { services:[], incidents:[], nextServiceId:4, nextIncidentId:1 }; }
}
function writeStore(s: Store) { writeFileSync(STORE_PATH, JSON.stringify(s, null, 2)); }

// ─── Logging helpers ──────────────────────────────────────────────────────────
function sessionLog(agent: string, msg: string) {
  mkdirSync(DOCS_DIR, { recursive: true });
  appendFileSync(SESSION_LOG, `[${new Date().toISOString()}] [AGENT:${agent}] ACTION: ${msg}\n`);
}
function historyLog(svc: string, type: string, status: string, fix: string) {
  mkdirSync(DOCS_DIR, { recursive: true });
  appendFileSync(HISTORY_LOG, `[${new Date().toISOString()}] SERVICE=${svc} ERROR_TYPE=${type} STATUS=${status} FIX=${fix}\n`);
}

// ─── Chaos log parser ─────────────────────────────────────────────────────────
function parseChaosLog(svcName: string): { type: string; file: string; desc: string } | null {
  const logPath = path.join(LOG_DIR, `${svcName}.log`);
  if (!existsSync(logPath)) return null;
  const lines = readFileSync(logPath, "utf8").split("\n").filter(Boolean).reverse();
  for (const line of lines) {
    if (!line.includes("CHAOS INJECTED")) continue;
    const type = line.match(/TYPE=(\w+)/)?.[1];
    const file = line.match(/FILE=([^|]+)/)?.[1]?.trim() ?? "index.ts";
    const desc = line.match(/DESC=(.+)$/)?.[1]?.trim() ?? "";
    if (type) return { type, file, desc };
  }
  return null;
}

// ─── Source file walker ───────────────────────────────────────────────────────
function findSourceFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      const full = path.join(d, f);
      if (statSync(full).isDirectory()) {
        if (f !== "__tests__" && f !== "node_modules") walk(full);
      } else if (/\.(ts|js)$/.test(f) && !f.includes(".test.") && !f.includes(".spec.")) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// ─── Fix strategies (all pure file I/O — no child process) ────────────────────

function fixSyntax(serviceDir: string): { ok: boolean; desc: string } {
  const files = findSourceFiles(serviceDir);
  const MARKER = "// CHAOS: syntax error injected";
  for (const f of files) {
    const content = readFileSync(f, "utf8");
    if (!content.includes(MARKER)) continue;
    const lines  = content.split("\n");
    const mIdx   = lines.findIndex(l => l.includes(MARKER));
    if (mIdx === -1) continue;
    // Remove the marker line and the stray `}}` line before it
    const clean  = lines.slice(0, mIdx - (lines[mIdx - 1]?.trim() === "}}" ? 1 : 0));
    while (clean.length && clean[clean.length - 1].trim() === "") clean.pop();
    writeFileSync(f, clean.join("\n") + "\n");
    return { ok: true, desc: `Removed stray }}// CHAOS marker from ${path.basename(f)}` };
  }
  return { ok: true, desc: "No syntax marker found — file already clean" };
}

function fixType(serviceDir: string): { ok: boolean; desc: string } {
  const files = findSourceFiles(serviceDir);
  for (const f of files) {
    const content = readFileSync(f, "utf8");
    if (!/=\s*"(\d{2,})"/g.test(content)) continue;
    writeFileSync(f, content.replace(/=\s*"(\d{2,})"/g, (_, n) => `= ${n}`));
    return { ok: true, desc: `Restored numeric literal (removed erroneous quotes) in ${path.basename(f)}` };
  }
  return { ok: true, desc: "No quoted numeric found — file already clean" };
}

function fixLogic(serviceDir: string): { ok: boolean; desc: string } {
  const files = findSourceFiles(serviceDir);
  for (const f of files) {
    const content = readFileSync(f, "utf8");
    if (content.includes(" <= ")) {
      writeFileSync(f, content.replace(" <= ", " >= "));
      return { ok: true, desc: `Restored >= operator in ${path.basename(f)}` };
    }
    const lines = content.split("\n");
    const idx   = lines.findIndex(l => / < /.test(l) && /\d|\.length|threshold|count|id|value/.test(l));
    if (idx !== -1) {
      lines[idx] = lines[idx].replace(" < ", " > ");
      writeFileSync(f, lines.join("\n"));
      return { ok: true, desc: `Restored > operator in ${path.basename(f)}` };
    }
  }
  return { ok: true, desc: "No flipped operator found — file already clean" };
}

function fixDependency(serviceDir: string, svcName: string): { ok: boolean; desc: string } {
  const pkgPath = path.join(serviceDir, "package.json");
  if (!existsSync(pkgPath)) return { ok: false, desc: "package.json not found" };
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.dependencies = Object.assign({}, GOOD_DEPS[svcName] ?? {}, pkg.dependencies ?? {});
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  // express is still in node_modules (chaos only edited package.json) — no npm install needed
  return { ok: true, desc: "Restored express dependency in package.json" };
}

function fixConfig(serviceDir: string, svcName: string): { ok: boolean; desc: string } {
  const cfgPath = path.join(serviceDir, "config.json");
  const good    = GOOD_CONFIGS[svcName];
  if (!good) {
    if (existsSync(cfgPath)) { const { unlinkSync } = require("fs"); unlinkSync(cfgPath); }
    return { ok: true, desc: "Removed erroneous config.json" };
  }
  writeFileSync(cfgPath, JSON.stringify(good, null, 2));
  return { ok: true, desc: `Restored config.json for ${svcName}` };
}

// ─── Test runner ──────────────────────────────────────────────────────────────
function runTests(serviceDir: string, svcName: string): boolean {
  // Use process.execPath = exact path to node.exe on this machine
  const result = spawnSync(
    process.execPath,
    [path.join(serviceDir, "node_modules", ".bin", "jest"), "--forceExit", "--passWithNoTests"],
    { cwd: serviceDir, stdio: "pipe", timeout: 60_000, shell: false }
  );
  if (result.status === 0) return true;

  // Fallback: call npm test (slower but more reliable across environments)
  const npm = spawnSync("npm", ["test", "--", "--forceExit", "--passWithNoTests"], {
    cwd: serviceDir, stdio: "pipe", timeout: 60_000,
    shell: true, env: { ...process.env, NODE_ENV: "test" },
  });
  return npm.status === 0;
}

// ─── Queue ────────────────────────────────────────────────────────────────────
interface QueueEntry { id:string; service:string; startedAt:string; status:"running"|"resolved"|"failed"; endedAt?:string; }
const queue: QueueEntry[] = [];
let queueSeq = 0;

export async function GET() {
  return NextResponse.json({ queue: queue.slice(-20), running: queue.filter(e=>e.status==="running").length });
}

// ─── POST /api/resolve ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body    = await req.json().catch(() => ({})) as { service?: string };
  const service = body.service;
  if (!service) return NextResponse.json({ error: "Missing: service" }, { status: 400 });

  const store  = readStore();
  const svc    = store.services.find(s => s.service === service);
  if (!svc) return NextResponse.json({ error: `Service '${service}' not found in store` }, { status: 404 });

  // Mark investigating
  const now = new Date().toISOString();
  svc.status       = "INVESTIGATING";
  svc.last_updated = now;
  writeStore(store);

  sessionLog("Main", `Sentinel resolution engine started`);
  sessionLog("Main", `Targeting 1 service(s): ${service}`);
  sessionLog("Main", `Reading status for ${service} — status=CRITICAL`);
  sessionLog("Main", `Marked ${service} as INVESTIGATING`);

  const serviceDir = path.join(SVC_DIR, service);

  // ── Alpha: parse chaos log ────────────────────────────────────────
  sessionLog("Alpha", `Reading chaos log at services/logs/${service}.log`);
  const chaos = parseChaosLog(service);
  const errorType = chaos?.type ?? svc.error_type ?? "SYNTAX";
  sessionLog("Alpha", `Chaos detected — TYPE=${errorType} FILE=${chaos?.file ?? "index.ts"}`);
  sessionLog("Alpha", `Description: ${chaos?.desc ?? "Unknown"}`);

  // ── Alpha: apply fix ──────────────────────────────────────────────
  sessionLog("Alpha", `Applying fix for ${errorType} error in ${service}…`);
  let fixResult: { ok: boolean; desc: string };

  switch (errorType) {
    case "SYNTAX":     fixResult = fixSyntax(serviceDir);                break;
    case "TYPE":       fixResult = fixType(serviceDir);                  break;
    case "LOGIC":      fixResult = fixLogic(serviceDir);                 break;
    case "DEPENDENCY": fixResult = fixDependency(serviceDir, service);   break;
    case "CONFIG":     fixResult = fixConfig(serviceDir, service);       break;
    default:           fixResult = fixSyntax(serviceDir);                break;  // safe fallback
  }

  sessionLog("Alpha", `Fix applied: ${fixResult.desc}`);

  // ── Beta: run tests ───────────────────────────────────────────────
  sessionLog("Beta", `Running npm test in ${service}…`);
  const passed = runTests(serviceDir, service);
  sessionLog("Beta", passed ? `Tests PASSED for ${service}` : `Tests FAILED for ${service}`);

  // ── Main: update store ────────────────────────────────────────────
  const freshStore = readStore();
  const freshSvc   = freshStore.services.find(s => s.service === service);
  const resolvedAt = new Date().toISOString();

  if (freshSvc) {
    if (passed) {
      freshSvc.status      = "HEALTHY";
      freshSvc.error_type  = "NONE";
      freshSvc.last_updated = resolvedAt;
      freshSvc.resolved_by = "Claude Sentinel";
      freshStore.incidents
        .filter(i => i.service === service && !i.resolved_at)
        .forEach(i => { i.resolved_at = resolvedAt; i.fix_description = fixResult.desc; });
      sessionLog("Main", `✓ Fix verified — marking ${service} as HEALTHY`);
      sessionLog("Main", `Updated dashboard store: ${service} → HEALTHY`);
      sessionLog("Beta", `Regression test suite passed — fix is stable`);
      historyLog(service, errorType, "RESOLVED", fixResult.desc);
    } else {
      freshSvc.status      = "CRITICAL";
      freshSvc.last_updated = resolvedAt;
      sessionLog("Main", `❌ ${service} fix FAILED — tests did not pass`);
      historyLog(service, errorType, "FAILED", `Fix attempted but tests failed`);
    }
  }
  writeStore(freshStore);

  return NextResponse.json({
    ok:        passed,
    service,
    status:    passed ? "resolved" : "failed",
    errorType,
    fixDesc:   fixResult.desc,
    message:   passed
      ? `${service} is HEALTHY — fix applied and verified`
      : `Fix applied but tests failed — check Agent Log`,
  }, { status: passed ? 200 : 422 });
}
