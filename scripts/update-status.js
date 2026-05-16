#!/usr/bin/env node
/**
 * update-status.js
 * Updates a service's status in the JSON flat-file store.
 * Usage: node scripts/update-status.js <service> <status> [error_type]
 *
 * Compatible with Node.js 24 — no native bindings required.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../app/data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

const [,, service, status, errorType = "NONE"] = process.argv;

if (!service || !status) {
  console.error("Usage: node update-status.js <service> <status> [error_type]");
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readStore() {
  if (!fs.existsSync(STORE_PATH)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const now = new Date().toISOString();
    const initial = {
      services: [
        { id: 1, service: "auth-service",   status: "HEALTHY", error_type: "NONE", last_updated: now, resolved_by: null },
        { id: 2, service: "data-service",   status: "HEALTHY", error_type: "NONE", last_updated: now, resolved_by: null },
        { id: 3, service: "notify-service", status: "HEALTHY", error_type: "NONE", last_updated: now, resolved_by: null },
      ],
      incidents: [],
      nextServiceId: 4,
      nextIncidentId: 1,
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const now = new Date().toISOString();
const store = readStore();

// Upsert service status
const existing = store.services.find((s) => s.service === service);
if (existing) {
  existing.status = status;
  existing.error_type = errorType;
  existing.last_updated = now;
  existing.resolved_by = status === "HEALTHY" ? "Claude Sentinel" : null;
} else {
  store.services.push({
    id: store.nextServiceId++,
    service,
    status,
    error_type: errorType,
    last_updated: now,
    resolved_by: status === "HEALTHY" ? "Claude Sentinel" : null,
  });
}

// Log incident if CRITICAL
if (status === "CRITICAL") {
  store.incidents.push({
    id: store.nextIncidentId++,
    service,
    status,
    error_type: errorType,
    timestamp: now,
    resolved_at: null,
    fix_description: null,
  });
}

// Mark latest unresolved incident as resolved when going HEALTHY
if (status === "HEALTHY") {
  const unresolved = store.incidents
    .filter((i) => i.service === service && i.resolved_at === null)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (unresolved.length > 0) {
    unresolved[0].resolved_at = now;
    unresolved[0].fix_description = "Auto-fixed by Sentinel";
  }
}

writeStore(store);
console.log(`✅ Updated: ${service} → ${status} (${errorType})`);
