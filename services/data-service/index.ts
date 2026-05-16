/**
 * data-service/index.ts
 * Simulates a data-processing microservice.
 */

import express from "express";

const app = express();
app.use(express.json());

const PORT = 3002;

interface DataRecord {
  id: number;
  value: number;
  label: string;
}

const store: DataRecord[] = [
  { id: 1, value: 100, label: "alpha" },
  { id: 2, value: 200, label: "beta" },
  { id: 3, value: 300, label: "gamma" },
];

/** Returns the average of an array of numbers */
function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Returns records whose value strictly exceeds the threshold */
function filterAboveThreshold(records: DataRecord[], threshold: number): DataRecord[] {
  return records.filter((r) => r.value > threshold);
}

/**
 * Validates that a value is a strict finite number (not boolean, not NaN).
 */
function isStrictNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value) && Number.isFinite(value);
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "data-service" });
});

app.get("/records", (_req, res) => {
  res.json({ records: store, count: store.length });
});

app.get("/stats", (_req, res) => {
  const values = store.map((r) => r.value);
  res.json({
    average: average(values),
    max: Math.max(...values),
    min: Math.min(...values),
  });
});

app.post("/filter", (req, res) => {
  const { threshold } = req.body;
  if (!isStrictNumber(threshold)) {
    return res.status(400).json({ error: "threshold must be a number" });
  }
  return res.json({ records: filterAboveThreshold(store, threshold) });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`data-service running on port ${PORT}`);
  });
}


export default app;
