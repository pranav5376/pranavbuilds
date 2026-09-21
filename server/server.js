/**
 * Portfolio backend.
 *
 * Serves the static site and handles POST /api/submit. The rules live in
 * server/core.js:
 *   - visitor gives name + Gmail + phone  → a 6-digit code is emailed to that Gmail
 *   - visitor types the code              → you get a PDF of their details, they get in
 *   - resume requests / contact messages  → need the pass issued after verification;
 *                                           the resume is emailed to the verified Gmail
 *                                           and you are notified.
 *
 * All configuration lives in .env — see .env.example.
 */

import "dotenv/config";
import express from "express";
import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ---------------------------------------------------------------- config
const resumePath = process.env.RESUME_PATH || "./assets/resume.pdf";
const cfg = {
  port:          Number(process.env.PORT || 3000),
  gmailUser:     process.env.GMAIL_USER || "",
  gmailPass:    (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""),
  ownerEmail:    process.env.OWNER_EMAIL || process.env.GMAIL_USER || "",
  ownerName:     process.env.OWNER_NAME || "Portfolio",
  resumePath,
  resumeAbs:     path.resolve(ROOT, resumePath),
  resumeExists:  () => fs.existsSync(path.resolve(ROOT, resumePath)),
  resumeName:    process.env.RESUME_FILENAME || "resume.pdf",
  // Optional public link (Google Drive / Dropbox "anyone with the link"), used
  // when the PDF file itself is missing on the server.
  resumeUrl:     (process.env.RESUME_URL || "").trim(),
  requireGmail: (process.env.REQUIRE_GMAIL || "true").toLowerCase() === "true",
  ratePerHour:   Number(process.env.RATE_LIMIT_PER_HOUR || 40),
  otpPerIpHour:  Number(process.env.OTP_LIMIT_PER_IP_HOUR || 15),
  resumePerDay:  Number(process.env.RESUME_LIMIT_PER_EMAIL || 3),
  tokenSecret:   (process.env.TOKEN_SECRET || "").trim(),
  allowedOrigin: process.env.ALLOWED_ORIGIN || "",
  leadsFile:     path.join(ROOT, "data", "leads.csv")
};

const missing = [];
if (!cfg.gmailUser) missing.push("GMAIL_USER");
if (!cfg.gmailPass) missing.push("GMAIL_APP_PASSWORD");
if (missing.length) {
  console.warn(
    "\n  ⚠  Missing in .env: " + missing.join(", ") +
    "\n     The site will load, but visitors cannot be verified (no code can be emailed).\n" +
    "     See docs/SETUP-NODE.md.\n"
  );
}

const mailer = (cfg.gmailUser && cfg.gmailPass)
  ? nodemailer.createTransport({
      service: "gmail",
      auth: { user: cfg.gmailUser, pass: cfg.gmailPass },
      // Without these, a blocked or slow SMTP connection hangs the request
      // indefinitely and the visitor just sees a spinner forever.
      connectionTimeout: 10000,
      greetingTimeout: 8000,
      socketTimeout: 20000,
      pool: true,
      maxConnections: 2
    })
  : null;

function appendLead(row) {
  fs.mkdirSync(path.dirname(cfg.leadsFile), { recursive: true });
  if (!fs.existsSync(cfg.leadsFile)) {
    fs.writeFileSync(cfg.leadsFile,
      "Time,Type,Name,Email,Phone,Message,Page,Referrer,Timezone,Device\n");
  }
  // Leading = + - @ are prefixed so a spreadsheet never runs them as a formula.
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  fs.appendFileSync(cfg.leadsFile, row.map(cell).join(",") + "\n");
}

const api = createApi({ cfg, mailer, appendLead });

// ---------------------------------------------------------------- app
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

// The browser sends text/plain to stay a "simple" CORS request.
app.use(express.text({ type: ["text/plain", "application/json"], limit: "64kb" }));

if (cfg.allowedOrigin) {
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", cfg.allowedOrigin);
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mailerReady: !!mailer,
    resumeFound: cfg.resumeExists(),
    resumeLink:  cfg.resumeUrl ? "configured" : "not set"
  });
});

app.post("/api/submit", async (req, res) => {
  let d;
  try {
    d = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ ok: false, message: "Malformed request." });
  }
  const out = await api.handle(d, { ip: req.ip || "unknown" });
  res.status(out.status).json(out.body);
});

app.use(express.static(path.join(ROOT, "public"), {
  maxAge: "1h",
  setHeaders: (res, p) => {
    if (p.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
  }
}));

app.use((_req, res) => res.status(404).sendFile(path.join(ROOT, "public", "index.html")));

app.listen(cfg.port, () => {
  const indexFile = path.join(ROOT, "public", "index.html");
  let gateOn = false;
  try { gateOn = /<html[^>]*gate-locked/.test(fs.readFileSync(indexFile, "utf8").slice(0, 400)); } catch {}
  console.log(`\n  Portfolio running on http://localhost:${cfg.port}`);
  console.log(`  Serving site from: ${indexFile}`);
  console.log(`  Visitor gate: ${gateOn ? "ON" : "OFF  <-- this is an OLD index.html; use the one from the new zip"}`);
  console.log("  Visitors must enter name, Gmail and phone on every visit (nothing is remembered).");
  console.log(`  Mailer: ${mailer ? "ready (" + cfg.gmailUser + ")" : "NOT CONFIGURED"}`);
  const found = cfg.resumeExists();
  console.log(`  Resume: ${found ? cfg.resumePath : "NOT FOUND at " + cfg.resumePath}`);
  console.log(`  Resume link fallback: ${cfg.resumeUrl || "not set"}`);
  if (!found && !cfg.resumeUrl) {
    console.log("\n  ⚠  Visitors cannot receive the resume yet.");
    console.log("     Put the PDF at " + cfg.resumePath + " OR set RESUME_URL in .env.\n");
  } else {
    console.log("");
  }
});
