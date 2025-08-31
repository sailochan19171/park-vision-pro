// Firebase Functions Express app wrapper for Vite frontend
// Minimal subset of backend routes migrated for Hosting rewrites

const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "healthy" });
});

// Content: return empty array for now (Footer carousel safety)
app.get("/api/content/articles", (req, res) => {
  res.json({ success: true, count: 0, articles: [] });
});

// Newsletter subscribe (no DB here; email optional via SMTP env)
let transporter;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
} else {
  transporter = nodemailer.createTransport({ jsonTransport: true });
}

// Build standard List-Unsubscribe headers targeting Firebase Hosting URL
function buildUnsubscribeHeaders(to) {
  const base = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
  const url = `${base}/api/newsletter/unsubscribe?email=${encodeURIComponent(String(to || ''))}`;
  const fromEmail = process.env.SMTP_USER || 'no-reply@vayaccess.com';
  return {
    'List-Unsubscribe': `<${url}>, <mailto:${fromEmail}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'List-Id': 'VayAccess Newsletter <newsletter.vayaccess.com>',
    'Precedence': 'bulk'
  };
}

app.post("/api/newsletter/subscribe", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
    }

    // Optional welcome email (best-effort)
    try {
      await transporter.sendMail({
        from: `"VayAccess Updates" <${process.env.SMTP_USER || "no-reply@vayaccess.com"}>`,
        to: email,
        subject: "Welcome to VayAccess Newsletter",
        text: "You will receive product news, articles, and live updates.",
        headers: buildUnsubscribeHeaders(email),
      });
    } catch (_) {}

    res.json({ success: true, message: "Subscribed successfully" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to subscribe" });
  }
});

// Contact
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    try {
      await transporter.sendMail({
        from: `"Website Contact" <${process.env.SMTP_USER || "no-reply@vayaccess.com"}>`,
        to: process.env.CONTACT_RECEIVER || process.env.SMTP_USER || "owner@example.com",
        subject: `New contact from ${name}`,
        text: `${name} <${email}>\n\n${message}`,
      });
    } catch (_) {}

    res.json({ success: true, message: "Message sent" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to send message" });
  }
});

// One-click unsubscribe endpoint (best-effort; no DB persistence here)
app.post("/api/newsletter/unsubscribe", async (req, res) => {
  try {
    const email = (req.body?.email || req.query?.email || "").toString();
    // In this lightweight function we can’t persist state, just acknowledge
    // RFC 8058 requires 200 with empty body for one-click.
    return res.status(200).send("");
  } catch (e) {
    return res.status(200).send("");
  }
});

// Human-friendly GET unsubscribe page (for when users click the link)
app.get("/api/newsletter/unsubscribe", (req, res) => {
  const email = (req.query?.email || "").toString();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Unsubscribed | VayAccess</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;line-height:1.5;padding:24px;color:#0f172a;background:#f8fafc}
        .card{max-width:640px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 20px rgba(0,0,0,.06);padding:24px}
        .brand{display:flex;align-items:center;gap:12px;margin-bottom:8px}
        .brand h1{font-size:20px;margin:0;color:#0f172a}
        .pill{display:inline-block;background:#e2e8f0;color:#334155;font-size:12px;padding:2px 8px;border-radius:999px}
        .btn{display:inline-block;margin-top:16px;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px}
        .muted{color:#64748b;font-size:14px}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand">
          <img src="https://vayaccess-59fdd.web.app/vay-logo.jpg" alt="VayAccess" width="32" height="32" />
          <h1>VayAccess</h1>
          <span class="pill">Newsletter</span>
        </div>
        <p>${email ? `We've processed your unsubscribe request for <strong>${email}</strong>.` : 'We\'ve processed your unsubscribe request.'}</p>
        <p class="muted">You won\'t receive future marketing updates. You can re-subscribe anytime on our website.</p>
        <a class="btn" href="/">Return to website</a>
      </div>
    </body>
  </html>`);
});

// Simple Manage Preferences placeholder (served from Functions for now)
app.get("/api/newsletter/manage", (req, res) => {
  const email = (req.query?.email || "").toString();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Manage Preferences | VayAccess</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;line-height:1.5;padding:24px;color:#0f172a;background:#f8fafc}
        .card{max-width:720px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 20px rgba(0,0,0,.06);padding:24px}
        h1{font-size:24px;margin:0 0 8px}
        .muted{color:#64748b;font-size:14px}
        label{display:block;margin:16px 0 6px}
        input[type="checkbox"]{margin-right:8px}
        .btn{display:inline-block;margin-top:20px;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px}
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Manage Email Preferences</h1>
        <p class="muted">${email ? `For: <strong>${email}</strong>` : ''} — Preferences are not persisted in this lightweight demo. Use the Unsubscribe link to stop emails.</p>
        <form>
          <label><input type="checkbox" checked disabled /> Product updates</label>
          <label><input type="checkbox" checked disabled /> Promotions and offers</label>
          <label><input type="checkbox" checked disabled /> Event invitations</label>
        </form>
        <a class="btn" href="/">Return to website</a>
      </div>
    </body>
  </html>`);
});

// Send a branded promo email to a single test recipient
app.post("/api/newsletter/send-test", async (req, res) => {
  try {
    const { to, subject, offerCode, offerEnds } = req.body || {};
    if (!to || !/.+@.+\..+/.test(to)) {
      return res.status(400).json({ success: false, message: "Valid 'to' email is required" });
    }

    const base = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
    const manageUrl = `${base}/api/newsletter/manage?email=${encodeURIComponent(to)}`;
    const unsubscribeUrl = `${base}/api/newsletter/unsubscribe?email=${encodeURIComponent(to)}`;
    const logoUrl = `${base}/logo.png`;

    const html = `
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${subject || 'VayAccess Updates'}</title>
      <style>
        body{margin:0;background:#f6f9fc;color:#0f172a}
        .container{max-width:680px;margin:0 auto;background:#ffffff}
        .header{padding:20px 24px;border-bottom:1px solid #eef2f7;display:flex;align-items:center;gap:12px}
        .brand{font-weight:700;font-size:18px}
        .hero{padding:28px 24px 8px}
        .title{font-size:22px;margin:0 0 6px}
        .subtitle{color:#475569;margin:0 0 18px}
        .card{margin:0 24px 16px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
        .card-body{padding:16px 16px}
        .cta{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px}
        .muted{color:#64748b}
        .footer{padding:20px 24px;border-top:1px solid #eef2f7;background:#fafbfc;color:#64748b;font-size:13px}
        .nav a{color:#2563eb;text-decoration:none;margin-right:12px}
        .pill{display:inline-block;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:2px 8px;border-radius:999px;font-size:12px}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="${logoUrl}" alt="VayAccess" width="32" height="32" />
          <div class="brand">VayAccess</div>
          <span class="pill">Newsletter</span>
        </div>
        <div class="hero">
          <h1 class="title">${subject || 'Latest from VayAccess'}</h1>
          <p class="subtitle">Smart parking solutions, access control, and product updates.</p>
        </div>

        <div class="card">
          <div class="card-body">
            <h2 style="margin:0 0 8px;font-size:18px">Special Offer</h2>
            <p style="margin:0 0 12px">Save up to 20% on select access control and parking solutions.</p>
            ${offerCode ? `<p style="margin:0 0 12px">Use promo code <strong>${offerCode}</strong>${offerEnds ? ` by <strong>${offerEnds}</strong>` : ''}.</p>` : ''}
            <a class="cta" href="${base}">Claim your discount</a>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <h2 style="margin:0 0 8px;font-size:18px">Featured Products</h2>
            <ul style="margin:0;padding-left:18px">
              <li>Barrier Gates – heavy-duty vehicle access control</li>
              <li>Flap/Tripod Turnstiles – secure pedestrian entry</li>
              <li>Parking Guidance Systems – improve flow and occupancy</li>
            </ul>
          </div>
        </div>

        <div class="footer">
          <div class="nav" style="margin-bottom:8px">
            <a href="${manageUrl}">Manage Preferences</a>
            <a href="${unsubscribeUrl}">Unsubscribe</a>
          </div>
          <div>
            You’re receiving this because you subscribed on our website.
            <br/>
            VayAccess • Smart Parking Solutions
          </div>
        </div>
      </div>
    </body>
    </html>`;

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER || 'no-reply@vayaccess.com'}>`,
      to,
      subject: subject || 'VayAccess: Smart Access & Parking Updates',
      html,
      headers: buildUnsubscribeHeaders(to),
    });

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// Export as a single HTTPS function
exports.api = functions.https.onRequest(app);