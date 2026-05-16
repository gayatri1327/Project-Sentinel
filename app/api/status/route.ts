/**
 * app/api/status/route.ts
 * Returns all service statuses from SQLite for the dashboard.
 */

import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "sentinel.db");

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

function initDb() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'HEALTHY',
      error_type TEXT DEFAULT 'NONE',
      last_updated TEXT NOT NULL,
      resolved_by TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service TEXT NOT NULL,
      status TEXT NOT NULL,
      error_type TEXT,
      timestamp TEXT NOT NULL,
      resolved_at TEXT DEFAULT NULL,
      fix_description TEXT DEFAULT NULL
    );
  `);

  // Seed default services if empty
  const count = (db.prepare("SELECT COUNT(*) as c FROM service_status").get() as { c: number }).c;
  if (count === 0) {
    const now = new Date().toISOString();
    ["auth-service", "data-service", "notify-service"].forEach((svc) => {
      db.prepare(
        "INSERT OR IGNORE INTO service_status (service, status, error_type, last_updated) VALUES (?, 'HEALTHY', 'NONE', ?)"
      ).run(svc, now);
    });
  }

  return db;
}

export async function GET() {
  try {
    const db = initDb();
    const services = db.prepare("SELECT * FROM service_status ORDER BY service").all() as ServiceStatus[];
    const incidents = db
      .prepare("SELECT * FROM incidents ORDER BY timestamp DESC LIMIT 20")
      .all() as Incident[];

    const resolvedToday = incidents.filter(
      (i) => i.resolved_at && i.resolved_at > new Date(Date.now() - 86400000).toISOString()
    ).length;

    const criticalCount = services.filter((s) => s.status === "CRITICAL").length;
    const healthyCount = services.filter((s) => s.status === "HEALTHY").length;

    db.close();
    return NextResponse.json({ services, incidents, resolvedToday, criticalCount, healthyCount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
