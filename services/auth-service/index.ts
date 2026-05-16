/**
 * auth-service/index.ts
 * Simulates an authentication microservice.
 */

import express from "express";
import { readFileSync } from "fs";
import path from "path";

const app = express();
app.use(express.json());

interface Config {
  port: number;
  jwtSecret: string;
  tokenExpirySeconds: number;
}

/** Load config from config.json */
function loadConfig(): Config {
  const raw = readFileSync(path.join(__dirname, "config.json"), "utf8");
  return JSON.parse(raw);
}

/** Validate that a user ID is a positive integer */
function isValidUserId(id: unknown): boolean {
  return typeof id === "number" && id > 0;
}

/** Generate a mock JWT token string */
function generateToken(userId: number, expirySeconds: number): string {
  const payload = { userId, exp: Date.now() + expirySeconds * 1000 };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "auth-service" });
});

app.post("/login", (req, res) => {
  const { userId } = req.body;

  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    return res.status(500).json({ error: "Config load failed", detail: String(err) });
  }

  const token = generateToken(userId as number, config.tokenExpirySeconds);
  return res.json({ token, expiresIn: config.tokenExpirySeconds });
});

const config = loadConfig();
if (process.env.NODE_ENV !== "test") {
  app.listen(config.port, () => {
    console.log(`auth-service running on port ${config.port}`);
  });
}

export default app;
