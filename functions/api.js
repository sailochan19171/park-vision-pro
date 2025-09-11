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

// Send brochure
app.post("/api/send-brochure", async (req, res) => {
  try {
    const { name, email, phone, countryCode, city } = req.body || {};
    if (!name || !/.+@.+\..+/.test(String(email || "")) || !phone || !city) {
      return res.status(400).json({ success: false, message: "Missing or invalid fields" });
    }

    // Notify internal recipient with lead details
    try {
      await transporter.sendMail({
        from: `"VayAccess" <${process.env.SMTP_USER || "no-reply@vayaccess.com"}>`,
        to: process.env.CONTACT_RECEIVER || process.env.SMTP_USER || "owner@example.com",
        subject: `Brochure Request - ${name}`,
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${countryCode || ""} ${phone}\nCity: ${city}`,
      });
    } catch (_) {}

    // Send brochure link to the user (best-effort)
    const base = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
    const brochureUrl = `${base}/vay-gate-brochure.pdf`;
    try {
      await transporter.sendMail({
        from: `"VayAccess" <${process.env.SMTP_USER || "no-reply@vayaccess.com"}>`,
        to: email,
        subject: "Your VayAccess brochure",
        text: `Thank you for your interest. Download your brochure here: ${brochureUrl}`,
        html: `<p>Thank you for your interest.</p><p>Download your brochure here: <a href="${brochureUrl}">${brochureUrl}</a></p>`,
        headers: buildUnsubscribeHeaders(email),
      });
    } catch (_) {}

    return res.json({ success: true, message: "Brochure sent" });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Failed to send brochure" });
  }
});

// Send brochure
app.post("/api/send-brochure", async (req, res) => {
  try {
    const { name, email, phone, countryCode, city } = req.body || {};
    if (!name || !/.+@.+\..+/.test(String(email || "")) || !phone || !city) {
      return res.status(400).json({ success: false, message: "Missing or invalid fields" });
    }

    // Notify internal recipient with lead details
    try {
      await transporter.sendMail({
        from: `"VayAccess" <${process.env.SMTP_USER || "no-reply@vayaccess.com"}>`,
        to: process.env.CONTACT_RECEIVER || process.env.SMTP_USER || "owner@example.com",
        subject: `Brochure Request - ${name}`,
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${countryCode || ""} ${phone}\nCity: ${city}`,
      });
    } catch (_) {}

    // Send brochure link to the user (best-effort)
    const base = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
    const brochureUrl = `${base}/vay-gate-brochure.pdf`;
    try {
      await transporter.sendMail({
        from: `"VayAccess" <${process.env.SMTP_USER || "no-reply@vayaccess.com"}>`,
        to: email,
        subject: "Your VayAccess brochure",
        text: `Thank you for your interest. Download your brochure here: ${brochureUrl}`,
        html: `<p>Thank you for your interest.</p><p>Download your brochure here: <a href="${brochureUrl}">${brochureUrl}</a></p>`,
        headers: buildUnsubscribeHeaders(email),
      });
    } catch (_) {}

    return res.json({ success: true, message: "Brochure sent" });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Failed to send brochure" });
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

// Export Express API as HTTPS function
exports.api = functions.https.onRequest(app);

// --- Scheduled digests and event-based emails ---------------------------------
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Helper: build edX-style newsletter template
function buildEdxStyleTemplate({ subject, preheader = '', introTitle, introBody, cards = [], ctaText = 'Explore', ctaUrl = '/', footerNote = '' }) {
  const base = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
  const logoUrl = `${base}/logo.png`;
  const nav = `${base}`;
  const manageUrl = `${base}/api/newsletter/manage`;
  const unsubscribeUrl = `${base}/api/newsletter/unsubscribe`;
  return `<!doctype html>
  <html lang="en"><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject || 'VayAccess Updates'}</title>
    <style>
      body{margin:0;background:#f6f9fc;color:#0f172a;font-family:Arial,Helvetica,sans-serif}
      .container{max-width:680px;margin:0 auto;background:#ffffff}
      .header{padding:20px 24px;border-bottom:1px solid #eef2f7;display:flex;align-items:center;gap:12px}
      .brand{font-weight:700;font-size:18px}
      .nav{margin-left:auto}
      .nav a{color:#2563eb;text-decoration:none;margin-left:12px}
      .hero{padding:28px 24px 8px}
      .title{font-size:22px;margin:0 0 6px}
      .subtitle{color:#475569;margin:0 0 18px}
      .card{margin:0 24px 16px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
      .card-body{padding:16px}
      .cta{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px}
      .pill{display:inline-block;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:2px 8px;border-radius:999px;font-size:12px}
      .footer{padding:20px 24px;border-top:1px solid #eef2f7;background:#fafbfc;color:#64748b;font-size:13px}
      .muted{color:#64748b}
      img{display:block;max-width:100%;border:0}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="${logoUrl}" alt="VayAccess" width="32" height="32" />
        <div class="brand">VayAccess</div>
        <div class="nav">
          <a href="${nav}/products">Products</a>
          <a href="${nav}/solutions">Solutions</a>
          <a href="${nav}/#contact">Contact</a>
        </div>
      </div>
      <div class="hero">
        <h1 class="title">${introTitle || 'Latest from VayAccess'}</h1>
        <p class="subtitle">${introBody || preheader || 'Smart parking & access control updates, tailored for you.'}</p>
      </div>
      ${cards.map(c => `
        <div class="card">
          ${c.image ? `<img src="${c.image}" alt="${c.title}" />` : ''}
          <div class="card-body">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
              <div>
                <h2 style="margin:0 0 6px;font-size:18px">${c.title}</h2>
                <p class="muted" style="margin:0 0 12px">${c.description || ''}</p>
              </div>
              ${c.tag ? `<span class="pill">${c.tag}</span>` : ''}
            </div>
            <a class="cta" href="${c.url || c.ctaUrl || ctaUrl}">${c.ctaText || ctaText}</a>
          </div>
        </div>`).join('')}
      <div class="footer">
        <div class="nav" style="margin-bottom:8px">
          <a href="${manageUrl}">Manage Preferences</a>
          <a href="${unsubscribeUrl}">Unsubscribe</a>
        </div>
        <div>
          You’re receiving this because you subscribed on our website.
          <br/>
          ${footerNote || 'VayAccess • Smart Parking Solutions'}
        </div>
      </div>
    </div>
  </body></html>`;
}

// Helper: send a message to many recipients with proper headers
async function sendBulk({ toList, subject, html }) {
  const results = [];
  for (const to of toList) {
    try {
      await transporter.sendMail({
        from: `"VayAccess Updates" <${process.env.SMTP_USER || 'no-reply@vayaccess.com'}>`,
        to,
        subject,
        html,
        headers: buildUnsubscribeHeaders(to),
      });
      results.push({ to, ok: true });
    } catch (e) {
      results.push({ to, ok: false, error: String(e) });
    }
  }
  return results;
}

// Hourly digest: gather new updates from Firestore and send once per item (no repeats)
exports.hourlyDigest = functions.pubsub
  .schedule('every 60 minutes')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const base = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
    // 1) Fetch published updates without newsletterSentAt in the last 6 hours (safety window)
    const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 6 * 60 * 60 * 1000));
    const snap = await db.collection('updates')
      .where('status', '==', 'published')
      .where('publishedAt', '>=', since)
      .get();

    const pending = snap.docs.filter(d => !d.get('newsletterSentAt'));
    if (pending.length === 0) return null; // nothing to do

    // 2) Build cards from updates
    const assetBase = process.env.ASSET_BASE_URL || base;
    const cards = pending.map(d => ({
      title: d.get('title') || 'Update',
      description: (d.get('body') || '').slice(0, 180),
      url: `${base}${d.get('link') || '/'}`,
      tag: 'New',
      image: `${assetBase}/assets/featured-image-1.jpg`, // Use a real image; replace per update if you store image path
      ctaText: 'Read more'
    }));

    const html = buildEdxStyleTemplate({
      subject: `VayAccess — ${pending.length} new update${pending.length>1?'s':''}`,
      introTitle: 'This hour at VayAccess',
      introBody: 'Here are the latest product and solution updates.',
      cards,
    });

    // 3) Fetch active subscribers
    const subsSnap = await db.collection('subscribers').where('active', '==', true).get();
    const toList = subsSnap.docs.map(d => d.id).filter(e => /.+@.+\..+/.test(e));
    if (toList.length === 0) return null;

    // 4) Send bulk & mark sent to avoid repeats
    await sendBulk({ toList, subject: 'VayAccess — New updates', html });

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    pending.forEach(d => batch.update(d.ref, { newsletterSentAt: now }));
    await batch.commit();

    return null;
  });

// Event-based emails: process queued events and send category-specific templates
exports.eventDispatcher = functions.pubsub
  .schedule('every 5 minutes')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const q = await db.collection('events').where('processed', '==', false).limit(50).get();
    if (q.empty) return null;

    const base = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
    const assetBase = process.env.ASSET_BASE_URL || base; // Prefer backend URL that serves /assets from src/assets

    const categoryCard = (category) => {
      const map = {
        'barrier-gates': {
          title: 'Barrier Gates — Control Vehicle Access',
          description: 'Heavy-duty barriers with LED indicators and 24/7 operation.',
          url: `${base}/products/barrier-gates`,
          image: `${assetBase}/assets/barrier-gate-10.jpg`,
          tag: 'Products',
        },
        'pedestrian-gates': {
          title: 'Pedestrian Gates — Tripod & Flap Turnstiles',
          description: 'Secure, elegant entry management for buildings and metros.',
          url: `${base}/products/pedestrian-gates`,
          image: `${assetBase}/assets/vay-flap-barrier-slim.jpg`,
          tag: 'Products',
        },
        'access-control': {
          title: 'Access Control — RFID, Biometrics, Mobile',
          description: 'Multi-modal authentication with cloud management.',
          url: `${base}/products/access-control/mobile-system`,
          image: `${assetBase}/assets/mobile-access-control.jpg`,
          tag: 'Solutions',
        },
        'parking-management': {
          title: 'Parking Management — Ticketless & Guidance',
          description: 'Real-time monitoring, digital payments, LPR & analytics.',
          url: `${base}/products/parking-management`,
          image: `${assetBase}/assets/parking-guidance-23.jpg`,
          tag: 'Solutions',
        }
      };
      return map[category] || {
        title: 'VayAccess — Smart Parking & Access',
        description: 'Explore our products and solutions tailored to your facility.',
        url: base,
        image: `${assetBase}/assets/logo.png`,
        tag: 'Explore',
      };
    };

    const batch = db.batch();
    for (const doc of q.docs) {
      const ev = doc.data();
      const toList = ev.email ? [ev.email] : []; // optional per-user, else broadcast to all below
      let recipients = toList;
      if (recipients.length === 0) {
        const subs = await db.collection('subscribers').where('active', '==', true).get();
        recipients = subs.docs.map(d => d.id).filter(e => /.+@.+\..+/.test(e));
      }

      const card = categoryCard(ev.category || 'general');
      const html = buildEdxStyleTemplate({
        subject: `VayAccess — ${card.title}`,
        introTitle: card.title,
        introBody: 'Triggered by your recent activity on our website.',
        cards: [card],
        ctaText: 'Learn more',
        ctaUrl: card.url,
      });

      await sendBulk({ toList: recipients, subject: `VayAccess — ${card.title}`, html });

      batch.update(doc.ref, { processed: true, sentAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    await batch.commit();
    return null;
  });

// Minimal event tracking endpoint to enqueue events from the website
app.post('/api/events/track', async (req, res) => {
  try {
    const { type, category, email, meta } = req.body || {};
    await db.collection('events').add({
      type: type || 'activity',
      category: (category || 'general').toString(),
      email: email || null,
      meta: meta || {},
      processed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to track event' });
  }
});

// Test digest builder for a single address
app.post('/api/newsletter/digest-test', async (req, res) => {
  try {
    const { to, frequency = 'weekly' } = req.body || {};
    if (!to || !/.+@.+\..+/.test(to)) return res.status(400).json({ success: false, message: 'Valid to required' });
    const base = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';

    // Fetch static feeds from Hosting
    async function fetchJson(url) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Fetch failed ${url}: ${r.status}`);
      return r.json();
    }
    const [products, solutions] = await Promise.all([
      fetchJson(`${base}/products.json`).catch(() => []),
      fetchJson(`${base}/solutions.json`).catch(() => []),
    ]);

    // Helpers
    const now = new Date();
    const withinDays = (iso, days) => {
      const d = new Date(iso || 0).getTime();
      return now.getTime() - d <= days * 24 * 60 * 60 * 1000;
    };
    const shuffle = (arr) => arr.map(v => ({ v, r: Math.random() })).sort((a,b)=>a.r-b.r).map(x=>x.v);
    const byViewsDesc = (a,b) => (b.views||0) - (a.views||0);
    const byUpdatedDesc = (a,b) => new Date(b.updatedAt||0).getTime() - new Date(a.updatedAt||0).getTime();

    let cards = [];
    if (frequency === 'hourly') {
      const prodPick = shuffle(products).slice(0,2);
      const solPick = shuffle(solutions).slice(0,2);
      cards = [...prodPick, ...solPick];
    } else if (frequency === 'daily') {
      const recent = [
        ...products.filter(p => withinDays(p.updatedAt, 7)),
        ...solutions.filter(s => withinDays(s.updatedAt, 7)),
      ].sort(byUpdatedDesc).slice(0, 6);
      cards = recent;
    } else { // weekly
      const all = [...products, ...solutions];
      const topViewed = [...all].sort(byViewsDesc).slice(0, 6);
      // Include all new (updated last 30 days) plus top viewed
      const fresh = all.filter(i => withinDays(i.updatedAt, 30));
      const map = new Map();
      [...fresh, ...topViewed].forEach(i => map.set(i.id, i));
      cards = Array.from(map.values());
    }

    // Normalize cards to template format with absolute images
    const normalize = (item) => ({
      title: item.title,
      description: item.description || '',
      url: item.link ? (item.link.startsWith('http') ? item.link : `${base}${item.link}`) : base,
      image: item.image && item.image.startsWith('http') ? item.image : `${base}/logo.png`,
      tag: item.category || 'Update',
    });
    const html = buildEdxStyleTemplate({
      subject: `VayAccess — ${frequency.charAt(0).toUpperCase()+frequency.slice(1)} Digest`,
      introTitle: 'Latest from VayAccess',
      introBody: frequency === 'hourly' ? 'Quick hourly highlights picked for you.' : frequency === 'daily' ? 'Top changes from the last 7 days.' : 'All new items and top viewed highlights.',
      cards: cards.map(normalize),
    });

    await transporter.sendMail({ from: `"VayAccess Updates" <${process.env.SMTP_USER || 'no-reply@vayaccess.com'}>`, to, subject: `VayAccess — ${frequency.charAt(0).toUpperCase()+frequency.slice(1)} Digest`, html, headers: buildUnsubscribeHeaders(to) });
    res.json({ success: true, count: cards.length });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to send test digest' });
  }
});