#!/usr/bin/env node
/**
 * chaos-monkey.js
 * Randomly introduces one of 5 bug types into a target service.
 * Usage: node scripts/chaos-monkey.js [service-name]
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SERVICES_DIR = path.join(__dirname, "../services");
const LOG_DIR = path.join(__dirname, "../services/logs");
const DB_PATH = path.join(__dirname, "../app/sentinel.db");

// Ensure log dir exists
fs.mkdirSync(LOG_DIR, { recursive: true });

/** List all available services */
function getServices() {
  return fs.readdirSync(SERVICES_DIR).filter((f) => {
    const full = path.join(SERVICES_DIR, f);
    return fs.statSync(full).isDirectory() && f !== "logs";
  });
}

/** Pick a random element from an array */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Find all .ts / .js files in a directory (non-test) */
function findSourceFiles(dir) {
  const results = [];
  function walk(d) {
    fs.readdirSync(d).forEach((f) => {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory() && f !== "__tests__" && f !== "node_modules") {
        walk(full);
      } else if (/\.(ts|js)$/.test(f) && !f.includes(".test.") && !f.includes(".spec.")) {
        results.push(full);
      }
    });
  }
  walk(dir);
  return results;
}

// ─── Bug Introducers ───────────────────────────────────────────────────────────

/**
 * BUG TYPE 1: Syntax Error
 * Inserts a stray `}}` at the end of a random source file.
 */
function introduceSyntaxError(serviceDir) {
  const files = findSourceFiles(serviceDir);
  if (!files.length) return null;
  const target = pick(files);
  const original = fs.readFileSync(target, "utf8");
  fs.writeFileSync(target, original + "\n}}// CHAOS: syntax error injected\n");
  return { type: "SYNTAX", file: target, description: "Appended stray `}}` to file" };
}

/**
 * BUG TYPE 2: Type Mismatch
 * Wraps a numeric literal in quotes to turn it into a string.
 */
function introduceTypeMismatch(serviceDir) {
  const files = findSourceFiles(serviceDir);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    // Match patterns like `= 42` or `= 100` (simple numeric assignments)
    const match = content.match(/=\s*(\d{2,})/);
    if (match) {
      const fixed = content.replace(/=\s*(\d{2,})/, `= "${match[1]}"`);
      fs.writeFileSync(file, fixed);
      return { type: "TYPE", file, description: `Turned numeric ${match[1]} into string` };
    }
  }
  return null;
}

/**
 * BUG TYPE 3: Logic Error
 * Flips a `>` comparison to `<` or vice versa.
 */
function introduceLogicError(serviceDir) {
  const files = findSourceFiles(serviceDir);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (content.includes(" > ")) {
      fs.writeFileSync(file, content.replace(" > ", " < "));
      return { type: "LOGIC", file, description: "Flipped > to < comparison operator" };
    }
    if (content.includes(" >= ")) {
      fs.writeFileSync(file, content.replace(" >= ", " <= "));
      return { type: "LOGIC", file, description: "Flipped >= to <= comparison operator" };
    }
  }
  return null;
}

/**
 * BUG TYPE 4: Missing Dependency
 * Corrupts package.json by removing the first dependency entry.
 */
function introduceDependencyError(serviceDir) {
  const pkgPath = path.join(serviceDir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const deps = Object.keys(pkg.dependencies || {});
  if (!deps.length) return null;
  const victim = deps[0];
  delete pkg.dependencies[victim];
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  return { type: "DEPENDENCY", file: pkgPath, description: `Removed dependency: ${victim}` };
}

/**
 * BUG TYPE 5: Corrupted JSON Config
 * Writes invalid JSON into a config file used by the service.
 */
function introduceConfigCorruption(serviceDir) {
  const configPath = path.join(serviceDir, "config.json");
  if (!fs.existsSync(configPath)) {
    // Create a config and immediately corrupt it
    fs.writeFileSync(configPath, '{ "port": 3001 }');
  }
  fs.writeFileSync(configPath, '{ "port": INVALID_JSON_VALUE, broken }');
  return { type: "CONFIG", file: configPath, description: "Corrupted config.json with invalid JSON" };
}

// ─── Orchestrator ──────────────────────────────────────────────────────────────

const BUG_TYPES = [
  introduceSyntaxError,
  introduceTypeMismatch,
  introduceLogicError,
  introduceDependencyError,
  introduceConfigCorruption,
];

async function main() {
  const services = getServices();
  if (!services.length) {
    console.error("❌ No services found in /services directory.");
    process.exit(1);
  }

  const targetName = process.argv[2] || pick(services);
  const serviceDir = path.join(SERVICES_DIR, targetName);

  if (!fs.existsSync(serviceDir)) {
    console.error(`❌ Service "${targetName}" not found.`);
    process.exit(1);
  }

  const bugIntroducer = pick(BUG_TYPES);
  const result = bugIntroducer(serviceDir);

  if (!result) {
    console.log(`⚠️  Could not introduce a bug in ${targetName} — no suitable target found.`);
    process.exit(0);
  }

  const timestamp = new Date().toISOString();

  // Write to service log
  const logFile = path.join(LOG_DIR, `${targetName}.log`);
  const logEntry = `[${timestamp}] CHAOS INJECTED | TYPE=${result.type} | FILE=${result.file} | DESC=${result.description}\n`;
  fs.appendFileSync(logFile, logEntry);

  // Update JSON store status
  try {
    const updateScript = path.join(__dirname, "update-status.js");
    if (fs.existsSync(updateScript)) {
      execSync(`node "${updateScript}" "${targetName}" "CRITICAL" "${result.type}"`, { stdio: "inherit" });
    }
  } catch (e) {
    // Store update is best-effort during chaos
  }

  console.log(`\n🐒 CHAOS MONKEY STRUCK!`);
  console.log(`   Service  : ${targetName}`);
  console.log(`   Bug Type : ${result.type}`);
  console.log(`   File     : ${result.file}`);
  console.log(`   Detail   : ${result.description}`);
  console.log(`   Time     : ${timestamp}`);
  console.log(`\n🚨 Service status set to CRITICAL. Run the Sentinel agent to fix.\n`);
}

main().catch(console.error);
