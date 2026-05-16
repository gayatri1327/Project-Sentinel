/**
 * auth-service/__tests__/auth.test.ts
 * Regression tests — written by Subagent Beta after each fix.
 */

import request from "supertest";
import app from "../index";

describe("auth-service /health", () => {
  it("returns 200 and status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("auth-service /login", () => {
  it("rejects missing userId", async () => {
    const res = await request(app).post("/login").send({});
    expect(res.status).toBe(400);
  });

  it("rejects string userId", async () => {
    const res = await request(app).post("/login").send({ userId: "abc" });
    expect(res.status).toBe(400);
  });

  it("rejects negative userId", async () => {
    const res = await request(app).post("/login").send({ userId: -1 });
    expect(res.status).toBe(400);
  });

  it("returns a token for valid userId", async () => {
    const res = await request(app).post("/login").send({ userId: 42 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(typeof res.body.token).toBe("string");
    expect(res.body.expiresIn).toBeGreaterThan(0);
  });
});
