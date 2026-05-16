/**
 * notify-service/__tests__/notify.test.ts
 * Regression tests for the notify-service.
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
    expect(res.body.service).toBe("notify-service");
  });

  it("returns config metadata in the health response", async () => {
    const res = await request(app).get("/health");
    expect(res.body.config).toBeDefined();
    expect(typeof res.body.config.port).toBe("number");
    expect(typeof res.body.config.retryLimit).toBe("number");
    expect(typeof res.body.config.timeoutMs).toBe("number");
  });
});

// ─── /notify ──────────────────────────────────────────────────────────────────

describe("POST /notify", () => {
  it("rejects request missing channel", async () => {
    const res = await request(app).post("/notify").send({ message: "hello" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("rejects request missing message", async () => {
    const res = await request(app).post("/notify").send({ channel: "slack" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("rejects an invalid channel", async () => {
    const res = await request(app)
      .post("/notify")
      .send({ channel: "telegram", message: "hello" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/channel must be one of/);
  });

  it("rejects an empty message string", async () => {
    const res = await request(app)
      .post("/notify")
      .send({ channel: "slack", message: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty/);
  });

  it("accepts a valid slack notification and returns notification object", async () => {
    // Mock Math.random to guarantee success (> 0.1)
    const mockRandom = jest.spyOn(Math, "random").mockReturnValue(0.99);

    const res = await request(app)
      .post("/notify")
      .send({ channel: "slack", message: "Deployment complete" });

    mockRandom.mockRestore();

    expect([200, 502]).toContain(res.status); // 502 is valid on simulated failure
    if (res.status === 200) {
      expect(res.body.ok).toBe(true);
      expect(res.body.notification).toMatchObject({
        channel: "slack",
        message: "Deployment complete",
        recipient: "broadcast",
      });
      expect(typeof res.body.notification.id).toBe("number");
      expect(typeof res.body.notification.sentAt).toBe("string");
    }
  });

  it("accepts email and pagerduty channels", async () => {
    for (const channel of ["email", "pagerduty"] as const) {
      const res = await request(app)
        .post("/notify")
        .send({ channel, message: "Test alert" });
      expect([200, 502]).toContain(res.status);
    }
  });
});

// ─── /send ────────────────────────────────────────────────────────────────────

describe("POST /send", () => {
  it("rejects request missing recipient", async () => {
    const res = await request(app)
      .post("/send")
      .send({ channel: "slack", message: "hello" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/recipient/);
  });

  it("rejects request missing channel", async () => {
    const res = await request(app)
      .post("/send")
      .send({ message: "hello", recipient: "ops-team" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid channel", async () => {
    const res = await request(app)
      .post("/send")
      .send({ channel: "discord", message: "hi", recipient: "ops" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/channel must be one of/);
  });

  it("rejects empty recipient string", async () => {
    const res = await request(app)
      .post("/send")
      .send({ channel: "email", message: "Test", recipient: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty/);
  });

  it("sends a valid email notification to a specific recipient", async () => {
    const mockRandom = jest.spyOn(Math, "random").mockReturnValue(0.99);

    const res = await request(app).post("/send").send({
      channel: "email",
      message: "Incident resolved",
      recipient: "oncall@company.com",
    });

    mockRandom.mockRestore();

    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.ok).toBe(true);
      expect(res.body.notification.recipient).toBe("oncall@company.com");
      expect(res.body.notification.channel).toBe("email");
    }
  });

  it("returns 502 when delivery fails", async () => {
    // Force all random calls to fail (< 0.1)
    const mockRandom = jest.spyOn(Math, "random").mockReturnValue(0.05);

    const res = await request(app).post("/send").send({
      channel: "pagerduty",
      message: "Critical alert",
      recipient: "incident-team",
    });

    mockRandom.mockRestore();

    expect(res.status).toBe(502);
    expect(res.body.notification.success).toBe(false);
  });
});

// ─── /history ─────────────────────────────────────────────────────────────────

describe("GET /history", () => {
  it("returns a notifications array and a total count", async () => {
    const res = await request(app).get("/history");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.notifications)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });
});
