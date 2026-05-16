/**
 * app/api/agent-log/route.ts
 *
 * GET /api/agent-log?lines=N
 *   Returns the last N lines of docs/agent-session.log.
 *   Parses each line into a structured object for the dashboard.
 *   Default: last 50 lines. Max: 200.
 */

import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import path from "path";

const REPO_ROOT   = path.join(process.cwd(), "..");
const SESSION_LOG = path.join(REPO_ROOT, "docs", "agent-session.log");

// Log line format: [ISO_TIMESTAMP] [AGENT:Name] ACTION: message
const LOG_PATTERN = /^\[(.+?)\] \[AGENT:(\w+)\] ACTION: (.+)$/;

interface LogEntry {
  timestamp: string;
  agent:     "Main" | "Alpha" | "Beta" | string;
  action:    string;
  raw:       string;
}

function parseLogLine(line: string): LogEntry | null {
  const match = line.match(LOG_PATTERN);
  if (!match) return null;
  return {
    timestamp: match[1],
    agent:     match[2],
    action:    match[3],
    raw:       line,
  };
}

export async function GET(req: NextRequest) {
  const url      = new URL(req.url);
  const nParam   = parseInt(url.searchParams.get("lines") ?? "50", 10);
  const maxLines = Math.min(isNaN(nParam) ? 50 : nParam, 200);

  if (!existsSync(SESSION_LOG)) {
    return NextResponse.json({
      entries:  [],
      total:    0,
      message:  "No agent-session.log yet — run sentinel-resolve.js to generate entries",
    });
  }

  const raw   = readFileSync(SESSION_LOG, "utf8");
  const lines = raw.split("\n").filter(l => l.trim() && !l.startsWith("#"));
  const slice = lines.slice(-maxLines);

  const entries: LogEntry[] = [];
  for (const line of slice) {
    const parsed = parseLogLine(line);
    if (parsed) entries.push(parsed);
  }

  // Group entries into sessions (each "Sentinel resolution engine started" starts a new session)
  const sessions: LogEntry[][] = [];
  let   current: LogEntry[]    = [];
  for (const e of entries) {
    if (e.action.includes("Sentinel resolution engine started") && current.length > 0) {
      sessions.push(current);
      current = [];
    }
    current.push(e);
  }
  if (current.length > 0) sessions.push(current);

  return NextResponse.json({
    entries,
    sessions: sessions.length,
    total:    lines.length,
    showing:  entries.length,
    lastUpdated: entries.at(-1)?.timestamp ?? null,
  });
}
