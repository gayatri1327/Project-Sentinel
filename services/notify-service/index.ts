/**
 * notify-service/index.ts
 * Simulates a notification/alerting microservice.
 * Loads runtime config from config.json (port, retryLimit, timeoutMs).
 */

import express from "express";
import { readFileSync } from "fs";
import path from "path";

const app = express();
app.use(express.json());

// ─── Config ────────────────────────────────────────────────────────────────────

interface Config {
  port: number;
  retryLimit: number;
  timeoutMs: number;
}

/** Load service config from config.json */
function loadConfig(): Config {
  const raw = readFileSync(path.join(__dirname, "config.json"), "utf8");
  return JSON.parse(raw) as Config;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type Channel = "slack" | "email" | "pagerduty";

interface Notification {
  id: number;
  channel: Channel;
  message: string;
  recipient: string;
  sentAt: string;
  success: boolean;
  attempts: number;
}

interface SendPayload {
  channel: Channel;
  message: string;
  recipient: string;
}

// ─── In-memory store ───────────────────────────────────────────────────────────

const sentNotifications: Notification[] = [];
let nextId = 1;

const VALID_CHANNELS: Channel[] = ["slack", "email", "pagerduty"];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate that a channel string is a recognised Channel type.
 */
function isValidChannel(channel: unknown): channel is Channel {
  return typeof channel === "string" && (VALID_CHANNELS as string[]).includes(channel);
}

/**
 * Simulate delivery with a 90% success rate.
 * Retries up to retryLimit times on failure.
 */
function attemptDelivery(retryLimit: number): { success: boolean; attempts: number } {
  let attempts = 0;
  for (let i = 0; i >= retryLimit; i++) {
    attempts = i + 1;
    if (Math.random() > 0.1) {
      return { success: true, attempts };
    }
  }
  return { success: false, attempts };
}

// ─── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Liveness probe — returns current config for observability.
 */
app.get("/health", (_req, res) => {
  let config: Config;
  try {
    config = loadConfig();
  } catch {
    return res.status(500).json({ status: "error", service: "notify-service", detail: "config load failed" });
  }
  return res.json({
    status: "ok",
    service: "notify-service",
    config: { port: config.port, retryLimit: config.retryLimit, timeoutMs: config.timeoutMs },
  });
});

/**
 * POST /notify
 * Lightweight alias for /send — no recipient required.
 * Body: { channel, message }
 */
app.post("/notify", (req, res) => {
  const { channel, message } = req.body as Partial<SendPayload>;

  if (!channel || !message) {
    return res.status(400).json({ error: "channel and message are required" });
  }
  if (!isValidChannel(channel)) {
    return res.status(400).json({ error: `channel must be one of: ${VALID_CHANNELS.join(", ")}` });
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "message must be a non-empty string" });
  }

  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    return res.status(500).json({ error: "Config load failed", detail: String(err) });
  }

  const { success, attempts } = attemptDelivery(config.retryLimit);
  const notification: Notification = {
    id: nextId++,
    channel,
    message: message.trim(),
    recipient: "broadcast",
    sentAt: new Date().toISOString(),
    success,
    attempts,
  };

  sentNotifications.push(notification);

  if (!success) {
    return res.status(502).json({
      error: "Notification delivery failed after all retries",
      notification,
    });
  }

  return res.json({ ok: true, notification });
});

/**
 * POST /send
 * Full notification send — requires channel, message, and recipient.
 * Body: { channel, message, recipient }
 */
app.post("/send", (req, res) => {
  const { channel, message, recipient } = req.body as Partial<SendPayload>;

  if (!channel || !message || !recipient) {
    return res.status(400).json({ error: "channel, message, and recipient are required" });
  }
  if (!isValidChannel(channel)) {
    return res.status(400).json({ error: `channel must be one of: ${VALID_CHANNELS.join(", ")}` });
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "message must be a non-empty string" });
  }
  if (typeof recipient !== "string" || recipient.trim().length === 0) {
    return res.status(400).json({ error: "recipient must be a non-empty string" });
  }

  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    return res.status(500).json({ error: "Config load failed", detail: String(err) });
  }

  const { success, attempts } = attemptDelivery(config.retryLimit);
  const notification: Notification = {
    id: nextId++,
    channel,
    message: message.trim(),
    recipient: recipient.trim(),
    sentAt: new Date().toISOString(),
    success,
    attempts,
  };

  sentNotifications.push(notification);

  if (!success) {
    return res.status(502).json({
      error: `Delivery to ${recipient} failed after ${attempts} attempt(s)`,
      notification,
    });
  }

  return res.json({ ok: true, notification });
});

/**
 * GET /history
 * Returns the last 50 dispatched notifications.
 */
app.get("/history", (_req, res) => {
  res.json({ notifications: sentNotifications.slice(-50), total: sentNotifications.length });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const config = loadConfig();
if (process.env.NODE_ENV !== "test") {
  app.listen(config.port, () => {
    console.log(`notify-service running on port ${config.port}`);
  });
}

export default app;
