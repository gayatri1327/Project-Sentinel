#!/usr/bin/env node
/**
 * scripts/restore-service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Resets one or all services back to clean git state.
 * Use this between demos to undo any chaos-monkey changes.
 *
 * Usage:
 *   node scripts/restore-service.js                  → restore ALL services
 *   node scripts/restore-service.js auth-service     → restore one service
 *   node scripts/restore-service.js --reset-store    → also reset JSON store
 *   node scripts/restore-service.js --reset-logs     → also clear service logs
 *   node scripts/restore-service.js --full-reset     → everything above
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT         = path.join(__dirname, "..");
const SERVICES_DIR = path.join(ROOT, "services");
const LOG_DIR      = path.join(SERVICES_DIR, "logs");
const DATA_DIR     = path.join(ROOT, "app", "data");
const STORE_PATH   = path.join(DATA_DIR, "store.json");
const DOCS_DIR     = path.join(ROOT, "docs");
const SESSION_LOG  = path.join(DOCS_DIR, "agent-session.log");

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const fullReset  = args.includes("--full-reset");
const resetStore = fullReset || args.includes("--reset-store");
const resetLogs  = fullReset || args.includes("--reset-logs");
const target     = args.find(a => !a.startsWith("--")) ?? null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { console.log(`  ${msg}`); }
function ok(msg)  { console.log(`  ✅ ${msg}`); }
function warn(msg){ console.log(`  ⚠  ${msg}`); }
function fail(msg){ console.log(`  ❌ ${msg}`); }

/** Check whether the current directory is inside a git repository */
function isGitRepo() {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch { return false; }
}

/**
 * Run git checkout on a service path, reverting any uncommitted changes.
 * Silently ignores "did not match any files" (service was never changed by chaos).
 */
function gitCheckout(relativePath) {
  try {
    execSync(`git checkout -- "${relativePath}"`, { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch (e) {
    const msg = e.stderr?.toString() ?? e.message ?? "";
    // "did not match" means the file was never in git — not an error
    if (msg.includes("did not match") || msg.includes("unknown revision")) return true;
    return false;
  }
}

/**
 * Fallback when git is unavailable or checkout fails:
 * manually undo each known chaos mutation per service.
 */
function manualRestore(serviceName) {
  const serviceDir = path.join(SERVICES_DIR, serviceName);
  let fixed = 0;

  // ── Fix SYNTAX: remove `}}// CHAOS: syntax error injected` ──────
  function findSourceFiles(dir) {
    const res = [];
    if (!fs.existsSync(dir)) return res;
    fs.readdirSync(dir).forEach(f => {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory() && f !== "__tests__" && f !== "node_modules") {
        res.push(...findSourceFiles(full));
      } else if (/\.(ts|js)$/.test(f) && !f.includes(".test.") && !f.includes(".spec.")) {
        res.push(full);
      }
    });
    return res;
  }

  for (const file of findSourceFiles(serviceDir)) {
    let content = fs.readFileSync(file, "utf8");
    const marker = "// CHAOS: syntax error injected";
    if (content.includes(marker)) {
      const lines  = content.split("\n");
      const mIdx   = lines.findIndex(l => l.includes(marker));
      const strip  = lines[mIdx - 1]?.trim() === "}}" ? mIdx - 1 : mIdx;
      const clean  = lines.slice(0, strip);
      while (clean.length && clean[clean.length - 1].trim() === "") clean.pop();
      fs.writeFileSync(file, clean.join("\n") + "\n");
      fixed++;
    }
    // ── Fix TYPE: restore quoted numbers ────────────────────────────
    content = fs.readFileSync(file, "utf8");
    if (/=\s*"(\d{2,})"/.test(content)) {
      fs.writeFileSync(file, content.replace(/=\s*"(\d{2,})"/g, (_, n) => `= ${n}`));
      fixed++;
    }
    // ── Fix LOGIC: restore flipped operator ─────────────────────────
    content = fs.readFileSync(file, "utf8");
    if (content.includes(" <= ")) {
      fs.writeFileSync(file, content.replace(" <= ", " >= "));
      fixed++;
    }
  }

  // ── Fix DEPENDENCY: restore package.json ─────────────────────────
  const GOOD_DEPS = { express: "^4.18.2" };
  const pkgPath   = path.join(serviceDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg.dependencies = Object.assign({}, GOOD_DEPS, pkg.dependencies || {});
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    fixed++;
  }

  // ── Fix CONFIG: restore known-good configs ────────────────────────
  const GOOD_CONFIGS = {
    "auth-service":   { port: 3001, jwtSecret: "sentinel-secret-dev", tokenExpirySeconds: 3600 },
    "notify-service": { port: 3003, retryLimit: 3, timeoutMs: 5000 },
  };
  const goodCfg   = GOOD_CONFIGS[serviceName];
  const cfgPath   = path.join(serviceDir, "config.json");
  if (goodCfg) {
    fs.writeFileSync(cfgPath, JSON.stringify(goodCfg, null, 2));
    fixed++;
  } else if (serviceName === "data-service" && fs.existsSync(cfgPath)) {
    // data-service never had a config.json — remove any chaos-created one
    fs.unlinkSync(cfgPath);
    fixed++;
  }

  return fixed;
}

// ─── JSON store reset ─────────────────────────────────────────────────────────

function resetJsonStore() {
  const now = new Date().toISOString();
  const clean = {
    services: [
      { id:1, service:"auth-service",   status:"HEALTHY", error_type:"NONE", last_updated:now, resolved_by:null },
      { id:2, service:"data-service",   status:"HEALTHY", error_type:"NONE", last_updated:now, resolved_by:null },
      { id:3, service:"notify-service", status:"HEALTHY", error_type:"NONE", last_updated:now, resolved_by:null },
    ],
    incidents: [], nextServiceId: 4, nextIncidentId: 1,
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(clean, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║           SENTINEL — SERVICE RESTORE UTILITY           ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  // Determine target services
  const allServices = fs.readdirSync(SERVICES_DIR).filter(f => {
    const full = path.join(SERVICES_DIR, f);
    return fs.statSync(full).isDirectory() && f !== "logs";
  });

  const targets = target
    ? allServices.filter(s => s === target)
    : allServices;

  if (targets.length === 0) {
    fail(target ? `Service '${target}' not found in /services` : "No services found");
    process.exit(1);
  }

  const useGit = isGitRepo();
  if (!useGit) warn("Not a git repo — using manual pattern-based restore");

  log(`Restoring: ${targets.join(", ")}`);
  log(`Strategy : ${useGit ? "git checkout" : "manual pattern revert"}`);
  log(`Reset store: ${resetStore ? "yes" : "no"}`);
  log(`Reset logs : ${resetLogs ? "yes" : "no"}`);
  console.log();

  // ── Restore each service ─────────────────────────────────────────
  for (const svc of targets) {
    process.stdout.write(`  Restoring ${svc}… `);

    let success = false;
    if (useGit) {
      success = gitCheckout(`services/${svc}`);
      if (!success) {
        // git failed — try manual
        warn(`git checkout failed for ${svc}, trying manual restore`);
        const n = manualRestore(svc);
        success = true;
        process.stdout.write(`(manual, ${n} mutations reversed) `);
      }
    } else {
      const n = manualRestore(svc);
      success = true;
      process.stdout.write(`(${n} mutations reversed) `);
    }

    console.log(success ? "✅" : "❌");
  }

  // ── Reset service logs ───────────────────────────────────────────
  if (resetLogs) {
    console.log();
    log("Clearing service logs…");
    if (fs.existsSync(LOG_DIR)) {
      fs.readdirSync(LOG_DIR).forEach(f => {
        if (f.endsWith(".log")) {
          fs.writeFileSync(path.join(LOG_DIR, f), "");
          log(`  Cleared logs/${f}`);
        }
      });
    }
    // Also clear the agent session log
    if (fs.existsSync(SESSION_LOG)) {
      fs.writeFileSync(SESSION_LOG, `# Agent session log — reset at ${new Date().toISOString()}\n`);
      log("  Cleared docs/agent-session.log");
    }
    ok("Service logs cleared");
  }

  // ── Reset JSON store ─────────────────────────────────────────────
  if (resetStore) {
    console.log();
    log("Resetting JSON store to clean state…");
    resetJsonStore();
    ok("app/data/store.json reset — all services HEALTHY, incidents cleared");
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║                    RESTORE COMPLETE                    ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log(`  Services restored : ${targets.join(", ")}`);
  console.log(`  Store reset       : ${resetStore ? "yes" : "no (use --reset-store)"}`);
  console.log(`  Logs cleared      : ${resetLogs  ? "yes" : "no (use --reset-logs)"}`);
  console.log(`\n  Dashboard should show all HEALTHY on next poll.\n`);
}

main();
