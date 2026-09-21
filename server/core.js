/**
 * Portfolio API logic (no Express, no network — easy to test).
 *
 * Flow
 *   1. enter    visitor gives name + Gmail + phone → we check them for fakes
 *               (same rules as before) and let them straight in — no code is
 *               emailed and nothing needs to be typed back. You still get a
 *               PDF report of who came in, and the visitor gets a signed pass.
 *   2. everything else (contact form, resume) needs that signed pass.
 *
 * Neither the Gmail address nor the phone number is proven to belong to the
 * visitor — only checked against common fake/junk patterns. Proving Gmail
 * ownership would need an emailed code (removed here); proving the phone
 * would need an SMS service (Twilio, Firebase Phone Auth, MSG91).
 */
import crypto from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { checkName, checkEmail, checkPhone } from "./validate.js";

const HOUR = 60 * 60 * 1000, DAY = 24 * HOUR;
const PASS_DAYS = 30;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ PDF */
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 48;

// Standard PDF fonts only cover Latin-1. Anything else is shown as "?" in the PDF
// (the exact text is always in the email body and the CSV).
const latin = (s) => String(s ?? "").replace(/[\r\n\t]+/g, " ")
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

function wrap(text, font, size, maxW) {
  const lines = [];
  let line = "";
  for (const word of latin(text).split(" ")) {
    let w = word;
    while (font.widthOfTextAtSize(w, size) > maxW) {            // very long tokens (URLs, user agents)
      let cut = w.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxW) cut--;
      if (line) { lines.push(line); line = ""; }
      lines.push(w.slice(0, cut)); w = w.slice(cut);
    }
    const test = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxW) line = test;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

export async function buildReportPdf({ title, subtitle, badge, rows, footer }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin(title)); pdf.setCreator("Portfolio"); pdf.setProducer("Portfolio");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.11, 0.16), grey = rgb(0.45, 0.5, 0.58), line = rgb(0.88, 0.9, 0.93);
  const teal = rgb(0.37, 0.92, 0.83), navy = rgb(0.043, 0.071, 0.125);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: PAGE_H - 120, width: PAGE_W, height: 120, color: navy });
  page.drawRectangle({ x: 0, y: PAGE_H - 124, width: PAGE_W, height: 4, color: teal });
  page.drawText(latin(title), { x: MARGIN, y: PAGE_H - 62, size: 24, font: bold, color: rgb(1, 1, 1) });
  page.drawText(latin(subtitle), { x: MARGIN, y: PAGE_H - 88, size: 11, font, color: teal });
  if (badge) {
    const bw = bold.widthOfTextAtSize(latin(badge), 9) + 22;
    page.drawRectangle({ x: PAGE_W - MARGIN - bw, y: PAGE_H - 70, width: bw, height: 22, color: teal });
    page.drawText(latin(badge), { x: PAGE_W - MARGIN - bw + 11, y: PAGE_H - 63, size: 9, font: bold, color: navy });
  }

  let y = PAGE_H - 160;
  const labelW = 130, valX = MARGIN + labelW + 12, valW = PAGE_W - MARGIN - valX;
  let lossy = false;
  for (const [label, value] of rows) {
    const raw = String(value ?? "") || "-";
    if (/[^\x20-\x7E\xA0-\xFF\r\n\t]/.test(raw)) lossy = true;
    const lines = wrap(raw, font, 11, valW);
    const h = Math.max(lines.length * 15, 15) + 16;
    if (y - h < 70) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - 60; }
    page.drawText(latin(label), { x: MARGIN, y: y - 12, size: 10, font: bold, color: grey });
    lines.forEach((l, i) => page.drawText(l, { x: valX, y: y - 12 - i * 15, size: 11, font, color: ink }));
    y -= h;
    page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.6, color: line });
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const note = (lossy && i === pages.length - 1) ? "Non-Latin characters appear as ? here; the exact text is in the email body. " : "";
    wrap(note + (footer || ""), font, 8, PAGE_W - 2 * MARGIN - 70).forEach((l, k) =>
      p.drawText(l, { x: MARGIN, y: 44 - k * 11, size: 8, font, color: grey }));
    p.drawText(`Page ${i + 1} of ${pages.length}`, { x: PAGE_W - MARGIN - 48, y: 22, size: 8, font, color: grey });
  });
  return Buffer.from(await pdf.save());
}

/* ------------------------------------------------------------------ API */
export function createApi({ cfg, mailer, appendLead, now = () => Date.now(), log = console }) {
  const secret = cfg.tokenSecret ||
    (cfg.gmailPass ? crypto.createHash("sha256").update("portfolio-pass|" + cfg.gmailUser + "|" + cfg.gmailPass).digest("hex")
                   : crypto.randomBytes(32).toString("hex"));
  const hmac = (s) => crypto.createHmac("sha256", secret).update(s).digest("base64url");
  const safeEq = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && crypto.timingSafeEqual(A, B); };

  const hits = new Map();
  function limited(key, max, windowMs) {
    const t = now(), rec = hits.get(key);
    if (!rec || t > rec.reset) { hits.set(key, { n: 1, reset: t + windowMs }); return false; }
    rec.n += 1; return rec.n > max;
  }
  const sweep = setInterval(() => {
    const t = now();
    for (const [k, v] of hits) if (t > v.reset) hits.delete(k);
  }, 10 * 60 * 1000); sweep.unref?.();

  const reply = (status, body) => ({ status, body });
  const fail = (status, message, code) => reply(status, { ok: false, message, ...(code ? { code } : {}) });

  /* signed pass */
  function makePass(canon) {
    const exp = now() + PASS_DAYS * DAY;
    const payload = Buffer.from(canon + "|" + exp).toString("base64url");
    return { token: payload + "." + hmac(payload), exp };
  }
  function passOk(token, email) {
    try {
      const [payload, sig] = String(token || "").split(".");
      if (!payload || !sig || !safeEq(sig, hmac(payload))) return false;
      const [canon, exp] = Buffer.from(payload, "base64url").toString().split("|");
      const e = checkEmail(email, false);
      return e.ok && e.canon === canon && Number(exp) > now();
    } catch { return false; }
  }

  const clientMeta = (d, ip) => ({
    page: String(d.page || "").slice(0, 300), referrer: String(d.referrer || "").slice(0, 300),
    timezone: String(d.timezone || "").slice(0, 80), device: String(d.userAgent || "").slice(0, 300), ip
  });
  const stamp = (t) => new Date(t).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

  function ownerHtml(title, rows, intro = "New activity on your portfolio.") {
    const body = rows.map(([k, v]) =>
      `<tr><td style="padding:9px 12px 9px 0;color:#888;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eee">${esc(k)}</td>` +
      `<td style="padding:9px 0;border-bottom:1px solid #eee;word-break:break-word">${esc(v || "—")}</td></tr>`).join("");
    return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px"><h2 style="margin:0 0 4px;font-size:18px">${esc(title)}</h2>` +
      `<p style="margin:0 0 18px;color:#666;font-size:13px">${esc(intro)}</p>` +
      `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">${body}</table></div>`;
  }

  /* ---------- 1. validate details and let the visitor straight in ----------
   * No emailed code, no typing anything back. Name / Gmail / phone still go
   * through the same fake-detection checks as before (checkName, checkEmail,
   * checkPhone) so junk entries are still refused — the visitor just isn't
   * asked to prove they own the inbox by retyping a code.
   */
  async function enter(d, ip) {
    const n = checkName(d.name), e = checkEmail(d.email, cfg.requireGmail), p = checkPhone(d.phone);
    for (const r of [n, e, p]) if (!r.ok) return fail(400, r.message);

    if (limited("enter-ip:" + ip, cfg.otpPerIpHour, HOUR)) return fail(429, "Too many attempts from this connection. Please try again in an hour.");
    if (limited("enter-mail:" + e.canon, 6, HOUR)) return fail(429, "Too many attempts for this address. Please try again in an hour.");

    const t = now(), m = clientMeta(d, ip);
    const rows = [
      ["Name", n.value], ["Gmail", e.value + "   (format-checked, not confirmed by code)"], ["Phone", p.value + "   (format-checked, not verified)"],
      ["Entered at", stamp(t)], ["Time zone", m.timezone], ["Device", m.device], ["Came from", m.referrer], ["Page", m.page], ["IP address", m.ip]
    ];
    try { appendLead([new Date(t).toISOString(), "Visitor", n.value, e.value, p.value, "", m.page, m.referrer, m.timezone, m.device]); }
    catch (err) { log.error("lead log failed:", err.message); }

    if (mailer) {
      try {
        const pdf = await buildReportPdf({
          title: "New portfolio visitor", subtitle: n.value, badge: "FORMAT CHECKED", rows,
          footer: "Name, Gmail format and phone format were checked for fakes. Ownership of the Gmail address was not confirmed by an emailed code."
        });
        const safeName = latin(n.value).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "visitor";
        await mailer.sendMail({
          from: `"${n.value}" <${cfg.gmailUser}>`, to: cfg.ownerEmail, replyTo: e.value,
          subject: `[Portfolio] New visitor — ${n.value}`,
          html: ownerHtml("New visitor", rows, "Their details are attached as a PDF."),
          attachments: [{ filename: `Visitor-${safeName}-${new Date(t).toISOString().slice(0, 10)}.pdf`, content: pdf, contentType: "application/pdf" }]
        });
      } catch (err) { log.error("owner PDF mail failed:", err.message); }     // never lock a visitor out over this
    }
    const pass = makePass(e.canon);
    return reply(200, { ok: true, token: pass.token, exp: pass.exp, visitor: { name: n.value, email: e.value, phone: p.value } });
  }

  /* ---------- 3. contact form + resume (need a pass) ---------- */
  function visitorHtml(name, attached) {
    const hello = name ? `Hi ${esc(name.split(" ")[0])},` : "Hi,";
    const delivery = attached ? `<p>Thanks for taking a look at my portfolio. My resume is attached to this email as a PDF.</p>`
                              : `<p>Thanks for taking a look at my portfolio. You can open my resume here:</p>`;
    const button = (!attached && cfg.resumeUrl)
      ? `<p style="margin:22px 0"><a href="${esc(cfg.resumeUrl)}" style="display:inline-block;padding:13px 24px;border-radius:999px;background:#0F62FE;color:#fff;text-decoration:none;font-weight:600;font-size:15px">Open my resume</a></p>
         <p style="font-size:13px;color:#666">If the button does not work, paste this into your browser:<br><a href="${esc(cfg.resumeUrl)}" style="color:#0F62FE">${esc(cfg.resumeUrl)}</a></p>` : "";
    return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;font-size:15px;line-height:1.65;color:#222"><p>${hello}</p>${delivery}${button}
      <p>If anything there fits what you are working on, just reply to this email and it will reach me directly.</p>
      <p style="margin-top:22px">Best,<br>${esc(cfg.ownerName)}</p>
      <p style="margin-top:26px;padding-top:14px;border-top:1px solid #eee;font-size:12px;color:#999">You are receiving this because you requested the resume from my portfolio site.</p></div>`;
  }

  async function passed(d, ip) {
    const ve = checkEmail(d.email, false);
    const nn = checkName(d.name);
    if (!nn.ok) return fail(400, nn.message);
    if (!ve.ok) return fail(400, ve.message);
    if (!mailer) return fail(503, "Email is not configured on the server yet.");

    const type = String(d.type || "Portfolio visitor").slice(0, 60);
    const name = nn.value.slice(0, 120);
    const message = String(d.message || "").slice(0, 4000);
    const m = clientMeta(d, ip);
    const meta = [["Name", name], ["Email", ve.value], ["Type", type], ["Message", message],
                  ["Page", m.page], ["Came from", m.referrer], ["Timezone", m.timezone], ["Device", m.device], ["Time", stamp(now())]];
    try { appendLead([new Date(now()).toISOString(), type, name, ve.value, "", message, m.page, m.referrer, m.timezone, m.device]); }
    catch (err) { log.error("lead log failed:", err.message); }

    try {
      if (d.deliverResume === true) {
        if (limited("resume:" + ve.canon, cfg.resumePerDay, DAY)) {
          return fail(429, "The resume has already been sent to this address. Please check your inbox and spam folder.");
        }
        const hasFile = !!cfg.resumeAbs && cfg.resumeExists();
        if (!hasFile && !cfg.resumeUrl) {
          await mailer.sendMail({
            from: `"${name}" <${cfg.gmailUser}>`, to: cfg.ownerEmail, replyTo: ve.value,
            subject: "[Portfolio] ACTION NEEDED — resume request could not be fulfilled",
            html: ownerHtml("Resume request could not be fulfilled", meta.concat([
              ["Problem", "No PDF at " + cfg.resumeAbs + " and RESUME_URL is empty."],
              ["Fix", "Put your PDF at " + cfg.resumePath + ", or set RESUME_URL in .env to a public share link."]]))
          });
          return fail(500, "The resume is not published yet. I've been notified and will email it to you shortly.");
        }
        // The resume goes to the Gmail submitted in this request.
        await mailer.sendMail({
          from: `"${cfg.ownerName}" <${cfg.gmailUser}>`, to: ve.value, replyTo: cfg.ownerEmail,
          subject: `${cfg.ownerName} — Resume`, html: visitorHtml(name, hasFile),
          attachments: hasFile ? [{ filename: cfg.resumeName, path: cfg.resumeAbs }] : []
        });
        await mailer.sendMail({
          from: `"${name}" <${cfg.gmailUser}>`, to: cfg.ownerEmail, replyTo: ve.value,
          subject: `[Portfolio] Resume requested and sent — ${name || ve.value}`,
          html: ownerHtml("Resume requested and sent", meta.concat([["Delivered as", hasFile ? "PDF attachment" : "public link (" + cfg.resumeUrl + ")"]]),
                          "Someone just asked for your resume. It was emailed to their verified Gmail.")
        });
        return reply(200, { ok: true, delivered: true, mode: hasFile ? "attachment" : "link" });
      }
      const replyTo = checkEmail(d.email, false).ok ? String(d.email).trim().toLowerCase() : ve.value;
      await mailer.sendMail({
        from: `"${name}" <${cfg.gmailUser}>`, to: cfg.ownerEmail, replyTo,
        subject: `[Portfolio] ${type} — ${name || ve.value}`, html: ownerHtml(type, meta)
      });
      return reply(200, { ok: true });
    } catch (err) {
      log.error("send failed:", err.message);
      return fail(502, "Your details were recorded but the email could not be sent. Please try again shortly.");
    }
  }

  return {
    async handle(d, { ip = "unknown" } = {}) {
      if (!d || typeof d !== "object") return fail(400, "Malformed request.");
      if (limited("ip:" + ip, cfg.ratePerHour, HOUR)) return fail(429, "Too many requests. Please try again later.");
      if (d.action === "enter") return enter(d, ip);
      return passed(d, ip);
    },
    _test: { makePass }
  };
}
