# 🛡️ Project Sentinel — Autonomous Incident Resolution Engine

> *"No more 3 AM wake-up calls. Sentinel detects failures, diagnoses root causes, and fixes production bugs — autonomously."*


---

## 📖 Table of Contents

1. [What Is This?](#-what-is-this)
2. [Architecture Overview](#-architecture-overview)
3. [Monorepo Structure](#-monorepo-structure)
4. [The Multi-Agent System](#-the-multi-agent-system)
5. [The 5 Chaos Bug Types](#-the-5-chaos-bug-types)
6. [API Reference](#-api-reference)
7. [Getting Started](#-getting-started)
8. [Demo Walkthrough](#-demo-walkthrough)
9. [Sample Outputs](#-sample-outputs)
10. [CI/CD Pipeline](#-cicd-pipeline)
11. [Tech Stack](#-tech-stack)
12. [CLAUDE.md Protocol](#-claudemd-protocol)

---

## 🤔 What Is This?

**Project Sentinel** is a fully autonomous incident resolution engine built as a DevOps mastery capstone. It simulates a real production environment where:

- A **Chaos Monkey** randomly breaks microservices (syntax errors, type errors, logic bugs, dependency corruption, config corruption)
- A **real-time dashboard** detects failures within 5 seconds
- A **3-agent AI system** (Main → Alpha → Beta) automatically diagnoses, patches, and verifies the fix
- **Zero human intervention** is required from detection to resolution

The project demonstrates autonomous agentic AI workflows, multi-agent orchestration, and real-time incident management.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PROJECT SENTINEL SYSTEM                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  Next.js Dashboard (port 3000)               │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │    │
│  │  │ /api/    │  │ /api/    │  │ /api/    │  │ /api/      │  │    │
│  │  │ status   │  │ chaos    │  │ resolve  │  │ agent-log  │  │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬───────┘  │    │
│  └───────┼─────────────┼─────────────┼──────────────┼──────────┘    │
│          │             │             │              │                │
│          ▼             ▼             ▼              ▼                │
│  ┌──────────────┐  ┌────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ store.json   │  │ chaos- │  │ Fix Logic    │  │ agent-       │  │
│  │ (flat-file   │  │ monkey │  │ (inline,     │  │ session.log  │  │
│  │  data store) │  │ .js    │  │  no spawn)   │  │              │  │
│  └──────────────┘  └────┬───┘  └──────┬───────┘  └──────────────┘  │
│                         │             │                              │
│                    ┌────▼─────────────▼────┐                        │
│                    │   /services/           │                        │
│                    │  ┌────────────────┐    │                        │
│                    │  │ auth-service   │    │                        │
│                    │  │ data-service   │    │                        │
│                    │  │ notify-service │    │                        │
│                    │  └────────────────┘    │                        │
│                    │   /services/logs/      │                        │
│                    └───────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
CHAOS INJECT          DETECT              RESOLVE            VERIFY
─────────────         ──────────          ─────────          ──────────
chaos-monkey.js  →    store.json     →    /api/resolve  →    npm test
  (breaks svc)        (status=         (fixes file,         (Jest suite)
                       CRITICAL)         updates store)
                            │                                    │
                            ▼                                    ▼
                      Dashboard polls             agent-session.log
                      every 5 seconds             incident-history.log
```

---

## 📁 Monorepo Structure

```
sentinel/
│
├── 📱 app/                          # Next.js 14 Dashboard
│   ├── src/app/
│   │   ├── page.tsx                 # Main dashboard (3 tabs: Services, Agent Log, Post-Mortem)
│   │   ├── layout.tsx               # Root layout with Tailwind CSS
│   │   ├── globals.css              # Tailwind directives + component classes
│   │   └── api/
│   │       ├── status/route.ts      # GET  — reads store.json, returns service statuses
│   │       ├── chaos/route.ts       # POST — triggers chaos-monkey.js
│   │       ├── resolve/route.ts     # POST — runs inline fix logic + npm test
│   │       ├── agent-log/route.ts   # GET  — parses docs/agent-session.log
│   │       └── post-mortem/route.ts # GET  — generates incident report JSON
│   ├── data/
│   │   └── store.json               # Flat-file state store (services + incidents)
│   ├── tailwind.config.js           # Custom navy palette, animations, component utilities
│   ├── vercel.json                  # Vercel deployment config (Mumbai region)
│   └── package.json
│
├── 🔧 services/                     # Mock Microservices
│   ├── auth-service/                # JWT auth simulation (port 3001)
│   │   ├── index.ts                 # Express app — /health, /login, /verify, /users
│   │   ├── __tests__/auth.test.ts   # Jest regression suite
│   │   └── config.json              # { port, jwtSecret, tokenExpirySeconds }
│   ├── data-service/                # Data CRUD simulation (port 3002)
│   │   ├── index.ts                 # Express app — /health, /items, /stats
│   │   ├── __tests__/data.test.ts
│   │   └── package.json
│   ├── notify-service/              # Notification delivery simulation (port 3003)
│   │   ├── index.ts                 # Express app — /health, /notify, /send, /history
│   │   ├── __tests__/notify.test.ts
│   │   └── config.json              # { port, retryLimit, timeoutMs }
│   └── logs/                        # Per-service chaos event logs
│       ├── auth-service.log
│       ├── data-service.log
│       └── notify-service.log
│
├── 🤖 scripts/                      # Automation Scripts
│   ├── chaos-monkey.js              # Injects 5 types of bugs randomly
│   ├── sentinel-resolve.js          # Full agentic CLI resolution loop
│   ├── restore-service.js           # Clean-state reset utility
│   └── update-status.js             # Manual store status patcher
│
├── 📄 docs/                         # Logs & Templates
│   ├── agent-session.log            # Multi-agent session transcript
│   ├── incident-history.log         # All RESOLVED/FAILED resolution attempts
│   └── post-mortem-template.md      # Template for post-mortem reports
│
├── ⚙️ .github/workflows/
│   ├── ci.yml                       # Lint + test matrix + build on push
│   └── deploy.yml                   # Vercel production deploy on merge to main
│
├── 📋 CLAUDE.md                     # AI Resolution Protocol (agent rules)
└── package.json                     # Root scripts
```

---

## 🤖 The Multi-Agent System

Sentinel uses a **3-agent orchestration pattern** coordinated by `sentinel-resolve.js` (CLI) and `app/api/resolve/route.ts` (web):

```
┌─────────────────────────────────────────────────────────────────┐
│                    SENTINEL AGENTIC LOOP                         │
│                                                                  │
│  [Main Agent] ──── reads store.json ──── finds CRITICAL service  │
│       │                                                          │
│       ▼                                                          │
│  [Main Agent] ──── marks INVESTIGATING ── writes store.json      │
│       │                                                          │
│       ▼                                                          │
│  [Subagent Alpha] ── reads services/logs/<svc>.log               │
│       │               parses: TYPE=? FILE=? DESC=?               │
│       │                                                          │
│       ▼                                                          │
│  [Main Agent] ──── checks incident-history.log                   │
│       │             if prior FAILED attempts → Thinking Mode      │
│       │                                                          │
│       ▼                                                          │
│  [Subagent Alpha] ── applies targeted fix (pure file I/O):       │
│       │               SYNTAX     → strips }} CHAOS marker        │
│       │               TYPE       → restores numeric literals      │
│       │               LOGIC      → flips < back to >             │
│       │               DEPENDENCY → restores package.json entry    │
│       │               CONFIG     → restores config.json           │
│       │                                                          │
│       ▼                                                          │
│  [Subagent Beta] ─── runs npm test --forceExit                   │
│       │               PASS → mark HEALTHY, append to logs        │
│       │               FAIL → mark CRITICAL, log as FAILED        │
│       │                                                          │
│       ▼                                                          │
│  [Main Agent] ──── updates store.json ── appends session log     │
│                     appends incident-history.log                 │
└─────────────────────────────────────────────────────────────────┘
```

### Thinking Mode

If `incident-history.log` contains prior `STATUS=FAILED` entries for the same `SERVICE + ERROR_TYPE` combination, the Main Agent activates **Thinking Mode** — a flag that switches to an alternative resolution strategy (more aggressive pattern matching, broader file search scope).

---

## 🐒 The 5 Chaos Bug Types

| Type | What chaos-monkey.js does | What sentinel fixes |
|---|---|---|
| **SYNTAX** | Appends `}}// CHAOS: syntax error injected` to a `.ts` file | Strips from the marker line back to last clean line |
| **TYPE** | Converts `= 3600` → `= "3600"` (number to string) | Regex replaces `= "NNN"` → `= NNN` across all source files |
| **LOGIC** | Flips `>=` → `<=` (or `>` → `<`) in a comparison | Finds the first flipped operator, restores it |
| **DEPENDENCY** | Removes `express` from `package.json` dependencies | Restores from `GOOD_DEPS` baseline (no npm install needed — node_modules untouched) |
| **CONFIG** | Writes `{"CORRUPTED": true}` to `config.json` | Overwrites from known-good hardcoded config map |

---

## 🔌 API Reference

### `GET /api/status`
Returns current service statuses, incidents, and health metrics.

```json
{
  "services": [
    { "id": 1, "service": "auth-service", "status": "HEALTHY", "error_type": "NONE", "last_updated": "2026-05-16T..." },
    { "id": 2, "service": "data-service",  "status": "CRITICAL", "error_type": "SYNTAX", "last_updated": "2026-05-16T..." },
    { "id": 3, "service": "notify-service","status": "HEALTHY", "error_type": "NONE", "last_updated": "2026-05-16T..." }
  ],
  "incidents": [...],
  "healthyCount": 2,
  "criticalCount": 1,
  "resolvedToday": 3
}
```

---

### `POST /api/chaos`
Injects a random bug into a service.

**Request:**
```json
{ "service": "auth-service" }   // optional — omit for random service
```

**Response:**
```json
{
  "ok": true,
  "service": "auth-service",
  "error_type": "SYNTAX",
  "detail": "Appended stray `}}` to file",
  "file": "index.ts"
}
```

---

### `POST /api/resolve`
Triggers the full autonomous fix loop for a service.

**Request:**
```json
{ "service": "data-service" }
```

**Response (200 — success):**
```json
{
  "ok": true,
  "service": "data-service",
  "status": "resolved",
  "errorType": "SYNTAX",
  "fixDesc": "Removed stray }}// CHAOS marker from index.ts",
  "message": "data-service is HEALTHY — fix applied and verified"
}
```

**Response (422 — tests failed):**
```json
{
  "ok": false,
  "service": "data-service",
  "status": "failed",
  "errorType": "TYPE",
  "message": "Fix applied but tests failed — check Agent Log"
}
```

---

### `GET /api/agent-log?lines=60`
Returns the last N lines of `docs/agent-session.log` as structured JSON.

```json
{
  "entries": [
    { "timestamp": "2026-05-16T09:24:01Z", "agent": "Main",  "action": "Sentinel resolution engine started" },
    { "timestamp": "2026-05-16T09:24:01Z", "agent": "Alpha", "action": "Chaos detected — TYPE=SYNTAX FILE=index.ts" },
    { "timestamp": "2026-05-16T09:24:02Z", "agent": "Alpha", "action": "Fix applied: Removed stray }}// CHAOS marker" },
    { "timestamp": "2026-05-16T09:24:07Z", "agent": "Beta",  "action": "Tests PASSED for data-service" },
    { "timestamp": "2026-05-16T09:24:07Z", "agent": "Main",  "action": "Updated dashboard store: data-service → HEALTHY" }
  ],
  "total": 5,
  "source": "docs/agent-session.log"
}
```

---

### `GET /api/post-mortem`
Generates a structured post-mortem report from `incident-history.log` and `store.json`.

```json
{
  "generatedAt": "2026-05-16T...",
  "stats": {
    "totalIncidents": 12,
    "totalResolved": 10,
    "totalFailed": 2,
    "resolutionRate": 83,
    "avgResolutionSeconds": 8,
    "mostCommonErrorType": "SYNTAX",
    "mostAffectedService": "data-service"
  },
  "errorBreakdown": [
    { "type": "SYNTAX", "count": 5, "resolved": 5, "failed": 0 },
    { "type": "DEPENDENCY", "count": 3, "resolved": 2, "failed": 1 }
  ],
  "serviceSummaries": [...]
}
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+ 
- **npm** v9+
- **Windows / macOS / Linux**

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/sentinel.git
cd sentinel

# Install root scripts dependencies
npm install

# Install dashboard dependencies
cd app && npm install && cd ..

# Install each service
cd services/auth-service   && npm install && cd ../..
cd services/data-service   && npm install && cd ../..
cd services/notify-service && npm install && cd ../..
```

### 2. Start the Dashboard

```bash
cd app
npm run dev
```

Dashboard opens at **http://localhost:3000**

### 3. Reset to Clean State

```bash
node scripts/restore-service.js --full-reset
```

This resets all services to HEALTHY, clears all logs, and resets the store.

---

## 🎬 Demo Walkthrough

This is the exact sequence to demonstrate the full autonomous loop:

### Step 1 — All Services Healthy
```
http://localhost:3000  →  Health Ring: 100%  |  3/3 Operational
```

### Step 2 — Inject Chaos
```bash
# Via dashboard: click "🐒 CHAOS" button
# OR via CLI:
node scripts/chaos-monkey.js auth-service
```

Output:
```
🐒 CHAOS MONKEY STRUCK!
   Service  : auth-service
   Bug Type : LOGIC
   File     : services/auth-service/index.ts
   Detail   : Flipped > to < comparison operator
   Time     : 2026-05-16T15:41:45.087Z

🚨 Service status set to CRITICAL.
```

Dashboard updates automatically within **5 seconds** — auth-service card turns red.

### Step 3 — Autonomous Fix
```
Click "✦ AUTO-FIX" on the incident  |  OR  |  via CLI:
node scripts/sentinel-resolve.js auth-service
```

CLI Output:
```
╔════════════════════════════════════════════════════════╗
║     SENTINEL — AUTONOMOUS INCIDENT RESOLUTION ENGINE   ║
╚════════════════════════════════════════════════════════╝
  Started: 2026-05-16T15:41:56.000Z

  Found 1 CRITICAL service(s): auth-service

────────────────────────────────────────────────────────────
🔍 Resolving: auth-service
────────────────────────────────────────────────────────────
  [Main]  Reading status for auth-service — status=CRITICAL
  [Main]  Marked auth-service as INVESTIGATING
  [Alpha] Reading chaos log at services/logs/auth-service.log
  [Alpha] Chaos detected — TYPE=LOGIC FILE=index.ts
  [Alpha] Description: Flipped > to < comparison operator
  [Main]  Checking incident history for prior failures
  [Main]  No prior failures — proceeding with standard fix
  [Alpha] Applying fix for LOGIC error in auth-service…
  [Alpha] Fix applied: Restored > operator in index.ts
  [Beta]  Running npm test in auth-service…
  [Beta]  Tests PASSED for auth-service
  [Main]  ✓ Fix verified — marking auth-service as HEALTHY
  [Main]  Updated dashboard store: auth-service → HEALTHY

✅ auth-service resolved successfully!

╔════════════════════════════════════════════════════════╗
║                   RESOLUTION SUMMARY                   ║
╚════════════════════════════════════════════════════════╝
  ✅ auth-service  → RESOLVED [LOGIC]

  Resolved: 1/1
  Session log: docs/agent-session.log
  History log: docs/incident-history.log
```

Dashboard updates: auth-service turns **HEALTHY**, ring jumps back to **100%**.

### Step 4 — View Agent Log Tab
Click **⚡ AGENT LOG** tab in the dashboard to see the full multi-agent trace.

### Step 5 — Post-Mortem
Click **📋 POST-MORTEM** tab to see resolution metrics, error breakdown, and service reliability scores.

### Step 6 — Reset for Next Demo
```bash
node scripts/restore-service.js --full-reset
```

---

## 📊 Sample Outputs

### `docs/agent-session.log`
```
[2026-05-16T09:24:01.663Z] [AGENT:Main]  ACTION: Sentinel resolution engine started
[2026-05-16T09:24:01.670Z] [AGENT:Main]  ACTION: Targeting 1 service(s): data-service
[2026-05-16T09:24:01.680Z] [AGENT:Main]  ACTION: Reading status for data-service — status=CRITICAL
[2026-05-16T09:24:01.690Z] [AGENT:Main]  ACTION: Marked data-service as INVESTIGATING
[2026-05-16T09:24:01.700Z] [AGENT:Alpha] ACTION: Reading chaos log at services/logs/data-service.log
[2026-05-16T09:24:01.710Z] [AGENT:Alpha] ACTION: Chaos detected — TYPE=SYNTAX FILE=index.ts
[2026-05-16T09:24:01.720Z] [AGENT:Alpha] ACTION: Description: Appended stray `}}` to file
[2026-05-16T09:24:01.730Z] [AGENT:Main]  ACTION: No prior failures — proceeding with standard fix protocol
[2026-05-16T09:24:01.740Z] [AGENT:Alpha] ACTION: Applying fix for SYNTAX error in data-service…
[2026-05-16T09:24:01.750Z] [AGENT:Alpha] ACTION: Fix applied: Removed stray }}// CHAOS marker from index.ts
[2026-05-16T09:24:01.760Z] [AGENT:Beta]  ACTION: Running npm test in data-service…
[2026-05-16T09:24:07.420Z] [AGENT:Beta]  ACTION: Tests PASSED for data-service
[2026-05-16T09:24:07.430Z] [AGENT:Main]  ACTION: ✓ Fix verified — marking data-service as HEALTHY
[2026-05-16T09:24:07.440Z] [AGENT:Main]  ACTION: Updated dashboard store: data-service → HEALTHY
[2026-05-16T09:24:07.450Z] [AGENT:Beta]  ACTION: Regression test suite passed — fix is stable
[2026-05-16T09:24:07.460Z] [AGENT:Main]  ACTION: Session complete — 1/1 services resolved
```

### `docs/incident-history.log`
```
[2026-05-16T09:24:07Z] SERVICE=data-service   ERROR_TYPE=SYNTAX     STATUS=RESOLVED FIX=Removed stray }}// CHAOS marker from index.ts
[2026-05-16T09:30:15Z] SERVICE=auth-service   ERROR_TYPE=LOGIC      STATUS=RESOLVED FIX=Restored > operator in index.ts
[2026-05-16T09:35:22Z] SERVICE=notify-service ERROR_TYPE=CONFIG     STATUS=RESOLVED FIX=Restored config.json from known-good template
[2026-05-16T09:41:10Z] SERVICE=data-service   ERROR_TYPE=TYPE       STATUS=RESOLVED FIX=Restored numeric literal in index.ts
[2026-05-16T09:47:33Z] SERVICE=auth-service   ERROR_TYPE=DEPENDENCY STATUS=RESOLVED FIX=Restored express dependency in package.json
```

### `app/data/store.json`
```json
{
  "services": [
    {
      "id": 1, "service": "auth-service",
      "status": "HEALTHY", "error_type": "NONE",
      "last_updated": "2026-05-16T09:30:15.000Z",
      "resolved_by": "Claude Sentinel"
    },
    {
      "id": 2, "service": "data-service",
      "status": "CRITICAL", "error_type": "SYNTAX",
      "last_updated": "2026-05-16T09:28:00.000Z",
      "resolved_by": null
    }
  ],
  "incidents": [
    {
      "id": 1, "service": "data-service", "status": "CRITICAL",
      "error_type": "SYNTAX", "timestamp": "2026-05-16T09:28:00.000Z",
      "resolved_at": null, "fix_description": null
    }
  ]
}
```

---

## ⚙️ CI/CD Pipeline

### `.github/workflows/ci.yml`

Triggered on every push and PR to `main`:

```
push to main/PR
     │
     ├─► lint-types       TypeScript tsc --noEmit on Next.js app
     ├─► test (matrix)    Jest suite × 3 services in parallel
     │     ├── auth-service
     │     ├── data-service
     │     └── notify-service
     ├─► build            Next.js npm run build (validates compile)
     └─► sentinel-scripts Smoke-tests restore + resolve scripts
```

### `.github/workflows/deploy.yml`

Triggered on merge to `main`:

```
merge to main
     │
     ├─► pre-deploy-check  (full build + all tests)
     ├─► deploy-production  vercel deploy --prod --prebuilt
     └─► post-deploy-smoke  curl /api/status → expect 200
```

### Enabling Vercel Deploy

1. `cd app && npx vercel link` — follow prompts
2. Copy `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` from `.vercel/project.json`
3. Create a token at [vercel.com/account/tokens](https://vercel.com/account/tokens)
4. Add 3 secrets to your GitHub repo: `Settings → Secrets → Actions`
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript |
| **Styling** | Tailwind CSS v3 — zero inline CSS |
| **State** | Flat-file JSON store (`app/data/store.json`) |
| **Services** | Node.js + Express (TypeScript) |
| **Testing** | Jest + ts-jest + Supertest |
| **Logging** | Structured append-only log files |
| **CI/CD** | GitHub Actions + Vercel |
| **Fonts** | JetBrains Mono + Inter (Google Fonts) |

---

## 📋 CLAUDE.md Protocol

The `CLAUDE.md` file defines the **Sentinel Resolution Protocol** — a strict ruleset the AI agents follow:

```
RULE 1: Check incident-history.log BEFORE applying any fix.
        If this (service, error_type) has failed before → Thinking Mode.

RULE 2: Classify error as: SYNTAX | TYPE | LOGIC | DEPENDENCY | CONFIG

RULE 3: Subagent Alpha fixes code. Scope: /services/** only.

RULE 4: Subagent Beta runs npm test. Fix must PASS before HEALTHY is set.

RULE 5: Commit message format: fix(<service>): <description> [sentinel-auto]

RULE 6: Append to incident-history.log with STATUS=RESOLVED or STATUS=FAILED.
```

---

## 🔄 Useful Commands

```bash
# Start everything
cd app && npm run dev

# Inject chaos into a specific service
node scripts/chaos-monkey.js auth-service
node scripts/chaos-monkey.js data-service
node scripts/chaos-monkey.js notify-service

# Inject chaos into a random service
node scripts/chaos-monkey.js

# Run the autonomous resolver (CLI)
node scripts/sentinel-resolve.js                  # fix all CRITICAL
node scripts/sentinel-resolve.js auth-service     # fix one service

# Reset everything to clean state
node scripts/restore-service.js --full-reset

# Run tests for a specific service
cd services/auth-service   && npm test
cd services/data-service   && npm test
cd services/notify-service && npm test

# Check current store state
cat app/data/store.json

# View live agent session log
cat docs/agent-session.log

# View incident history
cat docs/incident-history.log
```

---

## 📝 Submission Checklist

- [x] **GitHub Repo** with full code and `CLAUDE.md`
- [x] **Agent Logs** — `docs/agent-session.log` (multi-agent session transcript)
- [x] **Post-Mortem** — accessible at `GET /api/post-mortem` and via dashboard tab
- [x] **CI/CD** — GitHub Actions (`.github/workflows/ci.yml`, `deploy.yml`)
- [x] **Tailwind UI** — zero manual CSS, full dark-mode dashboard
- [ ] **Loom Video** — Record: chaos injection → auto-fix → HEALTHY (no keyboard after chaos click)

---

*Built with the Sentinel Autonomous Resolution Engine · Powered by Claude Sonnet*
