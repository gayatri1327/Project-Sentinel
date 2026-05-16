/**
 * data-service/__tests__/data.test.ts
 * Regression tests for the data-service.
 * Written by Subagent Beta — run after every fix.
 */

import request from "supertest";
import app from "../index";

// ─── /health ──────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns HTTP 200 with status ok and service name", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("data-service");
  });
});

// ─── /records ─────────────────────────────────────────────────────────────────

describe("GET /records", () => {
  it("returns a records array with the correct shape", async () => {
    const res = await request(app).get("/records");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(typeof res.body.count).toBe("number");
    expect(res.body.count).toBe(res.body.records.length);
  });

  it("each record has id (number), value (number), and label (string)", async () => {
    const res = await request(app).get("/records");
    for (const record of res.body.records) {
      expect(typeof record.id).toBe("number");
      expect(typeof record.value).toBe("number");
      expect(typeof record.label).toBe("string");
    }
  });

  it("returns at least 3 seeded records", async () => {
    const res = await request(app).get("/records");
    expect(res.body.records.length).toBeGreaterThanOrEqual(3);
  });

  it("seeded values are correct: 100, 200, 300", async () => {
    const res = await request(app).get("/records");
    const values: number[] = res.body.records.map((r: { value: number }) => r.value);
    expect(values).toEqual(expect.arrayContaining([100, 200, 300]));
  });
});

// ─── /stats ───────────────────────────────────────────────────────────────────

describe("GET /stats", () => {
  it("returns average, max, and min fields", async () => {
    const res = await request(app).get("/stats");
    expect(res.status).toBe(200);
    expect(typeof res.body.average).toBe("number");
    expect(typeof res.body.max).toBe("number");
    expect(typeof res.body.min).toBe("number");
  });

  it("average of [100, 200, 300] is 200", async () => {
    const res = await request(app).get("/stats");
    expect(res.body.average).toBe(200);
  });

  it("max of [100, 200, 300] is 300", async () => {
    const res = await request(app).get("/stats");
    expect(res.body.max).toBe(300);
  });

  it("min of [100, 200, 300] is 100", async () => {
    const res = await request(app).get("/stats");
    expect(res.body.min).toBe(100);
  });
});

// ─── /filter ──────────────────────────────────────────────────────────────────

describe("POST /filter", () => {
  it("returns 400 if threshold is missing", async () => {
    const res = await request(app).post("/filter").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 if threshold is a string", async () => {
    const res = await request(app).post("/filter").send({ threshold: "150" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/number/);
  });

  it("returns records above threshold 150 (should return 200, 300)", async () => {
    const res = await request(app).post("/filter").send({ threshold: 150 });
    expect(res.status).toBe(200);
    const values: number[] = res.body.records.map((r: { value: number }) => r.value);
    expect(values).toEqual(expect.arrayContaining([200, 300]));
    expect(values).not.toContain(100);
  });

  it("returns records above threshold 0 (all 3 records)", async () => {
    const res = await request(app).post("/filter").send({ threshold: 0 });
    expect(res.status).toBe(200);
    expect(res.body.records.length).toBe(3);
  });

  it("returns empty array when threshold is above all values (e.g. 999)", async () => {
    const res = await request(app).post("/filter").send({ threshold: 999 });
    expect(res.status).toBe(200);
    expect(res.body.records).toEqual([]);
  });

  it("threshold is exclusive — record with value === threshold is excluded", async () => {
    const res = await request(app).post("/filter").send({ threshold: 200 });
    expect(res.status).toBe(200);
    const values: number[] = res.body.records.map((r: { value: number }) => r.value);
    // Only 300 should appear (200 is NOT > 200)
    expect(values).toContain(300);
    expect(values).not.toContain(200);
    expect(values).not.toContain(100);
  });

  it("returns 400 for boolean threshold", async () => {
    const res = await request(app).post("/filter").send({ threshold: true });
    expect(res.status).toBe(400);
  });
});
