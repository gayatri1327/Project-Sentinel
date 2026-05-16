/**
 * app/api/status/route.ts
 * Returns all service statuses from a JSON flat-file store for the dashboard.
 * Uses JSON instead of SQLite to avoid native binary dependencies.
 */

import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ServiceStatus {
  id: number;
  service: string;
  status: "HEALTHY" | "CRITICAL" | "INVESTIGATING" | "DEGRADED";
  error_type: string;
  last_updated: string;
  resolved_by: string | null;
}

export interface Incident {
  id: number;
  service: string;
  status: string;
  error_type: string;
  timestamp: string;
  resolved_at: string | null;
  fix_description: string | null;
}

interface Store {
  services: ServiceStatus[];
  incidents: Incident[];
  nextServiceId: number;
  nextIncidentId: number;
}

// ─── Store helpers ─────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

/** Read the JSON store, initialising it with seed data if it doesn't exist. */
function readStore(): Store {
  if (!existsSync(STORE_PATH)) {
    mkdirSync(DATA_DIR, { recursive: true });
    const now = new Date().toISOString();
    const initial: Store = {
      services: [
        { id: 1, service: "auth-service",   status: "HEALTHY", error_type: "NONE", last_updated: now, resolved_by: null },
        { id: 2, service: "data-service",   status: "HEALTHY", error_type: "NONE", last_updated: now, resolved_by: null },
        { id: 3, service: "notify-service", status: "HEALTHY", error_type: "NONE", last_updated: now, resolved_by: null },
      ],
      incidents: [],
      nextServiceId: 4,
      nextIncidentId: 1,
    };
    writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Store;
}

// ─── GET /api/status ───────────────────────────────────────────────────────────

export async function GET() {
  try {
    const store = readStore();
    const { services, incidents } = store;

    const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const resolvedToday = incidents.filter(
      (i) => i.resolved_at && i.resolved_at > oneDayAgo
    ).length;

    const criticalCount = services.filter((s) => s.status === "CRITICAL").length;
    const healthyCount  = services.filter((s) => s.status === "HEALTHY").length;

    // Return the 20 most recent incidents
    const recentIncidents = [...incidents]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 20);

    return NextResponse.json({
      services,
      incidents: recentIncidents,
      resolvedToday,
      criticalCount,
      healthyCount,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
