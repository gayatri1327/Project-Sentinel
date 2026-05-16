# =============================================================================
# SENTINEL POST-MORTEM REPORT TEMPLATE
# =============================================================================
# Used by scripts/sentinel-resolve.js to generate per-incident post-mortems.
# Placeholders use {{DOUBLE_BRACE}} syntax — replaced by the script at runtime.
#
# To generate a post-mortem manually:
#   node scripts/sentinel-resolve.js --post-mortem <service>
#
# To view all post-mortems via API:
#   GET /api/post-mortem
#   GET /api/post-mortem?service=auth-service
# =============================================================================

---

# 🔴 Incident Post-Mortem — `{{SERVICE_NAME}}`

| Field             | Value                                  |
|-------------------|----------------------------------------|
| **Service**       | `{{SERVICE_NAME}}`                     |
| **Error Type**    | `{{ERROR_TYPE}}`                       |
| **Severity**      | {{SEVERITY}}                           |
| **Started At**    | `{{STARTED_AT}}`                       |
| **Resolved At**   | `{{RESOLVED_AT}}`                      |
| **Duration**      | {{DURATION_SECONDS}}s                  |
| **Fix Attempts**  | {{FIX_ATTEMPTS}}                       |
| **Resolved By**   | Claude Sentinel (Autonomous Agent)     |
| **Report Date**   | `{{REPORT_DATE}}`                      |

---

## 1. Executive Summary

`{{SERVICE_NAME}}` entered a **CRITICAL** state at `{{STARTED_AT}}` due to a **{{ERROR_TYPE}}**
error injected by the Chaos Monkey. The Sentinel autonomous agent detected the failure within one
5-second polling cycle, diagnosed the root cause by reading the service chaos log, and dispatched
a multi-agent fix sequence (Main → Alpha → Beta). Total downtime: **{{DURATION_SECONDS}} seconds**.

> {{#if FIX_ATTEMPTS > 1}}
> ⚠️ **Thinking Mode was activated** — a prior failed attempt for `{{SERVICE_NAME}}:{{ERROR_TYPE}}`
> was found in `docs/incident-history.log`, triggering an alternative resolution strategy.
> {{/if}}
> {{#if FIX_ATTEMPTS == 1}}
> ✅ Resolved on the **first attempt** — no prior failures for this service/error combination.
> {{/if}}

---

## 2. Incident Timeline

| Timestamp          | Event                                                         | Agent   |
|--------------------|---------------------------------------------------------------|---------|
| `{{STARTED_AT}}`   | 🐒 Chaos Monkey injected `{{ERROR_TYPE}}` bug                 | —       |
| `{{DETECTED_AT}}`  | Sentinel polled store, detected CRITICAL status               | Main    |
| `{{DIAGNOSED_AT}}` | Alpha read `services/logs/{{SERVICE_NAME}}.log`, found bug    | Alpha   |
| `{{FIXED_AT}}`     | Alpha applied patch: {{FIX_DESCRIPTION}}                      | Alpha   |
| `{{TESTED_AT}}`    | Beta ran `npm test` — {{TEST_RESULT}}                         | Beta    |
| `{{RESOLVED_AT}}`  | Main updated store to HEALTHY, wrote incident log             | Main    |

---

## 3. Root Cause Analysis

**Error Category:** `{{ERROR_TYPE}}`

### SYNTAX errors
Chaos appends `}}// CHAOS: syntax error injected` to a `.ts` source file.
TypeScript compilation fails; the service process cannot start.
**Fix:** Strip the injected marker and trailing stray braces from the file.

### TYPE errors
Chaos replaces a numeric literal (e.g. `3600`) with its string equivalent (`"3600"`).
Arithmetic on the value produces `NaN`; port bindings may fail silently.
**Fix:** Regex `= "(\d+)"` → `= $1` applied across source files.

### LOGIC errors
Chaos flips a comparison operator (`>` → `<`, `>=` → `<=`).
Business logic silently produces wrong results; unit tests catch the divergence.
**Fix:** Restore the original operator direction in the affected file.

### DEPENDENCY errors
Chaos removes the first entry from `package.json` dependencies.
Node's `require()` throws `MODULE_NOT_FOUND` on service startup.
**Fix:** Restore from `GOOD_DEPS` baseline, run `npm install`.

### CONFIG errors
Chaos writes syntactically invalid JSON to `config.json`.
`JSON.parse()` throws on startup, crashing the service immediately.
**Fix:** Overwrite `config.json` from the known-good hardcoded template.

---

## 4. Multi-Agent Resolution Log

```
{{AGENT_LOG_EXCERPT}}
```

> Full session: `docs/agent-session.log`
> History entry: `docs/incident-history.log`

---

## 5. Test Verification

| Metric              | Value               |
|---------------------|---------------------|
| **Test Framework**  | Jest + ts-jest      |
| **Suite**           | `{{SERVICE_NAME}}`  |
| **Tests Run**       | {{TESTS_TOTAL}}     |
| **Tests Passed**    | {{TESTS_PASSED}}    |
| **Tests Failed**    | {{TESTS_FAILED}}    |
| **Fix Attempts**    | {{FIX_ATTEMPTS}}    |
| **Outcome**         | {{TEST_RESULT}}     |

---

## 6. Impact Assessment

| Dimension            | Assessment                                            |
|----------------------|-------------------------------------------------------|
| **Affected Service** | `{{SERVICE_NAME}}`                                    |
| **Downstream APIs**  | {{DOWNSTREAM_IMPACT}}                                 |
| **Data Loss**        | None — services are stateless in-memory               |
| **User-Facing**      | No — mock / staging environment only                  |
| **MTTR**             | {{DURATION_SECONDS}}s (Mean Time To Resolve)          |
| **Escalated**        | No — fully autonomous resolution                      |

---

## 7. Action Items

| # | Action                                                                 | Owner         | Priority | Status  |
|---|------------------------------------------------------------------------|---------------|----------|---------|
| 1 | Add pre-commit hook to reject `// CHAOS` markers in source             | DevOps        | High     | Open    |
| 2 | Add `JSON.parse` error boundary + schema validation in config loaders  | Service Teams | High     | Open    |
| 3 | Enable `strict`, `noImplicitAny`, `strictNullChecks` in `tsconfig`    | Dev           | Medium   | Open    |
| 4 | Switch CI from `npm install` to `npm ci` to enforce lockfile           | DevOps        | Medium   | Open    |
| 5 | Add Sentinel `/api/resolve` webhook to PagerDuty integration           | Platform      | Low      | Open    |
| 6 | Reduce Sentinel poll interval 5s → 2s for faster incident detection    | Sentinel Team | Low      | Open    |

---

## 8. Resolution Confidence Matrix

| Dimension             | Score | Notes                                              |
|-----------------------|-------|----------------------------------------------------|
| Fix correctness       | ✅    | All {{TESTS_TOTAL}} tests passed post-fix          |
| Regression coverage   | ✅    | Existing suite covers the injected error path      |
| Root cause clarity    | ✅    | Chaos log pinpointed file, line, and mutation type |
| Recurrence risk       | ⚠️    | Chaos Monkey can re-inject at any time             |
| Recovery automation   | ✅    | Zero human intervention required                   |

---

*Auto-generated by **Sentinel v1.0** · `scripts/sentinel-resolve.js`*
*Template: `docs/post-mortem-template.md` · API: `GET /api/post-mortem`*
