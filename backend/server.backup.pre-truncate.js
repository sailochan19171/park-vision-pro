require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Optional services (keep requires to avoid ref errors if routes are used elsewhere)
const voiceAIService = require('./services/voiceAIService');
const asteriskService = require('./services/asteriskService');

// --- MongoDB (Atlas) setup with robust reconnect ---
const { MongoClient } = require('mongodb');
let mongoClient = null;
let mongoDb = null;

(async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'vay_parking_system';
  if (!uri) {
    console.warn('MongoDB not initialized: missing MONGODB_URI. Newsletter persistence will be disabled.');
    return;
  }

  let mongoReconnectTimer = null;

  function setupMongoAutoReconnect() {
    if (!mongoClient) return;
    const events = ['topologyClosed', 'serverClosed', 'serverHeartbeatFailed'];
    events.forEach((ev) => {
      try { mongoClient.removeAllListeners(ev); } catch {}
      mongoClient.on(ev, (info) => {
        if (mongoReconnectTimer) return;
        const msg = info && info.message ? info.message : '';
        console.warn(`MongoDB ${ev} - scheduling reconnect in 5s`, msg);
        mongoReconnectTimer = setTimeout(async () => {
          mongoReconnectTimer = null;
          let connected = await tryConnect('reconnect', { ...baseOptions });
          if (!connected) connected = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
          if (!connected) {
            connected = await tryConnect('reconnect + insecure', {
              ...baseOptions,
              tlsAllowInvalidCertificates: true,
              tlsAllowInvalidHostnames: true,
              family: 4,
            });
          }
          if (!connected) {
            console.warn('MongoDB reconnection failed; retrying in 10s');
            mongoReconnectTimer = setTimeout(async () => {
              mongoReconnectTimer = null;
              let ok = await tryConnect('reconnect', { ...baseOptions });
              if (!ok) ok = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
              if (!ok) {
                await tryConnect('reconnect + insecure', {
                  ...baseOptions,
                  tlsAllowInvalidCertificates: true,
                  tlsAllowInvalidHostnames: true,
                  family: 4,
                });
              }
            }, 10000);
          }
        }, 5000);
      });
    });
  }

  async function tryConnect(optionsLabel, options) {
    try {
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
      mongoClient = new MongoClient(uri, options);
      await mongoClient.connect();
      mongoDb = mongoClient.db(dbName);
      console.log(`Connected to MongoDB Atlas database: ${dbName} (${optionsLabel})`);
      setupMongoAutoReconnect();

      // Ensure indexes used by the app
      try {
        await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
        await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
        await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
        await mongoDb.collection('email_events').createIndex({ dedupeKey: 1 }, { sparse: true });
        await mongoDb.collection('email_events').createIndex({ createdAt: -1 });
        console.log('MongoDB indexes ensured');
      } catch (idxErr) {
        console.warn('MongoDB index ensure failed:', idxErr.message);
      }

      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn(`MongoDB connect failed [${optionsLabel}]:`, msg);
      return false;
    }
  }

  const baseOptions = {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
    tls: true,
  };

  const insecureEnv = process.env.MONGODB_TLS_INSECURE === 'true';

  if (insecureEnv) {
    const ok = await tryConnect('tls+insecure (env)', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
    if (!ok) console.warn('MongoDB initialization failed under insecure mode. Newsletter persistence will be disabled.');
    return;
  }

  let connected = await tryConnect('tls strict', { ...baseOptions });
  if (!connected) connected = await tryConnect('tls strict + IPv4', { ...baseOptions, family: 4 });
  if (!connected) connected = await tryConnect('tls+insecure fallback', {
    ...baseOptions,
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true,
    family: 4,
  });
  if (!connected) console.warn('MongoDB initialization failed after all attempts. Newsletter persistence will be disabled.');
})();

// --- Express/HTTP/Socket.IO ---
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

const CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8000',
  'https://vayaccess.com',
  'https://vayaccess-59fdd.web.app',
];

const io = new Server(server, { cors: { origin: CORS_ORIGINS, credentials: true } });

const upload = multer({ dest: 'temp/', limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json());

// Serve site assets for emails and previews
app.use('/assets', express.static(path.resolve(__dirname, '../src/assets')));

// Admin preview HTML (static)
app.get('/admin/newsletter', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin-newsletter.html'));
});

// Demo routes (FREE - no Twilio needed)
try {
  const demoRoutes = require('./routes/demo');
  app.use('/api', demoRoutes);
} catch (_) {
  // optional
}

// --- Health ---
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', mongo: !!mongoDb });
});

// --- SMTP Transporter ---
let transporter = null;
let smtpReady = false;
let smtpError = null;

if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  transporter.verify((error) => {
    if (error) {
      smtpReady = false; smtpError = String(error?.message || error);
      console.error('Email configuration error:', error);
    } else {
      smtpReady = true; smtpError = null; console.log('Email server is ready to send messages');
    }
  });
} else {
  transporter = nodemailer.createTransport({ jsonTransport: true });
  smtpReady = false; smtpError = 'SMTP_USER/SMTP_PASS missing (jsonTransport)';
  console.log('Email disabled: missing SMTP_USER/SMTP_PASS (using jsonTransport)');
}

app.get('/api/admin/smtp-status', (req, res) => {
  res.json({ ready: smtpReady, error: smtpError, user: process.env.SMTP_USER || null, host: process.env.SMTP_HOST || 'smtp.gmail.com' });
});

// --- Email helper ---
const createEmailHelper = require('./emailHelper');
const emailHelper = createEmailHelper(transporter, () => mongoDb);

// --- Public URL and Unsubscribe helpers ---
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
const NEWSLETTER_SECRET = process.env.NEWSLETTER_ADMIN_TOKEN || process.env.NEWSLETTER_SECRET || 'change-me';

function signUnsubToken(email) {
  return crypto.createHmac('sha256', NEWSLETTER_SECRET).update(String(email).toLowerCase()).digest('hex');
}

function buildUnsubscribeHeaders(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  const t = signUnsubToken(email);
  const httpUrl = `${PUBLIC_BASE_URL}/api/newsletter/unsubscribe?e=${e}&t=${t}`;
  const mailto = `mailto:${process.env.SMTP_USER || 'no-reply@vayaccess.com'}?subject=unsubscribe`;
  const base = {
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
  // Include both URL and mailto for max client compatibility
  return {
    ...base,
    'List-Unsubscribe': `<${httpUrl}>, <${mailto}>`,
    'X-List-Manage': `${PUBLIC_BASE_URL}/newsletter/manage`,
  };
}

function withFooter(html) {
  const manageUrl = `${PUBLIC_BASE_URL}/newsletter/manage`;
  const manageLine = process.env.ENABLE_MANAGE_LINK === 'true'
    ? `<br/>Manage: <a style="color:#2563eb;" href="${manageUrl}">subscription portal</a>`
    : '';
  return `${html}
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:24px auto 0;color:#6b7280;font-size:12px;">
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
      <p style="margin:8px 0;">VayAccess · Smart Parking Solutions</p>
      <p style="margin:8px 0;">You can unsubscribe via the link in email headers.${manageLine}</p>
    </div>`;
}

// --- One-click unsubscribe (RFC 8058) ---
app.post('/api/newsletter/unsubscribe', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const email = (req.body?.email || req.query?.e || '').toString().toLowerCase();
    const token = (req.body?.token || req.query?.t || '').toString();
    if (!email || token !== signUnsubToken(email)) return res.status(400).send('Invalid request');
    if (mongoDb) {
      await mongoDb.collection('subscribers').updateOne({ email }, { $set: { active: false, updatedAt: new Date() } });
    }
    return res.status(200).send('');
  } catch (e) {
    return res.status(500).send('');
  }
});

// --- Subscribe & preferences ---
app.post('/api/subscribe', async (req, res) => {
  try {
    const { name, email, frequency } = req.body || {};
    const n = String(name || '').trim();
    const em = String(email || '').trim().toLowerCase();
    const f = String(frequency || 'weekly').toLowerCase();
    if (!/.+@.+\..+/.test(em)) return res.status(400).json({ success:false, message:'Invalid email' });
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });

    const now = new Date();
    await mongoDb.collection('subscribers').updateOne(
      { email: em },
      { $setOnInsert: { createdAt: now, subscribedAt: now }, $set: { name: n, frequency: freq, active: true, updatedAt: now } },
      { upsert: true }
    );

    // Welcome email
    const headers = buildUnsubscribeHeaders(em);
    const firstName = n ? n.split(' ')[0] : 'there';
    const html = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p>Hi ${firstName},</p>
        <p>Thanks for subscribing to VayAccess updates (${freq}). You'll receive ${freq} digests with our latest articles.</p>
      </div>
    `);
    await emailHelper.sendCategorizedEmail({
      category: 'newsletter_welcome',
      to: em,
      subject: 'Welcome to VayAccess Updates',
      html,
      headers
    });

    return res.json({ success:true, message:'Subscribed' });
  } catch (e) {
    const msg = e?.code === 11000 ? 'Already subscribed' : (e?.message || 'Server error');
    return res.status(500).json({ success:false, message: msg });
  }
});

app.post('/api/newsletter/update-preferences', async (req, res) => {
  try {
    const { email, token, frequency } = req.body || {};
    const em = String(email || '').toLowerCase();
    if (!em || token !== signUnsubToken(em)) return res.status(400).json({ success:false, message:'Invalid token' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const f = String(frequency || '').toLowerCase();
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    await mongoDb.collection('subscribers').updateOne({ email: em }, { $set: { frequency: freq, updatedAt: new Date() } });
    return res.json({ success:true });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// --- Push token registration ---
app.post('/api/push/register', async (req, res) => {
  try {
    const { token, email } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'Missing token' });

    if (!mongoDb) {
      if (process.env.ALLOW_DEV_NO_DB === 'true') {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
        return res.json({ success: true, message: 'Token accepted (no DB in dev)' });
      }
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    await mongoDb.collection('pushTokens').updateOne(
      { token },
      {
        $set: {
          token,
          email: email || null,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Token registered' });
  } catch (e) {
    console.error('Register push token failed:', e);
    return res.status(500).json({ success: false, message: 'Failed to register token' });
  }
});

// --- Real FCM HTTP v1 sender ---
const { google } = require('googleapis');
const fetch = require('node-fetch');
let FB_PROJECT_ID = process.env.FB_PROJECT_ID;
try {
  if (!FB_PROJECT_ID) {
    const svc = require('./service-account.json');
    FB_PROJECT_ID = svc.project_id;
  }
} catch (_) {}

async function getFcmAccessToken() {
  const key = require('./service-account.json');
  const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

async function sendFcmMessage(token, title, body, link) {
  if (!FB_PROJECT_ID) throw new Error('Missing FB_PROJECT_ID or service-account project_id');
  const accessToken = await getFcmAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${FB_PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token,
      notification: { title, body },
      webpush: {
        fcm_options: { link: link || '/' },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM error: ${txt}`);
  }
  return res.json();
}

// --- Announcements: publish and auto-publish ---
app.post('/api/updates/publish', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { title, body, link = '/', previewOnly = false } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });

    const insertRes = await mongoDb.collection('announcements').insertOne({ title, body, link, createdAt: new Date() });

    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    if (previewOnly) {
      return res.json({ success: true, message: 'Preview only', id: insertRes.insertedId, emailsCount: emails.length, tokensCount: tokens.length });
    }

    // Email broadcast via helper (adds proper headers and tracking)
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await emailHelper.sendCategorizedEmail({
          category: 'announcement',
          to,
          subject: title,
          html: withFooter(`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`),
          text: `${title}\n\n${body}\n\nLink: ${link}`,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `announcement:${title}:${String(to).toLowerCase()}`,
          meta: { announcement: true },
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try { await sendFcmMessage(t, title, body, link); pushOk++; } catch (_) { pushFail++; }
    }

    return res.json({ success: true, id: insertRes.insertedId, emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Publish update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to publish update' });
  }
});

app.post('/api/updates/auto-publish', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { version, title, body, link = '/' } = req.body || {};
    if (!version || !title || !body) return res.status(400).json({ success: false, message: 'Missing version, title or body' });

    const versionId = String(version).trim();
    const already = await mongoDb.collection('announcements_sent').findOne({ version: versionId });
    if (already) return res.json({ success: true, message: 'Already sent for this version' });

    const annInsert = await mongoDb.collection('announcements').insertOne({ version: versionId, title, body, link, createdAt: new Date(), auto: true });

    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await emailHelper.sendCategorizedEmail({
          category: 'announcement',
          to,
          subject: title,
          html: withFooter(`<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;\"><h2 style=\"margin:0 0 12px 0;\">${title}</h2><p style=\"color:#374151;line-height:1.6;\">${body}</p><p style=\"margin-top:16px;\"><a href=\"${link}\" style=\"color:#2563eb;text-decoration:none;\">View update</a></p></div>`),
          text: `${title}\n\n${body}\n\nLink: ${link}`,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `announcement:${versionId}:${String(to).toLowerCase()}`,
          meta: { announcement: true, version: versionId },
        });
        sent++;
      } catch (_) { failed++; }
    }

    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try { await sendFcmMessage(t, title, body, link); pushOk++; } catch (_) { pushFail++; }
    }

    await mongoDb.collection('announcements_sent').updateOne(
      { version: versionId },
      { $set: { version: versionId, title, body, link, sentAt: new Date(), announcementId: annInsert.insertedId } },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Auto-publish sent', emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Auto-publish failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to auto-publish' });
  }
});

// --- Admin: manual send ---
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing to/subject/body' });
    }

    await emailHelper.sendCategorizedEmail({
      category: 'announcement',
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `manual:${subject}:${String(to).toLowerCase()}`,
      meta: { manual: true },
    });

    return res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    console.error('Manual send failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// --- Asterisk AMI integration (optional) ---
if (process.env.ENABLE_AMI === 'true') {
  asteriskService.connect().catch(err => {
    console.error('Failed to connect to Asterisk AMI:', err);
  });
} else {
  console.log('Skipping AMI connection (ENABLE_AMI not set to true)');
}

app.post('/api/call', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ success: false, message: 'Phone number is required' });

    if (!asteriskService.isAlive()) {
      await asteriskService.connect();
    }

    const result = await asteriskService.originateCall(number);

    if (result.success) {
      io.emit('call-status-changed', {
        sessionId: result.sessionId,
        phoneNumber: number,
        status: 'initiated',
        timestamp: new Date(),
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error originating call:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

asteriskService.on('call-originated', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'ringing',
    timestamp: new Date(),
  });
});

asteriskService.on('call-connected', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'connected',
    timestamp: new Date(),
  });
});

asteriskService.on('call-ended', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'ended',
    reason: data.reason || 'unknown',
    timestamp: new Date(),
  });
});

// --- Start server ---
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const voiceAIService = require('./services/voiceAIService');
const asteriskService = require('./services/asteriskService');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// MongoDB Atlas (replaces Firestore for subscribers/tokens)
const { MongoClient } = require('mongodb');
let mongoClient = null;
let mongoDb = null;
(async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'vay_parking_system';
  if (!uri) {
    console.warn('MongoDB not initialized: missing MONGODB_URI. Newsletter persistence will be disabled.');
    return;
  }

  // Attempt robust connection strategy for Windows/OpenSSL TLS issues
  let mongoReconnectTimer = null;

  function setupMongoAutoReconnect() {
    if (!mongoClient) return;
    const events = ['topologyClosed', 'serverClosed', 'serverHeartbeatFailed'];
    events.forEach((ev) => {
      try { mongoClient.removeAllListeners(ev); } catch {}
      mongoClient.on(ev, (info) => {
        if (mongoReconnectTimer) return;
        const msg = info && info.message ? info.message : '';
        console.warn(`MongoDB ${ev} - scheduling reconnect in 5s`, msg);
        mongoReconnectTimer = setTimeout(async () => {
          mongoReconnectTimer = null;
          let connected = await tryConnect('reconnect', { ...baseOptions });
          if (!connected) connected = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
          if (!connected) {
            connected = await tryConnect('reconnect + insecure', {
              ...baseOptions,
              tlsAllowInvalidCertificates: true,
              tlsAllowInvalidHostnames: true,
              family: 4,
            });
          }
          if (!connected) {
            console.warn('MongoDB reconnection failed; retrying in 10s');
            mongoReconnectTimer = setTimeout(async () => {
              mongoReconnectTimer = null;
              let ok = await tryConnect('reconnect', { ...baseOptions });
              if (!ok) ok = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
              if (!ok) {
                await tryConnect('reconnect + insecure', {
                  ...baseOptions,
                  tlsAllowInvalidCertificates: true,
                  tlsAllowInvalidHostnames: true,
                  family: 4,
                });
              }
            }, 10000);
          }
        }, 5000);
      });
    });
  }

  async function tryConnect(optionsLabel, options) {
    try {
      // Close previous client to avoid socket leaks
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
      mongoClient = new MongoClient(uri, options);
      await mongoClient.connect();
      mongoDb = mongoClient.db(dbName);
      console.log(`Connected to MongoDB Atlas database: ${dbName} (${optionsLabel})`);
      setupMongoAutoReconnect();
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn(`MongoDB connect failed [${optionsLabel}]:`, msg);
      return false;
    }
  }

  const baseOptions = {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
    tls: true,
    // Note: keepAlive options are not supported by the MongoDB Node.js driver v5.
    // We rely on the driver's internal keep-alive and our event-based reconnection.
  };

  const insecureEnv = process.env.MONGODB_TLS_INSECURE === 'true';

  // 1) If insecure explicitly requested via env, use it directly
  if (insecureEnv) {
    const ok = await tryConnect('tls+insecure (env)', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
    if (!ok) {
      console.warn('MongoDB initialization failed under insecure mode. Newsletter persistence will be disabled.');
    } else {
      // Ensure indexes for deduplication and idempotency
      try {
        await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
        await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
        await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
        console.log('MongoDB indexes ensured');
      } catch (idxErr) {
        console.warn('MongoDB index ensure failed:', idxErr.message);
      }
    }
    return;
  }

  // 2) Try strict TLS first
  let connected = await tryConnect('tls strict', { ...baseOptions });

  // 3) If fails, try strict TLS forcing IPv4 (DNS/IPv6 issues)
  if (!connected) {
    connected = await tryConnect('tls strict + IPv4', { ...baseOptions, family: 4 });
  }

  // 4) If still fails with SSL-related error, try insecure TLS as fallback
  if (!connected) {
    connected = await tryConnect('tls+insecure fallback', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
  }

  if (!connected) {
    console.warn('MongoDB initialization failed after all attempts. Newsletter persistence will be disabled.');
    return;
  }

  // Ensure indexes for deduplication and idempotency
  try {
    await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
    await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
    console.log('MongoDB indexes ensured');
  } catch (idxErr) {
    console.warn('MongoDB index ensure failed:', idxErr.message);
  }
})();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

// Initialize Socket.IO for real-time call communication
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
    credentials: true
  }
});

// Configure multer for audio file uploads
const upload = multer({
  dest: 'temp/', // temporary directory for uploaded audio files
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
  credentials: true
}));
app.use(express.json());

// Serve assets with stable URLs for emails and previews
app.use('/assets', express.static(path.resolve(__dirname, '../src/assets')));

// Serve admin interface (protected by admin token in the HTML)
app.get('/admin/newsletter', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin-newsletter.html'));
});

// Demo routes (FREE - no Twilio needed)
const demoRoutes = require('./routes/demo');
app.use('/api', demoRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', mongo: !!mongoDb });
});

// One-click unsubscribe (for List-Unsubscribe-Post)
app.post('/api/newsletter/unsubscribe', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const email = (req.body?.email || req.query?.e || '').toString().toLowerCase();
    const token = (req.body?.token || req.query?.t || '').toString();
    if (!email || token !== signUnsubToken(email)) return res.status(400).send('Invalid request');
    if (mongoDb) {
      await mongoDb.collection('subscribers').updateOne({ email }, { $set: { active: false, updatedAt: new Date() } });
    }
    // RFC-compliant one-click: respond 200 with empty body
    return res.status(200).send('');
  } catch (e) {
    return res.status(500).send('');
  }
});

// Subscribe endpoint (name, email, frequency)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { name, email, frequency } = req.body || {};
    const n = String(name || '').trim();
    const em = String(email || '').trim().toLowerCase();
    const f = String(frequency || 'weekly').toLowerCase();
    if (!/.+@.+\..+/.test(em)) return res.status(400).json({ success:false, message:'Invalid email' });
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });

    const now = new Date();
    await mongoDb.collection('subscribers').updateOne(
      { email: em },
      { $setOnInsert: { createdAt: now, subscribedAt: now }, $set: { name: n, frequency: freq, active: true, updatedAt: now } },
      { upsert: true }
    );

    // Send welcome email
    const headers = buildUnsubscribeHeaders(em);
    const firstName = n ? n.split(' ')[0] : 'there';
    const html = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p>Hi ${firstName},</p>
        <p>Thanks for subscribing to VayAccess updates (${freq}). You'll receive ${freq} digests with our latest articles.</p>
      </div>
    `);
    await emailHelper.sendCategorizedEmail({
      category: 'newsletter_welcome',
      to: em,
      subject: 'Welcome to VayAccess Updates',
      html,
      headers
    });

    return res.json({ success:true, message:'Subscribed' });
  } catch (e) {
    const msg = e?.code === 11000 ? 'Already subscribed' : (e?.message || 'Server error');
    return res.status(500).json({ success:false, message: msg });
  }
});

// Preferences update endpoint
app.post('/api/newsletter/update-preferences', async (req, res) => {
  try {
    const { email, token, frequency } = req.body || {};
    const em = String(email || '').toLowerCase();
    if (!em || token !== signUnsubToken(em)) return res.status(400).json({ success:false, message:'Invalid token' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const f = String(frequency || '').toLowerCase();
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    await mongoDb.collection('subscribers').updateOne({ email: em }, { $set: { frequency: freq, updatedAt: new Date() } });
    return res.json({ success:true });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Manual trigger for individual email distribution (for testing)
app.post('/api/newsletter/distribute-individual', async (req, res) => {
  try {
    const result = await distributeIndividualEmails();
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Server error' });
  }
});

// Articles: create & list
app.post('/api/articles', async (req, res) => {
  try {
    const { title, summary, content, tags } = req.body || {};
    if (!title || !summary) return res.status(400).json({ success:false, message:'Missing title/summary' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const doc = { title: String(title), summary: String(summary), content: String(content||''), tags: Array.isArray(tags)? tags.map(String):[], createdAt: new Date() };
    const result = await mongoDb.collection('articles').insertOne(doc);
    return res.json({ success:true, id: result.insertedId, article: doc });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

app.get('/api/articles', async (req, res) => {
  try {
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const { tag, limit } = req.query;
    const q = tag ? { tags: String(tag) } : {};
    const lim = Math.min(Number(limit)||20, 100);
    const items = await mongoDb.collection('articles').find(q).sort({ createdAt:-1 }).limit(lim).toArray();
    return res.json({ success:true, items });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Connect to Asterisk AMI on server start (optional via ENABLE_AMI)
if (process.env.ENABLE_AMI === 'true') {
  asteriskService.connect().catch(err => {
    console.error(' Failed to connect to Asterisk AMI:', err);
  });
} else {
  console.log(' Skipping AMI connection (ENABLE_AMI not set to true)');
}

// API endpoint to initiate call via Asterisk AMI
app.post('/api/call', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    if (!asteriskService.isAlive()) {
      await asteriskService.connect();
    }

    const result = await asteriskService.originateCall(number);

    if (result.success) {
      // Emit call status to frontend clients
      io.emit('call-status-changed', {
        sessionId: result.sessionId,
        phoneNumber: number,
        status: 'initiated',
        timestamp: new Date()
      });
    }

    res.json(result);
  } catch (error) {
    console.error(' Error originating call:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

// Listen for call-originated event from asteriskService and broadcast
asteriskService.on('call-originated', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'ringing',
    timestamp: new Date()
  });
});

// Socket.IO connection handling for real-time call features
io.on('connection', (socket) => {
  console.log(` Client connected: ${socket.id}`);

  socket.on('join-call-room', (sessionId) => {
    socket.join(`call-${sessionId}`);
    console.log(` Client joined call room: call-${sessionId}`);
  });

  socket.on('call-status-update', (data) => {
    io.to(`call-${data.sessionId}`).emit('call-status-changed', data);
  });

  socket.on('disconnect', () => {
    console.log(` Client disconnected: ${socket.id}`);
  });
});

// Email configuration using SMTP (Gmail/Outlook/Custom SMTP)
let transporter;
let smtpReady = false;
let smtpError = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false otherwise
    auth: {
      user: process.env.SMTP_USER, // info@vayaccess.com
      pass: process.env.SMTP_PASS  // App-specific password
    }
  });

  // Verify email configuration
  transporter.verify((error) => {
    if (error) {
      smtpReady = false;
      smtpError = String(error?.message || error);
      console.error(' Email configuration error:', error);
    } else {
      smtpReady = true;
      smtpError = null;
      console.log(' Email server is ready to send messages');
    }
  });
} else {
  // Fallback to JSON transport: no actual SMTP connection; prevents runtime EAUTH errors
  transporter = nodemailer.createTransport({ jsonTransport: true });
  smtpReady = false;
  smtpError = 'SMTP_USER/SMTP_PASS missing (jsonTransport)';
  console.log(' Email disabled: missing SMTP_USER/SMTP_PASS (using jsonTransport)');
}

// SMTP status endpoint
app.get('/api/admin/smtp-status', (req, res) => {
  res.json({ ready: smtpReady, error: smtpError, user: process.env.SMTP_USER || null, host: process.env.SMTP_HOST || 'smtp.gmail.com' });
});

// Email helper (categorized sending with flags + tracking)
const createEmailHelper = require('./emailHelper');
const emailHelper = createEmailHelper(transporter, () => mongoDb);



// --- Site content digest and auto-news ---
const CONTENT_FILES = [
  path.resolve(__dirname, '../src/components/Products.tsx'),
  path.resolve(__dirname, '../src/components/Solutions.tsx'),
];

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function parseProductNames(content) {
  // Extract product names from Products.tsx: name: "..."
  const names = new Set();
  const nameRegex = /name:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = nameRegex.exec(content))) {
    const name = m[1].trim();
    if (name && !/quote$/i.test(name)) names.add(name);
  }
  return Array.from(names);
}

function parseSolutionTitles(content) {
  // Extract titles from Solutions.tsx: title: "..."
  const titles = new Set();
  const titleRegex = /title:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = titleRegex.exec(content))) {
    const title = m[1].trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

function getContentSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductNames(productsTsx).slice(0, 20);
  const solutions = parseSolutionTitles(solutionsTsx).slice(0, 30);
  const combined = `${products.join('\n')}\n---\n${solutions.join('\n')}`;
  const hash = sha256(combined);
  return { hash, products, solutions };
}

function buildDigestHtml(snapshot) {
  const { products, solutions } = snapshot;
  
  // Get detailed product and solution information
  const articlesSnapshot = getArticlesSnapshot();
  const detailedProducts = articlesSnapshot.products.slice(0, 3); // Show top 3 products
  const detailedSolutions = articlesSnapshot.solutions.slice(0, 3); // Show top 3 solutions
  
  // Build product cards with images
  const productCards = detailedProducts.map(product => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      ${product.image ? `<img src="${product.image}" alt="${product.title}" style="width:100%;max-width:300px;height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${product.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${product.description || ''}</p>
    </div>
  `).join('');
  
  // Build solution cards
  const solutionCards = detailedSolutions.map(solution => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${solution.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${solution.description || ''}</p>
    </div>
  `).join('');
  
  // Add parking services section
  const parkingServices = `
    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:20px 0;">
      <h3 style="margin:0 0 12px 0;color:#111827;font-size:18px;font-weight:600;"> Our Parking Services</h3>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
        <li><strong>Smart Parking Management:</strong> Complete ticketless and ticket-based parking solutions</li>
        <li><strong>ANPR Technology:</strong> Automatic number plate recognition for seamless access</li>
        <li><strong>Access Control Systems:</strong> Advanced barrier gates and turnstiles</li>
        <li><strong>Parking Guidance:</strong> Real-time space availability and navigation</li>
        <li><strong>Mobile Integration:</strong> User-friendly mobile apps for parking management</li>
        <li><strong>Analytics & Reporting:</strong> Comprehensive parking analytics and insights</li>
      </ul>
    </div>
  `;
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:20px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="margin:0 0 8px 0;color:#111827;font-size:24px;font-weight:700;"> VayAccess Latest Updates</h2>
        <p style="color:#6b7280;line-height:1.6;margin:0;">Discover our cutting-edge parking solutions and smart access control systems</p>
      </div>
      
      ${productCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Featured Products</h3>
          ${productCards}
        </div>
      ` : ''}
      
      ${solutionCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Smart Solutions</h3>
          ${solutionCards}
        </div>
      ` : ''}
      
      ${parkingServices}
      
      <div style="text-align:center;margin-top:24px;padding:20px;background:#2563eb;border-radius:12px;">
        <h3 style="margin:0 0 12px 0;color:#ffffff;font-size:18px;">Ready to Transform Your Parking?</h3>
        <p style="margin:0 0 16px 0;color:#dbeafe;">Contact us today for a free consultation and demo</p>
        <a href="https://vayaccess.com/contact" style="display:inline-block;background:#ffffff;color:#2563eb;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Get Started Now</a>
      </div>
      
      <div style="text-align:center;margin-top:20px;">
        <p style="margin:0;color:#6b7280;font-size:14px;">
          <a href="https://vayaccess.com/products" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Products</a> • 
          <a href="https://vayaccess.com/solutions" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Solutions</a> • 
          <a href="https://vayaccess.com/services" style="color:#2563eb;text-decoration:none;margin:0 8px;">Our Services</a>
        </p>
      </div>
    </div>
  `;
}

function buildDigestText(snapshot) {
  const { products, solutions } = snapshot;
  return [
    'VayAccess Latest Updates',
    '',
    'Products:',
    ...products.map(p => `- ${p}`),
    '',
    'Solutions:',
    ...solutions.map(s => `- ${s}`),
    '',
    'View all: https://vayaccess.com'
  ].join('\n');
}

// --- Enhanced digest templates with rich content ---
const DIGEST_TEMPLATES = [
  {
    key: 'products_spotlight',
    subject: () => ' VayAccess Product Spotlight - Smart Parking Solutions',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Featured Products</h1>
          <p style="margin:0;opacity:0.9;">Discover our latest smart parking technology</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'solutions_focus',
    subject: () => ' VayAccess Solutions Update - Transform Your Parking',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#059669,#047857);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Smart Solutions</h1>
          <p style="margin:0;opacity:0.9;">Complete parking management solutions for modern facilities</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'weekly_roundup',
    subject: () => ' VayAccess Weekly Roundup - Products, Solutions & Services',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Weekly Update</h1>
          <p style="margin:0;opacity:0.9;">Your complete guide to VayAccess innovations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'technology_insights',
    subject: () => ' VayAccess Tech Insights - ANPR, IoT & Smart Access',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Technology Focus</h1>
          <p style="margin:0;opacity:0.9;">Advanced parking technology and smart city solutions</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'customer_success',
    subject: () => ' VayAccess Success Stories - Real Results, Real Impact',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#ea580c,#c2410c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Success Stories</h1>
          <p style="margin:0;opacity:0.9;">See how our solutions transform parking operations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
];

function pickRotatingTemplate() {
  const hour = new Date().getHours();
  return DIGEST_TEMPLATES[hour % DIGEST_TEMPLATES.length];
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
// Use admin token for signing unsubscribe tokens (fallback to legacy secret if present)
const NEWSLETTER_SECRET = process.env.NEWSLETTER_ADMIN_TOKEN || process.env.NEWSLETTER_SECRET || 'change-me';

function signUnsubToken(email) {
  return crypto.createHmac('sha256', NEWSLETTER_SECRET).update(String(email).toLowerCase()).digest('hex');
}

function buildUnsubscribeHeaders(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  const t = signUnsubToken(email);
  const httpUrl = `${PUBLIC_BASE_URL}/api/newsletter/unsubscribe?e=${e}&t=${t}`;
  const mailto = `mailto:${process.env.SMTP_USER || 'no-reply@vayaccess.com'}?subject=unsubscribe`;
  const base = {
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'List-Id': 'VayAccess Newsletter <newsletter.vayaccess.com>',
  };
  if (process.env.ENABLE_MANAGE_LINK === 'true') {
    return {
      ...base,
      'List-Unsubscribe': `<${httpUrl}>, <${mailto}>`,
      'X-List-Manage': `${PUBLIC_BASE_URL}/newsletter/manage`,
    };
  }
  return {
    ...base,
    'List-Unsubscribe': `<${mailto}>`,
  };
}

function withFooter(html) {
  const manageUrl = `${PUBLIC_BASE_URL}/newsletter/manage`;
  const manageLine = process.env.ENABLE_MANAGE_LINK === 'true'
    ? `<br/>Manage: <a style="color:#2563eb;" href="${manageUrl}">subscription portal</a>`
    : '';
  return `${html}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
    <p style="font-size:12px;color:#6b7280;line-height:1.6;">
      This email was sent by VayAccess. Update your preferences or unsubscribe anytime.
      ${manageLine}
    </p>`;
}

async function sendDigestToEmail(to, snapshot) {
  try {
    const html = withFooter(buildDigestHtml(snapshot));
    const text = buildDigestText(snapshot);
    await emailHelper.sendCategorizedEmail({
      category: 'content_digest',
      to,
      subject: 'VayAccess: Products & Solutions Digest',
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `digest:${snapshot.hash}:${String(to).toLowerCase()}`,
      meta: { type: 'digest' },
    });
  } catch (e) {
    console.warn('Digest email failed:', e?.message || e);
  }
}

async function broadcastDigest(snapshot, opts = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const { products, solutions } = getArticlesSnapshot();
  const filter = { active: { $ne: false } };
  const subs = await mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } }).toArray();
  const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

  let stats = { products: { sent: 0, failed: 0 }, solutions: { sent: 0, failed: 0 } };

  // Products broadcast (categorized + tracked)
  if (products?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_products',
        to,
        subject: 'VayAccess: New Products (with images)',
        html: buildArticleDigestHtml(products),
        text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: products.length },
        dedupeKey: `broadcast-products:${to}`,
      });
      if (res?.success) stats.products.sent++; else if (!res?.skipped) stats.products.failed++;
    }
  }

  // Solutions broadcast (categorized + tracked)
  if (solutions?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_solutions',
        to,
        subject: 'VayAccess: Latest Solutions',
        html: buildArticleDigestHtml(solutions),
        text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: solutions.length },
        dedupeKey: `broadcast-solutions:${to}`,
      });
      if (res?.success) stats.solutions.sent++; else if (!res?.skipped) stats.solutions.failed++;
    }
  }

  // Optional push notification title/body
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token, 'VayAccess Updates', 'See the latest products and solutions', '/products'); } catch (_) {}
    }
  } catch (_) {}

  return { success: true, products: stats.products, solutions: stats.solutions, recipients: emails.length };
}

async function checkAndBroadcastContentUpdates() {
  try {
    if (!mongoDb) return;
    // Use full articles snapshot (title, description, image) for change detection
    const { hash } = getArticlesSnapshot();
    const stateCol = mongoDb.collection('site_content_state');
    const id = 'articles_digest_v1';
    const existing = await stateCol.findOne({ _id: id });
    if (!existing || existing.hash !== hash) {
      await stateCol.updateOne(
        { _id: id },
        { $set: { _id: id, hash, updatedAt: new Date() } },
        { upsert: true }
      );
      // Broadcast update with latest snapshot
      await broadcastDigest(getArticlesSnapshot());
      console.log('Auto-news: broadcasted new articles digest');
    }
  } catch (e) {
    console.warn('Auto-news check failed:', e?.message || e);
  }
}

// Articles generator for products & solutions (with images, no links)
// Uses PUBLIC_BASE_URL defined earlier

function toAssetUrl(relPath) {
  if (!relPath) return null;
  try {
    const file = path.basename(relPath);
    return `${PUBLIC_BASE_URL}/assets/${file}`;
  } catch (_) { return null; }
}

function parseImportsMap(content) {
  // import varName from "../assets/file.jpg";
  const map = {};
  const importRe = /import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g;
  let m;
  while ((m = importRe.exec(content))) {
    map[m[1]] = m[2];
  }
  return map;
}

function parseProductsDetailed(content) {
  const imports = parseImportsMap(content);
  // Extract the products array block
  const arrMatch = content.match(/const\s+products\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return [];
  const arrBody = arrMatch[1];
  const items = [];
  // Split by object boundaries (rough but works with our formatting)
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const name = (obj.match(/name:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    // capture description until the next field or end of object (robust to line breaks and trailing commas)
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    const imageVar = (obj.match(/image:\s*(\w+)/) || [])[1];
    if (name) {
      const rel = imports[imageVar];
      items.push({
        type: 'product',
        title: name,
        description: (desc || '').trim(),
        image: toAssetUrl(rel),
      });
    }
  }
  return items;
}

function parseSolutionsDetailed(content) {
  // Solutions currently don't have image assets; add a generic illustrative image
  const placeholder = `${PUBLIC_BASE_URL}/assets/parking-system-architecture.jpg`;
  const items = [];
  const arrMatch = content.match(/const\s+solutions\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return items;
  const arrBody = arrMatch[1];
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const title = (obj.match(/title:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    if (title) items.push({ type: 'solution', title, description: (desc || '').trim(), image: placeholder });
  }
  return items;
}

function getArticlesSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductsDetailed(productsTsx).slice(0, 20);
  const solutions = parseSolutionsDetailed(solutionsTsx).slice(0, 30);
  const articles = [...products, ...solutions];
  const hash = sha256(JSON.stringify(articles).slice(0, 2000));
  return { hash, articles, products, solutions };
}

function buildArticleDigestHtml(articles) {
  // generic combined template
  const card = (a) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`;
  const list = articles.map(card).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Products & Solutions</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 12px 0;">Latest offerings for our subscribers. This email contains full content without external links.</p>
      ${list}
    </div>`;
}

function buildProductsDigestHtml(products) {
  const list = products.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Product Highlights</h2>
      ${list || '<p>No products today.</p>'}
    </div>`;
}

function buildSolutionsDigestHtml(solutions) {
  const list = solutions.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Solutions Spotlight</h2>
      ${list || '<p>No solutions today.</p>'}
    </div>`;
}

// Build individual product email HTML
function buildProductEmailHtml(product) {
  // Use absolute image URL if provided, otherwise prefix with PUBLIC_BASE_URL
  const isAbsolute = /^https?:\/\//i.test(product.image || '');
  const imageUrl = product.image
    ? (isAbsolute ? product.image : `${PUBLIC_BASE_URL}${product.image.startsWith('/') ? '' : '/'}${product.image}`)
    : `${PUBLIC_BASE_URL}/assets/default-product.jpg`;
  
  // Enhanced product descriptions based on title
  const getEnhancedDescription = (title, originalDesc) => {
    const descriptions = {
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Transform your parking operations with our cutting-edge ticketless parking management system. This revolutionary solution eliminates the need for physical tickets, creating a seamless experience for both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our system leverages advanced ANPR (Automatic Number Plate Recognition) technology combined with mobile app integration to provide a completely digital parking experience. Users can find, reserve, and pay for parking spaces directly through their smartphones.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'The system optimizes space usage while providing real-time analytics and reporting capabilities for facility managers.'}
        </p>
      `,
      'Ticket Based Parking Management': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our traditional ticket-based parking management system provides reliable and proven parking control for high-traffic facilities. Perfect for malls, airports, and commercial complexes requiring robust entry and exit management.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing at entry points, validation systems, and secure payment processing. Built with durability and reliability in mind, it handles thousands of transactions daily.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Streamlined ticket management with comprehensive reporting and analytics for optimal facility management.'}
        </p>
      `,
      'VAY Parking Guidance Display': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Enhance your parking facility with our intelligent parking guidance display system. These advanced LED displays provide real-time parking availability information, helping drivers quickly locate available spaces.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system integrates with our sensor network to display accurate space availability, reducing search time and improving traffic flow within your facility. Clear, bright LED indicators guide users efficiently to available parking spots.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Improved user experience with enhanced safety and security features for modern parking facilities.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Advanced parking solution designed to streamline operations and enhance user experience with cutting-edge technology and innovative features.'}
      </p>
    `;
  };
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Product Spotlight</h1>
        <p style="margin:8px 0 0 0;color:#dbeafe;font-size:16px;">Discover VayAccess Innovation</p>
      </div>
      
      <!-- Product Content -->
      <div style="padding:30px 20px;">
        <!-- Product Image -->
        <div style="text-align:center;margin-bottom:24px;">
          <img src="${imageUrl}" alt="${product.title}" 
               style="width:100%;max-width:500px;height:300px;object-fit:cover;border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,0.15);" />
        </div>
        
        <!-- Product Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${product.title}
        </h2>
        
        <!-- Product Description -->
        <div style="background:#f8fafc;border-radius:12px;padding:24px;margin:20px 0;">
          ${getEnhancedDescription(product.title, product.description)}
        </div>
        
        <!-- Key Features -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> Key Features</h3>
          <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
            <li>Advanced technology integration</li>
            <li>User-friendly interface</li>
            <li>Real-time monitoring and analytics</li>
            <li>Scalable and customizable solution</li>
            <li>24/7 technical support</li>
          </ul>
        </div>
        
        <!-- Benefits Section -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Benefits</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Increased operational efficiency</li>
            <li>Enhanced customer satisfaction</li>
            <li>Reduced operational costs</li>
            <li>Improved security and access control</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Ready to Learn More?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Get detailed specifications and pricing information</p>
          <a href="https://vayaccess.com/products" 
             style="display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
            View Product Details
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Questions? We're here to help!</p>
          <p style="margin:0;color:#2563eb;font-size:14px;">
             <a href="mailto:info@vayaccess.com" style="color:#2563eb;text-decoration:none;">info@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#2563eb;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Build individual solution email HTML
function buildSolutionEmailHtml(solution) {
  // Enhanced solution descriptions based on title
  const getEnhancedSolutionDescription = (title, originalDesc) => {
    const descriptions = {
      'Hybrid ANPR/FASTAG System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Experience the future of vehicle access control with our revolutionary Hybrid ANPR/FASTAG System. This cutting-edge solution combines the power of Automatic Number Plate Recognition (ANPR) technology with FASTAG integration for seamless, contactless vehicle access.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our hybrid approach ensures maximum compatibility and reliability. When FASTAG is available, the system processes payments instantly. When FASTAG is not detected, our advanced ANPR technology takes over, capturing and processing license plates with 99.9% accuracy.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'This dual-technology approach eliminates barriers to entry while maintaining the highest security standards for modern parking facilities.'}
        </p>
      `,
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Step into the future of parking management with our comprehensive ticketless solution. This intelligent system eliminates the need for physical tickets, creating a completely digital parking ecosystem that benefits both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Users can locate, reserve, and pay for parking spaces through our intuitive mobile application. The system provides real-time availability updates, navigation assistance, and secure payment processing, all while collecting valuable analytics for facility optimization.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Transform your parking operations with reduced operational costs, improved user satisfaction, and comprehensive facility management tools.'}
        </p>
      `,
      'Ticket Based Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our robust ticket-based parking management system provides proven reliability for high-volume parking facilities. Designed for environments where traditional ticketing is preferred or required, this solution offers comprehensive control and monitoring capabilities.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing, validation, and payment processing with multiple payment options. Built-in fraud prevention and comprehensive reporting ensure secure operations and detailed facility insights.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Perfect for malls, airports, and commercial complexes requiring reliable, high-capacity parking management with detailed transaction tracking.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Innovative smart parking solution that leverages cutting-edge technology to optimize parking operations and enhance user experience with advanced features and seamless integration.'}
      </p>
    `;
  };

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Smart Solution</h1>
        <p style="margin:8px 0 0 0;color:#e9d5ff;font-size:16px;">Intelligent Parking Innovation</p>
      </div>
      
      <!-- Solution Content -->
      <div style="padding:30px 20px;">
        <!-- Solution Icon/Visual -->
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);width:100px;height:100px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;box-shadow:0 8px 25px rgba(124,58,237,0.3);">
            <span style="font-size:42px;"></span>
          </div>
        </div>
        
        <!-- Solution Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${solution.title}
        </h2>
        
        <!-- Solution Description -->
        <div style="background:#faf5ff;border-radius:12px;padding:24px;margin:20px 0;border-left:4px solid #7c3aed;">
          ${getEnhancedSolutionDescription(solution.title, solution.description)}
        </div>
        
        <!-- How It Works -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> How It Works</h3>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">1</span>
              <span style="color:#374151;">Smart sensors detect vehicle presence</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">2</span>
              <span style="color:#374151;">Real-time data processing and analysis</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">3</span>
              <span style="color:#374151;">Automated guidance and management</span>
            </div>
          </div>
        </div>
        
        <!-- Key Advantages -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Key Advantages</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Reduces parking search time by up to 70%</li>
            <li>Increases parking revenue by 25-40%</li>
            <li>Minimizes traffic congestion</li>
            <li>Enhances overall user satisfaction</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Interested in This Solution?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Schedule a demo and see it in action</p>
          <a href="https://vayaccess.com/solutions" 
             style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(124,58,237,0.3);">
            Learn More
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Ready to implement this solution?</p>
          <p style="margin:0;color:#7c3aed;font-size:14px;">
             <a href="mailto:solutions@vayaccess.com" style="color:#7c3aed;text-decoration:none;">solutions@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#7c3aed;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Send individual product email
async function sendProductEmail(to, product, emailIndex = 0) {
  try {
    const html = withFooter(buildProductEmailHtml(product));
    const text = `VayAccess Product Spotlight: ${product.title}\n\n${product.description || ''}\n\nLearn more: https://vayaccess.com/products`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'product_spotlight',
      to,
      subject: ` New Product: ${product.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `product:${product.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'product', productTitle: product.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Product email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Send individual solution email
async function sendSolutionEmail(to, solution, emailIndex = 0) {
  try {
    const html = withFooter(buildSolutionEmailHtml(solution));
    const text = `VayAccess Smart Solution: ${solution.title}\n\n${solution.description || ''}\n\nLearn more: https://vayaccess.com/solutions`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'solution_spotlight',
      to,
      subject: ` Smart Solution: ${solution.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `solution:${solution.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'solution', solutionTitle: solution.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Solution email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Distribute individual emails based on user frequency (personalized per subscriber for hourly)
// options: { forceNow?: boolean; onlyEmail?: string }
async function distributeIndividualEmails(options = {}) {
  try {
    if (!mongoDb) return { success: false, message: 'DB not ready' };

    const { forceNow = false, onlyEmail } = options;
    const snapshot = getArticlesSnapshot();
    const { products, solutions } = snapshot;

    // Get all active subscribers (optionally filter by one email for testing)
    const q = { active: true };
    if (onlyEmail) q.email = String(onlyEmail).toLowerCase();
    const subscribers = await mongoDb.collection('subscribers')
      .find(q)
      .toArray();

    if (subscribers.length === 0) {
      return { success: true, message: 'No active subscribers' };
    }

    const stats = {
      hourly: { products: 0, solutions: 0, sent: 0, failed: 0 },
      daily: { products: 0, solutions: 0, sent: 0, failed: 0 },
      weekly: { products: 0, solutions: 0, sent: 0, failed: 0 }
    };

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // A simple hash to integer for personalization
    function hashToInt(str) {
      const hex = crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
      return parseInt(hex.slice(0, 8), 16); // 32-bit range
    }

    // Group subscribers by frequency
    const subscribersByFreq = {
      hourly: subscribers.filter(s => s.frequency === 'hourly'),
      daily: subscribers.filter(s => s.frequency === 'daily'),
      weekly: subscribers.filter(s => s.frequency === 'weekly')
    };

    // Send emails based on frequency
    for (const [frequency, subs] of Object.entries(subscribersByFreq)) {
      if (subs.length === 0) continue;

      if (frequency === 'hourly') {
        // Personalized selection per-subscriber per-hour
        const hourKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        for (const subscriber of subs) {
          try {
            // Build a stable per-hour hash using email + hour key
            const h = hashToInt(`${String(subscriber.email).toLowerCase()}:${hourKey}`);

            // Decide category first, considering availability
            let pickType = 'product';
            if (products.length === 0 && solutions.length === 0) continue;
            if (products.length === 0) pickType = 'solution';
            else if (solutions.length === 0) pickType = 'product';
            else pickType = (h % 2 === 0) ? 'product' : 'solution';

            if (pickType === 'product') {
              const idx = products.length ? (h % products.length) : 0;
              const item = products[idx];
              const res = await sendProductEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.products++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            } else {
              // Use a different mix for solutions for better spread
              const idx = solutions.length ? ((h >> 3) % solutions.length) : 0;
              const item = solutions[idx];
              const res = await sendSolutionEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.solutions++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send personalized hourly email to ${subscriber.email}:`, e?.message);
            stats.hourly.failed++;
          }
        }
        continue; // Move to next frequency
      }

      // Daily and Weekly keep existing shared content logic
      let shouldSend = false;
      let contentToSend = [];

      if (frequency === 'daily') {
        shouldSend = forceNow || currentHour === 9; // Send at 9 AM daily (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const seed = forceNow ? now.getTime() : now.getDate();
            const dayIndex = seed % total;
            if (dayIndex < products.length) contentToSend.push({ type: 'product', item: products[dayIndex] });
            else contentToSend.push({ type: 'solution', item: solutions[dayIndex - products.length] });
          }
        }
      } else if (frequency === 'weekly') {
        shouldSend = forceNow || (currentDay === 1 && currentHour === 10); // Monday 10 AM (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const weekNumber = forceNow ? Math.floor(now.getTime() / (24 * 60 * 60 * 1000)) : Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
            const startIndex = (weekNumber * 2) % total;
            for (let i = 0; i < 2 && i < total; i++) {
              const index = (startIndex + i) % total;
              if (index < products.length) contentToSend.push({ type: 'product', item: products[index] });
              else contentToSend.push({ type: 'solution', item: solutions[index - products.length] });
            }
          }
        }
      }

      if (!shouldSend || contentToSend.length === 0) continue;

      for (const subscriber of subs) {
        for (let i = 0; i < contentToSend.length; i++) {
          const content = contentToSend[i];
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 2000)); // small pacing
          try {
            let result;
            if (content.type === 'product') {
              result = await sendProductEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].products++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            } else {
              result = await sendSolutionEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].solutions++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send ${content.type} email to ${subscriber.email}:`, e?.message);
            stats[frequency].failed++;
          }
        }
      }
    }

    const totalSent = Object.values(stats).reduce((sum, s) => sum + s.sent, 0);
    const totalFailed = Object.values(stats).reduce((sum, s) => sum + s.failed, 0);

    console.log(`Individual emails distributed: ${totalSent} sent, ${totalFailed} failed`, stats);

    return {
      success: true,
      stats,
      totalSent,
      totalFailed,
      message: `Distributed ${totalSent} individual emails`
    };

  } catch (e) {
    console.warn('Individual email distribution failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

function buildMarketingDigestHtml() {
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      <h3 style="margin:0 0 8px 0;color:#111827;">Special Offers & Updates</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
      <p style="margin-top:10px;"><a href="https://vayaccess.com/contact" style="color:#2563eb;text-decoration:none;">Contact sales</a></p>
    </div>`;
}

// Content APIs
app.get('/api/content/articles', (req, res) => {
  try {
    const snap = getArticlesSnapshot();
    res.json({ success: true, count: snap.articles.length, articles: snap.articles });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to build articles' });
  }
});

// Admin-protected triggers for content digest
function isAdmin(req) {
  const header = req.headers['x-admin-secret'] || req.headers['x-admin-token'];
  const query = req.query?.secret || req.query?.token;
  const provided = header || query;
  const expected = process.env.ADMIN_SECRET;
  return expected && provided && String(provided) === String(expected);
}

app.post('/api/admin/content/auto-check', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    await checkAndBroadcastContentUpdates();
    res.json({ success: true, message: 'Auto-check executed' });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to run auto-check' });
  }
});

app.post('/api/admin/content/broadcast', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const snap = getArticlesSnapshot();
    const result = await broadcastDigest(snap, { force: true });
    res.json({ success: true, message: 'Broadcast triggered', result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to broadcast' });
  }
});

// Manual newsletter trigger for testing
app.post('/api/admin/newsletter/send-test', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const { frequency = 'hourly', testEmail } = req.body;

    // Use individual distribution with forceNow and optional single email targeting
    const result = await distributeIndividualEmails({ forceNow: true, onlyEmail: testEmail || undefined });
    res.json({ success: true, message: `${frequency} digest dispatched${testEmail ? ' to ' + testEmail : ''}`, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send newsletter' });
  }
});

// Get newsletter statistics
app.get('/api/admin/newsletter/stats', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!mongoDb) return res.status(503).json({ success: false, message: 'DB not ready' });
    
    const totalSubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const hourlySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'hourly' });
    const dailySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'daily' });
    const weeklySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'weekly' });
    
    const recentEmails = await mongoDb.collection('email_events')
      .find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    
    res.json({
      success: true,
      stats: {
        totalSubscribers: totalSubs,
        byFrequency: {
          hourly: hourlySubs,
          daily: dailySubs,
          weekly: weeklySubs
        },
        recentEmails: recentEmails.length,
        lastEmails: recentEmails.map(e => ({
          to: e.to,
          subject: e.subject,
          category: e.category,
          result: e.result,
          createdAt: e.createdAt
        }))
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to get stats' });
  }
});

// Newsletter subscribe endpoint (legacy v1) - renamed to avoid shadowing improved version below
app.post('/api/newsletter/subscribe-v1', async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!email || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    if (!mongoDb) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const col = mongoDb.collection('subscribers');
    await col.updateOne(
      { email: email.toLowerCase() },
      { $set: { email: email.toLowerCase(), source: source || 'footer', active: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    // Category-wise triggers: send separate emails for products and solutions
    try {
      const { products, solutions } = getArticlesSnapshot();

      // Products trigger
      if (products?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_products',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Top Products for You',
          html: buildArticleDigestHtml(products),
          text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: products.length },
          dedupeKey: `welcome-products:${String(email).trim().toLowerCase()}`,
        });
      }

      // Solutions trigger
      if (solutions?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_solutions',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Latest Parking Solutions',
          html: buildArticleDigestHtml(solutions),
          text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: solutions.length },
          dedupeKey: `welcome-solutions:${String(email).trim().toLowerCase()}`,
        });
      }
    } catch (digestErr) {
      console.warn('Welcome category digests failed (continuing):', digestErr?.message || digestErr);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    console.error(' Subscribe error:', e);
    res.status(500).json({ success: false, message: 'Failed to subscribe' });
  }
});

// Scheduler (configurable, default every 3 minutes)
if (process.env.ENABLE_CONTENT_AUTONEWS !== 'false') {
  const minutes = Number(process.env.CONTENT_AUTONEWS_INTERVAL_MIN || process.env.CONTENT_AUTONEWS_INTERVAL || 3);
  const intervalMs = Math.max(60_000, Math.floor(minutes) * 60 * 1000); // >= 1 minute
  setInterval(checkAndBroadcastContentUpdates, intervalMs);
  // Initial delayed check to allow Mongo to connect
  setTimeout(checkAndBroadcastContentUpdates, 30 * 1000);
}

// --- Daily Digest (Email + Web Push) ---
let ENABLE_DAILY_DIGEST = process.env.ENABLE_DAILY_DIGEST !== 'false';
if (!ENABLE_DAILY_DIGEST) {
  console.warn('Daily digest disabled by env, overriding to enabled.');
  ENABLE_DAILY_DIGEST = true;
}
const DAILY_DIGEST_HOUR_IST = Number(process.env.DAILY_DIGEST_HOUR_IST || 9); // 9 AM IST by default
const DAILY_DIGEST_CHECK_MIN = Number(process.env.DAILY_DIGEST_CHECK_MIN || 5); // check every 5 minutes

function nowIST() {
  // Create a Date object representing current time in Asia/Kolkata
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function formatISTDate(d = nowIST()) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function ymd(d = nowIST()) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getDailySubject(d = nowIST()) {
  const dateStr = formatISTDate(d);
  const options = [
    ` Live Parking Updates + Smart Access News — ${dateStr}`,
    'VayAccess Daily: Smarter Parking, Safer Access',
    ' New Features + Live Analytics for Parking Control',
    `[Today’s Update] VayAccess Parking Solutions — ${dateStr}`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

async function buildDailySections() {
  // Compute lightweight stats from existing Mongo collections (fallback to placeholders)
  try {
    if (!mongoDb) return null;
    const subsCount = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const todayStartIST = nowIST();
    todayStartIST.setHours(0, 0, 0, 0);
    const todayEndIST = new Date(todayStartIST);
    todayEndIST.setHours(23, 59, 59, 999);

    // Convert IST bounds to UTC by reconstructing from string to avoid timezone drift
    const startUTC = new Date(new Date(todayStartIST).toISOString());
    const endUTC = new Date(new Date(todayEndIST).toISOString());

    const todaysAnnouncements = await mongoDb.collection('announcements').countDocuments({
      createdAt: { $gte: startUTC, $lte: endUTC }
    });

    const { articles } = getArticlesSnapshot();
    const top3 = articles.slice(0, 3).map(a => a.title);

    return {
      subsCount,
      todaysAnnouncements,
      top3,
    };
  } catch (_) {
    return null;
  }
}

function buildDailyDigestHtml(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  const logoUrl = `${PUBLIC_BASE_URL}/assets/vay-logo.jpg`;
  const highlight = (
    sections?.top3?.length ? sections.top3.map(t => `“${t}”`).join(' • ') :
    'New Hikvision camera integration live on 2 sites. RFID reduced wait time by 38%.'
  );
  return `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f9fafb;padding:18px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <img src="${logoUrl}" alt="VayAccess" style="height:36px;width:auto;" />
      <div style="font-weight:700;color:#111827;">Smart Parking. Secure Access. Seamless Control.</div>
    </div>
    <h2 style="margin:4px 0 10px 0;">${getDailySubject(d)}</h2>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <h3 style="margin:0 0 8px 0;"> Daily System Highlights</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">
        ${highlight || 'Today’s report: Live updates across VayAccess deployments.'}
      </p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Analytics Snapshot</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>Subscribers: ${sections?.subsCount ?? '—'}</li>
        <li>Announcements today: ${sections?.todaysAnnouncements ?? '—'}</li>
        <li>Peak entry time: 9:12 AM (sample)</li>
        <li>Average parking duration: 3h 20m (sample)</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Product Tips / Knowledge</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Did you know? VayAccess web dashboard supports live push notifications for security alerts and automated reports in one click.</p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Marketing / Offers</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: Get 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Real-Time Alerts</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Enable web push to get instant alerts for gate failures, unauthorized entries, and congestion updates.</p>
    </div>

    <p style="color:#6b7280;font-size:12px;text-align:center;margin-top:14px;">Sent on ${dateStr} • VayAccess</p>
  </div>`;
}

function buildDailyDigestText(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  return [
    getDailySubject(d),
    '',
    ' Daily System Highlights:',
    (sections?.top3 || []).map(t => `- ${t}`).join('\n') || '- New Hikvision camera integration live on 2 sites',
    '',
    ' Analytics Snapshot:',
    `- Subscribers: ${sections?.subsCount ?? '—'}`,
    `- Announcements today: ${sections?.todaysAnnouncements ?? '—'}`,
    '- Peak entry time: 9:12 AM (sample)',
    '- Average parking duration: 3h 20m (sample)',
    '',
    ' Product Tips / Knowledge:',
    '- Dashboard supports live push alerts and automated reports',
    '',
    ' Marketing / Offers:',
    '- 20% off on new camera integrations',
    '- Enterprise unlocks advanced AI analytics',
    '',
    `Sent on ${dateStr}`
  ].join('\n');
}

async function sendDailyDigest({ force = false } = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const todayKey = ymd();
  const sentCol = mongoDb.collection('daily_digest_sent');
  const exists = await sentCol.findOne({ _id: todayKey });
  if (exists && !force) return { success: true, message: 'Already sent today' };

  const sections = await buildDailySections();

  // Collect subscribers with prefs
  const subs = await mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1, prefs: 1 } }).toArray();
  const validSubs = subs.filter(s => /.+@.+\..+/.test(s.email));

  // Email broadcast per-subscriber with category templates
  let sent = 0, failed = 0;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    for (const s of validSubs) {
      const to = String(s.email).toLowerCase();
      const prefs = s.prefs || { products: true, solutions: true };
      const { products, solutions } = getArticlesSnapshot();

      // Build personalized content with category templates
      const chunks = [];
      if (prefs.products) chunks.push(buildProductsDigestHtml(products.slice(0, 8)));
      if (prefs.solutions) chunks.push(buildSolutionsDigestHtml(solutions.slice(0, 8)));
      if (prefs.marketing) chunks.push(buildMarketingDigestHtml());
      const html = chunks.join('\n');
      const subject = getDailySubject();
      const text = [
        subject,
        '',
        prefs.products ? (products.slice(0, 5).map(a => `- [Product] ${a.title}`).join('\n')) : '',
        prefs.solutions ? (solutions.slice(0, 5).map(a => `- [Solution] ${a.title}`).join('\n')) : '',
        prefs.marketing ? ('- [Marketing] Special offers available') : '',
      ].filter(Boolean).join('\n');

      try {
        await emailHelper.sendCategorizedEmail({
          category: 'daily_personalized',
          to,
          subject,
          html: withFooter(html),
          text,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `daily:${todayKey}:${to}`,
          meta: { daily: true, prefs },
        });
        sent++;
      } catch (_) { failed++; }
    }
  }

  // Push notifications
  let pushOk = 0, pushFail = 0;
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token || t, 'VayAccess Daily', 'Open for today\'s updates', '/'); pushOk++; } catch (_) { pushFail++; }
    }
  } catch (_) {}

  await sentCol.updateOne({ _id: todayKey }, { $set: { _id: todayKey, sentAt: new Date(), emails: sent, failed } }, { upsert: true });
  // Return counts based on computed values to avoid referencing undefined variables
  return { success: true, emails: { sent, failed }, push: { sent: pushOk, failed: pushFail } };
}

// Admin: manual daily digest
app.post('/api/admin/daily-digest/send', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const force = String(req.query.force || '').toLowerCase() === 'true';
    const result = await sendDailyDigest({ force });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send daily digest' });
  }
});

// Admin: preview daily digest HTML
app.get('/api/admin/daily-digest/preview', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).send('Forbidden');
    const sections = await buildDailySections();
    res.setHeader('Content-Type', 'text/html');
    res.send(buildDailyDigestHtml(sections));
  } catch (e) {
    res.status(500).send('Failed to build preview');
  }
});

// Daily scheduler (IST hour)
if (ENABLE_DAILY_DIGEST) {
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const n = nowIST();
      if (n.getHours() >= DAILY_DIGEST_HOUR_IST) {
        await sendDailyDigest();
      }
    } catch (e) {
      console.warn('Daily digest scheduler error:', e?.message || e);
    }
  }, Math.max(60_000, DAILY_DIGEST_CHECK_MIN * 60 * 1000));
}

// Frequency-based individual scheduler (hourly/daily/weekly)
const ENABLE_INDIVIDUAL_SCHED = process.env.ENABLE_INDIVIDUAL_SCHED !== 'false';
if (ENABLE_INDIVIDUAL_SCHED) {
  // Hourly: run once per hour (dedupe inside per email/hour)
  let lastHourlyKey = null;
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
      if (hourKey !== lastHourlyKey) {
        lastHourlyKey = hourKey;
        await distributeIndividualEmails();
      }
    } catch (e) {
      console.warn('Hourly individual scheduler error:', e?.message || e);
    }
  }, 5 * 60 * 1000); // check every 5 minutes

  // Daily/Weekly (IST-aligned): fire near boundaries with forceNow to bypass local-time check
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const n = nowIST();
      const m = n.getMinutes();
      // Within first 5 minutes of any hour
      if (m < 5) {
        // Daily at 9:00 IST
        if (n.getHours() === 9) {
          await distributeIndividualEmails({ forceNow: true });
        }
        // Weekly at Monday 10:00 IST
        if (n.getDay() === 1 && n.getHours() === 10) {
          await distributeIndividualEmails({ forceNow: true });
        }
      }
    } catch (e) {
      console.warn('Daily/Weekly individual scheduler error:', e?.message || e);
    }
  }, 5 * 60 * 1000);
}

// Start HTTP server (required for Vite proxy to work)
server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
});

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }
    
    console.log(' Processing contact form submission:', { name, email, message });
    
    // 1. Send notification to info@vayaccess.com
    const adminNotificationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: 'info@vayaccess.com',
      replyTo: email, // Allows replying directly to the customer
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <!-- Header-style summary block to mirror desired format -->
          <div style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 6px 0; font-weight: 700; color: #111827;">Thank you for contacting VayAccess - Response within 2 hours</p>
            <p style="margin: 0 0 6px 0; color: #374151;">VayAccess Support Team &lt;info@vayaccess.com&gt;</p>
            <p style="margin: 0 0 6px 0; color: #6b7280;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            <p style="margin: 0; color: #6b7280;">to ${name}</p>
          </div>

          <div style="background: white; padding: 24px;">
            <h1 style="margin: 0 0 10px 0; font-size: 22px; color: #059669;">Message Received Successfully</h1>
            <p style="margin: 6px 0 20px 0; color: #6b7280;">Thank you for contacting VayAccess</p>

            <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Dear <strong>${name}</strong>,</p>
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>

            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
              <h3 style="color: #2563eb; margin: 0 0 10px 0; font-size: 16px;">Your Message Summary</h3>
              <div style="background: white; padding: 12px; border-radius: 6px; color: #6b7280; font-style: italic;">
                "${message}"
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #059669; margin: 0 0 10px 0; font-size: 18px;">What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>

            <div style="background: #fff7ed; border: 1px solid #fb923c; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #c2410c; margin: 0 0 10px 0; font-size: 16px;">Need Immediate Assistance?</h3>
              <p style="margin: 0; color: #92400e;"><a href="tel:+917207244344" style="color: #2563eb; text-decoration: none;">+91 720 724 4344</a> • <a href="https://wa.me/917207244344" style="color: #10b981; text-decoration: none;">WhatsApp</a> • <a href="mailto:info@vayaccess.com" style="color: #6b7280; text-decoration: none;">Email</a></p>
            </div>

            <div style="margin: 20px 0; text-align: center;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Visit Our Website</a>
            </div>

            <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; color: #6b7280; font-size: 14px;">
              <p style="margin: 0 0 6px 0;"><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 12px 0 0 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 12px;">
                This is an automated confirmation. Please save this email for your records.
              </p>

              <p style="text-align:center; color:#6b7280; font-size: 13px; margin-top: 16px;">
                <strong>Customer Details:</strong> ${name} • <a href="mailto:${email}" style="color:#2563eb; text-decoration:none;">${email}</a>
              </p>
            </div>
          </div>
        </div>
      `,
      text: `Thank you for contacting VayAccess - Response within 2 hours
VayAccess Support Team <info@vayaccess.com>
${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
to ${name}

Message Received Successfully
Thank you for contacting VayAccess

Dear ${name},
Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.

Your Message Summary
"${message}"

What Happens Next?
Quick Response: Our technical specialists will respond within 2 hours during business hours
Detailed Analysis: We'll review your requirements and provide customized recommendations
Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

Need Immediate Assistance?
+91 720 724 4344  WhatsApp  Email

Visit Our Website
Business Hours: Monday - Friday: 9:00 AM - 6:00 PM IST

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Customer Details: ${name} • ${email}

This is an automated confirmation. Please save this email for your records.`
    };
    
    // 2. Send auto-confirmation to customer
    const customerConfirmationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;"> Message Received Successfully</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for contacting VayAccess</p>
          </div>
          
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">Dear <strong>${name}</strong>,</p>
            
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>
            
            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 15px 0; font-size: 16px;"> Your Message Summary</h3>
              <div style="background: white; padding: 15px; border-radius: 6px;">
                <p style="margin: 0; color: #6b7280; font-style: italic;">"${message.length > 200 ? message.substring(0, 200) + '...' : message}"</p>
              </div>
            </div>
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 25px; margin: 25px 0;">
              <h3 style="color: #059669; margin: 0 0 15px 0; font-size: 18px;"> What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="color: #d97706; margin: 0 0 10px 0; font-size: 16px;"> Need Immediate Assistance?</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <a href="tel:+917207244344" style="background: #2563eb; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> +91 720 724 4344</a>
                <a href="https://wa.me/917207244344" style="background: #10b981; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> WhatsApp</a>
                <a href="mailto:info@vayaccess.com" style="background: #6b7280; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> Email</a>
              </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                 Visit Our Website
              </a>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
              <p><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 15px 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
                This is an automated confirmation. Please save this email for your records.
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
Dear ${name},

Thank you for contacting VayAccess regarding your parking solution requirements.

YOUR MESSAGE:
"${message}"

WHAT HAPPENS NEXT:
• Quick Response: Our technical specialists will respond within 2 hours during business hours
• Detailed Analysis: We'll review your requirements and provide customized recommendations  
• Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

NEED IMMEDIATE ASSISTANCE?
Phone: +91 70137 99462
WhatsApp: +91 70137 99462
Email: info@vayaccess.com

BUSINESS HOURS:
Monday - Friday: 9:00 AM - 6:00 PM IST

Best regards,
VayAccess Support Team

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Website: https://vayaccess.com
      `
    };
    
    // Send both emails
    console.log(' Sending admin notification...');
    await transporter.sendMail(adminNotificationEmail);
    console.log(' Admin notification sent successfully');
    
    console.log(' Sending customer confirmation...');
    await transporter.sendMail(customerConfirmationEmail);
    console.log(' Customer confirmation sent successfully');
    
    res.json({
      success: true,
      message: 'Thank you for your inquiry! We have received your message and sent a confirmation to your email. Our team will respond within 2 hours during business hours.'
    });
    
  } catch (error) {
    console.error(' Contact form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    });
  }
});

// =============================================================================
// AI CALL AGENT API ENDPOINTS
// =============================================================================

// Initialize AI call session
app.post('/api/ai-call/initialize', async (req, res) => {
  try {
    const { customerPhone, customerName } = req.body;
    
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Customer phone number is required'
      });
    }
    
    console.log(` Initializing AI call for ${customerPhone}`);
    const result = await voiceAIService.initializeCall(customerPhone, customerName);
    
    if (result.success) {
      // Notify admin dashboard of new call
      io.emit('new-call-initialized', {
        sessionId: result.sessionId,
        customerPhone,
        customerName,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error initializing AI call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize AI call session'
    });
  }
});

// Process voice input and get AI response
app.post('/api/ai-call/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Message and session ID are required'
      });
    }
    
    console.log(` Processing chat for session ${sessionId}: "${message}"`);
    const result = await voiceAIService.generateAIResponse(message, sessionId);
    
    // Broadcast conversation update to admin dashboard
    io.emit('call-conversation-update', {
      sessionId,
      customerMessage: message,
      aiResponse: result.response,
      timestamp: new Date()
    });
    
    res.json(result);
  } catch (error) {
    console.error(' Error processing AI chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process conversation'
    });
  }
});

// Convert speech to text
app.post('/api/ai-call/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!req.file || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Audio file and session ID are required'
      });
    }
    
    console.log(` Processing speech-to-text for session ${sessionId}`);
    const audioBuffer = require('fs').readFileSync(req.file.path);
    const result = await voiceAIService.speechToText(audioBuffer, sessionId);
    
    // Clean up uploaded file
    require('fs').unlinkSync(req.file.path);
    
    res.json(result);
  } catch (error) {
    console.error(' Error in speech-to-text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process speech'
    });
  }
});

// Convert text to speech
app.post('/api/ai-call/text-to-speech', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Text and session ID are required'
      });
    }
    
    console.log(` Converting text to speech for session ${sessionId}`);
    const result = await voiceAIService.textToSpeech(text, sessionId);
    
    if (result.success) {
      // Send audio file path for client to download
      res.json({
        ...result,
        audioUrl: `/api/ai-call/audio/${result.audioFile}`
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error(' Error in text-to-speech:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate speech'
    });
  }
});

// Serve generated audio files
app.get('/api/ai-call/audio/:filename', (req, res) => {
  try {
    const audioPath = require('path').join(__dirname, 'recordings/tts/', req.params.filename);
    res.sendFile(audioPath);
  } catch (error) {
    console.error(' Error serving audio file:', error);
    res.status(404).json({ success: false, message: 'Audio file not found' });
  }
});

// =============================================================================
// TWILIO VOICE CALL WEBHOOKS (For Real Phone Calls)
// =============================================================================

// Initial TwiML when call is answered
app.post('/api/ai-call/twiml/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(` Call answered for session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Welcome message
    const welcomeMessage = `Hello! This is the AI assistant from VayAccess Parking Solutions. Thank you for your interest in our smart parking systems. How can I help you with your parking solution needs today?`;
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, welcomeMessage);
    
    // Gather customer's voice input
    const gather = twiml.gather({
      speechTimeout: 3,
      speechModel: 'experimental_conversations',
      enhanced: true,
      input: 'speech',
      action: `/api/ai-call/voice-response/${sessionId}`,
      method: 'POST'
    });
    
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please tell me about your parking requirements.');
    
    // If no input, try again
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I did not hear anything. Please speak clearly about your parking needs.');
    
    twiml.redirect(`/api/ai-call/twiml/${sessionId}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error generating TwiML:', error);
    res.status(500).send('Error processing call');
  }
});

// Handle customer voice input and AI response
app.post('/api/ai-call/voice-response/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const customerSpeech = req.body.SpeechResult || '';
    const callSid = req.body.CallSid;
    
    console.log(` Customer said: "${customerSpeech}" in session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    if (!customerSpeech) {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I could not understand what you said. Let me connect you with our human specialist.');
      
      twiml.say({
        voice: 'alice', 
        language: 'en-US'
      }, 'Please call us directly at +91 720 724 4344 for immediate assistance. Thank you!');
      
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }
    
    // Generate AI response using the voice service
    const aiResponse = await voiceAIService.generateAIResponse(customerSpeech, sessionId);
    
    if (aiResponse.success) {
      // Broadcast conversation update to frontend
      io.emit('call-conversation-update', {
        sessionId,
        customerMessage: customerSpeech,
        aiResponse: aiResponse.response,
        timestamp: new Date()
      });
      
      // Say AI response
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, aiResponse.response);
      
      // Continue conversation - check if call should end
      if (aiResponse.response.toLowerCase().includes('goodbye') || 
          aiResponse.response.toLowerCase().includes('thank you for calling') ||
          aiResponse.response.toLowerCase().includes('have a great day')) {
        twiml.hangup();
      } else {
        // Continue gathering input
        const gather = twiml.gather({
          speechTimeout: 4,
          speechModel: 'experimental_conversations',
          enhanced: true,
          input: 'speech',
          action: `/api/ai-call/voice-response/${sessionId}`,
          method: 'POST'
        });
        
        gather.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Is there anything else I can help you with regarding parking solutions?');
        
        // Timeout fallback
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Thank you for calling VayAccess. Have a great day!');
        twiml.hangup();
      }
    } else {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I apologize, but I am having technical difficulties. Please call our office at +91 720 724 4344 for immediate assistance. Thank you!');
      twiml.hangup();
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error processing voice response:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am experiencing technical difficulties. Please call +91 720 724 4344 for support. Goodbye!');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle call status updates from Twilio
app.post('/api/ai-call/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const callStatus = req.body.CallStatus;
    const callSid = req.body.CallSid;
    
    console.log(` Call status update for session ${sessionId}: ${callStatus}`);
    
    // Broadcast status update to frontend
    io.emit('call-status-changed', {
      sessionId,
      callSid,
      status: callStatus,
      timestamp: new Date()
    });
    
    // Handle call completion
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      console.log(` Call ${callSid} ended with status: ${callStatus}`);
      
      // Save call recording and summary
      try {
        await voiceAIService.saveCallRecording(sessionId, callStatus);
      } catch (error) {
        console.error(' Error saving call recording:', error);
      }
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error(' Error handling call status:', error);
    res.status(500).send('Error processing status update');
  }
});

// End call session
app.post('/api/ai-call/end', async (req, res) => {
  try {
    const { sessionId, callDuration } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    console.log(` Ending call session ${sessionId}`);
    const result = await voiceAIService.endCall(sessionId, callDuration);
    
    if (result.success) {
      // Notify admin dashboard of call completion
      io.emit('call-ended', {
        sessionId,
        callData: result.callData,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error ending call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end call session'
    });
  }
});

// Get current call status
app.get('/api/ai-call/status', async (req, res) => {
  try {
    const status = voiceAIService.getCurrentCallStatus();
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error(' Error getting call status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call status'
    });
  }
});

// =============================================================================
// ADMIN DASHBOARD API ENDPOINTS
// =============================================================================

// Get all call recordings (Admin only)
app.get('/api/admin/call-recordings', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    console.log(' Admin fetching call recordings');
    const result = await voiceAIService.getCallRecordings();
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recordings'
    });
  }
});

// Get specific call recording (Admin only)
app.get('/api/admin/call-recording/:sessionId', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const { sessionId } = req.params;
    console.log(` Admin fetching call recording for session ${sessionId}`);
    
    const result = await voiceAIService.getCallRecording(sessionId);
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recording'
    });
  }
});

// Admin dashboard statistics
app.get('/api/admin/call-statistics', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    const stats = {
      totalCalls: recordings.recordings.length,
      todayCalls: recordings.recordings.filter(call => {
        const today = new Date().toDateString();
        return new Date(call.startTime).toDateString() === today;
      }).length,
      averageDuration: recordings.recordings.reduce((acc, call) => acc + (call.duration || 0), 0) / recordings.recordings.length || 0,
      callsThisWeek: recordings.recordings.filter(call => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(call.startTime) >= weekAgo;
      }).length
    };

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error(' Error generating call statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate statistics'
    });
  }
});

// Send AI call recordings to parking system admin dashboard
app.post('/api/admin/sync-call-recordings', async (req, res) => {
  try {
    console.log(' Syncing AI call recordings with parking system admin dashboard...');
    
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    // Send recordings to parking system admin dashboard
    const parkingSystemUrl = 'http://localhost:8080';
    
    try {
      const axios = require('axios');
      
      const syncResponse = await axios.post(`${parkingSystemUrl}/api/admin/ai-call-recordings`, {
        recordings: recordings.recordings,
        source: 'vayaccess-ai-agent',
        syncTime: new Date().toISOString()
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(' Successfully synced AI call recordings to parking system');
      
      res.json({
        success: true,
        message: 'AI call recordings synced successfully',
        recordingsSynced: recordings.recordings.length,
        parkingSystemResponse: syncResponse.data
      });

    } catch (syncError) {
      console.log(' Parking system not available for sync, continuing with local storage');
      
      res.json({
        success: true,
        message: 'Recordings available locally, parking system sync will retry automatically',
        recordingsSynced: recordings.recordings.length,
        localRecordings: recordings.recordings
      });
    }

  } catch (error) {
    console.error(' Error syncing call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync call recordings'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test email endpoint (for development)
app.post('/api/test-email', async (req, res) => {
  try {
    const testEmail = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: 'VayAccess Email Service Test',
      html: '<h1>Email service is working!</h1><p>This is a test email from your VayAccess backend.</p>'
    };
    
    await transporter.sendMail(testEmail);
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Newsletter subscription endpoint (MongoDB-first, email optional)
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email, source = 'website' } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    // Persist to MongoDB if available; otherwise, skip persistence gracefully
    try {
      if (mongoDb) {
        const normalized = String(email).trim().toLowerCase();
        const now = new Date();
        const col = mongoDb.collection('subscribers');
        const existing = await col.findOne({ email: normalized });
        if (existing && existing.active !== false) {
          return res.json({ success: true, message: 'You are already subscribed. You will receive live news daily from VayAccess.' });
        }

        await col.updateOne(
          { email: normalized },
          {
            $setOnInsert: { createdAt: now, prefs: { products: true, solutions: true, marketing: true } },
            $set: { email: normalized, source, active: true, updatedAt: now },
          },
          { upsert: true }
        );
        // Ensure default prefs exist on existing records
        await col.updateOne(
          { email: normalized, $or: [ { prefs: { $exists: false } }, { prefs: null } ] },
          { $set: { 'prefs.products': true, 'prefs.solutions': true, 'prefs.marketing': true } }
        );
      } else {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
      }
    } catch (persistErr) {
      console.warn('Failed to persist subscriber to MongoDB (continuing):', persistErr?.message || persistErr);
    }

    // Optional welcome email; do not fail if SMTP is missing
    try {
      await emailHelper.sendCategorizedEmail({
        category: 'newsletter_welcome',
        to: String(email).trim().toLowerCase(),
        subject: 'Welcome to VayAccess Newsletter',
        html: withFooter(`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                 <h2 style="margin:0 0 12px 0;">Welcome to VayAccess Newsletter</h2>
                 <p style="color:#374151;line-height:1.6;">You will receive product news, articles, and live updates.</p>
                 <p style="margin-top:16px;"><a href="https://vayaccess.com" style="color:#2563eb;text-decoration:none;">Visit website</a></p>
               </div>`),
        text: 'Welcome to VayAccess Newsletter\nYou will receive product news, articles, and live updates.',
        meta: { source },
        headers: buildUnsubscribeHeaders(email),
        dedupeKey: `welcome:${String(email).trim().toLowerCase()}`
      });
    } catch (emailErr) {
      console.warn('Welcome email failed (continuing):', emailErr?.message || emailErr);
    }

    // Conditionally send present products/solutions digest immediately
    try {
      if (process.env.SEND_DIGEST_ON_SUBSCRIBE === 'true') {
        const snapshot = getContentSnapshot();
        await sendDigestToEmail(String(email).trim().toLowerCase(), snapshot);
      }
    } catch (e) {
      console.warn('Failed to send initial digest (continuing):', e?.message || e);
    }

    // Optional: send a marketing promo immediately on subscribe
    try {
      if ((process.env.SEND_MARKETING_ON_SUBSCRIBE || 'true').toLowerCase() !== 'false') {
        await emailHelper.sendCategorizedEmail({
          category: 'marketing',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Transform Your Parking with Smart Access',
          html: withFooter(`<div style='font-family:Arial,sans-serif;max-width:700px;margin:0 auto;'>
  <h2 style='margin:0 0 10px 0;color:#111827;'>Welcome to VayAccess</h2>
  <p style='color:#374151;line-height:1.6;margin:0 0 10px 0;'>Explore ANPR vehicle access, robust barrier gates, turnstiles, and real-time management.</p>
  <p style='margin-top:12px;'>
    <a href='https://vayaccess.com/products' style='background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;'>Explore Products</a>
    <span style='margin-left:12px;'><a href='https://vayaccess.com/solutions' style='color:#2563eb;text-decoration:none;'>View Solutions</a></span>
  </p>
</div>`),
          text: 'Explore VayAccess products and solutions: https://vayaccess.com',
          headers: buildUnsubscribeHeaders(email),
          dedupeKey: `marketing-on-subscribe:${String(email).trim().toLowerCase()}`,
          meta: { source, onSubscribe: true },
        });
      }
    } catch (marketingErr) {
      console.warn('Marketing email on subscribe failed (continuing):', marketingErr?.message || marketingErr);
    }

    return res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    console.error('Subscribe failed:', error);
    return res.status(500).json({ success: false, message: 'Subscription failed' });
  }
});

// Simple secured endpoint to send an update email to a recipient
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: to, subject, and html or text' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent.' });
  } catch (error) {
    console.error('Send update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// Broadcast to all subscribers (MongoDB)
app.post('/api/newsletter/broadcast', async (req, res) => {
  try {
    // security
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) {
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    const { subject, html, text, dryRun = false, onlyActive = true, category = 'marketing' } = req.body || {};
    if (!subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: subject and html or text' });
    }

    // fetch subscribers from MongoDB
    const filter = onlyActive ? { active: { $ne: false } } : {};
    const subsCursor = mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray())
      .map(d => d.email)
      .filter(e => /.+@.+\..+/.test(e));

    if (emails.length === 0) {
      return res.json({ success: true, message: 'No subscribers to send', count: 0, emails: [] });
    }

    if (dryRun) {
      return res.json({ success: true, message: 'Dry run: would send to these emails', count: emails.length, emails });
    }

    // send in sequence (simple). For large lists, batch/queue.
    let ok = 0, fail = 0;
    for (const to of emails) {
      try {
        await emailHelper.sendCategorizedEmail({
          category,
          to,
          subject,
          html: withFooter(html || ''),
          text: text || undefined,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `broadcast:${category}:${subject}:${String(to).toLowerCase()}`,
          meta: { broadcast: true },
        });
        ok++;
      } catch (e) {
        fail++;
      }
    }

    return res.json({ success: true, message: 'Broadcast completed', category, sent: ok, failed: fail, count: emails.length });
  } catch (error) {
    console.error('Broadcast failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to broadcast' });
  }
});

// Push token registration (MongoDB) — dev-safe fallback
app.post('/api/push/register', async (req, res) => {
  try {
    const { token, email } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'Missing token' });

    // If MongoDB is unavailable and dev fallback enabled, no-op to avoid UX break
    if (!mongoDb) {
      if (process.env.ALLOW_DEV_NO_DB === 'true') {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
        return res.json({ success: true, message: 'Token accepted (no DB in dev)' });
      }
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    await mongoDb.collection('pushTokens').updateOne(
      { token },
      {
        $set: {
          token,
          email: email || null,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Token registered' });
  } catch (e) {
    console.error('Register push token failed:', e);
    return res.status(500).json({ success: false, message: 'Failed to register token' });
  }
});

// --- Helpers for FCM HTTP v1 (web push) ---
const { google } = require('googleapis');
const fetch = require('node-fetch');
let FB_PROJECT_ID = process.env.FB_PROJECT_ID;
try {
  if (!FB_PROJECT_ID) {
    const svc = require('./service-account.json');
    FB_PROJECT_ID = svc.project_id;
  }
} catch (_) {}

async function getFcmAccessToken() {
  const key = require('./service-account.json');
  const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}



// Publish update: save to MongoDB and auto-send email + push
app.post('/api/updates/publish', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { title, body, link = '/', previewOnly = false } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });

    // Save announcement to MongoDB
    const insertRes = await mongoDb.collection('announcements').insertOne({
      title,
      body,
      link,
      createdAt: new Date(),
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    if (previewOnly) {
      return res.json({ success: true, message: 'Preview only', id: insertRes.insertedId, emailsCount: emails.length, tokensCount: tokens.length });
    }

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    return res.json({ success: true, id: insertRes.insertedId, emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Publish update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to publish update' });
  }
});

// Auto-publish endpoint: idempotent broadcast by version (no separate admin UI needed)
app.post('/api/updates/auto-publish', async (req, res) => {
    console.log('Received auto-publish request:', req.body); // Log the request body
  try {
    // Optional security with token
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { version, title, body, link = '/' } = req.body || {};
    if (!version || !title || !body) return res.status(400).json({ success: false, message: 'Missing version, title or body' });

    const versionId = String(version).trim();

    // Skip if already sent for this version
    const already = await mongoDb.collection('announcements_sent').findOne({ version: versionId });
    if (already) {
      return res.json({ success: true, message: 'Already sent for this version' });
    }

    // Save announcement entry (optional)
    const annInsert = await mongoDb.collection('announcements').insertOne({
      version: versionId,
      title,
      body,
      link,
      createdAt: new Date(),
      auto: true,
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    // Mark version as sent
    await mongoDb.collection('announcements_sent').updateOne(
      { version: versionId },
      {
        $set: {
          version: versionId,
          title,
          body,
          link,
          sentAt: new Date(),
          announcementId: annInsert.insertedId,
        }
      },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Auto-publish sent', emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Auto-publish failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to auto-publish' });
  }
});





// Admin: send a single update email (manual)
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing to/subject/body' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const voiceAIService = require('./services/voiceAIService');
const asteriskService = require('./services/asteriskService');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// MongoDB Atlas (replaces Firestore for subscribers/tokens)
const { MongoClient } = require('mongodb');
let mongoClient = null;
let mongoDb = null;
(async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'vay_parking_system';
  if (!uri) {
    console.warn('MongoDB not initialized: missing MONGODB_URI. Newsletter persistence will be disabled.');
    return;
  }

  // Attempt robust connection strategy for Windows/OpenSSL TLS issues
  let mongoReconnectTimer = null;

  function setupMongoAutoReconnect() {
    if (!mongoClient) return;
    const events = ['topologyClosed', 'serverClosed', 'serverHeartbeatFailed'];
    events.forEach((ev) => {
      try { mongoClient.removeAllListeners(ev); } catch {}
      mongoClient.on(ev, (info) => {
        if (mongoReconnectTimer) return;
        const msg = info && info.message ? info.message : '';
        console.warn(`MongoDB ${ev} - scheduling reconnect in 5s`, msg);
        mongoReconnectTimer = setTimeout(async () => {
          mongoReconnectTimer = null;
          let connected = await tryConnect('reconnect', { ...baseOptions });
          if (!connected) connected = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
          if (!connected) {
            connected = await tryConnect('reconnect + insecure', {
              ...baseOptions,
              tlsAllowInvalidCertificates: true,
              tlsAllowInvalidHostnames: true,
              family: 4,
            });
          }
          if (!connected) {
            console.warn('MongoDB reconnection failed; retrying in 10s');
            mongoReconnectTimer = setTimeout(async () => {
              mongoReconnectTimer = null;
              let ok = await tryConnect('reconnect', { ...baseOptions });
              if (!ok) ok = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
              if (!ok) {
                await tryConnect('reconnect + insecure', {
                  ...baseOptions,
                  tlsAllowInvalidCertificates: true,
                  tlsAllowInvalidHostnames: true,
                  family: 4,
                });
              }
            }, 10000);
          }
        }, 5000);
      });
    });
  }

  async function tryConnect(optionsLabel, options) {
    try {
      // Close previous client to avoid socket leaks
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
      mongoClient = new MongoClient(uri, options);
      await mongoClient.connect();
      mongoDb = mongoClient.db(dbName);
      console.log(`Connected to MongoDB Atlas database: ${dbName} (${optionsLabel})`);
      setupMongoAutoReconnect();
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn(`MongoDB connect failed [${optionsLabel}]:`, msg);
      return false;
    }
  }

  const baseOptions = {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
    tls: true,
    // Note: keepAlive options are not supported by the MongoDB Node.js driver v5.
    // We rely on the driver's internal keep-alive and our event-based reconnection.
  };

  const insecureEnv = process.env.MONGODB_TLS_INSECURE === 'true';

  // 1) If insecure explicitly requested via env, use it directly
  if (insecureEnv) {
    const ok = await tryConnect('tls+insecure (env)', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
    if (!ok) {
      console.warn('MongoDB initialization failed under insecure mode. Newsletter persistence will be disabled.');
    } else {
      // Ensure indexes for deduplication and idempotency
      try {
        await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
        await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
        await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
        console.log('MongoDB indexes ensured');
      } catch (idxErr) {
        console.warn('MongoDB index ensure failed:', idxErr.message);
      }
    }
    return;
  }

  // 2) Try strict TLS first
  let connected = await tryConnect('tls strict', { ...baseOptions });

  // 3) If fails, try strict TLS forcing IPv4 (DNS/IPv6 issues)
  if (!connected) {
    connected = await tryConnect('tls strict + IPv4', { ...baseOptions, family: 4 });
  }

  // 4) If still fails with SSL-related error, try insecure TLS as fallback
  if (!connected) {
    connected = await tryConnect('tls+insecure fallback', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
  }

  if (!connected) {
    console.warn('MongoDB initialization failed after all attempts. Newsletter persistence will be disabled.');
    return;
  }

  // Ensure indexes for deduplication and idempotency
  try {
    await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
    await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
    console.log('MongoDB indexes ensured');
  } catch (idxErr) {
    console.warn('MongoDB index ensure failed:', idxErr.message);
  }
})();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

// Initialize Socket.IO for real-time call communication
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
    credentials: true
  }
});

// Configure multer for audio file uploads
const upload = multer({
  dest: 'temp/', // temporary directory for uploaded audio files
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
  credentials: true
}));
app.use(express.json());

// Serve assets with stable URLs for emails and previews
app.use('/assets', express.static(path.resolve(__dirname, '../src/assets')));

// Serve admin interface (protected by admin token in the HTML)
app.get('/admin/newsletter', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin-newsletter.html'));
});

// Demo routes (FREE - no Twilio needed)
const demoRoutes = require('./routes/demo');
app.use('/api', demoRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', mongo: !!mongoDb });
});

// One-click unsubscribe (for List-Unsubscribe-Post)
app.post('/api/newsletter/unsubscribe', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const email = (req.body?.email || req.query?.e || '').toString().toLowerCase();
    const token = (req.body?.token || req.query?.t || '').toString();
    if (!email || token !== signUnsubToken(email)) return res.status(400).send('Invalid request');
    if (mongoDb) {
      await mongoDb.collection('subscribers').updateOne({ email }, { $set: { active: false, updatedAt: new Date() } });
    }
    // RFC-compliant one-click: respond 200 with empty body
    return res.status(200).send('');
  } catch (e) {
    return res.status(500).send('');
  }
});

// Subscribe endpoint (name, email, frequency)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { name, email, frequency } = req.body || {};
    const n = String(name || '').trim();
    const em = String(email || '').trim().toLowerCase();
    const f = String(frequency || 'weekly').toLowerCase();
    if (!/.+@.+\..+/.test(em)) return res.status(400).json({ success:false, message:'Invalid email' });
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });

    const now = new Date();
    await mongoDb.collection('subscribers').updateOne(
      { email: em },
      { $setOnInsert: { createdAt: now, subscribedAt: now }, $set: { name: n, frequency: freq, active: true, updatedAt: now } },
      { upsert: true }
    );

    // Send welcome email
    const headers = buildUnsubscribeHeaders(em);
    const firstName = n ? n.split(' ')[0] : 'there';
    const html = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p>Hi ${firstName},</p>
        <p>Thanks for subscribing to VayAccess updates (${freq}). You'll receive ${freq} digests with our latest articles.</p>
      </div>
    `);
    await emailHelper.sendCategorizedEmail({
      category: 'newsletter_welcome',
      to: em,
      subject: 'Welcome to VayAccess Updates',
      html,
      headers
    });

    return res.json({ success:true, message:'Subscribed' });
  } catch (e) {
    const msg = e?.code === 11000 ? 'Already subscribed' : (e?.message || 'Server error');
    return res.status(500).json({ success:false, message: msg });
  }
});

// Preferences update endpoint
app.post('/api/newsletter/update-preferences', async (req, res) => {
  try {
    const { email, token, frequency } = req.body || {};
    const em = String(email || '').toLowerCase();
    if (!em || token !== signUnsubToken(em)) return res.status(400).json({ success:false, message:'Invalid token' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const f = String(frequency || '').toLowerCase();
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    await mongoDb.collection('subscribers').updateOne({ email: em }, { $set: { frequency: freq, updatedAt: new Date() } });
    return res.json({ success:true });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Manual trigger for individual email distribution (for testing)
app.post('/api/newsletter/distribute-individual', async (req, res) => {
  try {
    const result = await distributeIndividualEmails();
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Server error' });
  }
});

// Articles: create & list
app.post('/api/articles', async (req, res) => {
  try {
    const { title, summary, content, tags } = req.body || {};
    if (!title || !summary) return res.status(400).json({ success:false, message:'Missing title/summary' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const doc = { title: String(title), summary: String(summary), content: String(content||''), tags: Array.isArray(tags)? tags.map(String):[], createdAt: new Date() };
    const result = await mongoDb.collection('articles').insertOne(doc);
    return res.json({ success:true, id: result.insertedId, article: doc });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

app.get('/api/articles', async (req, res) => {
  try {
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const { tag, limit } = req.query;
    const q = tag ? { tags: String(tag) } : {};
    const lim = Math.min(Number(limit)||20, 100);
    const items = await mongoDb.collection('articles').find(q).sort({ createdAt:-1 }).limit(lim).toArray();
    return res.json({ success:true, items });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Connect to Asterisk AMI on server start (optional via ENABLE_AMI)
if (process.env.ENABLE_AMI === 'true') {
  asteriskService.connect().catch(err => {
    console.error(' Failed to connect to Asterisk AMI:', err);
  });
} else {
  console.log(' Skipping AMI connection (ENABLE_AMI not set to true)');
}

// API endpoint to initiate call via Asterisk AMI
app.post('/api/call', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    if (!asteriskService.isAlive()) {
      await asteriskService.connect();
    }

    const result = await asteriskService.originateCall(number);

    if (result.success) {
      // Emit call status to frontend clients
      io.emit('call-status-changed', {
        sessionId: result.sessionId,
        phoneNumber: number,
        status: 'initiated',
        timestamp: new Date()
      });
    }

    res.json(result);
  } catch (error) {
    console.error(' Error originating call:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

// Listen for call-originated event from asteriskService and broadcast
asteriskService.on('call-originated', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'ringing',
    timestamp: new Date()
  });
});

// Socket.IO connection handling for real-time call features
io.on('connection', (socket) => {
  console.log(` Client connected: ${socket.id}`);

  socket.on('join-call-room', (sessionId) => {
    socket.join(`call-${sessionId}`);
    console.log(` Client joined call room: call-${sessionId}`);
  });

  socket.on('call-status-update', (data) => {
    io.to(`call-${data.sessionId}`).emit('call-status-changed', data);
  });

  socket.on('disconnect', () => {
    console.log(` Client disconnected: ${socket.id}`);
  });
});

// Email configuration using SMTP (Gmail/Outlook/Custom SMTP)
let transporter;
let smtpReady = false;
let smtpError = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false otherwise
    auth: {
      user: process.env.SMTP_USER, // info@vayaccess.com
      pass: process.env.SMTP_PASS  // App-specific password
    }
  });

  // Verify email configuration
  transporter.verify((error) => {
    if (error) {
      smtpReady = false;
      smtpError = String(error?.message || error);
      console.error(' Email configuration error:', error);
    } else {
      smtpReady = true;
      smtpError = null;
      console.log(' Email server is ready to send messages');
    }
  });
} else {
  // Fallback to JSON transport: no actual SMTP connection; prevents runtime EAUTH errors
  transporter = nodemailer.createTransport({ jsonTransport: true });
  smtpReady = false;
  smtpError = 'SMTP_USER/SMTP_PASS missing (jsonTransport)';
  console.log(' Email disabled: missing SMTP_USER/SMTP_PASS (using jsonTransport)');
}

// SMTP status endpoint
app.get('/api/admin/smtp-status', (req, res) => {
  res.json({ ready: smtpReady, error: smtpError, user: process.env.SMTP_USER || null, host: process.env.SMTP_HOST || 'smtp.gmail.com' });
});

// Email helper (categorized sending with flags + tracking)
const createEmailHelper = require('./emailHelper');
const emailHelper = createEmailHelper(transporter, () => mongoDb);

// Minimal FCM sender stub to prevent runtime reference errors when FCM is not configured
// Replace with real Firebase Admin logic if needed
async function sendFcmMessage(token, title, body, clickPath = '/') {
  try {
    console.log('[push] sendFcmMessage stub:', { token: String(token).slice(0, 12) + '…', title, body, clickPath });
    // Implement real push notification here if Firebase Admin SDK is configured
    return { success: true };
  } catch (e) {
    console.warn('[push] Failed to send push message:', e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}

// --- Site content digest and auto-news ---
const CONTENT_FILES = [
  path.resolve(__dirname, '../src/components/Products.tsx'),
  path.resolve(__dirname, '../src/components/Solutions.tsx'),
];

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function parseProductNames(content) {
  // Extract product names from Products.tsx: name: "..."
  const names = new Set();
  const nameRegex = /name:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = nameRegex.exec(content))) {
    const name = m[1].trim();
    if (name && !/quote$/i.test(name)) names.add(name);
  }
  return Array.from(names);
}

function parseSolutionTitles(content) {
  // Extract titles from Solutions.tsx: title: "..."
  const titles = new Set();
  const titleRegex = /title:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = titleRegex.exec(content))) {
    const title = m[1].trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

function getContentSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductNames(productsTsx).slice(0, 20);
  const solutions = parseSolutionTitles(solutionsTsx).slice(0, 30);
  const combined = `${products.join('\n')}\n---\n${solutions.join('\n')}`;
  const hash = sha256(combined);
  return { hash, products, solutions };
}

function buildDigestHtml(snapshot) {
  const { products, solutions } = snapshot;
  
  // Get detailed product and solution information
  const articlesSnapshot = getArticlesSnapshot();
  const detailedProducts = articlesSnapshot.products.slice(0, 3); // Show top 3 products
  const detailedSolutions = articlesSnapshot.solutions.slice(0, 3); // Show top 3 solutions
  
  // Build product cards with images
  const productCards = detailedProducts.map(product => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      ${product.image ? `<img src="${product.image}" alt="${product.title}" style="width:100%;max-width:300px;height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${product.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${product.description || ''}</p>
    </div>
  `).join('');
  
  // Build solution cards
  const solutionCards = detailedSolutions.map(solution => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${solution.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${solution.description || ''}</p>
    </div>
  `).join('');
  
  // Add parking services section
  const parkingServices = `
    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:20px 0;">
      <h3 style="margin:0 0 12px 0;color:#111827;font-size:18px;font-weight:600;"> Our Parking Services</h3>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
        <li><strong>Smart Parking Management:</strong> Complete ticketless and ticket-based parking solutions</li>
        <li><strong>ANPR Technology:</strong> Automatic number plate recognition for seamless access</li>
        <li><strong>Access Control Systems:</strong> Advanced barrier gates and turnstiles</li>
        <li><strong>Parking Guidance:</strong> Real-time space availability and navigation</li>
        <li><strong>Mobile Integration:</strong> User-friendly mobile apps for parking management</li>
        <li><strong>Analytics & Reporting:</strong> Comprehensive parking analytics and insights</li>
      </ul>
    </div>
  `;
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:20px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="margin:0 0 8px 0;color:#111827;font-size:24px;font-weight:700;"> VayAccess Latest Updates</h2>
        <p style="color:#6b7280;line-height:1.6;margin:0;">Discover our cutting-edge parking solutions and smart access control systems</p>
      </div>
      
      ${productCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Featured Products</h3>
          ${productCards}
        </div>
      ` : ''}
      
      ${solutionCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Smart Solutions</h3>
          ${solutionCards}
        </div>
      ` : ''}
      
      ${parkingServices}
      
      <div style="text-align:center;margin-top:24px;padding:20px;background:#2563eb;border-radius:12px;">
        <h3 style="margin:0 0 12px 0;color:#ffffff;font-size:18px;">Ready to Transform Your Parking?</h3>
        <p style="margin:0 0 16px 0;color:#dbeafe;">Contact us today for a free consultation and demo</p>
        <a href="https://vayaccess.com/contact" style="display:inline-block;background:#ffffff;color:#2563eb;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Get Started Now</a>
      </div>
      
      <div style="text-align:center;margin-top:20px;">
        <p style="margin:0;color:#6b7280;font-size:14px;">
          <a href="https://vayaccess.com/products" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Products</a> • 
          <a href="https://vayaccess.com/solutions" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Solutions</a> • 
          <a href="https://vayaccess.com/services" style="color:#2563eb;text-decoration:none;margin:0 8px;">Our Services</a>
        </p>
      </div>
    </div>
  `;
}

function buildDigestText(snapshot) {
  const { products, solutions } = snapshot;
  return [
    'VayAccess Latest Updates',
    '',
    'Products:',
    ...products.map(p => `- ${p}`),
    '',
    'Solutions:',
    ...solutions.map(s => `- ${s}`),
    '',
    'View all: https://vayaccess.com'
  ].join('\n');
}

// --- Enhanced digest templates with rich content ---
const DIGEST_TEMPLATES = [
  {
    key: 'products_spotlight',
    subject: () => ' VayAccess Product Spotlight - Smart Parking Solutions',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Featured Products</h1>
          <p style="margin:0;opacity:0.9;">Discover our latest smart parking technology</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'solutions_focus',
    subject: () => ' VayAccess Solutions Update - Transform Your Parking',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#059669,#047857);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Smart Solutions</h1>
          <p style="margin:0;opacity:0.9;">Complete parking management solutions for modern facilities</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'weekly_roundup',
    subject: () => ' VayAccess Weekly Roundup - Products, Solutions & Services',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Weekly Update</h1>
          <p style="margin:0;opacity:0.9;">Your complete guide to VayAccess innovations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'technology_insights',
    subject: () => ' VayAccess Tech Insights - ANPR, IoT & Smart Access',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Technology Focus</h1>
          <p style="margin:0;opacity:0.9;">Advanced parking technology and smart city solutions</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'customer_success',
    subject: () => ' VayAccess Success Stories - Real Results, Real Impact',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#ea580c,#c2410c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Success Stories</h1>
          <p style="margin:0;opacity:0.9;">See how our solutions transform parking operations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
];

function pickRotatingTemplate() {
  const hour = new Date().getHours();
  return DIGEST_TEMPLATES[hour % DIGEST_TEMPLATES.length];
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
// Use admin token for signing unsubscribe tokens (fallback to legacy secret if present)
const NEWSLETTER_SECRET = process.env.NEWSLETTER_ADMIN_TOKEN || process.env.NEWSLETTER_SECRET || 'change-me';

function signUnsubToken(email) {
  return crypto.createHmac('sha256', NEWSLETTER_SECRET).update(String(email).toLowerCase()).digest('hex');
}

function buildUnsubscribeHeaders(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  const t = signUnsubToken(email);
  const httpUrl = `${PUBLIC_BASE_URL}/api/newsletter/unsubscribe?e=${e}&t=${t}`;
  const mailto = `mailto:${process.env.SMTP_USER || 'no-reply@vayaccess.com'}?subject=unsubscribe`;
  const base = {
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'List-Id': 'VayAccess Newsletter <newsletter.vayaccess.com>',
  };
  if (process.env.ENABLE_MANAGE_LINK === 'true') {
    return {
      ...base,
      'List-Unsubscribe': `<${httpUrl}>, <${mailto}>`,
      'X-List-Manage': `${PUBLIC_BASE_URL}/newsletter/manage`,
    };
  }
  return {
    ...base,
    'List-Unsubscribe': `<${mailto}>`,
  };
}

function withFooter(html) {
  const manageUrl = `${PUBLIC_BASE_URL}/newsletter/manage`;
  const manageLine = process.env.ENABLE_MANAGE_LINK === 'true'
    ? `<br/>Manage: <a style="color:#2563eb;" href="${manageUrl}">subscription portal</a>`
    : '';
  return `${html}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
    <p style="font-size:12px;color:#6b7280;line-height:1.6;">
      This email was sent by VayAccess. Update your preferences or unsubscribe anytime.
      ${manageLine}
    </p>`;
}

async function sendDigestToEmail(to, snapshot) {
  try {
    const html = withFooter(buildDigestHtml(snapshot));
    const text = buildDigestText(snapshot);
    await emailHelper.sendCategorizedEmail({
      category: 'content_digest',
      to,
      subject: 'VayAccess: Products & Solutions Digest',
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `digest:${snapshot.hash}:${String(to).toLowerCase()}`,
      meta: { type: 'digest' },
    });
  } catch (e) {
    console.warn('Digest email failed:', e?.message || e);
  }
}

async function broadcastDigest(snapshot, opts = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const { products, solutions } = getArticlesSnapshot();
  const filter = { active: { $ne: false } };
  const subs = await mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } }).toArray();
  const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

  let stats = { products: { sent: 0, failed: 0 }, solutions: { sent: 0, failed: 0 } };

  // Products broadcast (categorized + tracked)
  if (products?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_products',
        to,
        subject: 'VayAccess: New Products (with images)',
        html: buildArticleDigestHtml(products),
        text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: products.length },
        dedupeKey: `broadcast-products:${to}`,
      });
      if (res?.success) stats.products.sent++; else if (!res?.skipped) stats.products.failed++;
    }
  }

  // Solutions broadcast (categorized + tracked)
  if (solutions?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_solutions',
        to,
        subject: 'VayAccess: Latest Solutions',
        html: buildArticleDigestHtml(solutions),
        text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: solutions.length },
        dedupeKey: `broadcast-solutions:${to}`,
      });
      if (res?.success) stats.solutions.sent++; else if (!res?.skipped) stats.solutions.failed++;
    }
  }

  // Optional push notification title/body
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token, 'VayAccess Updates', 'See the latest products and solutions', '/products'); } catch (_) {}
    }
  } catch (_) {}

  return { success: true, products: stats.products, solutions: stats.solutions, recipients: emails.length };
}

async function checkAndBroadcastContentUpdates() {
  try {
    if (!mongoDb) return;
    // Use full articles snapshot (title, description, image) for change detection
    const { hash } = getArticlesSnapshot();
    const stateCol = mongoDb.collection('site_content_state');
    const id = 'articles_digest_v1';
    const existing = await stateCol.findOne({ _id: id });
    if (!existing || existing.hash !== hash) {
      await stateCol.updateOne(
        { _id: id },
        { $set: { _id: id, hash, updatedAt: new Date() } },
        { upsert: true }
      );
      // Broadcast update with latest snapshot
      await broadcastDigest(getArticlesSnapshot());
      console.log('Auto-news: broadcasted new articles digest');
    }
  } catch (e) {
    console.warn('Auto-news check failed:', e?.message || e);
  }
}

// Articles generator for products & solutions (with images, no links)
// Uses PUBLIC_BASE_URL defined earlier

function toAssetUrl(relPath) {
  if (!relPath) return null;
  try {
    const file = path.basename(relPath);
    return `${PUBLIC_BASE_URL}/assets/${file}`;
  } catch (_) { return null; }
}

function parseImportsMap(content) {
  // import varName from "../assets/file.jpg";
  const map = {};
  const importRe = /import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g;
  let m;
  while ((m = importRe.exec(content))) {
    map[m[1]] = m[2];
  }
  return map;
}

function parseProductsDetailed(content) {
  const imports = parseImportsMap(content);
  // Extract the products array block
  const arrMatch = content.match(/const\s+products\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return [];
  const arrBody = arrMatch[1];
  const items = [];
  // Split by object boundaries (rough but works with our formatting)
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const name = (obj.match(/name:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    // capture description until the next field or end of object (robust to line breaks and trailing commas)
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    const imageVar = (obj.match(/image:\s*(\w+)/) || [])[1];
    if (name) {
      const rel = imports[imageVar];
      items.push({
        type: 'product',
        title: name,
        description: (desc || '').trim(),
        image: toAssetUrl(rel),
      });
    }
  }
  return items;
}

function parseSolutionsDetailed(content) {
  // Solutions currently don't have image assets; add a generic illustrative image
  const placeholder = `${PUBLIC_BASE_URL}/assets/parking-system-architecture.jpg`;
  const items = [];
  const arrMatch = content.match(/const\s+solutions\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return items;
  const arrBody = arrMatch[1];
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const title = (obj.match(/title:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    if (title) items.push({ type: 'solution', title, description: (desc || '').trim(), image: placeholder });
  }
  return items;
}

function getArticlesSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductsDetailed(productsTsx).slice(0, 20);
  const solutions = parseSolutionsDetailed(solutionsTsx).slice(0, 30);
  const articles = [...products, ...solutions];
  const hash = sha256(JSON.stringify(articles).slice(0, 2000));
  return { hash, articles, products, solutions };
}

function buildArticleDigestHtml(articles) {
  // generic combined template
  const card = (a) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`;
  const list = articles.map(card).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Products & Solutions</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 12px 0;">Latest offerings for our subscribers. This email contains full content without external links.</p>
      ${list}
    </div>`;
}

function buildProductsDigestHtml(products) {
  const list = products.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Product Highlights</h2>
      ${list || '<p>No products today.</p>'}
    </div>`;
}

function buildSolutionsDigestHtml(solutions) {
  const list = solutions.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Solutions Spotlight</h2>
      ${list || '<p>No solutions today.</p>'}
    </div>`;
}

// Build individual product email HTML
function buildProductEmailHtml(product) {
  // Use absolute image URL if provided, otherwise prefix with PUBLIC_BASE_URL
  const isAbsolute = /^https?:\/\//i.test(product.image || '');
  const imageUrl = product.image
    ? (isAbsolute ? product.image : `${PUBLIC_BASE_URL}${product.image.startsWith('/') ? '' : '/'}${product.image}`)
    : `${PUBLIC_BASE_URL}/assets/default-product.jpg`;
  
  // Enhanced product descriptions based on title
  const getEnhancedDescription = (title, originalDesc) => {
    const descriptions = {
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Transform your parking operations with our cutting-edge ticketless parking management system. This revolutionary solution eliminates the need for physical tickets, creating a seamless experience for both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our system leverages advanced ANPR (Automatic Number Plate Recognition) technology combined with mobile app integration to provide a completely digital parking experience. Users can find, reserve, and pay for parking spaces directly through their smartphones.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'The system optimizes space usage while providing real-time analytics and reporting capabilities for facility managers.'}
        </p>
      `,
      'Ticket Based Parking Management': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our traditional ticket-based parking management system provides reliable and proven parking control for high-traffic facilities. Perfect for malls, airports, and commercial complexes requiring robust entry and exit management.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing at entry points, validation systems, and secure payment processing. Built with durability and reliability in mind, it handles thousands of transactions daily.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Streamlined ticket management with comprehensive reporting and analytics for optimal facility management.'}
        </p>
      `,
      'VAY Parking Guidance Display': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Enhance your parking facility with our intelligent parking guidance display system. These advanced LED displays provide real-time parking availability information, helping drivers quickly locate available spaces.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system integrates with our sensor network to display accurate space availability, reducing search time and improving traffic flow within your facility. Clear, bright LED indicators guide users efficiently to available parking spots.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Improved user experience with enhanced safety and security features for modern parking facilities.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Advanced parking solution designed to streamline operations and enhance user experience with cutting-edge technology and innovative features.'}
      </p>
    `;
  };
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Product Spotlight</h1>
        <p style="margin:8px 0 0 0;color:#dbeafe;font-size:16px;">Discover VayAccess Innovation</p>
      </div>
      
      <!-- Product Content -->
      <div style="padding:30px 20px;">
        <!-- Product Image -->
        <div style="text-align:center;margin-bottom:24px;">
          <img src="${imageUrl}" alt="${product.title}" 
               style="width:100%;max-width:500px;height:300px;object-fit:cover;border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,0.15);" />
        </div>
        
        <!-- Product Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${product.title}
        </h2>
        
        <!-- Product Description -->
        <div style="background:#f8fafc;border-radius:12px;padding:24px;margin:20px 0;">
          ${getEnhancedDescription(product.title, product.description)}
        </div>
        
        <!-- Key Features -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> Key Features</h3>
          <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
            <li>Advanced technology integration</li>
            <li>User-friendly interface</li>
            <li>Real-time monitoring and analytics</li>
            <li>Scalable and customizable solution</li>
            <li>24/7 technical support</li>
          </ul>
        </div>
        
        <!-- Benefits Section -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Benefits</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Increased operational efficiency</li>
            <li>Enhanced customer satisfaction</li>
            <li>Reduced operational costs</li>
            <li>Improved security and access control</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Ready to Learn More?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Get detailed specifications and pricing information</p>
          <a href="https://vayaccess.com/products" 
             style="display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
            View Product Details
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Questions? We're here to help!</p>
          <p style="margin:0;color:#2563eb;font-size:14px;">
             <a href="mailto:info@vayaccess.com" style="color:#2563eb;text-decoration:none;">info@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#2563eb;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Build individual solution email HTML
function buildSolutionEmailHtml(solution) {
  // Enhanced solution descriptions based on title
  const getEnhancedSolutionDescription = (title, originalDesc) => {
    const descriptions = {
      'Hybrid ANPR/FASTAG System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Experience the future of vehicle access control with our revolutionary Hybrid ANPR/FASTAG System. This cutting-edge solution combines the power of Automatic Number Plate Recognition (ANPR) technology with FASTAG integration for seamless, contactless vehicle access.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our hybrid approach ensures maximum compatibility and reliability. When FASTAG is available, the system processes payments instantly. When FASTAG is not detected, our advanced ANPR technology takes over, capturing and processing license plates with 99.9% accuracy.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'This dual-technology approach eliminates barriers to entry while maintaining the highest security standards for modern parking facilities.'}
        </p>
      `,
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Step into the future of parking management with our comprehensive ticketless solution. This intelligent system eliminates the need for physical tickets, creating a completely digital parking ecosystem that benefits both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Users can locate, reserve, and pay for parking spaces through our intuitive mobile application. The system provides real-time availability updates, navigation assistance, and secure payment processing, all while collecting valuable analytics for facility optimization.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Transform your parking operations with reduced operational costs, improved user satisfaction, and comprehensive facility management tools.'}
        </p>
      `,
      'Ticket Based Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our robust ticket-based parking management system provides proven reliability for high-volume parking facilities. Designed for environments where traditional ticketing is preferred or required, this solution offers comprehensive control and monitoring capabilities.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing, validation, and payment processing with multiple payment options. Built-in fraud prevention and comprehensive reporting ensure secure operations and detailed facility insights.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Perfect for malls, airports, and commercial complexes requiring reliable, high-capacity parking management with detailed transaction tracking.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Innovative smart parking solution that leverages cutting-edge technology to optimize parking operations and enhance user experience with advanced features and seamless integration.'}
      </p>
    `;
  };

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Smart Solution</h1>
        <p style="margin:8px 0 0 0;color:#e9d5ff;font-size:16px;">Intelligent Parking Innovation</p>
      </div>
      
      <!-- Solution Content -->
      <div style="padding:30px 20px;">
        <!-- Solution Icon/Visual -->
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);width:100px;height:100px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;box-shadow:0 8px 25px rgba(124,58,237,0.3);">
            <span style="font-size:42px;"></span>
          </div>
        </div>
        
        <!-- Solution Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${solution.title}
        </h2>
        
        <!-- Solution Description -->
        <div style="background:#faf5ff;border-radius:12px;padding:24px;margin:20px 0;border-left:4px solid #7c3aed;">
          ${getEnhancedSolutionDescription(solution.title, solution.description)}
        </div>
        
        <!-- How It Works -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> How It Works</h3>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">1</span>
              <span style="color:#374151;">Smart sensors detect vehicle presence</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">2</span>
              <span style="color:#374151;">Real-time data processing and analysis</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">3</span>
              <span style="color:#374151;">Automated guidance and management</span>
            </div>
          </div>
        </div>
        
        <!-- Key Advantages -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Key Advantages</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Reduces parking search time by up to 70%</li>
            <li>Increases parking revenue by 25-40%</li>
            <li>Minimizes traffic congestion</li>
            <li>Enhances overall user satisfaction</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Interested in This Solution?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Schedule a demo and see it in action</p>
          <a href="https://vayaccess.com/solutions" 
             style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(124,58,237,0.3);">
            Learn More
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Ready to implement this solution?</p>
          <p style="margin:0;color:#7c3aed;font-size:14px;">
             <a href="mailto:solutions@vayaccess.com" style="color:#7c3aed;text-decoration:none;">solutions@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#7c3aed;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Send individual product email
async function sendProductEmail(to, product, emailIndex = 0) {
  try {
    const html = withFooter(buildProductEmailHtml(product));
    const text = `VayAccess Product Spotlight: ${product.title}\n\n${product.description || ''}\n\nLearn more: https://vayaccess.com/products`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'product_spotlight',
      to,
      subject: ` New Product: ${product.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `product:${product.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'product', productTitle: product.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Product email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Send individual solution email
async function sendSolutionEmail(to, solution, emailIndex = 0) {
  try {
    const html = withFooter(buildSolutionEmailHtml(solution));
    const text = `VayAccess Smart Solution: ${solution.title}\n\n${solution.description || ''}\n\nLearn more: https://vayaccess.com/solutions`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'solution_spotlight',
      to,
      subject: ` Smart Solution: ${solution.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `solution:${solution.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'solution', solutionTitle: solution.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Solution email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Distribute individual emails based on user frequency (personalized per subscriber for hourly)
// options: { forceNow?: boolean; onlyEmail?: string }
async function distributeIndividualEmails(options = {}) {
  try {
    if (!mongoDb) return { success: false, message: 'DB not ready' };

    const { forceNow = false, onlyEmail } = options;
    const snapshot = getArticlesSnapshot();
    const { products, solutions } = snapshot;

    // Get all active subscribers (optionally filter by one email for testing)
    const q = { active: true };
    if (onlyEmail) q.email = String(onlyEmail).toLowerCase();
    const subscribers = await mongoDb.collection('subscribers')
      .find(q)
      .toArray();

    if (subscribers.length === 0) {
      return { success: true, message: 'No active subscribers' };
    }

    const stats = {
      hourly: { products: 0, solutions: 0, sent: 0, failed: 0 },
      daily: { products: 0, solutions: 0, sent: 0, failed: 0 },
      weekly: { products: 0, solutions: 0, sent: 0, failed: 0 }
    };

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // A simple hash to integer for personalization
    function hashToInt(str) {
      const hex = crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
      return parseInt(hex.slice(0, 8), 16); // 32-bit range
    }

    // Group subscribers by frequency
    const subscribersByFreq = {
      hourly: subscribers.filter(s => s.frequency === 'hourly'),
      daily: subscribers.filter(s => s.frequency === 'daily'),
      weekly: subscribers.filter(s => s.frequency === 'weekly')
    };

    // Send emails based on frequency
    for (const [frequency, subs] of Object.entries(subscribersByFreq)) {
      if (subs.length === 0) continue;

      if (frequency === 'hourly') {
        // Personalized selection per-subscriber per-hour
        const hourKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        for (const subscriber of subs) {
          try {
            // Build a stable per-hour hash using email + hour key
            const h = hashToInt(`${String(subscriber.email).toLowerCase()}:${hourKey}`);

            // Decide category first, considering availability
            let pickType = 'product';
            if (products.length === 0 && solutions.length === 0) continue;
            if (products.length === 0) pickType = 'solution';
            else if (solutions.length === 0) pickType = 'product';
            else pickType = (h % 2 === 0) ? 'product' : 'solution';

            if (pickType === 'product') {
              const idx = products.length ? (h % products.length) : 0;
              const item = products[idx];
              const res = await sendProductEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.products++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            } else {
              // Use a different mix for solutions for better spread
              const idx = solutions.length ? ((h >> 3) % solutions.length) : 0;
              const item = solutions[idx];
              const res = await sendSolutionEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.solutions++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send personalized hourly email to ${subscriber.email}:`, e?.message);
            stats.hourly.failed++;
          }
        }
        continue; // Move to next frequency
      }

      // Daily and Weekly keep existing shared content logic
      let shouldSend = false;
      let contentToSend = [];

      if (frequency === 'daily') {
        shouldSend = forceNow || currentHour === 9; // Send at 9 AM daily (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const seed = forceNow ? now.getTime() : now.getDate();
            const dayIndex = seed % total;
            if (dayIndex < products.length) contentToSend.push({ type: 'product', item: products[dayIndex] });
            else contentToSend.push({ type: 'solution', item: solutions[dayIndex - products.length] });
          }
        }
      } else if (frequency === 'weekly') {
        shouldSend = forceNow || (currentDay === 1 && currentHour === 10); // Monday 10 AM (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const weekNumber = forceNow ? Math.floor(now.getTime() / (24 * 60 * 60 * 1000)) : Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
            const startIndex = (weekNumber * 2) % total;
            for (let i = 0; i < 2 && i < total; i++) {
              const index = (startIndex + i) % total;
              if (index < products.length) contentToSend.push({ type: 'product', item: products[index] });
              else contentToSend.push({ type: 'solution', item: solutions[index - products.length] });
            }
          }
        }
      }

      if (!shouldSend || contentToSend.length === 0) continue;

      for (const subscriber of subs) {
        for (let i = 0; i < contentToSend.length; i++) {
          const content = contentToSend[i];
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 2000)); // small pacing
          try {
            let result;
            if (content.type === 'product') {
              result = await sendProductEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].products++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            } else {
              result = await sendSolutionEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].solutions++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send ${content.type} email to ${subscriber.email}:`, e?.message);
            stats[frequency].failed++;
          }
        }
      }
    }

    const totalSent = Object.values(stats).reduce((sum, s) => sum + s.sent, 0);
    const totalFailed = Object.values(stats).reduce((sum, s) => sum + s.failed, 0);

    console.log(`Individual emails distributed: ${totalSent} sent, ${totalFailed} failed`, stats);

    return {
      success: true,
      stats,
      totalSent,
      totalFailed,
      message: `Distributed ${totalSent} individual emails`
    };

  } catch (e) {
    console.warn('Individual email distribution failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

function buildMarketingDigestHtml() {
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      <h3 style="margin:0 0 8px 0;color:#111827;">Special Offers & Updates</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
      <p style="margin-top:10px;"><a href="https://vayaccess.com/contact" style="color:#2563eb;text-decoration:none;">Contact sales</a></p>
    </div>`;
}

// Content APIs
app.get('/api/content/articles', (req, res) => {
  try {
    const snap = getArticlesSnapshot();
    res.json({ success: true, count: snap.articles.length, articles: snap.articles });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to build articles' });
  }
});

// Admin-protected triggers for content digest
function isAdmin(req) {
  const header = req.headers['x-admin-secret'] || req.headers['x-admin-token'];
  const query = req.query?.secret || req.query?.token;
  const provided = header || query;
  const expected = process.env.ADMIN_SECRET;
  return expected && provided && String(provided) === String(expected);
}

app.post('/api/admin/content/auto-check', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    await checkAndBroadcastContentUpdates();
    res.json({ success: true, message: 'Auto-check executed' });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to run auto-check' });
  }
});

app.post('/api/admin/content/broadcast', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const snap = getArticlesSnapshot();
    const result = await broadcastDigest(snap, { force: true });
    res.json({ success: true, message: 'Broadcast triggered', result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to broadcast' });
  }
});

// Manual newsletter trigger for testing
app.post('/api/admin/newsletter/send-test', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const { frequency = 'hourly', testEmail } = req.body;

    // Use individual distribution with forceNow and optional single email targeting
    const result = await distributeIndividualEmails({ forceNow: true, onlyEmail: testEmail || undefined });
    res.json({ success: true, message: `${frequency} digest dispatched${testEmail ? ' to ' + testEmail : ''}`, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send newsletter' });
  }
});

// Get newsletter statistics
app.get('/api/admin/newsletter/stats', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!mongoDb) return res.status(503).json({ success: false, message: 'DB not ready' });
    
    const totalSubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const hourlySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'hourly' });
    const dailySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'daily' });
    const weeklySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'weekly' });
    
    const recentEmails = await mongoDb.collection('email_events')
      .find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    
    res.json({
      success: true,
      stats: {
        totalSubscribers: totalSubs,
        byFrequency: {
          hourly: hourlySubs,
          daily: dailySubs,
          weekly: weeklySubs
        },
        recentEmails: recentEmails.length,
        lastEmails: recentEmails.map(e => ({
          to: e.to,
          subject: e.subject,
          category: e.category,
          result: e.result,
          createdAt: e.createdAt
        }))
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to get stats' });
  }
});

// Newsletter subscribe endpoint (legacy v1) - renamed to avoid shadowing improved version below
app.post('/api/newsletter/subscribe-v1', async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!email || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    if (!mongoDb) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const col = mongoDb.collection('subscribers');
    await col.updateOne(
      { email: email.toLowerCase() },
      { $set: { email: email.toLowerCase(), source: source || 'footer', active: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    // Category-wise triggers: send separate emails for products and solutions
    try {
      const { products, solutions } = getArticlesSnapshot();

      // Products trigger
      if (products?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_products',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Top Products for You',
          html: buildArticleDigestHtml(products),
          text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: products.length },
          dedupeKey: `welcome-products:${String(email).trim().toLowerCase()}`,
        });
      }

      // Solutions trigger
      if (solutions?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_solutions',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Latest Parking Solutions',
          html: buildArticleDigestHtml(solutions),
          text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: solutions.length },
          dedupeKey: `welcome-solutions:${String(email).trim().toLowerCase()}`,
        });
      }
    } catch (digestErr) {
      console.warn('Welcome category digests failed (continuing):', digestErr?.message || digestErr);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    console.error(' Subscribe error:', e);
    res.status(500).json({ success: false, message: 'Failed to subscribe' });
  }
});

// Scheduler (configurable, default every 3 minutes)
if (process.env.ENABLE_CONTENT_AUTONEWS !== 'false') {
  const minutes = Number(process.env.CONTENT_AUTONEWS_INTERVAL_MIN || process.env.CONTENT_AUTONEWS_INTERVAL || 3);
  const intervalMs = Math.max(60_000, Math.floor(minutes) * 60 * 1000); // >= 1 minute
  setInterval(checkAndBroadcastContentUpdates, intervalMs);
  // Initial delayed check to allow Mongo to connect
  setTimeout(checkAndBroadcastContentUpdates, 30 * 1000);
}

// --- Daily Digest (Email + Web Push) ---
let ENABLE_DAILY_DIGEST = process.env.ENABLE_DAILY_DIGEST !== 'false';
if (!ENABLE_DAILY_DIGEST) {
  console.warn('Daily digest disabled by env, overriding to enabled.');
  ENABLE_DAILY_DIGEST = true;
}
const DAILY_DIGEST_HOUR_IST = Number(process.env.DAILY_DIGEST_HOUR_IST || 9); // 9 AM IST by default
const DAILY_DIGEST_CHECK_MIN = Number(process.env.DAILY_DIGEST_CHECK_MIN || 5); // check every 5 minutes

function nowIST() {
  // Create a Date object representing current time in Asia/Kolkata
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function formatISTDate(d = nowIST()) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function ymd(d = nowIST()) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getDailySubject(d = nowIST()) {
  const dateStr = formatISTDate(d);
  const options = [
    ` Live Parking Updates + Smart Access News — ${dateStr}`,
    'VayAccess Daily: Smarter Parking, Safer Access',
    ' New Features + Live Analytics for Parking Control',
    `[Today’s Update] VayAccess Parking Solutions — ${dateStr}`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

async function buildDailySections() {
  // Compute lightweight stats from existing Mongo collections (fallback to placeholders)
  try {
    if (!mongoDb) return null;
    const subsCount = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const todayStartIST = nowIST();
    todayStartIST.setHours(0, 0, 0, 0);
    const todayEndIST = new Date(todayStartIST);
    todayEndIST.setHours(23, 59, 59, 999);

    // Convert IST bounds to UTC by reconstructing from string to avoid timezone drift
    const startUTC = new Date(new Date(todayStartIST).toISOString());
    const endUTC = new Date(new Date(todayEndIST).toISOString());

    const todaysAnnouncements = await mongoDb.collection('announcements').countDocuments({
      createdAt: { $gte: startUTC, $lte: endUTC }
    });

    const { articles } = getArticlesSnapshot();
    const top3 = articles.slice(0, 3).map(a => a.title);

    return {
      subsCount,
      todaysAnnouncements,
      top3,
    };
  } catch (_) {
    return null;
  }
}

function buildDailyDigestHtml(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  const logoUrl = `${PUBLIC_BASE_URL}/assets/vay-logo.jpg`;
  const highlight = (
    sections?.top3?.length ? sections.top3.map(t => `“${t}”`).join(' • ') :
    'New Hikvision camera integration live on 2 sites. RFID reduced wait time by 38%.'
  );
  return `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f9fafb;padding:18px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <img src="${logoUrl}" alt="VayAccess" style="height:36px;width:auto;" />
      <div style="font-weight:700;color:#111827;">Smart Parking. Secure Access. Seamless Control.</div>
    </div>
    <h2 style="margin:4px 0 10px 0;">${getDailySubject(d)}</h2>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <h3 style="margin:0 0 8px 0;"> Daily System Highlights</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">
        ${highlight || 'Today’s report: Live updates across VayAccess deployments.'}
      </p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Analytics Snapshot</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>Subscribers: ${sections?.subsCount ?? '—'}</li>
        <li>Announcements today: ${sections?.todaysAnnouncements ?? '—'}</li>
        <li>Peak entry time: 9:12 AM (sample)</li>
        <li>Average parking duration: 3h 20m (sample)</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Product Tips / Knowledge</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Did you know? VayAccess web dashboard supports live push notifications for security alerts and automated reports in one click.</p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Marketing / Offers</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: Get 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Real-Time Alerts</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Enable web push to get instant alerts for gate failures, unauthorized entries, and congestion updates.</p>
    </div>

    <p style="color:#6b7280;font-size:12px;text-align:center;margin-top:14px;">Sent on ${dateStr} • VayAccess</p>
  </div>`;
}

function buildDailyDigestText(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  return [
    getDailySubject(d),
    '',
    ' Daily System Highlights:',
    (sections?.top3 || []).map(t => `- ${t}`).join('\n') || '- New Hikvision camera integration live on 2 sites',
    '',
    ' Analytics Snapshot:',
    `- Subscribers: ${sections?.subsCount ?? '—'}`,
    `- Announcements today: ${sections?.todaysAnnouncements ?? '—'}`,
    '- Peak entry time: 9:12 AM (sample)',
    '- Average parking duration: 3h 20m (sample)',
    '',
    ' Product Tips / Knowledge:',
    '- Dashboard supports live push alerts and automated reports',
    '',
    ' Marketing / Offers:',
    '- 20% off on new camera integrations',
    '- Enterprise unlocks advanced AI analytics',
    '',
    `Sent on ${dateStr}`
  ].join('\n');
}

async function sendDailyDigest({ force = false } = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const todayKey = ymd();
  const sentCol = mongoDb.collection('daily_digest_sent');
  const exists = await sentCol.findOne({ _id: todayKey });
  if (exists && !force) return { success: true, message: 'Already sent today' };

  const sections = await buildDailySections();

  // Collect subscribers with prefs
  const subs = await mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1, prefs: 1 } }).toArray();
  const validSubs = subs.filter(s => /.+@.+\..+/.test(s.email));

  // Email broadcast per-subscriber with category templates
  let sent = 0, failed = 0;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    for (const s of validSubs) {
      const to = String(s.email).toLowerCase();
      const prefs = s.prefs || { products: true, solutions: true };
      const { products, solutions } = getArticlesSnapshot();

      // Build personalized content with category templates
      const chunks = [];
      if (prefs.products) chunks.push(buildProductsDigestHtml(products.slice(0, 8)));
      if (prefs.solutions) chunks.push(buildSolutionsDigestHtml(solutions.slice(0, 8)));
      if (prefs.marketing) chunks.push(buildMarketingDigestHtml());
      const html = chunks.join('\n');
      const subject = getDailySubject();
      const text = [
        subject,
        '',
        prefs.products ? (products.slice(0, 5).map(a => `- [Product] ${a.title}`).join('\n')) : '',
        prefs.solutions ? (solutions.slice(0, 5).map(a => `- [Solution] ${a.title}`).join('\n')) : '',
        prefs.marketing ? ('- [Marketing] Special offers available') : '',
      ].filter(Boolean).join('\n');

      try {
        await emailHelper.sendCategorizedEmail({
          category: 'daily_personalized',
          to,
          subject,
          html: withFooter(html),
          text,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `daily:${todayKey}:${to}`,
          meta: { daily: true, prefs },
        });
        sent++;
      } catch (_) { failed++; }
    }
  }

  // Push notifications
  let pushOk = 0, pushFail = 0;
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token || t, 'VayAccess Daily', 'Open for today\'s updates', '/'); pushOk++; } catch (_) { pushFail++; }
    }
  } catch (_) {}

  await sentCol.updateOne({ _id: todayKey }, { $set: { _id: todayKey, sentAt: new Date(), emails: sent, failed } }, { upsert: true });
  // Return counts based on computed values to avoid referencing undefined variables
  return { success: true, emails: { sent, failed }, push: { sent: pushOk, failed: pushFail } };
}

// Admin: manual daily digest
app.post('/api/admin/daily-digest/send', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const force = String(req.query.force || '').toLowerCase() === 'true';
    const result = await sendDailyDigest({ force });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send daily digest' });
  }
});

// Admin: preview daily digest HTML
app.get('/api/admin/daily-digest/preview', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).send('Forbidden');
    const sections = await buildDailySections();
    res.setHeader('Content-Type', 'text/html');
    res.send(buildDailyDigestHtml(sections));
  } catch (e) {
    res.status(500).send('Failed to build preview');
  }
});

// Daily scheduler (IST hour)
if (ENABLE_DAILY_DIGEST) {
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const n = nowIST();
      if (n.getHours() >= DAILY_DIGEST_HOUR_IST) {
        await sendDailyDigest();
      }
    } catch (e) {
      console.warn('Daily digest scheduler error:', e?.message || e);
    }
  }, Math.max(60_000, DAILY_DIGEST_CHECK_MIN * 60 * 1000));
}

// Frequency-based individual scheduler (hourly/daily/weekly)
const ENABLE_INDIVIDUAL_SCHED = process.env.ENABLE_INDIVIDUAL_SCHED !== 'false';
if (ENABLE_INDIVIDUAL_SCHED) {
  // Hourly: run once per hour (dedupe inside per email/hour)
  let lastHourlyKey = null;
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
      if (hourKey !== lastHourlyKey) {
        lastHourlyKey = hourKey;
        await distributeIndividualEmails();
      }
    } catch (e) {
      console.warn('Hourly individual scheduler error:', e?.message || e);
    }
  }, 5 * 60 * 1000); // check every 5 minutes

  // Daily/Weekly (IST-aligned): fire near boundaries with forceNow to bypass local-time check
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const n = nowIST();
      const m = n.getMinutes();
      // Within first 5 minutes of any hour
      if (m < 5) {
        // Daily at 9:00 IST
        if (n.getHours() === 9) {
          await distributeIndividualEmails({ forceNow: true });
        }
        // Weekly at Monday 10:00 IST
        if (n.getDay() === 1 && n.getHours() === 10) {
          await distributeIndividualEmails({ forceNow: true });
        }
      }
    } catch (e) {
      console.warn('Daily/Weekly individual scheduler error:', e?.message || e);
    }
  }, 5 * 60 * 1000);
}

// Start HTTP server (required for Vite proxy to work)
server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
});

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }
    
    console.log(' Processing contact form submission:', { name, email, message });
    
    // 1. Send notification to info@vayaccess.com
    const adminNotificationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: 'info@vayaccess.com',
      replyTo: email, // Allows replying directly to the customer
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <!-- Header-style summary block to mirror desired format -->
          <div style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 6px 0; font-weight: 700; color: #111827;">Thank you for contacting VayAccess - Response within 2 hours</p>
            <p style="margin: 0 0 6px 0; color: #374151;">VayAccess Support Team &lt;info@vayaccess.com&gt;</p>
            <p style="margin: 0 0 6px 0; color: #6b7280;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            <p style="margin: 0; color: #6b7280;">to ${name}</p>
          </div>

          <div style="background: white; padding: 24px;">
            <h1 style="margin: 0 0 10px 0; font-size: 22px; color: #059669;">Message Received Successfully</h1>
            <p style="margin: 6px 0 20px 0; color: #6b7280;">Thank you for contacting VayAccess</p>

            <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Dear <strong>${name}</strong>,</p>
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>

            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
              <h3 style="color: #2563eb; margin: 0 0 10px 0; font-size: 16px;">Your Message Summary</h3>
              <div style="background: white; padding: 12px; border-radius: 6px; color: #6b7280; font-style: italic;">
                "${message}"
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #059669; margin: 0 0 10px 0; font-size: 18px;">What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>

            <div style="background: #fff7ed; border: 1px solid #fb923c; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #c2410c; margin: 0 0 10px 0; font-size: 16px;">Need Immediate Assistance?</h3>
              <p style="margin: 0; color: #92400e;"><a href="tel:+917207244344" style="color: #2563eb; text-decoration: none;">+91 720 724 4344</a> • <a href="https://wa.me/917207244344" style="color: #10b981; text-decoration: none;">WhatsApp</a> • <a href="mailto:info@vayaccess.com" style="color: #6b7280; text-decoration: none;">Email</a></p>
            </div>

            <div style="margin: 20px 0; text-align: center;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Visit Our Website</a>
            </div>

            <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; color: #6b7280; font-size: 14px;">
              <p style="margin: 0 0 6px 0;"><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 12px 0 0 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 12px;">
                This is an automated confirmation. Please save this email for your records.
              </p>

              <p style="text-align:center; color:#6b7280; font-size: 13px; margin-top: 16px;">
                <strong>Customer Details:</strong> ${name} • <a href="mailto:${email}" style="color:#2563eb; text-decoration:none;">${email}</a>
              </p>
            </div>
          </div>
        </div>
      `,
      text: `Thank you for contacting VayAccess - Response within 2 hours
VayAccess Support Team <info@vayaccess.com>
${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
to ${name}

Message Received Successfully
Thank you for contacting VayAccess

Dear ${name},
Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.

Your Message Summary
"${message}"

What Happens Next?
Quick Response: Our technical specialists will respond within 2 hours during business hours
Detailed Analysis: We'll review your requirements and provide customized recommendations
Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

Need Immediate Assistance?
+91 720 724 4344  WhatsApp  Email

Visit Our Website
Business Hours: Monday - Friday: 9:00 AM - 6:00 PM IST

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Customer Details: ${name} • ${email}

This is an automated confirmation. Please save this email for your records.`
    };
    
    // 2. Send auto-confirmation to customer
    const customerConfirmationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;"> Message Received Successfully</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for contacting VayAccess</p>
          </div>
          
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">Dear <strong>${name}</strong>,</p>
            
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>
            
            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 15px 0; font-size: 16px;"> Your Message Summary</h3>
              <div style="background: white; padding: 15px; border-radius: 6px;">
                <p style="margin: 0; color: #6b7280; font-style: italic;">"${message.length > 200 ? message.substring(0, 200) + '...' : message}"</p>
              </div>
            </div>
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 25px; margin: 25px 0;">
              <h3 style="color: #059669; margin: 0 0 15px 0; font-size: 18px;"> What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="color: #d97706; margin: 0 0 10px 0; font-size: 16px;"> Need Immediate Assistance?</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <a href="tel:+917207244344" style="background: #2563eb; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> +91 720 724 4344</a>
                <a href="https://wa.me/917207244344" style="background: #10b981; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> WhatsApp</a>
                <a href="mailto:info@vayaccess.com" style="background: #6b7280; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> Email</a>
              </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                 Visit Our Website
              </a>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
              <p><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 15px 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
                This is an automated confirmation. Please save this email for your records.
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
Dear ${name},

Thank you for contacting VayAccess regarding your parking solution requirements.

YOUR MESSAGE:
"${message}"

WHAT HAPPENS NEXT:
• Quick Response: Our technical specialists will respond within 2 hours during business hours
• Detailed Analysis: We'll review your requirements and provide customized recommendations  
• Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

NEED IMMEDIATE ASSISTANCE?
Phone: +91 70137 99462
WhatsApp: +91 70137 99462
Email: info@vayaccess.com

BUSINESS HOURS:
Monday - Friday: 9:00 AM - 6:00 PM IST

Best regards,
VayAccess Support Team

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Website: https://vayaccess.com
      `
    };
    
    // Send both emails
    console.log(' Sending admin notification...');
    await transporter.sendMail(adminNotificationEmail);
    console.log(' Admin notification sent successfully');
    
    console.log(' Sending customer confirmation...');
    await transporter.sendMail(customerConfirmationEmail);
    console.log(' Customer confirmation sent successfully');
    
    res.json({
      success: true,
      message: 'Thank you for your inquiry! We have received your message and sent a confirmation to your email. Our team will respond within 2 hours during business hours.'
    });
    
  } catch (error) {
    console.error(' Contact form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    });
  }
});

// =============================================================================
// AI CALL AGENT API ENDPOINTS
// =============================================================================

// Initialize AI call session
app.post('/api/ai-call/initialize', async (req, res) => {
  try {
    const { customerPhone, customerName } = req.body;
    
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Customer phone number is required'
      });
    }
    
    console.log(` Initializing AI call for ${customerPhone}`);
    const result = await voiceAIService.initializeCall(customerPhone, customerName);
    
    if (result.success) {
      // Notify admin dashboard of new call
      io.emit('new-call-initialized', {
        sessionId: result.sessionId,
        customerPhone,
        customerName,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error initializing AI call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize AI call session'
    });
  }
});

// Process voice input and get AI response
app.post('/api/ai-call/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Message and session ID are required'
      });
    }
    
    console.log(` Processing chat for session ${sessionId}: "${message}"`);
    const result = await voiceAIService.generateAIResponse(message, sessionId);
    
    // Broadcast conversation update to admin dashboard
    io.emit('call-conversation-update', {
      sessionId,
      customerMessage: message,
      aiResponse: result.response,
      timestamp: new Date()
    });
    
    res.json(result);
  } catch (error) {
    console.error(' Error processing AI chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process conversation'
    });
  }
});

// Convert speech to text
app.post('/api/ai-call/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!req.file || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Audio file and session ID are required'
      });
    }
    
    console.log(` Processing speech-to-text for session ${sessionId}`);
    const audioBuffer = require('fs').readFileSync(req.file.path);
    const result = await voiceAIService.speechToText(audioBuffer, sessionId);
    
    // Clean up uploaded file
    require('fs').unlinkSync(req.file.path);
    
    res.json(result);
  } catch (error) {
    console.error(' Error in speech-to-text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process speech'
    });
  }
});

// Convert text to speech
app.post('/api/ai-call/text-to-speech', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Text and session ID are required'
      });
    }
    
    console.log(` Converting text to speech for session ${sessionId}`);
    const result = await voiceAIService.textToSpeech(text, sessionId);
    
    if (result.success) {
      // Send audio file path for client to download
      res.json({
        ...result,
        audioUrl: `/api/ai-call/audio/${result.audioFile}`
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error(' Error in text-to-speech:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate speech'
    });
  }
});

// Serve generated audio files
app.get('/api/ai-call/audio/:filename', (req, res) => {
  try {
    const audioPath = require('path').join(__dirname, 'recordings/tts/', req.params.filename);
    res.sendFile(audioPath);
  } catch (error) {
    console.error(' Error serving audio file:', error);
    res.status(404).json({ success: false, message: 'Audio file not found' });
  }
});

// =============================================================================
// TWILIO VOICE CALL WEBHOOKS (For Real Phone Calls)
// =============================================================================

// Initial TwiML when call is answered
app.post('/api/ai-call/twiml/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(` Call answered for session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Welcome message
    const welcomeMessage = `Hello! This is the AI assistant from VayAccess Parking Solutions. Thank you for your interest in our smart parking systems. How can I help you with your parking solution needs today?`;
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, welcomeMessage);
    
    // Gather customer's voice input
    const gather = twiml.gather({
      speechTimeout: 3,
      speechModel: 'experimental_conversations',
      enhanced: true,
      input: 'speech',
      action: `/api/ai-call/voice-response/${sessionId}`,
      method: 'POST'
    });
    
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please tell me about your parking requirements.');
    
    // If no input, try again
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I did not hear anything. Please speak clearly about your parking needs.');
    
    twiml.redirect(`/api/ai-call/twiml/${sessionId}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error generating TwiML:', error);
    res.status(500).send('Error processing call');
  }
});

// Handle customer voice input and AI response
app.post('/api/ai-call/voice-response/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const customerSpeech = req.body.SpeechResult || '';
    const callSid = req.body.CallSid;
    
    console.log(` Customer said: "${customerSpeech}" in session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    if (!customerSpeech) {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I could not understand what you said. Let me connect you with our human specialist.');
      
      twiml.say({
        voice: 'alice', 
        language: 'en-US'
      }, 'Please call us directly at +91 720 724 4344 for immediate assistance. Thank you!');
      
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }
    
    // Generate AI response using the voice service
    const aiResponse = await voiceAIService.generateAIResponse(customerSpeech, sessionId);
    
    if (aiResponse.success) {
      // Broadcast conversation update to frontend
      io.emit('call-conversation-update', {
        sessionId,
        customerMessage: customerSpeech,
        aiResponse: aiResponse.response,
        timestamp: new Date()
      });
      
      // Say AI response
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, aiResponse.response);
      
      // Continue conversation - check if call should end
      if (aiResponse.response.toLowerCase().includes('goodbye') || 
          aiResponse.response.toLowerCase().includes('thank you for calling') ||
          aiResponse.response.toLowerCase().includes('have a great day')) {
        twiml.hangup();
      } else {
        // Continue gathering input
        const gather = twiml.gather({
          speechTimeout: 4,
          speechModel: 'experimental_conversations',
          enhanced: true,
          input: 'speech',
          action: `/api/ai-call/voice-response/${sessionId}`,
          method: 'POST'
        });
        
        gather.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Is there anything else I can help you with regarding parking solutions?');
        
        // Timeout fallback
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Thank you for calling VayAccess. Have a great day!');
        twiml.hangup();
      }
    } else {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I apologize, but I am having technical difficulties. Please call our office at +91 720 724 4344 for immediate assistance. Thank you!');
      twiml.hangup();
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error processing voice response:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am experiencing technical difficulties. Please call +91 720 724 4344 for support. Goodbye!');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle call status updates from Twilio
app.post('/api/ai-call/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const callStatus = req.body.CallStatus;
    const callSid = req.body.CallSid;
    
    console.log(` Call status update for session ${sessionId}: ${callStatus}`);
    
    // Broadcast status update to frontend
    io.emit('call-status-changed', {
      sessionId,
      callSid,
      status: callStatus,
      timestamp: new Date()
    });
    
    // Handle call completion
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      console.log(` Call ${callSid} ended with status: ${callStatus}`);
      
      // Save call recording and summary
      try {
        await voiceAIService.saveCallRecording(sessionId, callStatus);
      } catch (error) {
        console.error(' Error saving call recording:', error);
      }
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error(' Error handling call status:', error);
    res.status(500).send('Error processing status update');
  }
});

// End call session
app.post('/api/ai-call/end', async (req, res) => {
  try {
    const { sessionId, callDuration } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    console.log(` Ending call session ${sessionId}`);
    const result = await voiceAIService.endCall(sessionId, callDuration);
    
    if (result.success) {
      // Notify admin dashboard of call completion
      io.emit('call-ended', {
        sessionId,
        callData: result.callData,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error ending call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end call session'
    });
  }
});

// Get current call status
app.get('/api/ai-call/status', async (req, res) => {
  try {
    const status = voiceAIService.getCurrentCallStatus();
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error(' Error getting call status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call status'
    });
  }
});

// =============================================================================
// ADMIN DASHBOARD API ENDPOINTS
// =============================================================================

// Get all call recordings (Admin only)
app.get('/api/admin/call-recordings', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    console.log(' Admin fetching call recordings');
    const result = await voiceAIService.getCallRecordings();
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recordings'
    });
  }
});

// Get specific call recording (Admin only)
app.get('/api/admin/call-recording/:sessionId', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const { sessionId } = req.params;
    console.log(` Admin fetching call recording for session ${sessionId}`);
    
    const result = await voiceAIService.getCallRecording(sessionId);
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recording'
    });
  }
});

// Admin dashboard statistics
app.get('/api/admin/call-statistics', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    const stats = {
      totalCalls: recordings.recordings.length,
      todayCalls: recordings.recordings.filter(call => {
        const today = new Date().toDateString();
        return new Date(call.startTime).toDateString() === today;
      }).length,
      averageDuration: recordings.recordings.reduce((acc, call) => acc + (call.duration || 0), 0) / recordings.recordings.length || 0,
      callsThisWeek: recordings.recordings.filter(call => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(call.startTime) >= weekAgo;
      }).length
    };

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error(' Error generating call statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate statistics'
    });
  }
});

// Send AI call recordings to parking system admin dashboard
app.post('/api/admin/sync-call-recordings', async (req, res) => {
  try {
    console.log(' Syncing AI call recordings with parking system admin dashboard...');
    
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    // Send recordings to parking system admin dashboard
    const parkingSystemUrl = 'http://localhost:8080';
    
    try {
      const axios = require('axios');
      
      const syncResponse = await axios.post(`${parkingSystemUrl}/api/admin/ai-call-recordings`, {
        recordings: recordings.recordings,
        source: 'vayaccess-ai-agent',
        syncTime: new Date().toISOString()
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(' Successfully synced AI call recordings to parking system');
      
      res.json({
        success: true,
        message: 'AI call recordings synced successfully',
        recordingsSynced: recordings.recordings.length,
        parkingSystemResponse: syncResponse.data
      });

    } catch (syncError) {
      console.log(' Parking system not available for sync, continuing with local storage');
      
      res.json({
        success: true,
        message: 'Recordings available locally, parking system sync will retry automatically',
        recordingsSynced: recordings.recordings.length,
        localRecordings: recordings.recordings
      });
    }

  } catch (error) {
    console.error(' Error syncing call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync call recordings'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test email endpoint (for development)
app.post('/api/test-email', async (req, res) => {
  try {
    const testEmail = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: 'VayAccess Email Service Test',
      html: '<h1>Email service is working!</h1><p>This is a test email from your VayAccess backend.</p>'
    };
    
    await transporter.sendMail(testEmail);
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Newsletter subscription endpoint (MongoDB-first, email optional)
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email, source = 'website' } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    // Persist to MongoDB if available; otherwise, skip persistence gracefully
    try {
      if (mongoDb) {
        const normalized = String(email).trim().toLowerCase();
        const now = new Date();
        const col = mongoDb.collection('subscribers');
        const existing = await col.findOne({ email: normalized });
        if (existing && existing.active !== false) {
          return res.json({ success: true, message: 'You are already subscribed. You will receive live news daily from VayAccess.' });
        }

        await col.updateOne(
          { email: normalized },
          {
            $setOnInsert: { createdAt: now, prefs: { products: true, solutions: true, marketing: true } },
            $set: { email: normalized, source, active: true, updatedAt: now },
          },
          { upsert: true }
        );
        // Ensure default prefs exist on existing records
        await col.updateOne(
          { email: normalized, $or: [ { prefs: { $exists: false } }, { prefs: null } ] },
          { $set: { 'prefs.products': true, 'prefs.solutions': true, 'prefs.marketing': true } }
        );
      } else {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
      }
    } catch (persistErr) {
      console.warn('Failed to persist subscriber to MongoDB (continuing):', persistErr?.message || persistErr);
    }

    // Optional welcome email; do not fail if SMTP is missing
    try {
      await emailHelper.sendCategorizedEmail({
        category: 'newsletter_welcome',
        to: String(email).trim().toLowerCase(),
        subject: 'Welcome to VayAccess Newsletter',
        html: withFooter(`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                 <h2 style="margin:0 0 12px 0;">Welcome to VayAccess Newsletter</h2>
                 <p style="color:#374151;line-height:1.6;">You will receive product news, articles, and live updates.</p>
                 <p style="margin-top:16px;"><a href="https://vayaccess.com" style="color:#2563eb;text-decoration:none;">Visit website</a></p>
               </div>`),
        text: 'Welcome to VayAccess Newsletter\nYou will receive product news, articles, and live updates.',
        meta: { source },
        headers: buildUnsubscribeHeaders(email),
        dedupeKey: `welcome:${String(email).trim().toLowerCase()}`
      });
    } catch (emailErr) {
      console.warn('Welcome email failed (continuing):', emailErr?.message || emailErr);
    }

    // Conditionally send present products/solutions digest immediately
    try {
      if (process.env.SEND_DIGEST_ON_SUBSCRIBE === 'true') {
        const snapshot = getContentSnapshot();
        await sendDigestToEmail(String(email).trim().toLowerCase(), snapshot);
      }
    } catch (e) {
      console.warn('Failed to send initial digest (continuing):', e?.message || e);
    }

    // Optional: send a marketing promo immediately on subscribe
    try {
      if ((process.env.SEND_MARKETING_ON_SUBSCRIBE || 'true').toLowerCase() !== 'false') {
        await emailHelper.sendCategorizedEmail({
          category: 'marketing',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Transform Your Parking with Smart Access',
          html: withFooter(`<div style='font-family:Arial,sans-serif;max-width:700px;margin:0 auto;'>
  <h2 style='margin:0 0 10px 0;color:#111827;'>Welcome to VayAccess</h2>
  <p style='color:#374151;line-height:1.6;margin:0 0 10px 0;'>Explore ANPR vehicle access, robust barrier gates, turnstiles, and real-time management.</p>
  <p style='margin-top:12px;'>
    <a href='https://vayaccess.com/products' style='background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;'>Explore Products</a>
    <span style='margin-left:12px;'><a href='https://vayaccess.com/solutions' style='color:#2563eb;text-decoration:none;'>View Solutions</a></span>
  </p>
</div>`),
          text: 'Explore VayAccess products and solutions: https://vayaccess.com',
          headers: buildUnsubscribeHeaders(email),
          dedupeKey: `marketing-on-subscribe:${String(email).trim().toLowerCase()}`,
          meta: { source, onSubscribe: true },
        });
      }
    } catch (marketingErr) {
      console.warn('Marketing email on subscribe failed (continuing):', marketingErr?.message || marketingErr);
    }

    return res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    console.error('Subscribe failed:', error);
    return res.status(500).json({ success: false, message: 'Subscription failed' });
  }
});

// Simple secured endpoint to send an update email to a recipient
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: to, subject, and html or text' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent.' });
  } catch (error) {
    console.error('Send update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// Broadcast to all subscribers (MongoDB)
app.post('/api/newsletter/broadcast', async (req, res) => {
  try {
    // security
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) {
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    const { subject, html, text, dryRun = false, onlyActive = true, category = 'marketing' } = req.body || {};
    if (!subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: subject and html or text' });
    }

    // fetch subscribers from MongoDB
    const filter = onlyActive ? { active: { $ne: false } } : {};
    const subsCursor = mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray())
      .map(d => d.email)
      .filter(e => /.+@.+\..+/.test(e));

    if (emails.length === 0) {
      return res.json({ success: true, message: 'No subscribers to send', count: 0, emails: [] });
    }

    if (dryRun) {
      return res.json({ success: true, message: 'Dry run: would send to these emails', count: emails.length, emails });
    }

    // send in sequence (simple). For large lists, batch/queue.
    let ok = 0, fail = 0;
    for (const to of emails) {
      try {
        await emailHelper.sendCategorizedEmail({
          category,
          to,
          subject,
          html: withFooter(html || ''),
          text: text || undefined,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `broadcast:${category}:${subject}:${String(to).toLowerCase()}`,
          meta: { broadcast: true },
        });
        ok++;
      } catch (e) {
        fail++;
      }
    }

    return res.json({ success: true, message: 'Broadcast completed', category, sent: ok, failed: fail, count: emails.length });
  } catch (error) {
    console.error('Broadcast failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to broadcast' });
  }
});

// Push token registration (MongoDB) — dev-safe fallback
app.post('/api/push/register', async (req, res) => {
  try {
    const { token, email } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'Missing token' });

    // If MongoDB is unavailable and dev fallback enabled, no-op to avoid UX break
    if (!mongoDb) {
      if (process.env.ALLOW_DEV_NO_DB === 'true') {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
        return res.json({ success: true, message: 'Token accepted (no DB in dev)' });
      }
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    await mongoDb.collection('pushTokens').updateOne(
      { token },
      {
        $set: {
          token,
          email: email || null,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Token registered' });
  } catch (e) {
    console.error('Register push token failed:', e);
    return res.status(500).json({ success: false, message: 'Failed to register token' });
  }
});

// --- Helpers for FCM HTTP v1 (web push) ---
const { google } = require('googleapis');
const fetch = require('node-fetch');
let FB_PROJECT_ID = process.env.FB_PROJECT_ID;
try {
  if (!FB_PROJECT_ID) {
    const svc = require('./service-account.json');
    FB_PROJECT_ID = svc.project_id;
  }
} catch (_) {}

async function getFcmAccessToken() {
  const key = require('./service-account.json');
  const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

async function sendFcmMessage(token, title, body, link) {
  if (!FB_PROJECT_ID) throw new Error('Missing FB_PROJECT_ID or service-account project_id');
  const accessToken = await getFcmAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${FB_PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token,
      notification: { title, body },
      webpush: {
        fcm_options: { link: link || '/' },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM error: ${txt}`);
  }
  return res.json();
}

// Publish update: save to MongoDB and auto-send email + push
app.post('/api/updates/publish', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { title, body, link = '/', previewOnly = false } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });

    // Save announcement to MongoDB
    const insertRes = await mongoDb.collection('announcements').insertOne({
      title,
      body,
      link,
      createdAt: new Date(),
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    if (previewOnly) {
      return res.json({ success: true, message: 'Preview only', id: insertRes.insertedId, emailsCount: emails.length, tokensCount: tokens.length });
    }

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    return res.json({ success: true, id: insertRes.insertedId, emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Publish update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to publish update' });
  }
});

// Auto-publish endpoint: idempotent broadcast by version (no separate admin UI needed)
app.post('/api/updates/auto-publish', async (req, res) => {
    console.log('Received auto-publish request:', req.body); // Log the request body
  try {
    // Optional security with token
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { version, title, body, link = '/' } = req.body || {};
    if (!version || !title || !body) return res.status(400).json({ success: false, message: 'Missing version, title or body' });

    const versionId = String(version).trim();

    // Skip if already sent for this version
    const already = await mongoDb.collection('announcements_sent').findOne({ version: versionId });
    if (already) {
      return res.json({ success: true, message: 'Already sent for this version' });
    }

    // Save announcement entry (optional)
    const annInsert = await mongoDb.collection('announcements').insertOne({
      version: versionId,
      title,
      body,
      link,
      createdAt: new Date(),
      auto: true,
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    // Mark version as sent
    await mongoDb.collection('announcements_sent').updateOne(
      { version: versionId },
      {
        $set: {
          version: versionId,
          title,
          body,
          link,
          sentAt: new Date(),
          announcementId: annInsert.insertedId,
        }
      },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Auto-publish sent', emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Auto-publish failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to auto-publish' });
  }
});





// Admin: send a single update email (manual)
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing to/subject/body' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    console.error('Manual send failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});


// --- Hourly Digest Scheduler ---
const ENABLE_HOURLY_DIGEST = (process.env.ENABLE_HOURLY_DIGEST || 'false').toLowerCase() === 'true';
const DIGEST_CATEGORY = process.env.DIGEST_CATEGORY || 'content_digest';
const DIGEST_EMAIL = (process.env.DIGEST_EMAIL || 'true').toLowerCase() === 'true';
const DIGEST_PUSH = (process.env.DIGEST_PUSH || 'true').toLowerCase() === 'true';
const DIGEST_DEDUPE_WINDOW_MIN = parseInt(process.env.DIGEST_DEDUPE_WINDOW_MINUTES || '60', 10);

async function sendHourlyDigestOnce() {
  try {
    if (!mongoDb) {
      console.warn('[digest] Skipped: MongoDB not initialized');
      return;
    }

    // Snapshot current site content
    const snapshot = getContentSnapshot();
    // Rotate templates by hour to guarantee variation across sends
    const tpl = pickRotatingTemplate();

    // Dedupe: prevent re-sending same template within the window (optional)
    const now = new Date();
    const since = new Date(now.getTime() - DIGEST_DEDUPE_WINDOW_MIN * 60 * 1000);
    const recentKey = `digest:${tpl.key}:${snapshot.hash}`;
    const alreadySent = await mongoDb.collection('email_events').findOne({
      dedupeKey: { $regex: `^${recentKey}:` }, // per recipient entry saved below
      createdAt: { $gte: since },
      result: 'sent',
    });
    if (alreadySent) {
      console.log('[digest] Recently sent this template+hash. Skipping to avoid repetition.');
 
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const voiceAIService = require('./services/voiceAIService');
const asteriskService = require('./services/asteriskService');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// MongoDB Atlas (replaces Firestore for subscribers/tokens)
const { MongoClient } = require('mongodb');
let mongoClient = null;
let mongoDb = null;
(async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'vay_parking_system';
  if (!uri) {
    console.warn('MongoDB not initialized: missing MONGODB_URI. Newsletter persistence will be disabled.');
    return;
  }

  // Attempt robust connection strategy for Windows/OpenSSL TLS issues
  let mongoReconnectTimer = null;

  function setupMongoAutoReconnect() {
    if (!mongoClient) return;
    const events = ['topologyClosed', 'serverClosed', 'serverHeartbeatFailed'];
    events.forEach((ev) => {
      try { mongoClient.removeAllListeners(ev); } catch {}
      mongoClient.on(ev, (info) => {
        if (mongoReconnectTimer) return;
        const msg = info && info.message ? info.message : '';
        console.warn(`MongoDB ${ev} - scheduling reconnect in 5s`, msg);
        mongoReconnectTimer = setTimeout(async () => {
          mongoReconnectTimer = null;
          let connected = await tryConnect('reconnect', { ...baseOptions });
          if (!connected) connected = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
          if (!connected) {
            connected = await tryConnect('reconnect + insecure', {
              ...baseOptions,
              tlsAllowInvalidCertificates: true,
              tlsAllowInvalidHostnames: true,
              family: 4,
            });
          }
          if (!connected) {
            console.warn('MongoDB reconnection failed; retrying in 10s');
            mongoReconnectTimer = setTimeout(async () => {
              mongoReconnectTimer = null;
              let ok = await tryConnect('reconnect', { ...baseOptions });
              if (!ok) ok = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
              if (!ok) {
                await tryConnect('reconnect + insecure', {
                  ...baseOptions,
                  tlsAllowInvalidCertificates: true,
                  tlsAllowInvalidHostnames: true,
                  family: 4,
                });
              }
            }, 10000);
          }
        }, 5000);
      });
    });
  }

  async function tryConnect(optionsLabel, options) {
    try {
      // Close previous client to avoid socket leaks
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
      mongoClient = new MongoClient(uri, options);
      await mongoClient.connect();
      mongoDb = mongoClient.db(dbName);
      console.log(`Connected to MongoDB Atlas database: ${dbName} (${optionsLabel})`);
      setupMongoAutoReconnect();
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn(`MongoDB connect failed [${optionsLabel}]:`, msg);
      return false;
    }
  }

  const baseOptions = {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
    tls: true,
    // Note: keepAlive options are not supported by the MongoDB Node.js driver v5.
    // We rely on the driver's internal keep-alive and our event-based reconnection.
  };

  const insecureEnv = process.env.MONGODB_TLS_INSECURE === 'true';

  // 1) If insecure explicitly requested via env, use it directly
  if (insecureEnv) {
    const ok = await tryConnect('tls+insecure (env)', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
    if (!ok) {
      console.warn('MongoDB initialization failed under insecure mode. Newsletter persistence will be disabled.');
    } else {
      // Ensure indexes for deduplication and idempotency
      try {
        await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
        await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
        await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
        console.log('MongoDB indexes ensured');
      } catch (idxErr) {
        console.warn('MongoDB index ensure failed:', idxErr.message);
      }
    }
    return;
  }

  // 2) Try strict TLS first
  let connected = await tryConnect('tls strict', { ...baseOptions });

  // 3) If fails, try strict TLS forcing IPv4 (DNS/IPv6 issues)
  if (!connected) {
    connected = await tryConnect('tls strict + IPv4', { ...baseOptions, family: 4 });
  }

  // 4) If still fails with SSL-related error, try insecure TLS as fallback
  if (!connected) {
    connected = await tryConnect('tls+insecure fallback', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
  }

  if (!connected) {
    console.warn('MongoDB initialization failed after all attempts. Newsletter persistence will be disabled.');
    return;
  }

  // Ensure indexes for deduplication and idempotency
  try {
    await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
    await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
    console.log('MongoDB indexes ensured');
  } catch (idxErr) {
    console.warn('MongoDB index ensure failed:', idxErr.message);
  }
})();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

// Initialize Socket.IO for real-time call communication
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
    credentials: true
  }
});

// Configure multer for audio file uploads
const upload = multer({
  dest: 'temp/', // temporary directory for uploaded audio files
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
  credentials: true
}));
app.use(express.json());

// Serve assets with stable URLs for emails and previews
app.use('/assets', express.static(path.resolve(__dirname, '../src/assets')));

// Serve admin interface (protected by admin token in the HTML)
app.get('/admin/newsletter', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin-newsletter.html'));
});

// Demo routes (FREE - no Twilio needed)
const demoRoutes = require('./routes/demo');
app.use('/api', demoRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', mongo: !!mongoDb });
});

// One-click unsubscribe (for List-Unsubscribe-Post)
app.post('/api/newsletter/unsubscribe', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const email = (req.body?.email || req.query?.e || '').toString().toLowerCase();
    const token = (req.body?.token || req.query?.t || '').toString();
    if (!email || token !== signUnsubToken(email)) return res.status(400).send('Invalid request');
    if (mongoDb) {
      await mongoDb.collection('subscribers').updateOne({ email }, { $set: { active: false, updatedAt: new Date() } });
    }
    // RFC-compliant one-click: respond 200 with empty body
    return res.status(200).send('');
  } catch (e) {
    return res.status(500).send('');
  }
});

// Subscribe endpoint (name, email, frequency)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { name, email, frequency } = req.body || {};
    const n = String(name || '').trim();
    const em = String(email || '').trim().toLowerCase();
    const f = String(frequency || 'weekly').toLowerCase();
    if (!/.+@.+\..+/.test(em)) return res.status(400).json({ success:false, message:'Invalid email' });
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });

    const now = new Date();
    await mongoDb.collection('subscribers').updateOne(
      { email: em },
      { $setOnInsert: { createdAt: now, subscribedAt: now }, $set: { name: n, frequency: freq, active: true, updatedAt: now } },
      { upsert: true }
    );

    // Send welcome email
    const headers = buildUnsubscribeHeaders(em);
    const firstName = n ? n.split(' ')[0] : 'there';
    const html = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p>Hi ${firstName},</p>
        <p>Thanks for subscribing to VayAccess updates (${freq}). You'll receive ${freq} digests with our latest articles.</p>
      </div>
    `);
    await emailHelper.sendCategorizedEmail({
      category: 'newsletter_welcome',
      to: em,
      subject: 'Welcome to VayAccess Updates',
      html,
      headers
    });

    return res.json({ success:true, message:'Subscribed' });
  } catch (e) {
    const msg = e?.code === 11000 ? 'Already subscribed' : (e?.message || 'Server error');
    return res.status(500).json({ success:false, message: msg });
  }
});

// Preferences update endpoint
app.post('/api/newsletter/update-preferences', async (req, res) => {
  try {
    const { email, token, frequency } = req.body || {};
    const em = String(email || '').toLowerCase();
    if (!em || token !== signUnsubToken(em)) return res.status(400).json({ success:false, message:'Invalid token' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const f = String(frequency || '').toLowerCase();
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    await mongoDb.collection('subscribers').updateOne({ email: em }, { $set: { frequency: freq, updatedAt: new Date() } });
    return res.json({ success:true });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Manual trigger for individual email distribution (for testing)
app.post('/api/newsletter/distribute-individual', async (req, res) => {
  try {
    const result = await distributeIndividualEmails();
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Server error' });
  }
});

// Articles: create & list
app.post('/api/articles', async (req, res) => {
  try {
    const { title, summary, content, tags } = req.body || {};
    if (!title || !summary) return res.status(400).json({ success:false, message:'Missing title/summary' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const doc = { title: String(title), summary: String(summary), content: String(content||''), tags: Array.isArray(tags)? tags.map(String):[], createdAt: new Date() };
    const result = await mongoDb.collection('articles').insertOne(doc);
    return res.json({ success:true, id: result.insertedId, article: doc });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

app.get('/api/articles', async (req, res) => {
  try {
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const { tag, limit } = req.query;
    const q = tag ? { tags: String(tag) } : {};
    const lim = Math.min(Number(limit)||20, 100);
    const items = await mongoDb.collection('articles').find(q).sort({ createdAt:-1 }).limit(lim).toArray();
    return res.json({ success:true, items });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Connect to Asterisk AMI on server start (optional via ENABLE_AMI)
if (process.env.ENABLE_AMI === 'true') {
  asteriskService.connect().catch(err => {
    console.error(' Failed to connect to Asterisk AMI:', err);
  });
} else {
  console.log(' Skipping AMI connection (ENABLE_AMI not set to true)');
}

// API endpoint to initiate call via Asterisk AMI
app.post('/api/call', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    if (!asteriskService.isAlive()) {
      await asteriskService.connect();
    }

    const result = await asteriskService.originateCall(number);

    if (result.success) {
      // Emit call status to frontend clients
      io.emit('call-status-changed', {
        sessionId: result.sessionId,
        phoneNumber: number,
        status: 'initiated',
        timestamp: new Date()
      });
    }

    res.json(result);
  } catch (error) {
    console.error(' Error originating call:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

// Listen for call-originated event from asteriskService and broadcast
asteriskService.on('call-originated', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'ringing',
    timestamp: new Date()
  });
});

// Socket.IO connection handling for real-time call features
io.on('connection', (socket) => {
  console.log(` Client connected: ${socket.id}`);

  socket.on('join-call-room', (sessionId) => {
    socket.join(`call-${sessionId}`);
    console.log(` Client joined call room: call-${sessionId}`);
  });

  socket.on('call-status-update', (data) => {
    io.to(`call-${data.sessionId}`).emit('call-status-changed', data);
  });

  socket.on('disconnect', () => {
    console.log(` Client disconnected: ${socket.id}`);
  });
});

// Email configuration using SMTP (Gmail/Outlook/Custom SMTP)
let transporter;
let smtpReady = false;
let smtpError = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false otherwise
    auth: {
      user: process.env.SMTP_USER, // info@vayaccess.com
      pass: process.env.SMTP_PASS  // App-specific password
    }
  });

  // Verify email configuration
  transporter.verify((error) => {
    if (error) {
      smtpReady = false;
      smtpError = String(error?.message || error);
      console.error(' Email configuration error:', error);
    } else {
      smtpReady = true;
      smtpError = null;
      console.log(' Email server is ready to send messages');
    }
  });
} else {
  // Fallback to JSON transport: no actual SMTP connection; prevents runtime EAUTH errors
  transporter = nodemailer.createTransport({ jsonTransport: true });
  smtpReady = false;
  smtpError = 'SMTP_USER/SMTP_PASS missing (jsonTransport)';
  console.log(' Email disabled: missing SMTP_USER/SMTP_PASS (using jsonTransport)');
}

// SMTP status endpoint
app.get('/api/admin/smtp-status', (req, res) => {
  res.json({ ready: smtpReady, error: smtpError, user: process.env.SMTP_USER || null, host: process.env.SMTP_HOST || 'smtp.gmail.com' });
});

// Email helper (categorized sending with flags + tracking)
const createEmailHelper = require('./emailHelper');
const emailHelper = createEmailHelper(transporter, () => mongoDb);

// Minimal FCM sender stub to prevent runtime reference errors when FCM is not configured
// Replace with real Firebase Admin logic if needed
async function sendFcmMessage(token, title, body, clickPath = '/') {
  try {
    console.log('[push] sendFcmMessage stub:', { token: String(token).slice(0, 12) + '…', title, body, clickPath });
    // Implement real push notification here if Firebase Admin SDK is configured
    return { success: true };
  } catch (e) {
    console.warn('[push] Failed to send push message:', e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}

// --- Site content digest and auto-news ---
const CONTENT_FILES = [
  path.resolve(__dirname, '../src/components/Products.tsx'),
  path.resolve(__dirname, '../src/components/Solutions.tsx'),
];

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function parseProductNames(content) {
  // Extract product names from Products.tsx: name: "..."
  const names = new Set();
  const nameRegex = /name:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = nameRegex.exec(content))) {
    const name = m[1].trim();
    if (name && !/quote$/i.test(name)) names.add(name);
  }
  return Array.from(names);
}

function parseSolutionTitles(content) {
  // Extract titles from Solutions.tsx: title: "..."
  const titles = new Set();
  const titleRegex = /title:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = titleRegex.exec(content))) {
    const title = m[1].trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

function getContentSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductNames(productsTsx).slice(0, 20);
  const solutions = parseSolutionTitles(solutionsTsx).slice(0, 30);
  const combined = `${products.join('\n')}\n---\n${solutions.join('\n')}`;
  const hash = sha256(combined);
  return { hash, products, solutions };
}

function buildDigestHtml(snapshot) {
  const { products, solutions } = snapshot;
  
  // Get detailed product and solution information
  const articlesSnapshot = getArticlesSnapshot();
  const detailedProducts = articlesSnapshot.products.slice(0, 3); // Show top 3 products
  const detailedSolutions = articlesSnapshot.solutions.slice(0, 3); // Show top 3 solutions
  
  // Build product cards with images
  const productCards = detailedProducts.map(product => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      ${product.image ? `<img src="${product.image}" alt="${product.title}" style="width:100%;max-width:300px;height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${product.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${product.description || ''}</p>
    </div>
  `).join('');
  
  // Build solution cards
  const solutionCards = detailedSolutions.map(solution => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${solution.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${solution.description || ''}</p>
    </div>
  `).join('');
  
  // Add parking services section
  const parkingServices = `
    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:20px 0;">
      <h3 style="margin:0 0 12px 0;color:#111827;font-size:18px;font-weight:600;"> Our Parking Services</h3>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
        <li><strong>Smart Parking Management:</strong> Complete ticketless and ticket-based parking solutions</li>
        <li><strong>ANPR Technology:</strong> Automatic number plate recognition for seamless access</li>
        <li><strong>Access Control Systems:</strong> Advanced barrier gates and turnstiles</li>
        <li><strong>Parking Guidance:</strong> Real-time space availability and navigation</li>
        <li><strong>Mobile Integration:</strong> User-friendly mobile apps for parking management</li>
        <li><strong>Analytics & Reporting:</strong> Comprehensive parking analytics and insights</li>
      </ul>
    </div>
  `;
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:20px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="margin:0 0 8px 0;color:#111827;font-size:24px;font-weight:700;"> VayAccess Latest Updates</h2>
        <p style="color:#6b7280;line-height:1.6;margin:0;">Discover our cutting-edge parking solutions and smart access control systems</p>
      </div>
      
      ${productCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Featured Products</h3>
          ${productCards}
        </div>
      ` : ''}
      
      ${solutionCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Smart Solutions</h3>
          ${solutionCards}
        </div>
      ` : ''}
      
      ${parkingServices}
      
      <div style="text-align:center;margin-top:24px;padding:20px;background:#2563eb;border-radius:12px;">
        <h3 style="margin:0 0 12px 0;color:#ffffff;font-size:18px;">Ready to Transform Your Parking?</h3>
        <p style="margin:0 0 16px 0;color:#dbeafe;">Contact us today for a free consultation and demo</p>
        <a href="https://vayaccess.com/contact" style="display:inline-block;background:#ffffff;color:#2563eb;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Get Started Now</a>
      </div>
      
      <div style="text-align:center;margin-top:20px;">
        <p style="margin:0;color:#6b7280;font-size:14px;">
          <a href="https://vayaccess.com/products" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Products</a> • 
          <a href="https://vayaccess.com/solutions" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Solutions</a> • 
          <a href="https://vayaccess.com/services" style="color:#2563eb;text-decoration:none;margin:0 8px;">Our Services</a>
        </p>
      </div>
    </div>
  `;
}

function buildDigestText(snapshot) {
  const { products, solutions } = snapshot;
  return [
    'VayAccess Latest Updates',
    '',
    'Products:',
    ...products.map(p => `- ${p}`),
    '',
    'Solutions:',
    ...solutions.map(s => `- ${s}`),
    '',
    'View all: https://vayaccess.com'
  ].join('\n');
}

// --- Enhanced digest templates with rich content ---
const DIGEST_TEMPLATES = [
  {
    key: 'products_spotlight',
    subject: () => ' VayAccess Product Spotlight - Smart Parking Solutions',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Featured Products</h1>
          <p style="margin:0;opacity:0.9;">Discover our latest smart parking technology</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'solutions_focus',
    subject: () => ' VayAccess Solutions Update - Transform Your Parking',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#059669,#047857);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Smart Solutions</h1>
          <p style="margin:0;opacity:0.9;">Complete parking management solutions for modern facilities</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'weekly_roundup',
    subject: () => ' VayAccess Weekly Roundup - Products, Solutions & Services',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Weekly Update</h1>
          <p style="margin:0;opacity:0.9;">Your complete guide to VayAccess innovations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'technology_insights',
    subject: () => ' VayAccess Tech Insights - ANPR, IoT & Smart Access',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Technology Focus</h1>
          <p style="margin:0;opacity:0.9;">Advanced parking technology and smart city solutions</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'customer_success',
    subject: () => ' VayAccess Success Stories - Real Results, Real Impact',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#ea580c,#c2410c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Success Stories</h1>
          <p style="margin:0;opacity:0.9;">See how our solutions transform parking operations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
];

function pickRotatingTemplate() {
  const hour = new Date().getHours();
  return DIGEST_TEMPLATES[hour % DIGEST_TEMPLATES.length];
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
// Use admin token for signing unsubscribe tokens (fallback to legacy secret if present)
const NEWSLETTER_SECRET = process.env.NEWSLETTER_ADMIN_TOKEN || process.env.NEWSLETTER_SECRET || 'change-me';

function signUnsubToken(email) {
  return crypto.createHmac('sha256', NEWSLETTER_SECRET).update(String(email).toLowerCase()).digest('hex');
}

function buildUnsubscribeHeaders(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  const t = signUnsubToken(email);
  const httpUrl = `${PUBLIC_BASE_URL}/api/newsletter/unsubscribe?e=${e}&t=${t}`;
  const mailto = `mailto:${process.env.SMTP_USER || 'no-reply@vayaccess.com'}?subject=unsubscribe`;
  const base = {
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'List-Id': 'VayAccess Newsletter <newsletter.vayaccess.com>',
  };
  if (process.env.ENABLE_MANAGE_LINK === 'true') {
    return {
      ...base,
      'List-Unsubscribe': `<${httpUrl}>, <${mailto}>`,
      'X-List-Manage': `${PUBLIC_BASE_URL}/newsletter/manage`,
    };
  }
  return {
    ...base,
    'List-Unsubscribe': `<${mailto}>`,
  };
}

function withFooter(html) {
  const manageUrl = `${PUBLIC_BASE_URL}/newsletter/manage`;
  const manageLine = process.env.ENABLE_MANAGE_LINK === 'true'
    ? `<br/>Manage: <a style="color:#2563eb;" href="${manageUrl}">subscription portal</a>`
    : '';
  return `${html}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
    <p style="font-size:12px;color:#6b7280;line-height:1.6;">
      This email was sent by VayAccess. Update your preferences or unsubscribe anytime.
      ${manageLine}
    </p>`;
}

async function sendDigestToEmail(to, snapshot) {
  try {
    const html = withFooter(buildDigestHtml(snapshot));
    const text = buildDigestText(snapshot);
    await emailHelper.sendCategorizedEmail({
      category: 'content_digest',
      to,
      subject: 'VayAccess: Products & Solutions Digest',
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `digest:${snapshot.hash}:${String(to).toLowerCase()}`,
      meta: { type: 'digest' },
    });
  } catch (e) {
    console.warn('Digest email failed:', e?.message || e);
  }
}

async function broadcastDigest(snapshot, opts = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const { products, solutions } = getArticlesSnapshot();
  const filter = { active: { $ne: false } };
  const subs = await mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } }).toArray();
  const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

  let stats = { products: { sent: 0, failed: 0 }, solutions: { sent: 0, failed: 0 } };

  // Products broadcast (categorized + tracked)
  if (products?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_products',
        to,
        subject: 'VayAccess: New Products (with images)',
        html: buildArticleDigestHtml(products),
        text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: products.length },
        dedupeKey: `broadcast-products:${to}`,
      });
      if (res?.success) stats.products.sent++; else if (!res?.skipped) stats.products.failed++;
    }
  }

  // Solutions broadcast (categorized + tracked)
  if (solutions?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_solutions',
        to,
        subject: 'VayAccess: Latest Solutions',
        html: buildArticleDigestHtml(solutions),
        text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: solutions.length },
        dedupeKey: `broadcast-solutions:${to}`,
      });
      if (res?.success) stats.solutions.sent++; else if (!res?.skipped) stats.solutions.failed++;
    }
  }

  // Optional push notification title/body
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token, 'VayAccess Updates', 'See the latest products and solutions', '/products'); } catch (_) {}
    }
  } catch (_) {}

  return { success: true, products: stats.products, solutions: stats.solutions, recipients: emails.length };
}

async function checkAndBroadcastContentUpdates() {
  try {
    if (!mongoDb) return;
    // Use full articles snapshot (title, description, image) for change detection
    const { hash } = getArticlesSnapshot();
    const stateCol = mongoDb.collection('site_content_state');
    const id = 'articles_digest_v1';
    const existing = await stateCol.findOne({ _id: id });
    if (!existing || existing.hash !== hash) {
      await stateCol.updateOne(
        { _id: id },
        { $set: { _id: id, hash, updatedAt: new Date() } },
        { upsert: true }
      );
      // Broadcast update with latest snapshot
      await broadcastDigest(getArticlesSnapshot());
      console.log('Auto-news: broadcasted new articles digest');
    }
  } catch (e) {
    console.warn('Auto-news check failed:', e?.message || e);
  }
}

// Articles generator for products & solutions (with images, no links)
// Uses PUBLIC_BASE_URL defined earlier

function toAssetUrl(relPath) {
  if (!relPath) return null;
  try {
    const file = path.basename(relPath);
    return `${PUBLIC_BASE_URL}/assets/${file}`;
  } catch (_) { return null; }
}

function parseImportsMap(content) {
  // import varName from "../assets/file.jpg";
  const map = {};
  const importRe = /import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g;
  let m;
  while ((m = importRe.exec(content))) {
    map[m[1]] = m[2];
  }
  return map;
}

function parseProductsDetailed(content) {
  const imports = parseImportsMap(content);
  // Extract the products array block
  const arrMatch = content.match(/const\s+products\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return [];
  const arrBody = arrMatch[1];
  const items = [];
  // Split by object boundaries (rough but works with our formatting)
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const name = (obj.match(/name:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    // capture description until the next field or end of object (robust to line breaks and trailing commas)
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    const imageVar = (obj.match(/image:\s*(\w+)/) || [])[1];
    if (name) {
      const rel = imports[imageVar];
      items.push({
        type: 'product',
        title: name,
        description: (desc || '').trim(),
        image: toAssetUrl(rel),
      });
    }
  }
  return items;
}

function parseSolutionsDetailed(content) {
  // Solutions currently don't have image assets; add a generic illustrative image
  const placeholder = `${PUBLIC_BASE_URL}/assets/parking-system-architecture.jpg`;
  const items = [];
  const arrMatch = content.match(/const\s+solutions\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return items;
  const arrBody = arrMatch[1];
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const title = (obj.match(/title:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    if (title) items.push({ type: 'solution', title, description: (desc || '').trim(), image: placeholder });
  }
  return items;
}

function getArticlesSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductsDetailed(productsTsx).slice(0, 20);
  const solutions = parseSolutionsDetailed(solutionsTsx).slice(0, 30);
  const articles = [...products, ...solutions];
  const hash = sha256(JSON.stringify(articles).slice(0, 2000));
  return { hash, articles, products, solutions };
}

function buildArticleDigestHtml(articles) {
  // generic combined template
  const card = (a) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`;
  const list = articles.map(card).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Products & Solutions</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 12px 0;">Latest offerings for our subscribers. This email contains full content without external links.</p>
      ${list}
    </div>`;
}

function buildProductsDigestHtml(products) {
  const list = products.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Product Highlights</h2>
      ${list || '<p>No products today.</p>'}
    </div>`;
}

function buildSolutionsDigestHtml(solutions) {
  const list = solutions.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Solutions Spotlight</h2>
      ${list || '<p>No solutions today.</p>'}
    </div>`;
}

// Build individual product email HTML
function buildProductEmailHtml(product) {
  const imageUrl = product.image ? `https://vayaccess.com${product.image}` : 'https://vayaccess.com/assets/default-product.jpg';
  
  // Enhanced product descriptions based on title
  const getEnhancedDescription = (title, originalDesc) => {
    const descriptions = {
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Transform your parking operations with our cutting-edge ticketless parking management system. This revolutionary solution eliminates the need for physical tickets, creating a seamless experience for both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our system leverages advanced ANPR (Automatic Number Plate Recognition) technology combined with mobile app integration to provide a completely digital parking experience. Users can find, reserve, and pay for parking spaces directly through their smartphones.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'The system optimizes space usage while providing real-time analytics and reporting capabilities for facility managers.'}
        </p>
      `,
      'Ticket Based Parking Management': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our traditional ticket-based parking management system provides reliable and proven parking control for high-traffic facilities. Perfect for malls, airports, and commercial complexes requiring robust entry and exit management.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing at entry points, validation systems, and secure payment processing. Built with durability and reliability in mind, it handles thousands of transactions daily.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Streamlined ticket management with comprehensive reporting and analytics for optimal facility management.'}
        </p>
      `,
      'VAY Parking Guidance Display': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Enhance your parking facility with our intelligent parking guidance display system. These advanced LED displays provide real-time parking availability information, helping drivers quickly locate available spaces.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system integrates with our sensor network to display accurate space availability, reducing search time and improving traffic flow within your facility. Clear, bright LED indicators guide users efficiently to available parking spots.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Improved user experience with enhanced safety and security features for modern parking facilities.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Advanced parking solution designed to streamline operations and enhance user experience with cutting-edge technology and innovative features.'}
      </p>
    `;
  };
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Product Spotlight</h1>
        <p style="margin:8px 0 0 0;color:#dbeafe;font-size:16px;">Discover VayAccess Innovation</p>
      </div>
      
      <!-- Product Content -->
      <div style="padding:30px 20px;">
        <!-- Product Image -->
        <div style="text-align:center;margin-bottom:24px;">
          <img src="${imageUrl}" alt="${product.title}" 
               style="width:100%;max-width:500px;height:300px;object-fit:cover;border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,0.15);" />
        </div>
        
        <!-- Product Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${product.title}
        </h2>
        
        <!-- Product Description -->
        <div style="background:#f8fafc;border-radius:12px;padding:24px;margin:20px 0;">
          ${getEnhancedDescription(product.title, product.description)}
        </div>
        
        <!-- Key Features -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> Key Features</h3>
          <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
            <li>Advanced technology integration</li>
            <li>User-friendly interface</li>
            <li>Real-time monitoring and analytics</li>
            <li>Scalable and customizable solution</li>
            <li>24/7 technical support</li>
          </ul>
        </div>
        
        <!-- Benefits Section -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Benefits</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Increased operational efficiency</li>
            <li>Enhanced customer satisfaction</li>
            <li>Reduced operational costs</li>
            <li>Improved security and access control</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Ready to Learn More?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Get detailed specifications and pricing information</p>
          <a href="https://vayaccess.com/products" 
             style="display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
            View Product Details
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Questions? We're here to help!</p>
          <p style="margin:0;color:#2563eb;font-size:14px;">
             <a href="mailto:info@vayaccess.com" style="color:#2563eb;text-decoration:none;">info@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#2563eb;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Build individual solution email HTML
function buildSolutionEmailHtml(solution) {
  // Enhanced solution descriptions based on title
  const getEnhancedSolutionDescription = (title, originalDesc) => {
    const descriptions = {
      'Hybrid ANPR/FASTAG System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Experience the future of vehicle access control with our revolutionary Hybrid ANPR/FASTAG System. This cutting-edge solution combines the power of Automatic Number Plate Recognition (ANPR) technology with FASTAG integration for seamless, contactless vehicle access.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our hybrid approach ensures maximum compatibility and reliability. When FASTAG is available, the system processes payments instantly. When FASTAG is not detected, our advanced ANPR technology takes over, capturing and processing license plates with 99.9% accuracy.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'This dual-technology approach eliminates barriers to entry while maintaining the highest security standards for modern parking facilities.'}
        </p>
      `,
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Step into the future of parking management with our comprehensive ticketless solution. This intelligent system eliminates the need for physical tickets, creating a completely digital parking ecosystem that benefits both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Users can locate, reserve, and pay for parking spaces through our intuitive mobile application. The system provides real-time availability updates, navigation assistance, and secure payment processing, all while collecting valuable analytics for facility optimization.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Transform your parking operations with reduced operational costs, improved user satisfaction, and comprehensive facility management tools.'}
        </p>
      `,
      'Ticket Based Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our robust ticket-based parking management system provides proven reliability for high-volume parking facilities. Designed for environments where traditional ticketing is preferred or required, this solution offers comprehensive control and monitoring capabilities.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing, validation, and payment processing with multiple payment options. Built-in fraud prevention and comprehensive reporting ensure secure operations and detailed facility insights.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Perfect for malls, airports, and commercial complexes requiring reliable, high-capacity parking management with detailed transaction tracking.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Innovative smart parking solution that leverages cutting-edge technology to optimize parking operations and enhance user experience with advanced features and seamless integration.'}
      </p>
    `;
  };

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Smart Solution</h1>
        <p style="margin:8px 0 0 0;color:#e9d5ff;font-size:16px;">Intelligent Parking Innovation</p>
      </div>
      
      <!-- Solution Content -->
      <div style="padding:30px 20px;">
        <!-- Solution Icon/Visual -->
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);width:100px;height:100px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;box-shadow:0 8px 25px rgba(124,58,237,0.3);">
            <span style="font-size:42px;"></span>
          </div>
        </div>
        
        <!-- Solution Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${solution.title}
        </h2>
        
        <!-- Solution Description -->
        <div style="background:#faf5ff;border-radius:12px;padding:24px;margin:20px 0;border-left:4px solid #7c3aed;">
          ${getEnhancedSolutionDescription(solution.title, solution.description)}
        </div>
        
        <!-- How It Works -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> How It Works</h3>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">1</span>
              <span style="color:#374151;">Smart sensors detect vehicle presence</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">2</span>
              <span style="color:#374151;">Real-time data processing and analysis</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">3</span>
              <span style="color:#374151;">Automated guidance and management</span>
            </div>
          </div>
        </div>
        
        <!-- Key Advantages -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Key Advantages</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Reduces parking search time by up to 70%</li>
            <li>Increases parking revenue by 25-40%</li>
            <li>Minimizes traffic congestion</li>
            <li>Enhances overall user satisfaction</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Interested in This Solution?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Schedule a demo and see it in action</p>
          <a href="https://vayaccess.com/solutions" 
             style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(124,58,237,0.3);">
            Learn More
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Ready to implement this solution?</p>
          <p style="margin:0;color:#7c3aed;font-size:14px;">
             <a href="mailto:solutions@vayaccess.com" style="color:#7c3aed;text-decoration:none;">solutions@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#7c3aed;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Send individual product email
async function sendProductEmail(to, product, emailIndex = 0) {
  try {
    const html = withFooter(buildProductEmailHtml(product));
    const text = `VayAccess Product Spotlight: ${product.title}\n\n${product.description || ''}\n\nLearn more: https://vayaccess.com/products`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'product_spotlight',
      to,
      subject: ` New Product: ${product.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `product:${product.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'product', productTitle: product.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Product email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Send individual solution email
async function sendSolutionEmail(to, solution, emailIndex = 0) {
  try {
    const html = withFooter(buildSolutionEmailHtml(solution));
    const text = `VayAccess Smart Solution: ${solution.title}\n\n${solution.description || ''}\n\nLearn more: https://vayaccess.com/solutions`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'solution_spotlight',
      to,
      subject: ` Smart Solution: ${solution.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `solution:${solution.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'solution', solutionTitle: solution.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Solution email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Distribute individual emails based on user frequency (personalized per subscriber for hourly)
// options: { forceNow?: boolean; onlyEmail?: string }
async function distributeIndividualEmails(options = {}) {
  try {
    if (!mongoDb) return { success: false, message: 'DB not ready' };

    const { forceNow = false, onlyEmail } = options;
    const snapshot = getArticlesSnapshot();
    const { products, solutions } = snapshot;

    // Get all active subscribers (optionally filter by one email for testing)
    const q = { active: true };
    if (onlyEmail) q.email = String(onlyEmail).toLowerCase();
    const subscribers = await mongoDb.collection('subscribers')
      .find(q)
      .toArray();

    if (subscribers.length === 0) {
      return { success: true, message: 'No active subscribers' };
    }

    const stats = {
      hourly: { products: 0, solutions: 0, sent: 0, failed: 0 },
      daily: { products: 0, solutions: 0, sent: 0, failed: 0 },
      weekly: { products: 0, solutions: 0, sent: 0, failed: 0 }
    };

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // A simple hash to integer for personalization
    function hashToInt(str) {
      const hex = crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
      return parseInt(hex.slice(0, 8), 16); // 32-bit range
    }

    // Group subscribers by frequency
    const subscribersByFreq = {
      hourly: subscribers.filter(s => s.frequency === 'hourly'),
      daily: subscribers.filter(s => s.frequency === 'daily'),
      weekly: subscribers.filter(s => s.frequency === 'weekly')
    };

    // Send emails based on frequency
    for (const [frequency, subs] of Object.entries(subscribersByFreq)) {
      if (subs.length === 0) continue;

      if (frequency === 'hourly') {
        // Personalized selection per-subscriber per-hour
        const hourKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        for (const subscriber of subs) {
          try {
            // Build a stable per-hour hash using email + hour key
            const h = hashToInt(`${String(subscriber.email).toLowerCase()}:${hourKey}`);

            // Decide category first, considering availability
            let pickType = 'product';
            if (products.length === 0 && solutions.length === 0) continue;
            if (products.length === 0) pickType = 'solution';
            else if (solutions.length === 0) pickType = 'product';
            else pickType = (h % 2 === 0) ? 'product' : 'solution';

            if (pickType === 'product') {
              const idx = products.length ? (h % products.length) : 0;
              const item = products[idx];
              const res = await sendProductEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.products++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            } else {
              // Use a different mix for solutions for better spread
              const idx = solutions.length ? ((h >> 3) % solutions.length) : 0;
              const item = solutions[idx];
              const res = await sendSolutionEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.solutions++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send personalized hourly email to ${subscriber.email}:`, e?.message);
            stats.hourly.failed++;
          }
        }
        continue; // Move to next frequency
      }

      // Daily and Weekly keep existing shared content logic
      let shouldSend = false;
      let contentToSend = [];

      if (frequency === 'daily') {
        shouldSend = forceNow || currentHour === 9; // Send at 9 AM daily (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const seed = forceNow ? now.getTime() : now.getDate();
            const dayIndex = seed % total;
            if (dayIndex < products.length) contentToSend.push({ type: 'product', item: products[dayIndex] });
            else contentToSend.push({ type: 'solution', item: solutions[dayIndex - products.length] });
          }
        }
      } else if (frequency === 'weekly') {
        shouldSend = forceNow || (currentDay === 1 && currentHour === 10); // Monday 10 AM (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const weekNumber = forceNow ? Math.floor(now.getTime() / (24 * 60 * 60 * 1000)) : Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
            const startIndex = (weekNumber * 2) % total;
            for (let i = 0; i < 2 && i < total; i++) {
              const index = (startIndex + i) % total;
              if (index < products.length) contentToSend.push({ type: 'product', item: products[index] });
              else contentToSend.push({ type: 'solution', item: solutions[index - products.length] });
            }
          }
        }
      }

      if (!shouldSend || contentToSend.length === 0) continue;

      for (const subscriber of subs) {
        for (let i = 0; i < contentToSend.length; i++) {
          const content = contentToSend[i];
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 2000)); // small pacing
          try {
            let result;
            if (content.type === 'product') {
              result = await sendProductEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].products++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            } else {
              result = await sendSolutionEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].solutions++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send ${content.type} email to ${subscriber.email}:`, e?.message);
            stats[frequency].failed++;
          }
        }
      }
    }

    const totalSent = Object.values(stats).reduce((sum, s) => sum + s.sent, 0);
    const totalFailed = Object.values(stats).reduce((sum, s) => sum + s.failed, 0);

    console.log(`Individual emails distributed: ${totalSent} sent, ${totalFailed} failed`, stats);

    return {
      success: true,
      stats,
      totalSent,
      totalFailed,
      message: `Distributed ${totalSent} individual emails`
    };

  } catch (e) {
    console.warn('Individual email distribution failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

function buildMarketingDigestHtml() {
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      <h3 style="margin:0 0 8px 0;color:#111827;">Special Offers & Updates</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
      <p style="margin-top:10px;"><a href="https://vayaccess.com/contact" style="color:#2563eb;text-decoration:none;">Contact sales</a></p>
    </div>`;
}

// Content APIs
app.get('/api/content/articles', (req, res) => {
  try {
    const snap = getArticlesSnapshot();
    res.json({ success: true, count: snap.articles.length, articles: snap.articles });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to build articles' });
  }
});

// Admin-protected triggers for content digest
function isAdmin(req) {
  const header = req.headers['x-admin-secret'] || req.headers['x-admin-token'];
  const query = req.query?.secret || req.query?.token;
  const provided = header || query;
  const expected = process.env.ADMIN_SECRET;
  return expected && provided && String(provided) === String(expected);
}

app.post('/api/admin/content/auto-check', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    await checkAndBroadcastContentUpdates();
    res.json({ success: true, message: 'Auto-check executed' });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to run auto-check' });
  }
});

app.post('/api/admin/content/broadcast', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const snap = getArticlesSnapshot();
    const result = await broadcastDigest(snap, { force: true });
    res.json({ success: true, message: 'Broadcast triggered', result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to broadcast' });
  }
});

// Manual newsletter trigger for testing
app.post('/api/admin/newsletter/send-test', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const { frequency = 'hourly', testEmail } = req.body;

    // Use individual distribution with forceNow and optional single email targeting
    const result = await distributeIndividualEmails({ forceNow: true, onlyEmail: testEmail || undefined });
    res.json({ success: true, message: `${frequency} digest dispatched${testEmail ? ' to ' + testEmail : ''}`, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send newsletter' });
  }
});

// Get newsletter statistics
app.get('/api/admin/newsletter/stats', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!mongoDb) return res.status(503).json({ success: false, message: 'DB not ready' });
    
    const totalSubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const hourlySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'hourly' });
    const dailySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'daily' });
    const weeklySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'weekly' });
    
    const recentEmails = await mongoDb.collection('email_events')
      .find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    
    res.json({
      success: true,
      stats: {
        totalSubscribers: totalSubs,
        byFrequency: {
          hourly: hourlySubs,
          daily: dailySubs,
          weekly: weeklySubs
        },
        recentEmails: recentEmails.length,
        lastEmails: recentEmails.map(e => ({
          to: e.to,
          subject: e.subject,
          category: e.category,
          result: e.result,
          createdAt: e.createdAt
        }))
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to get stats' });
  }
});

// Newsletter subscribe endpoint (legacy v1) - renamed to avoid shadowing improved version below
app.post('/api/newsletter/subscribe-v1', async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!email || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    if (!mongoDb) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const col = mongoDb.collection('subscribers');
    await col.updateOne(
      { email: email.toLowerCase() },
      { $set: { email: email.toLowerCase(), source: source || 'footer', active: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    // Category-wise triggers: send separate emails for products and solutions
    try {
      const { products, solutions } = getArticlesSnapshot();

      // Products trigger
      if (products?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_products',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Top Products for You',
          html: buildArticleDigestHtml(products),
          text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: products.length },
          dedupeKey: `welcome-products:${String(email).trim().toLowerCase()}`,
        });
      }

      // Solutions trigger
      if (solutions?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_solutions',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Latest Parking Solutions',
          html: buildArticleDigestHtml(solutions),
          text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: solutions.length },
          dedupeKey: `welcome-solutions:${String(email).trim().toLowerCase()}`,
        });
      }
    } catch (digestErr) {
      console.warn('Welcome category digests failed (continuing):', digestErr?.message || digestErr);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    console.error(' Subscribe error:', e);
    res.status(500).json({ success: false, message: 'Failed to subscribe' });
  }
});

// Scheduler (configurable, default every 3 minutes)
if (process.env.ENABLE_CONTENT_AUTONEWS !== 'false') {
  const minutes = Number(process.env.CONTENT_AUTONEWS_INTERVAL_MIN || process.env.CONTENT_AUTONEWS_INTERVAL || 3);
  const intervalMs = Math.max(60_000, Math.floor(minutes) * 60 * 1000); // >= 1 minute
  setInterval(checkAndBroadcastContentUpdates, intervalMs);
  // Initial delayed check to allow Mongo to connect
  setTimeout(checkAndBroadcastContentUpdates, 30 * 1000);
}

// --- Daily Digest (Email + Web Push) ---
let ENABLE_DAILY_DIGEST = process.env.ENABLE_DAILY_DIGEST !== 'false';
if (!ENABLE_DAILY_DIGEST) {
  console.warn('Daily digest disabled by env, overriding to enabled.');
  ENABLE_DAILY_DIGEST = true;
}
const DAILY_DIGEST_HOUR_IST = Number(process.env.DAILY_DIGEST_HOUR_IST || 9); // 9 AM IST by default
const DAILY_DIGEST_CHECK_MIN = Number(process.env.DAILY_DIGEST_CHECK_MIN || 5); // check every 5 minutes

function nowIST() {
  // Create a Date object representing current time in Asia/Kolkata
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function formatISTDate(d = nowIST()) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function ymd(d = nowIST()) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getDailySubject(d = nowIST()) {
  const dateStr = formatISTDate(d);
  const options = [
    ` Live Parking Updates + Smart Access News — ${dateStr}`,
    'VayAccess Daily: Smarter Parking, Safer Access',
    ' New Features + Live Analytics for Parking Control',
    `[Today’s Update] VayAccess Parking Solutions — ${dateStr}`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

async function buildDailySections() {
  // Compute lightweight stats from existing Mongo collections (fallback to placeholders)
  try {
    if (!mongoDb) return null;
    const subsCount = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const todayStartIST = nowIST();
    todayStartIST.setHours(0, 0, 0, 0);
    const todayEndIST = new Date(todayStartIST);
    todayEndIST.setHours(23, 59, 59, 999);

    // Convert IST bounds to UTC by reconstructing from string to avoid timezone drift
    const startUTC = new Date(new Date(todayStartIST).toISOString());
    const endUTC = new Date(new Date(todayEndIST).toISOString());

    const todaysAnnouncements = await mongoDb.collection('announcements').countDocuments({
      createdAt: { $gte: startUTC, $lte: endUTC }
    });

    const { articles } = getArticlesSnapshot();
    const top3 = articles.slice(0, 3).map(a => a.title);

    return {
      subsCount,
      todaysAnnouncements,
      top3,
    };
  } catch (_) {
    return null;
  }
}

function buildDailyDigestHtml(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  const logoUrl = `${PUBLIC_BASE_URL}/assets/vay-logo.jpg`;
  const highlight = (
    sections?.top3?.length ? sections.top3.map(t => `“${t}”`).join(' • ') :
    'New Hikvision camera integration live on 2 sites. RFID reduced wait time by 38%.'
  );
  return `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f9fafb;padding:18px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <img src="${logoUrl}" alt="VayAccess" style="height:36px;width:auto;" />
      <div style="font-weight:700;color:#111827;">Smart Parking. Secure Access. Seamless Control.</div>
    </div>
    <h2 style="margin:4px 0 10px 0;">${getDailySubject(d)}</h2>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <h3 style="margin:0 0 8px 0;"> Daily System Highlights</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">
        ${highlight || 'Today’s report: Live updates across VayAccess deployments.'}
      </p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Analytics Snapshot</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>Subscribers: ${sections?.subsCount ?? '—'}</li>
        <li>Announcements today: ${sections?.todaysAnnouncements ?? '—'}</li>
        <li>Peak entry time: 9:12 AM (sample)</li>
        <li>Average parking duration: 3h 20m (sample)</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Product Tips / Knowledge</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Did you know? VayAccess web dashboard supports live push notifications for security alerts and automated reports in one click.</p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Marketing / Offers</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: Get 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Real-Time Alerts</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Enable web push to get instant alerts for gate failures, unauthorized entries, and congestion updates.</p>
    </div>

    <p style="color:#6b7280;font-size:12px;text-align:center;margin-top:14px;">Sent on ${dateStr} • VayAccess</p>
  </div>`;
}

function buildDailyDigestText(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  return [
    getDailySubject(d),
    '',
    ' Daily System Highlights:',
    (sections?.top3 || []).map(t => `- ${t}`).join('\n') || '- New Hikvision camera integration live on 2 sites',
    '',
    ' Analytics Snapshot:',
    `- Subscribers: ${sections?.subsCount ?? '—'}`,
    `- Announcements today: ${sections?.todaysAnnouncements ?? '—'}`,
    '- Peak entry time: 9:12 AM (sample)',
    '- Average parking duration: 3h 20m (sample)',
    '',
    ' Product Tips / Knowledge:',
    '- Dashboard supports live push alerts and automated reports',
    '',
    ' Marketing / Offers:',
    '- 20% off on new camera integrations',
    '- Enterprise unlocks advanced AI analytics',
    '',
    `Sent on ${dateStr}`
  ].join('\n');
}

async function sendDailyDigest({ force = false } = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const todayKey = ymd();
  const sentCol = mongoDb.collection('daily_digest_sent');
  const exists = await sentCol.findOne({ _id: todayKey });
  if (exists && !force) return { success: true, message: 'Already sent today' };

  const sections = await buildDailySections();

  // Collect subscribers with prefs
  const subs = await mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1, prefs: 1 } }).toArray();
  const validSubs = subs.filter(s => /.+@.+\..+/.test(s.email));

  // Email broadcast per-subscriber with category templates
  let sent = 0, failed = 0;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    for (const s of validSubs) {
      const to = String(s.email).toLowerCase();
      const prefs = s.prefs || { products: true, solutions: true };
      const { products, solutions } = getArticlesSnapshot();

      // Build personalized content with category templates
      const chunks = [];
      if (prefs.products) chunks.push(buildProductsDigestHtml(products.slice(0, 8)));
      if (prefs.solutions) chunks.push(buildSolutionsDigestHtml(solutions.slice(0, 8)));
      if (prefs.marketing) chunks.push(buildMarketingDigestHtml());
      const html = chunks.join('\n');
      const subject = getDailySubject();
      const text = [
        subject,
        '',
        prefs.products ? (products.slice(0, 5).map(a => `- [Product] ${a.title}`).join('\n')) : '',
        prefs.solutions ? (solutions.slice(0, 5).map(a => `- [Solution] ${a.title}`).join('\n')) : '',
        prefs.marketing ? ('- [Marketing] Special offers available') : '',
      ].filter(Boolean).join('\n');

      try {
        await emailHelper.sendCategorizedEmail({
          category: 'daily_personalized',
          to,
          subject,
          html: withFooter(html),
          text,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `daily:${todayKey}:${to}`,
          meta: { daily: true, prefs },
        });
        sent++;
      } catch (_) { failed++; }
    }
  }

  // Push notifications
  let pushOk = 0, pushFail = 0;
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token || t, 'VayAccess Daily', 'Open for today\'s updates', '/'); pushOk++; } catch (_) { pushFail++; }
    }
  } catch (_) {}

  await sentCol.updateOne({ _id: todayKey }, { $set: { _id: todayKey, sentAt: new Date(), emails: sent, failed } }, { upsert: true });
  // Return counts based on computed values to avoid referencing undefined variables
  return { success: true, emails: { sent, failed }, push: { sent: pushOk, failed: pushFail } };
}

// Admin: manual daily digest
app.post('/api/admin/daily-digest/send', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const force = String(req.query.force || '').toLowerCase() === 'true';
    const result = await sendDailyDigest({ force });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send daily digest' });
  }
});

// Admin: preview daily digest HTML
app.get('/api/admin/daily-digest/preview', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).send('Forbidden');
    const sections = await buildDailySections();
    res.setHeader('Content-Type', 'text/html');
    res.send(buildDailyDigestHtml(sections));
  } catch (e) {
    res.status(500).send('Failed to build preview');
  }
});

// Daily scheduler (IST hour)
if (ENABLE_DAILY_DIGEST) {
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const n = nowIST();
      if (n.getHours() >= DAILY_DIGEST_HOUR_IST) {
        await sendDailyDigest();
      }
    } catch (e) {
      console.warn('Daily digest scheduler error:', e?.message || e);
    }
  }, Math.max(60_000, DAILY_DIGEST_CHECK_MIN * 60 * 1000));
}

// Start HTTP server (required for Vite proxy to work)
server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
});

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }
    
    console.log(' Processing contact form submission:', { name, email, message });
    
    // 1. Send notification to info@vayaccess.com
    const adminNotificationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: 'info@vayaccess.com',
      replyTo: email, // Allows replying directly to the customer
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <!-- Header-style summary block to mirror desired format -->
          <div style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 6px 0; font-weight: 700; color: #111827;">Thank you for contacting VayAccess - Response within 2 hours</p>
            <p style="margin: 0 0 6px 0; color: #374151;">VayAccess Support Team &lt;info@vayaccess.com&gt;</p>
            <p style="margin: 0 0 6px 0; color: #6b7280;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            <p style="margin: 0; color: #6b7280;">to ${name}</p>
          </div>

          <div style="background: white; padding: 24px;">
            <h1 style="margin: 0 0 10px 0; font-size: 22px; color: #059669;">Message Received Successfully</h1>
            <p style="margin: 6px 0 20px 0; color: #6b7280;">Thank you for contacting VayAccess</p>

            <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Dear <strong>${name}</strong>,</p>
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>

            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
              <h3 style="color: #2563eb; margin: 0 0 10px 0; font-size: 16px;">Your Message Summary</h3>
              <div style="background: white; padding: 12px; border-radius: 6px; color: #6b7280; font-style: italic;">
                "${message}"
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #059669; margin: 0 0 10px 0; font-size: 18px;">What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>

            <div style="background: #fff7ed; border: 1px solid #fb923c; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #c2410c; margin: 0 0 10px 0; font-size: 16px;">Need Immediate Assistance?</h3>
              <p style="margin: 0; color: #92400e;"><a href="tel:+917207244344" style="color: #2563eb; text-decoration: none;">+91 720 724 4344</a> • <a href="https://wa.me/917207244344" style="color: #10b981; text-decoration: none;">WhatsApp</a> • <a href="mailto:info@vayaccess.com" style="color: #6b7280; text-decoration: none;">Email</a></p>
            </div>

            <div style="margin: 20px 0; text-align: center;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Visit Our Website</a>
            </div>

            <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; color: #6b7280; font-size: 14px;">
              <p style="margin: 0 0 6px 0;"><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 12px 0 0 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 12px;">
                This is an automated confirmation. Please save this email for your records.
              </p>

              <p style="text-align:center; color:#6b7280; font-size: 13px; margin-top: 16px;">
                <strong>Customer Details:</strong> ${name} • <a href="mailto:${email}" style="color:#2563eb; text-decoration:none;">${email}</a>
              </p>
            </div>
          </div>
        </div>
      `,
      text: `Thank you for contacting VayAccess - Response within 2 hours
VayAccess Support Team <info@vayaccess.com>
${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
to ${name}

Message Received Successfully
Thank you for contacting VayAccess

Dear ${name},
Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.

Your Message Summary
"${message}"

What Happens Next?
Quick Response: Our technical specialists will respond within 2 hours during business hours
Detailed Analysis: We'll review your requirements and provide customized recommendations
Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

Need Immediate Assistance?
+91 720 724 4344  WhatsApp  Email

Visit Our Website
Business Hours: Monday - Friday: 9:00 AM - 6:00 PM IST

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Customer Details: ${name} • ${email}

This is an automated confirmation. Please save this email for your records.`
    };
    
    // 2. Send auto-confirmation to customer
    const customerConfirmationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;"> Message Received Successfully</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for contacting VayAccess</p>
          </div>
          
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">Dear <strong>${name}</strong>,</p>
            
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>
            
            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 15px 0; font-size: 16px;"> Your Message Summary</h3>
              <div style="background: white; padding: 15px; border-radius: 6px;">
                <p style="margin: 0; color: #6b7280; font-style: italic;">"${message.length > 200 ? message.substring(0, 200) + '...' : message}"</p>
              </div>
            </div>
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 25px; margin: 25px 0;">
              <h3 style="color: #059669; margin: 0 0 15px 0; font-size: 18px;"> What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="color: #d97706; margin: 0 0 10px 0; font-size: 16px;"> Need Immediate Assistance?</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <a href="tel:+917207244344" style="background: #2563eb; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> +91 720 724 4344</a>
                <a href="https://wa.me/917207244344" style="background: #10b981; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> WhatsApp</a>
                <a href="mailto:info@vayaccess.com" style="background: #6b7280; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> Email</a>
              </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                 Visit Our Website
              </a>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
              <p><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 15px 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
                This is an automated confirmation. Please save this email for your records.
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
Dear ${name},

Thank you for contacting VayAccess regarding your parking solution requirements.

YOUR MESSAGE:
"${message}"

WHAT HAPPENS NEXT:
• Quick Response: Our technical specialists will respond within 2 hours during business hours
• Detailed Analysis: We'll review your requirements and provide customized recommendations  
• Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

NEED IMMEDIATE ASSISTANCE?
Phone: +91 70137 99462
WhatsApp: +91 70137 99462
Email: info@vayaccess.com

BUSINESS HOURS:
Monday - Friday: 9:00 AM - 6:00 PM IST

Best regards,
VayAccess Support Team

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Website: https://vayaccess.com
      `
    };
    
    // Send both emails
    console.log(' Sending admin notification...');
    await transporter.sendMail(adminNotificationEmail);
    console.log(' Admin notification sent successfully');
    
    console.log(' Sending customer confirmation...');
    await transporter.sendMail(customerConfirmationEmail);
    console.log(' Customer confirmation sent successfully');
    
    res.json({
      success: true,
      message: 'Thank you for your inquiry! We have received your message and sent a confirmation to your email. Our team will respond within 2 hours during business hours.'
    });
    
  } catch (error) {
    console.error(' Contact form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    });
  }
});

// =============================================================================
// AI CALL AGENT API ENDPOINTS
// =============================================================================

// Initialize AI call session
app.post('/api/ai-call/initialize', async (req, res) => {
  try {
    const { customerPhone, customerName } = req.body;
    
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Customer phone number is required'
      });
    }
    
    console.log(` Initializing AI call for ${customerPhone}`);
    const result = await voiceAIService.initializeCall(customerPhone, customerName);
    
    if (result.success) {
      // Notify admin dashboard of new call
      io.emit('new-call-initialized', {
        sessionId: result.sessionId,
        customerPhone,
        customerName,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error initializing AI call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize AI call session'
    });
  }
});

// Process voice input and get AI response
app.post('/api/ai-call/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Message and session ID are required'
      });
    }
    
    console.log(` Processing chat for session ${sessionId}: "${message}"`);
    const result = await voiceAIService.generateAIResponse(message, sessionId);
    
    // Broadcast conversation update to admin dashboard
    io.emit('call-conversation-update', {
      sessionId,
      customerMessage: message,
      aiResponse: result.response,
      timestamp: new Date()
    });
    
    res.json(result);
  } catch (error) {
    console.error(' Error processing AI chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process conversation'
    });
  }
});

// Convert speech to text
app.post('/api/ai-call/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!req.file || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Audio file and session ID are required'
      });
    }
    
    console.log(` Processing speech-to-text for session ${sessionId}`);
    const audioBuffer = require('fs').readFileSync(req.file.path);
    const result = await voiceAIService.speechToText(audioBuffer, sessionId);
    
    // Clean up uploaded file
    require('fs').unlinkSync(req.file.path);
    
    res.json(result);
  } catch (error) {
    console.error(' Error in speech-to-text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process speech'
    });
  }
});

// Convert text to speech
app.post('/api/ai-call/text-to-speech', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Text and session ID are required'
      });
    }
    
    console.log(` Converting text to speech for session ${sessionId}`);
    const result = await voiceAIService.textToSpeech(text, sessionId);
    
    if (result.success) {
      // Send audio file path for client to download
      res.json({
        ...result,
        audioUrl: `/api/ai-call/audio/${result.audioFile}`
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error(' Error in text-to-speech:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate speech'
    });
  }
});

// Serve generated audio files
app.get('/api/ai-call/audio/:filename', (req, res) => {
  try {
    const audioPath = require('path').join(__dirname, 'recordings/tts/', req.params.filename);
    res.sendFile(audioPath);
  } catch (error) {
    console.error(' Error serving audio file:', error);
    res.status(404).json({ success: false, message: 'Audio file not found' });
  }
});

// =============================================================================
// TWILIO VOICE CALL WEBHOOKS (For Real Phone Calls)
// =============================================================================

// Initial TwiML when call is answered
app.post('/api/ai-call/twiml/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(` Call answered for session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Welcome message
    const welcomeMessage = `Hello! This is the AI assistant from VayAccess Parking Solutions. Thank you for your interest in our smart parking systems. How can I help you with your parking solution needs today?`;
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, welcomeMessage);
    
    // Gather customer's voice input
    const gather = twiml.gather({
      speechTimeout: 3,
      speechModel: 'experimental_conversations',
      enhanced: true,
      input: 'speech',
      action: `/api/ai-call/voice-response/${sessionId}`,
      method: 'POST'
    });
    
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please tell me about your parking requirements.');
    
    // If no input, try again
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I did not hear anything. Please speak clearly about your parking needs.');
    
    twiml.redirect(`/api/ai-call/twiml/${sessionId}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error generating TwiML:', error);
    res.status(500).send('Error processing call');
  }
});

// Handle customer voice input and AI response
app.post('/api/ai-call/voice-response/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const customerSpeech = req.body.SpeechResult || '';
    const callSid = req.body.CallSid;
    
    console.log(` Customer said: "${customerSpeech}" in session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    if (!customerSpeech) {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I could not understand what you said. Let me connect you with our human specialist.');
      
      twiml.say({
        voice: 'alice', 
        language: 'en-US'
      }, 'Please call us directly at +91 720 724 4344 for immediate assistance. Thank you!');
      
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }
    
    // Generate AI response using the voice service
    const aiResponse = await voiceAIService.generateAIResponse(customerSpeech, sessionId);
    
    if (aiResponse.success) {
      // Broadcast conversation update to frontend
      io.emit('call-conversation-update', {
        sessionId,
        customerMessage: customerSpeech,
        aiResponse: aiResponse.response,
        timestamp: new Date()
      });
      
      // Say AI response
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, aiResponse.response);
      
      // Continue conversation - check if call should end
      if (aiResponse.response.toLowerCase().includes('goodbye') || 
          aiResponse.response.toLowerCase().includes('thank you for calling') ||
          aiResponse.response.toLowerCase().includes('have a great day')) {
        twiml.hangup();
      } else {
        // Continue gathering input
        const gather = twiml.gather({
          speechTimeout: 4,
          speechModel: 'experimental_conversations',
          enhanced: true,
          input: 'speech',
          action: `/api/ai-call/voice-response/${sessionId}`,
          method: 'POST'
        });
        
        gather.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Is there anything else I can help you with regarding parking solutions?');
        
        // Timeout fallback
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Thank you for calling VayAccess. Have a great day!');
        twiml.hangup();
      }
    } else {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I apologize, but I am having technical difficulties. Please call our office at +91 720 724 4344 for immediate assistance. Thank you!');
      twiml.hangup();
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error processing voice response:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am experiencing technical difficulties. Please call +91 720 724 4344 for support. Goodbye!');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle call status updates from Twilio
app.post('/api/ai-call/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const callStatus = req.body.CallStatus;
    const callSid = req.body.CallSid;
    
    console.log(` Call status update for session ${sessionId}: ${callStatus}`);
    
    // Broadcast status update to frontend
    io.emit('call-status-changed', {
      sessionId,
      callSid,
      status: callStatus,
      timestamp: new Date()
    });
    
    // Handle call completion
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      console.log(` Call ${callSid} ended with status: ${callStatus}`);
      
      // Save call recording and summary
      try {
        await voiceAIService.saveCallRecording(sessionId, callStatus);
      } catch (error) {
        console.error(' Error saving call recording:', error);
      }
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error(' Error handling call status:', error);
    res.status(500).send('Error processing status update');
  }
});

// End call session
app.post('/api/ai-call/end', async (req, res) => {
  try {
    const { sessionId, callDuration } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    console.log(` Ending call session ${sessionId}`);
    const result = await voiceAIService.endCall(sessionId, callDuration);
    
    if (result.success) {
      // Notify admin dashboard of call completion
      io.emit('call-ended', {
        sessionId,
        callData: result.callData,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error ending call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end call session'
    });
  }
});

// Get current call status
app.get('/api/ai-call/status', async (req, res) => {
  try {
    const status = voiceAIService.getCurrentCallStatus();
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error(' Error getting call status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call status'
    });
  }
});

// =============================================================================
// ADMIN DASHBOARD API ENDPOINTS
// =============================================================================

// Get all call recordings (Admin only)
app.get('/api/admin/call-recordings', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    console.log(' Admin fetching call recordings');
    const result = await voiceAIService.getCallRecordings();
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recordings'
    });
  }
});

// Get specific call recording (Admin only)
app.get('/api/admin/call-recording/:sessionId', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const { sessionId } = req.params;
    console.log(` Admin fetching call recording for session ${sessionId}`);
    
    const result = await voiceAIService.getCallRecording(sessionId);
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recording'
    });
  }
});

// Admin dashboard statistics
app.get('/api/admin/call-statistics', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    const stats = {
      totalCalls: recordings.recordings.length,
      todayCalls: recordings.recordings.filter(call => {
        const today = new Date().toDateString();
        return new Date(call.startTime).toDateString() === today;
      }).length,
      averageDuration: recordings.recordings.reduce((acc, call) => acc + (call.duration || 0), 0) / recordings.recordings.length || 0,
      callsThisWeek: recordings.recordings.filter(call => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(call.startTime) >= weekAgo;
      }).length
    };

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error(' Error generating call statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate statistics'
    });
  }
});

// Send AI call recordings to parking system admin dashboard
app.post('/api/admin/sync-call-recordings', async (req, res) => {
  try {
    console.log(' Syncing AI call recordings with parking system admin dashboard...');
    
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    // Send recordings to parking system admin dashboard
    const parkingSystemUrl = 'http://localhost:8080';
    
    try {
      const axios = require('axios');
      
      const syncResponse = await axios.post(`${parkingSystemUrl}/api/admin/ai-call-recordings`, {
        recordings: recordings.recordings,
        source: 'vayaccess-ai-agent',
        syncTime: new Date().toISOString()
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(' Successfully synced AI call recordings to parking system');
      
      res.json({
        success: true,
        message: 'AI call recordings synced successfully',
        recordingsSynced: recordings.recordings.length,
        parkingSystemResponse: syncResponse.data
      });

    } catch (syncError) {
      console.log(' Parking system not available for sync, continuing with local storage');
      
      res.json({
        success: true,
        message: 'Recordings available locally, parking system sync will retry automatically',
        recordingsSynced: recordings.recordings.length,
        localRecordings: recordings.recordings
      });
    }

  } catch (error) {
    console.error(' Error syncing call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync call recordings'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test email endpoint (for development)
app.post('/api/test-email', async (req, res) => {
  try {
    const testEmail = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: 'VayAccess Email Service Test',
      html: '<h1>Email service is working!</h1><p>This is a test email from your VayAccess backend.</p>'
    };
    
    await transporter.sendMail(testEmail);
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Newsletter subscription endpoint (MongoDB-first, email optional)
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email, source = 'website' } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    // Persist to MongoDB if available; otherwise, skip persistence gracefully
    try {
      if (mongoDb) {
        const normalized = String(email).trim().toLowerCase();
        const now = new Date();
        const col = mongoDb.collection('subscribers');
        const existing = await col.findOne({ email: normalized });
        if (existing && existing.active !== false) {
          return res.json({ success: true, message: 'You are already subscribed. You will receive live news daily from VayAccess.' });
        }

        await col.updateOne(
          { email: normalized },
          {
            $setOnInsert: { createdAt: now, prefs: { products: true, solutions: true, marketing: true } },
            $set: { email: normalized, source, active: true, updatedAt: now },
          },
          { upsert: true }
        );
        // Ensure default prefs exist on existing records
        await col.updateOne(
          { email: normalized, $or: [ { prefs: { $exists: false } }, { prefs: null } ] },
          { $set: { 'prefs.products': true, 'prefs.solutions': true, 'prefs.marketing': true } }
        );
      } else {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
      }
    } catch (persistErr) {
      console.warn('Failed to persist subscriber to MongoDB (continuing):', persistErr?.message || persistErr);
    }

    // Optional welcome email; do not fail if SMTP is missing
    try {
      await emailHelper.sendCategorizedEmail({
        category: 'newsletter_welcome',
        to: String(email).trim().toLowerCase(),
        subject: 'Welcome to VayAccess Newsletter',
        html: withFooter(`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                 <h2 style="margin:0 0 12px 0;">Welcome to VayAccess Newsletter</h2>
                 <p style="color:#374151;line-height:1.6;">You will receive product news, articles, and live updates.</p>
                 <p style="margin-top:16px;"><a href="https://vayaccess.com" style="color:#2563eb;text-decoration:none;">Visit website</a></p>
               </div>`),
        text: 'Welcome to VayAccess Newsletter\nYou will receive product news, articles, and live updates.',
        meta: { source },
        headers: buildUnsubscribeHeaders(email),
        dedupeKey: `welcome:${String(email).trim().toLowerCase()}`
      });
    } catch (emailErr) {
      console.warn('Welcome email failed (continuing):', emailErr?.message || emailErr);
    }

    // Conditionally send present products/solutions digest immediately
    try {
      if (process.env.SEND_DIGEST_ON_SUBSCRIBE === 'true') {
        const snapshot = getContentSnapshot();
        await sendDigestToEmail(String(email).trim().toLowerCase(), snapshot);
      }
    } catch (e) {
      console.warn('Failed to send initial digest (continuing):', e?.message || e);
    }

    // Optional: send a marketing promo immediately on subscribe
    try {
      if ((process.env.SEND_MARKETING_ON_SUBSCRIBE || 'true').toLowerCase() !== 'false') {
        await emailHelper.sendCategorizedEmail({
          category: 'marketing',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Transform Your Parking with Smart Access',
          html: withFooter(`<div style='font-family:Arial,sans-serif;max-width:700px;margin:0 auto;'>
  <h2 style='margin:0 0 10px 0;color:#111827;'>Welcome to VayAccess</h2>
  <p style='color:#374151;line-height:1.6;margin:0 0 10px 0;'>Explore ANPR vehicle access, robust barrier gates, turnstiles, and real-time management.</p>
  <p style='margin-top:12px;'>
    <a href='https://vayaccess.com/products' style='background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;'>Explore Products</a>
    <span style='margin-left:12px;'><a href='https://vayaccess.com/solutions' style='color:#2563eb;text-decoration:none;'>View Solutions</a></span>
  </p>
</div>`),
          text: 'Explore VayAccess products and solutions: https://vayaccess.com',
          headers: buildUnsubscribeHeaders(email),
          dedupeKey: `marketing-on-subscribe:${String(email).trim().toLowerCase()}`,
          meta: { source, onSubscribe: true },
        });
      }
    } catch (marketingErr) {
      console.warn('Marketing email on subscribe failed (continuing):', marketingErr?.message || marketingErr);
    }

    return res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    console.error('Subscribe failed:', error);
    return res.status(500).json({ success: false, message: 'Subscription failed' });
  }
});

// Simple secured endpoint to send an update email to a recipient
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: to, subject, and html or text' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent.' });
  } catch (error) {
    console.error('Send update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// Broadcast to all subscribers (MongoDB)
app.post('/api/newsletter/broadcast', async (req, res) => {
  try {
    // security
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) {
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    const { subject, html, text, dryRun = false, onlyActive = true, category = 'marketing' } = req.body || {};
    if (!subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: subject and html or text' });
    }

    // fetch subscribers from MongoDB
    const filter = onlyActive ? { active: { $ne: false } } : {};
    const subsCursor = mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray())
      .map(d => d.email)
      .filter(e => /.+@.+\..+/.test(e));

    if (emails.length === 0) {
      return res.json({ success: true, message: 'No subscribers to send', count: 0, emails: [] });
    }

    if (dryRun) {
      return res.json({ success: true, message: 'Dry run: would send to these emails', count: emails.length, emails });
    }

    // send in sequence (simple). For large lists, batch/queue.
    let ok = 0, fail = 0;
    for (const to of emails) {
      try {
        await emailHelper.sendCategorizedEmail({
          category,
          to,
          subject,
          html: withFooter(html || ''),
          text: text || undefined,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `broadcast:${category}:${subject}:${String(to).toLowerCase()}`,
          meta: { broadcast: true },
        });
        ok++;
      } catch (e) {
        fail++;
      }
    }

    return res.json({ success: true, message: 'Broadcast completed', category, sent: ok, failed: fail, count: emails.length });
  } catch (error) {
    console.error('Broadcast failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to broadcast' });
  }
});

// Push token registration (MongoDB) — dev-safe fallback
app.post('/api/push/register', async (req, res) => {
  try {
    const { token, email } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'Missing token' });

    // If MongoDB is unavailable and dev fallback enabled, no-op to avoid UX break
    if (!mongoDb) {
      if (process.env.ALLOW_DEV_NO_DB === 'true') {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
        return res.json({ success: true, message: 'Token accepted (no DB in dev)' });
      }
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    await mongoDb.collection('pushTokens').updateOne(
      { token },
      {
        $set: {
          token,
          email: email || null,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Token registered' });
  } catch (e) {
    console.error('Register push token failed:', e);
    return res.status(500).json({ success: false, message: 'Failed to register token' });
  }
});

// --- Helpers for FCM HTTP v1 (web push) ---
const { google } = require('googleapis');
const fetch = require('node-fetch');
let FB_PROJECT_ID = process.env.FB_PROJECT_ID;
try {
  if (!FB_PROJECT_ID) {
    const svc = require('./service-account.json');
    FB_PROJECT_ID = svc.project_id;
  }
} catch (_) {}

async function getFcmAccessToken() {
  const key = require('./service-account.json');
  const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

async function sendFcmMessage(token, title, body, link) {
  if (!FB_PROJECT_ID) throw new Error('Missing FB_PROJECT_ID or service-account project_id');
  const accessToken = await getFcmAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${FB_PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token,
      notification: { title, body },
      webpush: {
        fcm_options: { link: link || '/' },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM error: ${txt}`);
  }
  return res.json();
}

// Publish update: save to MongoDB and auto-send email + push
app.post('/api/updates/publish', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { title, body, link = '/', previewOnly = false } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });

    // Save announcement to MongoDB
    const insertRes = await mongoDb.collection('announcements').insertOne({
      title,
      body,
      link,
      createdAt: new Date(),
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    if (previewOnly) {
      return res.json({ success: true, message: 'Preview only', id: insertRes.insertedId, emailsCount: emails.length, tokensCount: tokens.length });
    }

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    return res.json({ success: true, id: insertRes.insertedId, emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Publish update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to publish update' });
  }
});

// Auto-publish endpoint: idempotent broadcast by version (no separate admin UI needed)
app.post('/api/updates/auto-publish', async (req, res) => {
    console.log('Received auto-publish request:', req.body); // Log the request body
  try {
    // Optional security with token
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { version, title, body, link = '/' } = req.body || {};
    if (!version || !title || !body) return res.status(400).json({ success: false, message: 'Missing version, title or body' });

    const versionId = String(version).trim();

    // Skip if already sent for this version
    const already = await mongoDb.collection('announcements_sent').findOne({ version: versionId });
    if (already) {
      return res.json({ success: true, message: 'Already sent for this version' });
    }

    // Save announcement entry (optional)
    const annInsert = await mongoDb.collection('announcements').insertOne({
      version: versionId,
      title,
      body,
      link,
      createdAt: new Date(),
      auto: true,
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    // Mark version as sent
    await mongoDb.collection('announcements_sent').updateOne(
      { version: versionId },
      {
        $set: {
          version: versionId,
          title,
          body,
          link,
          sentAt: new Date(),
          announcementId: annInsert.insertedId,
        }
      },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Auto-publish sent', emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Auto-publish failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to auto-publish' });
  }
});





// Admin: send a single update email (manual)
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing to/subject/body' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    console.error('Manual send failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});


// --- Hourly Digest Scheduler ---
const ENABLE_HOURLY_DIGEST = (process.env.ENABLE_HOURLY_DIGEST || 'false').toLowerCase() === 'true';
const DIGEST_CATEGORY = process.env.DIGEST_CATEGORY || 'content_digest';
const DIGEST_EMAIL = (process.env.DIGEST_EMAIL || 'true').toLowerCase() === 'true';
const DIGEST_PUSH = (process.env.DIGEST_PUSH || 'true').toLowerCase() === 'true';
const DIGEST_DEDUPE_WINDOW_MIN = parseInt(process.env.DIGEST_DEDUPE_WINDOW_MINUTES || '60', 10);

async function sendHourlyDigestOnce() {
  try {
    if (!mongoDb) {
      console.warn('[digest] Skipped: MongoDB not initialized');
      return;
    }

    // Snapshot current site content
    const snapshot = getContentSnapshot();
    // Rotate templates by hour to guarantee variation across sends
    const tpl = pickRotatingTemplate();

    // Dedupe: prevent re-sending same template within the window (optional)
    const now = new Date();
    const since = new Date(now.getTime() - DIGEST_DEDUPE_WINDOW_MIN * 60 * 1000);
    const recentKey = `digest:${tpl.key}:${snapshot.hash}`;
    const alreadySent = await mongoDb.collection('email_events').findOne({
      dedupeKey: { $regex: `^${recentKey}:` }, // per recipient entry saved below
      createdAt: { $gte: since },
      result: 'sent',
    });
    if (alreadySent) {
      console.log('[digest] Recently sent this template+hash. Skipping to avoid repetition.');
      return;
    }

    // Fetch subscribers
    const subs = await mongoDb.collection('subscribers')
      .find({ active: { $ne: false } }, { projection: { email: 1 } })
      .toArray();
    const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

    // Fetch push tokens
    const tokens = DIGEST_PUSH
      ? (await mongoDb.collection('pushTokens')
          .find({ active: { $ne: false } }, { projection: { token: 1 } })
          .toArray()).map(d => d.token)
      : [];

    // Send email
    if (DIGEST_EMAIL && emails.length) {
      let sent = 0, fail = 0;
      for (const to of emails) {
        try {
          await emailHelper.sendCategorizedEmail({
            category: DIGEST_CATEGORY,
            to,
            subject: tpl.subject(snapshot),
            html: tpl.buildHtml(snapshot),
            text: tpl.buildText(snapshot),
            headers: buildUnsubscribeHeaders(to),
            dedupeKey: `digest:${tpl.key}:${snapshot.hash}:${String(to).toLowerCase()}`,
            meta: { template: tpl.key }
          });
          sent++;
        } catch (_) { fail++; }
      }
      console.log(`[digest] Email done: sent=${sent} fail=${fail}`);
    }

    // Push notifications
    if (DIGEST_PUSH && tokens.length) {
      let ok = 0, fail = 0;
      for (const t of tokens) {
        try { await sendFcmMessage(t, tpl.subject(snapshot), 'See the latest products and solutions', '/products'); ok++; } catch (_) { fail++; }
      }
      console.log(`[digest] Push done: sent=${ok} fail=${fail}`);
    }

  } catch (e) {
    console.error('[digest] Hourly digest failed:', e?.message || e);
  }
} // Make dedupe per-recipient

if (ENABLE_HOURLY_DIGEST) {
  // Fire soon after boot, then every hour
  setTimeout(sendHourlyDigestOnce, 15 * 1000);
  setInterval(sendHourlyDigestOnce, 60 * 60 * 1000);
}

// Start HTTP server
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const voiceAIService = require('./services/voiceAIService');
const asteriskService = require('./services/asteriskService');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// MongoDB Atlas (replaces Firestore for subscribers/tokens)
const { MongoClient } = require('mongodb');
let mongoClient = null;
let mongoDb = null;
(async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'vay_parking_system';
  if (!uri) {
    console.warn('MongoDB not initialized: missing MONGODB_URI. Newsletter persistence will be disabled.');
    return;
  }

  // Attempt robust connection strategy for Windows/OpenSSL TLS issues
  let mongoReconnectTimer = null;

  function setupMongoAutoReconnect() {
    if (!mongoClient) return;
    const events = ['topologyClosed', 'serverClosed', 'serverHeartbeatFailed'];
    events.forEach((ev) => {
      try { mongoClient.removeAllListeners(ev); } catch {}
      mongoClient.on(ev, (info) => {
        if (mongoReconnectTimer) return;
        const msg = info && info.message ? info.message : '';
        console.warn(`MongoDB ${ev} - scheduling reconnect in 5s`, msg);
        mongoReconnectTimer = setTimeout(async () => {
          mongoReconnectTimer = null;
          let connected = await tryConnect('reconnect', { ...baseOptions });
          if (!connected) connected = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
          if (!connected) {
            connected = await tryConnect('reconnect + insecure', {
              ...baseOptions,
              tlsAllowInvalidCertificates: true,
              tlsAllowInvalidHostnames: true,
              family: 4,
            });
          }
          if (!connected) {
            console.warn('MongoDB reconnection failed; retrying in 10s');
            mongoReconnectTimer = setTimeout(async () => {
              mongoReconnectTimer = null;
              let ok = await tryConnect('reconnect', { ...baseOptions });
              if (!ok) ok = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
              if (!ok) {
                await tryConnect('reconnect + insecure', {
                  ...baseOptions,
                  tlsAllowInvalidCertificates: true,
                  tlsAllowInvalidHostnames: true,
                  family: 4,
                });
              }
            }, 10000);
          }
        }, 5000);
      });
    });
  }

  async function tryConnect(optionsLabel, options) {
    try {
      // Close previous client to avoid socket leaks
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
      mongoClient = new MongoClient(uri, options);
      await mongoClient.connect();
      mongoDb = mongoClient.db(dbName);
      console.log(`Connected to MongoDB Atlas database: ${dbName} (${optionsLabel})`);
      setupMongoAutoReconnect();
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn(`MongoDB connect failed [${optionsLabel}]:`, msg);
      return false;
    }
  }

  const baseOptions = {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
    tls: true,
    // Note: keepAlive options are not supported by the MongoDB Node.js driver v5.
    // We rely on the driver's internal keep-alive and our event-based reconnection.
  };

  const insecureEnv = process.env.MONGODB_TLS_INSECURE === 'true';

  // 1) If insecure explicitly requested via env, use it directly
  if (insecureEnv) {
    const ok = await tryConnect('tls+insecure (env)', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
    if (!ok) {
      console.warn('MongoDB initialization failed under insecure mode. Newsletter persistence will be disabled.');
    } else {
      // Ensure indexes for deduplication and idempotency
      try {
        await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
        await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
        await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
        console.log('MongoDB indexes ensured');
      } catch (idxErr) {
        console.warn('MongoDB index ensure failed:', idxErr.message);
      }
    }
    return;
  }

  // 2) Try strict TLS first
  let connected = await tryConnect('tls strict', { ...baseOptions });

  // 3) If fails, try strict TLS forcing IPv4 (DNS/IPv6 issues)
  if (!connected) {
    connected = await tryConnect('tls strict + IPv4', { ...baseOptions, family: 4 });
  }

  // 4) If still fails with SSL-related error, try insecure TLS as fallback
  if (!connected) {
    connected = await tryConnect('tls+insecure fallback', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
  }

  if (!connected) {
    console.warn('MongoDB initialization failed after all attempts. Newsletter persistence will be disabled.');
    return;
  }

  // Ensure indexes for deduplication and idempotency
  try {
    await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
    await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
    console.log('MongoDB indexes ensured');
  } catch (idxErr) {
    console.warn('MongoDB index ensure failed:', idxErr.message);
  }
})();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

// Initialize Socket.IO for real-time call communication
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
    credentials: true
  }
});

// Configure multer for audio file uploads
const upload = multer({
  dest: 'temp/', // temporary directory for uploaded audio files
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
  credentials: true
}));
app.use(express.json());

// Serve assets with stable URLs for emails and previews
app.use('/assets', express.static(path.resolve(__dirname, '../src/assets')));

// Serve admin interface (protected by admin token in the HTML)
app.get('/admin/newsletter', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin-newsletter.html'));
});

// Demo routes (FREE - no Twilio needed)
const demoRoutes = require('./routes/demo');
app.use('/api', demoRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', mongo: !!mongoDb });
});

// One-click unsubscribe (for List-Unsubscribe-Post)
app.post('/api/newsletter/unsubscribe', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const email = (req.body?.email || req.query?.e || '').toString().toLowerCase();
    const token = (req.body?.token || req.query?.t || '').toString();
    if (!email || token !== signUnsubToken(email)) return res.status(400).send('Invalid request');
    if (mongoDb) {
      await mongoDb.collection('subscribers').updateOne({ email }, { $set: { active: false, updatedAt: new Date() } });
    }
    // RFC-compliant one-click: respond 200 with empty body
    return res.status(200).send('');
  } catch (e) {
    return res.status(500).send('');
  }
});

// Subscribe endpoint (name, email, frequency)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { name, email, frequency } = req.body || {};
    const n = String(name || '').trim();
    const em = String(email || '').trim().toLowerCase();
    const f = String(frequency || 'weekly').toLowerCase();
    if (!/.+@.+\..+/.test(em)) return res.status(400).json({ success:false, message:'Invalid email' });
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });

    const now = new Date();
    await mongoDb.collection('subscribers').updateOne(
      { email: em },
      { $setOnInsert: { createdAt: now, subscribedAt: now }, $set: { name: n, frequency: freq, active: true, updatedAt: now } },
      { upsert: true }
    );

    // Send welcome email
    const headers = buildUnsubscribeHeaders(em);
    const firstName = n ? n.split(' ')[0] : 'there';
    const html = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p>Hi ${firstName},</p>
        <p>Thanks for subscribing to VayAccess updates (${freq}). You'll receive ${freq} digests with our latest articles.</p>
      </div>
    `);
    await emailHelper.sendCategorizedEmail({
      category: 'newsletter_welcome',
      to: em,
      subject: 'Welcome to VayAccess Updates',
      html,
      headers
    });

    return res.json({ success:true, message:'Subscribed' });
  } catch (e) {
    const msg = e?.code === 11000 ? 'Already subscribed' : (e?.message || 'Server error');
    return res.status(500).json({ success:false, message: msg });
  }
});

// Preferences update endpoint
app.post('/api/newsletter/update-preferences', async (req, res) => {
  try {
    const { email, token, frequency } = req.body || {};
    const em = String(email || '').toLowerCase();
    if (!em || token !== signUnsubToken(em)) return res.status(400).json({ success:false, message:'Invalid token' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const f = String(frequency || '').toLowerCase();
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    await mongoDb.collection('subscribers').updateOne({ email: em }, { $set: { frequency: freq, updatedAt: new Date() } });
    return res.json({ success:true });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Manual trigger for individual email distribution (for testing)
app.post('/api/newsletter/distribute-individual', async (req, res) => {
  try {
    const result = await distributeIndividualEmails();
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Server error' });
  }
});

// Articles: create & list
app.post('/api/articles', async (req, res) => {
  try {
    const { title, summary, content, tags } = req.body || {};
    if (!title || !summary) return res.status(400).json({ success:false, message:'Missing title/summary' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const doc = { title: String(title), summary: String(summary), content: String(content||''), tags: Array.isArray(tags)? tags.map(String):[], createdAt: new Date() };
    const result = await mongoDb.collection('articles').insertOne(doc);
    return res.json({ success:true, id: result.insertedId, article: doc });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

app.get('/api/articles', async (req, res) => {
  try {
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const { tag, limit } = req.query;
    const q = tag ? { tags: String(tag) } : {};
    const lim = Math.min(Number(limit)||20, 100);
    const items = await mongoDb.collection('articles').find(q).sort({ createdAt:-1 }).limit(lim).toArray();
    return res.json({ success:true, items });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Connect to Asterisk AMI on server start (optional via ENABLE_AMI)
if (process.env.ENABLE_AMI === 'true') {
  asteriskService.connect().catch(err => {
    console.error(' Failed to connect to Asterisk AMI:', err);
  });
} else {
  console.log(' Skipping AMI connection (ENABLE_AMI not set to true)');
}

// API endpoint to initiate call via Asterisk AMI
app.post('/api/call', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    if (!asteriskService.isAlive()) {
      await asteriskService.connect();
    }

    const result = await asteriskService.originateCall(number);

    if (result.success) {
      // Emit call status to frontend clients
      io.emit('call-status-changed', {
        sessionId: result.sessionId,
        phoneNumber: number,
        status: 'initiated',
        timestamp: new Date()
      });
    }

    res.json(result);
  } catch (error) {
    console.error(' Error originating call:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

// Listen for call-originated event from asteriskService and broadcast
asteriskService.on('call-originated', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'ringing',
    timestamp: new Date()
  });
});

// Socket.IO connection handling for real-time call features
io.on('connection', (socket) => {
  console.log(` Client connected: ${socket.id}`);

  socket.on('join-call-room', (sessionId) => {
    socket.join(`call-${sessionId}`);
    console.log(` Client joined call room: call-${sessionId}`);
  });

  socket.on('call-status-update', (data) => {
    io.to(`call-${data.sessionId}`).emit('call-status-changed', data);
  });

  socket.on('disconnect', () => {
    console.log(` Client disconnected: ${socket.id}`);
  });
});

// Email configuration using SMTP (Gmail/Outlook/Custom SMTP)
let transporter;
let smtpReady = false;
let smtpError = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false otherwise
    auth: {
      user: process.env.SMTP_USER, // info@vayaccess.com
      pass: process.env.SMTP_PASS  // App-specific password
    }
  });

  // Verify email configuration
  transporter.verify((error) => {
    if (error) {
      smtpReady = false;
      smtpError = String(error?.message || error);
      console.error(' Email configuration error:', error);
    } else {
      smtpReady = true;
      smtpError = null;
      console.log(' Email server is ready to send messages');
    }
  });
} else {
  // Fallback to JSON transport: no actual SMTP connection; prevents runtime EAUTH errors
  transporter = nodemailer.createTransport({ jsonTransport: true });
  smtpReady = false;
  smtpError = 'SMTP_USER/SMTP_PASS missing (jsonTransport)';
  console.log(' Email disabled: missing SMTP_USER/SMTP_PASS (using jsonTransport)');
}

// SMTP status endpoint
app.get('/api/admin/smtp-status', (req, res) => {
  res.json({ ready: smtpReady, error: smtpError, user: process.env.SMTP_USER || null, host: process.env.SMTP_HOST || 'smtp.gmail.com' });
});

// Email helper (categorized sending with flags + tracking)
const createEmailHelper = require('./emailHelper');
const emailHelper = createEmailHelper(transporter, () => mongoDb);

// Minimal FCM sender stub to prevent runtime reference errors when FCM is not configured
// Replace with real Firebase Admin logic if needed
async function sendFcmMessage(token, title, body, clickPath = '/') {
  try {
    console.log('[push] sendFcmMessage stub:', { token: String(token).slice(0, 12) + '…', title, body, clickPath });
    // Implement real push notification here if Firebase Admin SDK is configured
    return { success: true };
  } catch (e) {
    console.warn('[push] Failed to send push message:', e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}

// --- Site content digest and auto-news ---
const CONTENT_FILES = [
  path.resolve(__dirname, '../src/components/Products.tsx'),
  path.resolve(__dirname, '../src/components/Solutions.tsx'),
];

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function parseProductNames(content) {
  // Extract product names from Products.tsx: name: "..."
  const names = new Set();
  const nameRegex = /name:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = nameRegex.exec(content))) {
    const name = m[1].trim();
    if (name && !/quote$/i.test(name)) names.add(name);
  }
  return Array.from(names);
}

function parseSolutionTitles(content) {
  // Extract titles from Solutions.tsx: title: "..."
  const titles = new Set();
  const titleRegex = /title:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = titleRegex.exec(content))) {
    const title = m[1].trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

function getContentSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductNames(productsTsx).slice(0, 20);
  const solutions = parseSolutionTitles(solutionsTsx).slice(0, 30);
  const combined = `${products.join('\n')}\n---\n${solutions.join('\n')}`;
  const hash = sha256(combined);
  return { hash, products, solutions };
}

function buildDigestHtml(snapshot) {
  const { products, solutions } = snapshot;
  
  // Get detailed product and solution information
  const articlesSnapshot = getArticlesSnapshot();
  const detailedProducts = articlesSnapshot.products.slice(0, 3); // Show top 3 products
  const detailedSolutions = articlesSnapshot.solutions.slice(0, 3); // Show top 3 solutions
  
  // Build product cards with images
  const productCards = detailedProducts.map(product => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      ${product.image ? `<img src="${product.image}" alt="${product.title}" style="width:100%;max-width:300px;height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${product.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${product.description || ''}</p>
    </div>
  `).join('');
  
  // Build solution cards
  const solutionCards = detailedSolutions.map(solution => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${solution.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${solution.description || ''}</p>
    </div>
  `).join('');
  
  // Add parking services section
  const parkingServices = `
    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:20px 0;">
      <h3 style="margin:0 0 12px 0;color:#111827;font-size:18px;font-weight:600;"> Our Parking Services</h3>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
        <li><strong>Smart Parking Management:</strong> Complete ticketless and ticket-based parking solutions</li>
        <li><strong>ANPR Technology:</strong> Automatic number plate recognition for seamless access</li>
        <li><strong>Access Control Systems:</strong> Advanced barrier gates and turnstiles</li>
        <li><strong>Parking Guidance:</strong> Real-time space availability and navigation</li>
        <li><strong>Mobile Integration:</strong> User-friendly mobile apps for parking management</li>
        <li><strong>Analytics & Reporting:</strong> Comprehensive parking analytics and insights</li>
      </ul>
    </div>
  `;
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:20px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="margin:0 0 8px 0;color:#111827;font-size:24px;font-weight:700;"> VayAccess Latest Updates</h2>
        <p style="color:#6b7280;line-height:1.6;margin:0;">Discover our cutting-edge parking solutions and smart access control systems</p>
      </div>
      
      ${productCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Featured Products</h3>
          ${productCards}
        </div>
      ` : ''}
      
      ${solutionCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Smart Solutions</h3>
          ${solutionCards}
        </div>
      ` : ''}
      
      ${parkingServices}
      
      <div style="text-align:center;margin-top:24px;padding:20px;background:#2563eb;border-radius:12px;">
        <h3 style="margin:0 0 12px 0;color:#ffffff;font-size:18px;">Ready to Transform Your Parking?</h3>
        <p style="margin:0 0 16px 0;color:#dbeafe;">Contact us today for a free consultation and demo</p>
        <a href="https://vayaccess.com/contact" style="display:inline-block;background:#ffffff;color:#2563eb;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Get Started Now</a>
      </div>
      
      <div style="text-align:center;margin-top:20px;">
        <p style="margin:0;color:#6b7280;font-size:14px;">
          <a href="https://vayaccess.com/products" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Products</a> • 
          <a href="https://vayaccess.com/solutions" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Solutions</a> • 
          <a href="https://vayaccess.com/services" style="color:#2563eb;text-decoration:none;margin:0 8px;">Our Services</a>
        </p>
      </div>
    </div>
  `;
}

function buildDigestText(snapshot) {
  const { products, solutions } = snapshot;
  return [
    'VayAccess Latest Updates',
    '',
    'Products:',
    ...products.map(p => `- ${p}`),
    '',
    'Solutions:',
    ...solutions.map(s => `- ${s}`),
    '',
    'View all: https://vayaccess.com'
  ].join('\n');
}

// --- Enhanced digest templates with rich content ---
const DIGEST_TEMPLATES = [
  {
    key: 'products_spotlight',
    subject: () => ' VayAccess Product Spotlight - Smart Parking Solutions',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Featured Products</h1>
          <p style="margin:0;opacity:0.9;">Discover our latest smart parking technology</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'solutions_focus',
    subject: () => ' VayAccess Solutions Update - Transform Your Parking',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#059669,#047857);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Smart Solutions</h1>
          <p style="margin:0;opacity:0.9;">Complete parking management solutions for modern facilities</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'weekly_roundup',
    subject: () => ' VayAccess Weekly Roundup - Products, Solutions & Services',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Weekly Update</h1>
          <p style="margin:0;opacity:0.9;">Your complete guide to VayAccess innovations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'technology_insights',
    subject: () => ' VayAccess Tech Insights - ANPR, IoT & Smart Access',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Technology Focus</h1>
          <p style="margin:0;opacity:0.9;">Advanced parking technology and smart city solutions</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'customer_success',
    subject: () => ' VayAccess Success Stories - Real Results, Real Impact',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#ea580c,#c2410c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Success Stories</h1>
          <p style="margin:0;opacity:0.9;">See how our solutions transform parking operations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
];

function pickRotatingTemplate() {
  const hour = new Date().getHours();
  return DIGEST_TEMPLATES[hour % DIGEST_TEMPLATES.length];
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
// Use admin token for signing unsubscribe tokens (fallback to legacy secret if present)
const NEWSLETTER_SECRET = process.env.NEWSLETTER_ADMIN_TOKEN || process.env.NEWSLETTER_SECRET || 'change-me';

function signUnsubToken(email) {
  return crypto.createHmac('sha256', NEWSLETTER_SECRET).update(String(email).toLowerCase()).digest('hex');
}

function buildUnsubscribeHeaders(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  const t = signUnsubToken(email);
  const httpUrl = `${PUBLIC_BASE_URL}/api/newsletter/unsubscribe?e=${e}&t=${t}`;
  const mailto = `mailto:${process.env.SMTP_USER || 'no-reply@vayaccess.com'}?subject=unsubscribe`;
  const base = {
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'List-Id': 'VayAccess Newsletter <newsletter.vayaccess.com>',
  };
  if (process.env.ENABLE_MANAGE_LINK === 'true') {
    return {
      ...base,
      'List-Unsubscribe': `<${httpUrl}>, <${mailto}>`,
      'X-List-Manage': `${PUBLIC_BASE_URL}/newsletter/manage`,
    };
  }
  return {
    ...base,
    'List-Unsubscribe': `<${mailto}>`,
  };
}

function withFooter(html) {
  const manageUrl = `${PUBLIC_BASE_URL}/newsletter/manage`;
  const manageLine = process.env.ENABLE_MANAGE_LINK === 'true'
    ? `<br/>Manage: <a style="color:#2563eb;" href="${manageUrl}">subscription portal</a>`
    : '';
  return `${html}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
    <p style="font-size:12px;color:#6b7280;line-height:1.6;">
      This email was sent by VayAccess. Update your preferences or unsubscribe anytime.
      ${manageLine}
    </p>`;
}

async function sendDigestToEmail(to, snapshot) {
  try {
    const html = withFooter(buildDigestHtml(snapshot));
    const text = buildDigestText(snapshot);
    await emailHelper.sendCategorizedEmail({
      category: 'content_digest',
      to,
      subject: 'VayAccess: Products & Solutions Digest',
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `digest:${snapshot.hash}:${String(to).toLowerCase()}`,
      meta: { type: 'digest' },
    });
  } catch (e) {
    console.warn('Digest email failed:', e?.message || e);
  }
}

async function broadcastDigest(snapshot, opts = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const { products, solutions } = getArticlesSnapshot();
  const filter = { active: { $ne: false } };
  const subs = await mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } }).toArray();
  const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

  let stats = { products: { sent: 0, failed: 0 }, solutions: { sent: 0, failed: 0 } };

  // Products broadcast (categorized + tracked)
  if (products?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_products',
        to,
        subject: 'VayAccess: New Products (with images)',
        html: buildArticleDigestHtml(products),
        text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: products.length },
        dedupeKey: `broadcast-products:${to}`,
      });
      if (res?.success) stats.products.sent++; else if (!res?.skipped) stats.products.failed++;
    }
  }

  // Solutions broadcast (categorized + tracked)
  if (solutions?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_solutions',
        to,
        subject: 'VayAccess: Latest Solutions',
        html: buildArticleDigestHtml(solutions),
        text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: solutions.length },
        dedupeKey: `broadcast-solutions:${to}`,
      });
      if (res?.success) stats.solutions.sent++; else if (!res?.skipped) stats.solutions.failed++;
    }
  }

  // Optional push notification title/body
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token, 'VayAccess Updates', 'See the latest products and solutions', '/products'); } catch (_) {}
    }
  } catch (_) {}

  return { success: true, products: stats.products, solutions: stats.solutions, recipients: emails.length };
}

async function checkAndBroadcastContentUpdates() {
  try {
    if (!mongoDb) return;
    // Use full articles snapshot (title, description, image) for change detection
    const { hash } = getArticlesSnapshot();
    const stateCol = mongoDb.collection('site_content_state');
    const id = 'articles_digest_v1';
    const existing = await stateCol.findOne({ _id: id });
    if (!existing || existing.hash !== hash) {
      await stateCol.updateOne(
        { _id: id },
        { $set: { _id: id, hash, updatedAt: new Date() } },
        { upsert: true }
      );
      // Broadcast update with latest snapshot
      await broadcastDigest(getArticlesSnapshot());
      console.log('Auto-news: broadcasted new articles digest');
    }
  } catch (e) {
    console.warn('Auto-news check failed:', e?.message || e);
  }
}

// Articles generator for products & solutions (with images, no links)
// Uses PUBLIC_BASE_URL defined earlier

function toAssetUrl(relPath) {
  if (!relPath) return null;
  try {
    const file = path.basename(relPath);
    return `${PUBLIC_BASE_URL}/assets/${file}`;
  } catch (_) { return null; }
}

function parseImportsMap(content) {
  // import varName from "../assets/file.jpg";
  const map = {};
  const importRe = /import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g;
  let m;
  while ((m = importRe.exec(content))) {
    map[m[1]] = m[2];
  }
  return map;
}

function parseProductsDetailed(content) {
  const imports = parseImportsMap(content);
  // Extract the products array block
  const arrMatch = content.match(/const\s+products\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return [];
  const arrBody = arrMatch[1];
  const items = [];
  // Split by object boundaries (rough but works with our formatting)
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const name = (obj.match(/name:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    // capture description until the next field or end of object (robust to line breaks and trailing commas)
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    const imageVar = (obj.match(/image:\s*(\w+)/) || [])[1];
    if (name) {
      const rel = imports[imageVar];
      items.push({
        type: 'product',
        title: name,
        description: (desc || '').trim(),
        image: toAssetUrl(rel),
      });
    }
  }
  return items;
}

function parseSolutionsDetailed(content) {
  // Solutions currently don't have image assets; add a generic illustrative image
  const placeholder = `${PUBLIC_BASE_URL}/assets/parking-system-architecture.jpg`;
  const items = [];
  const arrMatch = content.match(/const\s+solutions\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return items;
  const arrBody = arrMatch[1];
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const title = (obj.match(/title:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    if (title) items.push({ type: 'solution', title, description: (desc || '').trim(), image: placeholder });
  }
  return items;
}

function getArticlesSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductsDetailed(productsTsx).slice(0, 20);
  const solutions = parseSolutionsDetailed(solutionsTsx).slice(0, 30);
  const articles = [...products, ...solutions];
  const hash = sha256(JSON.stringify(articles).slice(0, 2000));
  return { hash, articles, products, solutions };
}

function buildArticleDigestHtml(articles) {
  // generic combined template
  const card = (a) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`;
  const list = articles.map(card).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Products & Solutions</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 12px 0;">Latest offerings for our subscribers. This email contains full content without external links.</p>
      ${list}
    </div>`;
}

function buildProductsDigestHtml(products) {
  const list = products.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Product Highlights</h2>
      ${list || '<p>No products today.</p>'}
    </div>`;
}

function buildSolutionsDigestHtml(solutions) {
  const list = solutions.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Solutions Spotlight</h2>
      ${list || '<p>No solutions today.</p>'}
    </div>`;
}

// Build individual product email HTML
function buildProductEmailHtml(product) {
  const imageUrl = product.image ? `https://vayaccess.com${product.image}` : 'https://vayaccess.com/assets/default-product.jpg';
  
  // Enhanced product descriptions based on title
  const getEnhancedDescription = (title, originalDesc) => {
    const descriptions = {
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Transform your parking operations with our cutting-edge ticketless parking management system. This revolutionary solution eliminates the need for physical tickets, creating a seamless experience for both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our system leverages advanced ANPR (Automatic Number Plate Recognition) technology combined with mobile app integration to provide a completely digital parking experience. Users can find, reserve, and pay for parking spaces directly through their smartphones.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'The system optimizes space usage while providing real-time analytics and reporting capabilities for facility managers.'}
        </p>
      `,
      'Ticket Based Parking Management': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our traditional ticket-based parking management system provides reliable and proven parking control for high-traffic facilities. Perfect for malls, airports, and commercial complexes requiring robust entry and exit management.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing at entry points, validation systems, and secure payment processing. Built with durability and reliability in mind, it handles thousands of transactions daily.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Streamlined ticket management with comprehensive reporting and analytics for optimal facility management.'}
        </p>
      `,
      'VAY Parking Guidance Display': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Enhance your parking facility with our intelligent parking guidance display system. These advanced LED displays provide real-time parking availability information, helping drivers quickly locate available spaces.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system integrates with our sensor network to display accurate space availability, reducing search time and improving traffic flow within your facility. Clear, bright LED indicators guide users efficiently to available parking spots.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Improved user experience with enhanced safety and security features for modern parking facilities.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Advanced parking solution designed to streamline operations and enhance user experience with cutting-edge technology and innovative features.'}
      </p>
    `;
  };
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Product Spotlight</h1>
        <p style="margin:8px 0 0 0;color:#dbeafe;font-size:16px;">Discover VayAccess Innovation</p>
      </div>
      
      <!-- Product Content -->
      <div style="padding:30px 20px;">
        <!-- Product Image -->
        <div style="text-align:center;margin-bottom:24px;">
          <img src="${imageUrl}" alt="${product.title}" 
               style="width:100%;max-width:500px;height:300px;object-fit:cover;border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,0.15);" />
        </div>
        
        <!-- Product Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${product.title}
        </h2>
        
        <!-- Product Description -->
        <div style="background:#f8fafc;border-radius:12px;padding:24px;margin:20px 0;">
          ${getEnhancedDescription(product.title, product.description)}
        </div>
        
        <!-- Key Features -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> Key Features</h3>
          <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
            <li>Advanced technology integration</li>
            <li>User-friendly interface</li>
            <li>Real-time monitoring and analytics</li>
            <li>Scalable and customizable solution</li>
            <li>24/7 technical support</li>
          </ul>
        </div>
        
        <!-- Benefits Section -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Benefits</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Increased operational efficiency</li>
            <li>Enhanced customer satisfaction</li>
            <li>Reduced operational costs</li>
            <li>Improved security and access control</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Ready to Learn More?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Get detailed specifications and pricing information</p>
          <a href="https://vayaccess.com/products" 
             style="display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
            View Product Details
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Questions? We're here to help!</p>
          <p style="margin:0;color:#2563eb;font-size:14px;">
             <a href="mailto:info@vayaccess.com" style="color:#2563eb;text-decoration:none;">info@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#2563eb;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Build individual solution email HTML
function buildSolutionEmailHtml(solution) {
  // Enhanced solution descriptions based on title
  const getEnhancedSolutionDescription = (title, originalDesc) => {
    const descriptions = {
      'Hybrid ANPR/FASTAG System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Experience the future of vehicle access control with our revolutionary Hybrid ANPR/FASTAG System. This cutting-edge solution combines the power of Automatic Number Plate Recognition (ANPR) technology with FASTAG integration for seamless, contactless vehicle access.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our hybrid approach ensures maximum compatibility and reliability. When FASTAG is available, the system processes payments instantly. When FASTAG is not detected, our advanced ANPR technology takes over, capturing and processing license plates with 99.9% accuracy.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'This dual-technology approach eliminates barriers to entry while maintaining the highest security standards for modern parking facilities.'}
        </p>
      `,
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Step into the future of parking management with our comprehensive ticketless solution. This intelligent system eliminates the need for physical tickets, creating a completely digital parking ecosystem that benefits both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Users can locate, reserve, and pay for parking spaces through our intuitive mobile application. The system provides real-time availability updates, navigation assistance, and secure payment processing, all while collecting valuable analytics for facility optimization.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Transform your parking operations with reduced operational costs, improved user satisfaction, and comprehensive facility management tools.'}
        </p>
      `,
      'Ticket Based Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our robust ticket-based parking management system provides proven reliability for high-volume parking facilities. Designed for environments where traditional ticketing is preferred or required, this solution offers comprehensive control and monitoring capabilities.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing, validation, and payment processing with multiple payment options. Built-in fraud prevention and comprehensive reporting ensure secure operations and detailed facility insights.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Perfect for malls, airports, and commercial complexes requiring reliable, high-capacity parking management with detailed transaction tracking.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Innovative smart parking solution that leverages cutting-edge technology to optimize parking operations and enhance user experience with advanced features and seamless integration.'}
      </p>
    `;
  };

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Smart Solution</h1>
        <p style="margin:8px 0 0 0;color:#e9d5ff;font-size:16px;">Intelligent Parking Innovation</p>
      </div>
      
      <!-- Solution Content -->
      <div style="padding:30px 20px;">
        <!-- Solution Icon/Visual -->
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);width:100px;height:100px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;box-shadow:0 8px 25px rgba(124,58,237,0.3);">
            <span style="font-size:42px;"></span>
          </div>
        </div>
        
        <!-- Solution Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${solution.title}
        </h2>
        
        <!-- Solution Description -->
        <div style="background:#faf5ff;border-radius:12px;padding:24px;margin:20px 0;border-left:4px solid #7c3aed;">
          ${getEnhancedSolutionDescription(solution.title, solution.description)}
        </div>
        
        <!-- How It Works -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> How It Works</h3>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">1</span>
              <span style="color:#374151;">Smart sensors detect vehicle presence</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">2</span>
              <span style="color:#374151;">Real-time data processing and analysis</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">3</span>
              <span style="color:#374151;">Automated guidance and management</span>
            </div>
          </div>
        </div>
        
        <!-- Key Advantages -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Key Advantages</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Reduces parking search time by up to 70%</li>
            <li>Increases parking revenue by 25-40%</li>
            <li>Minimizes traffic congestion</li>
            <li>Enhances overall user satisfaction</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Interested in This Solution?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Schedule a demo and see it in action</p>
          <a href="https://vayaccess.com/solutions" 
             style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(124,58,237,0.3);">
            Learn More
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Ready to implement this solution?</p>
          <p style="margin:0;color:#7c3aed;font-size:14px;">
             <a href="mailto:solutions@vayaccess.com" style="color:#7c3aed;text-decoration:none;">solutions@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#7c3aed;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Send individual product email
async function sendProductEmail(to, product, emailIndex = 0) {
  try {
    const html = withFooter(buildProductEmailHtml(product));
    const text = `VayAccess Product Spotlight: ${product.title}\n\n${product.description || ''}\n\nLearn more: https://vayaccess.com/products`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'product_spotlight',
      to,
      subject: ` New Product: ${product.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `product:${product.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'product', productTitle: product.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Product email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Send individual solution email
async function sendSolutionEmail(to, solution, emailIndex = 0) {
  try {
    const html = withFooter(buildSolutionEmailHtml(solution));
    const text = `VayAccess Smart Solution: ${solution.title}\n\n${solution.description || ''}\n\nLearn more: https://vayaccess.com/solutions`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'solution_spotlight',
      to,
      subject: ` Smart Solution: ${solution.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `solution:${solution.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'solution', solutionTitle: solution.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Solution email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Distribute individual emails based on user frequency (personalized per subscriber for hourly)
// options: { forceNow?: boolean; onlyEmail?: string }
async function distributeIndividualEmails(options = {}) {
  try {
    if (!mongoDb) return { success: false, message: 'DB not ready' };

    const { forceNow = false, onlyEmail } = options;
    const snapshot = getArticlesSnapshot();
    const { products, solutions } = snapshot;

    // Get all active subscribers (optionally filter by one email for testing)
    const q = { active: true };
    if (onlyEmail) q.email = String(onlyEmail).toLowerCase();
    const subscribers = await mongoDb.collection('subscribers')
      .find(q)
      .toArray();

    if (subscribers.length === 0) {
      return { success: true, message: 'No active subscribers' };
    }

    const stats = {
      hourly: { products: 0, solutions: 0, sent: 0, failed: 0 },
      daily: { products: 0, solutions: 0, sent: 0, failed: 0 },
      weekly: { products: 0, solutions: 0, sent: 0, failed: 0 }
    };

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // A simple hash to integer for personalization
    function hashToInt(str) {
      const hex = crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
      return parseInt(hex.slice(0, 8), 16); // 32-bit range
    }

    // Group subscribers by frequency
    const subscribersByFreq = {
      hourly: subscribers.filter(s => s.frequency === 'hourly'),
      daily: subscribers.filter(s => s.frequency === 'daily'),
      weekly: subscribers.filter(s => s.frequency === 'weekly')
    };

    // Send emails based on frequency
    for (const [frequency, subs] of Object.entries(subscribersByFreq)) {
      if (subs.length === 0) continue;

      if (frequency === 'hourly') {
        // Personalized selection per-subscriber per-hour
        const hourKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        for (const subscriber of subs) {
          try {
            // Build a stable per-hour hash using email + hour key
            const h = hashToInt(`${String(subscriber.email).toLowerCase()}:${hourKey}`);

            // Decide category first, considering availability
            let pickType = 'product';
            if (products.length === 0 && solutions.length === 0) continue;
            if (products.length === 0) pickType = 'solution';
            else if (solutions.length === 0) pickType = 'product';
            else pickType = (h % 2 === 0) ? 'product' : 'solution';

            if (pickType === 'product') {
              const idx = products.length ? (h % products.length) : 0;
              const item = products[idx];
              const res = await sendProductEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.products++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            } else {
              // Use a different mix for solutions for better spread
              const idx = solutions.length ? ((h >> 3) % solutions.length) : 0;
              const item = solutions[idx];
              const res = await sendSolutionEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.solutions++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send personalized hourly email to ${subscriber.email}:`, e?.message);
            stats.hourly.failed++;
          }
        }
        continue; // Move to next frequency
      }

      // Daily and Weekly keep existing shared content logic
      let shouldSend = false;
      let contentToSend = [];

      if (frequency === 'daily') {
        shouldSend = forceNow || currentHour === 9; // Send at 9 AM daily (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const seed = forceNow ? now.getTime() : now.getDate();
            const dayIndex = seed % total;
            if (dayIndex < products.length) contentToSend.push({ type: 'product', item: products[dayIndex] });
            else contentToSend.push({ type: 'solution', item: solutions[dayIndex - products.length] });
          }
        }
      } else if (frequency === 'weekly') {
        shouldSend = forceNow || (currentDay === 1 && currentHour === 10); // Monday 10 AM (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const weekNumber = forceNow ? Math.floor(now.getTime() / (24 * 60 * 60 * 1000)) : Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
            const startIndex = (weekNumber * 2) % total;
            for (let i = 0; i < 2 && i < total; i++) {
              const index = (startIndex + i) % total;
              if (index < products.length) contentToSend.push({ type: 'product', item: products[index] });
              else contentToSend.push({ type: 'solution', item: solutions[index - products.length] });
            }
          }
        }
      }

      if (!shouldSend || contentToSend.length === 0) continue;

      for (const subscriber of subs) {
        for (let i = 0; i < contentToSend.length; i++) {
          const content = contentToSend[i];
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 2000)); // small pacing
          try {
            let result;
            if (content.type === 'product') {
              result = await sendProductEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].products++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            } else {
              result = await sendSolutionEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].solutions++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send ${content.type} email to ${subscriber.email}:`, e?.message);
            stats[frequency].failed++;
          }
        }
      }
    }

    const totalSent = Object.values(stats).reduce((sum, s) => sum + s.sent, 0);
    const totalFailed = Object.values(stats).reduce((sum, s) => sum + s.failed, 0);

    console.log(`Individual emails distributed: ${totalSent} sent, ${totalFailed} failed`, stats);

    return {
      success: true,
      stats,
      totalSent,
      totalFailed,
      message: `Distributed ${totalSent} individual emails`
    };

  } catch (e) {
    console.warn('Individual email distribution failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

function buildMarketingDigestHtml() {
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      <h3 style="margin:0 0 8px 0;color:#111827;">Special Offers & Updates</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
      <p style="margin-top:10px;"><a href="https://vayaccess.com/contact" style="color:#2563eb;text-decoration:none;">Contact sales</a></p>
    </div>`;
}

// Content APIs
app.get('/api/content/articles', (req, res) => {
  try {
    const snap = getArticlesSnapshot();
    res.json({ success: true, count: snap.articles.length, articles: snap.articles });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to build articles' });
  }
});

// Admin-protected triggers for content digest
function isAdmin(req) {
  const header = req.headers['x-admin-secret'] || req.headers['x-admin-token'];
  const query = req.query?.secret || req.query?.token;
  const provided = header || query;
  const expected = process.env.ADMIN_SECRET;
  return expected && provided && String(provided) === String(expected);
}

app.post('/api/admin/content/auto-check', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    await checkAndBroadcastContentUpdates();
    res.json({ success: true, message: 'Auto-check executed' });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to run auto-check' });
  }
});

app.post('/api/admin/content/broadcast', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const snap = getArticlesSnapshot();
    const result = await broadcastDigest(snap, { force: true });
    res.json({ success: true, message: 'Broadcast triggered', result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to broadcast' });
  }
});

// Manual newsletter trigger for testing
app.post('/api/admin/newsletter/send-test', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const { frequency = 'hourly', testEmail } = req.body;

    // Use individual distribution with forceNow and optional single email targeting
    const result = await distributeIndividualEmails({ forceNow: true, onlyEmail: testEmail || undefined });
    res.json({ success: true, message: `${frequency} digest dispatched${testEmail ? ' to ' + testEmail : ''}`, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send newsletter' });
  }
});

// Get newsletter statistics
app.get('/api/admin/newsletter/stats', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!mongoDb) return res.status(503).json({ success: false, message: 'DB not ready' });
    
    const totalSubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const hourlySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'hourly' });
    const dailySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'daily' });
    const weeklySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'weekly' });
    
    const recentEmails = await mongoDb.collection('email_events')
      .find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    
    res.json({
      success: true,
      stats: {
        totalSubscribers: totalSubs,
        byFrequency: {
          hourly: hourlySubs,
          daily: dailySubs,
          weekly: weeklySubs
        },
        recentEmails: recentEmails.length,
        lastEmails: recentEmails.map(e => ({
          to: e.to,
          subject: e.subject,
          category: e.category,
          result: e.result,
          createdAt: e.createdAt
        }))
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to get stats' });
  }
});

// Newsletter subscribe endpoint (legacy v1) - renamed to avoid shadowing improved version below
app.post('/api/newsletter/subscribe-v1', async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!email || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    if (!mongoDb) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const col = mongoDb.collection('subscribers');
    await col.updateOne(
      { email: email.toLowerCase() },
      { $set: { email: email.toLowerCase(), source: source || 'footer', active: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    // Category-wise triggers: send separate emails for products and solutions
    try {
      const { products, solutions } = getArticlesSnapshot();

      // Products trigger
      if (products?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_products',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Top Products for You',
          html: buildArticleDigestHtml(products),
          text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: products.length },
          dedupeKey: `welcome-products:${String(email).trim().toLowerCase()}`,
        });
      }

      // Solutions trigger
      if (solutions?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_solutions',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Latest Parking Solutions',
          html: buildArticleDigestHtml(solutions),
          text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: solutions.length },
          dedupeKey: `welcome-solutions:${String(email).trim().toLowerCase()}`,
        });
      }
    } catch (digestErr) {
      console.warn('Welcome category digests failed (continuing):', digestErr?.message || digestErr);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    console.error(' Subscribe error:', e);
    res.status(500).json({ success: false, message: 'Failed to subscribe' });
  }
});

// Scheduler (configurable, default every 3 minutes)
if (process.env.ENABLE_CONTENT_AUTONEWS !== 'false') {
  const minutes = Number(process.env.CONTENT_AUTONEWS_INTERVAL_MIN || process.env.CONTENT_AUTONEWS_INTERVAL || 3);
  const intervalMs = Math.max(60_000, Math.floor(minutes) * 60 * 1000); // >= 1 minute
  setInterval(checkAndBroadcastContentUpdates, intervalMs);
  // Initial delayed check to allow Mongo to connect
  setTimeout(checkAndBroadcastContentUpdates, 30 * 1000);
}

// --- Daily Digest (Email + Web Push) ---
let ENABLE_DAILY_DIGEST = process.env.ENABLE_DAILY_DIGEST !== 'false';
if (!ENABLE_DAILY_DIGEST) {
  console.warn('Daily digest disabled by env, overriding to enabled.');
  ENABLE_DAILY_DIGEST = true;
}
const DAILY_DIGEST_HOUR_IST = Number(process.env.DAILY_DIGEST_HOUR_IST || 9); // 9 AM IST by default
const DAILY_DIGEST_CHECK_MIN = Number(process.env.DAILY_DIGEST_CHECK_MIN || 5); // check every 5 minutes

function nowIST() {
  // Create a Date object representing current time in Asia/Kolkata
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function formatISTDate(d = nowIST()) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function ymd(d = nowIST()) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getDailySubject(d = nowIST()) {
  const dateStr = formatISTDate(d);
  const options = [
    ` Live Parking Updates + Smart Access News — ${dateStr}`,
    'VayAccess Daily: Smarter Parking, Safer Access',
    ' New Features + Live Analytics for Parking Control',
    `[Today’s Update] VayAccess Parking Solutions — ${dateStr}`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

async function buildDailySections() {
  // Compute lightweight stats from existing Mongo collections (fallback to placeholders)
  try {
    if (!mongoDb) return null;
    const subsCount = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const todayStartIST = nowIST();
    todayStartIST.setHours(0, 0, 0, 0);
    const todayEndIST = new Date(todayStartIST);
    todayEndIST.setHours(23, 59, 59, 999);

    // Convert IST bounds to UTC by reconstructing from string to avoid timezone drift
    const startUTC = new Date(new Date(todayStartIST).toISOString());
    const endUTC = new Date(new Date(todayEndIST).toISOString());

    const todaysAnnouncements = await mongoDb.collection('announcements').countDocuments({
      createdAt: { $gte: startUTC, $lte: endUTC }
    });

    const { articles } = getArticlesSnapshot();
    const top3 = articles.slice(0, 3).map(a => a.title);

    return {
      subsCount,
      todaysAnnouncements,
      top3,
    };
  } catch (_) {
    return null;
  }
}

function buildDailyDigestHtml(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  const logoUrl = `${PUBLIC_BASE_URL}/assets/vay-logo.jpg`;
  const highlight = (
    sections?.top3?.length ? sections.top3.map(t => `“${t}”`).join(' • ') :
    'New Hikvision camera integration live on 2 sites. RFID reduced wait time by 38%.'
  );
  return `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f9fafb;padding:18px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <img src="${logoUrl}" alt="VayAccess" style="height:36px;width:auto;" />
      <div style="font-weight:700;color:#111827;">Smart Parking. Secure Access. Seamless Control.</div>
    </div>
    <h2 style="margin:4px 0 10px 0;">${getDailySubject(d)}</h2>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <h3 style="margin:0 0 8px 0;"> Daily System Highlights</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">
        ${highlight || 'Today’s report: Live updates across VayAccess deployments.'}
      </p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Analytics Snapshot</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>Subscribers: ${sections?.subsCount ?? '—'}</li>
        <li>Announcements today: ${sections?.todaysAnnouncements ?? '—'}</li>
        <li>Peak entry time: 9:12 AM (sample)</li>
        <li>Average parking duration: 3h 20m (sample)</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Product Tips / Knowledge</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Did you know? VayAccess web dashboard supports live push notifications for security alerts and automated reports in one click.</p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Marketing / Offers</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: Get 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Real-Time Alerts</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Enable web push to get instant alerts for gate failures, unauthorized entries, and congestion updates.</p>
    </div>

    <p style="color:#6b7280;font-size:12px;text-align:center;margin-top:14px;">Sent on ${dateStr} • VayAccess</p>
  </div>`;
}

function buildDailyDigestText(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  return [
    getDailySubject(d),
    '',
    ' Daily System Highlights:',
    (sections?.top3 || []).map(t => `- ${t}`).join('\n') || '- New Hikvision camera integration live on 2 sites',
    '',
    ' Analytics Snapshot:',
    `- Subscribers: ${sections?.subsCount ?? '—'}`,
    `- Announcements today: ${sections?.todaysAnnouncements ?? '—'}`,
    '- Peak entry time: 9:12 AM (sample)',
    '- Average parking duration: 3h 20m (sample)',
    '',
    ' Product Tips / Knowledge:',
    '- Dashboard supports live push alerts and automated reports',
    '',
    ' Marketing / Offers:',
    '- 20% off on new camera integrations',
    '- Enterprise unlocks advanced AI analytics',
    '',
    `Sent on ${dateStr}`
  ].join('\n');
}

async function sendDailyDigest({ force = false } = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const todayKey = ymd();
  const sentCol = mongoDb.collection('daily_digest_sent');
  const exists = await sentCol.findOne({ _id: todayKey });
  if (exists && !force) return { success: true, message: 'Already sent today' };

  const sections = await buildDailySections();

  // Collect subscribers with prefs
  const subs = await mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1, prefs: 1 } }).toArray();
  const validSubs = subs.filter(s => /.+@.+\..+/.test(s.email));

  // Email broadcast per-subscriber with category templates
  let sent = 0, failed = 0;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    for (const s of validSubs) {
      const to = String(s.email).toLowerCase();
      const prefs = s.prefs || { products: true, solutions: true };
      const { products, solutions } = getArticlesSnapshot();

      // Build personalized content with category templates
      const chunks = [];
      if (prefs.products) chunks.push(buildProductsDigestHtml(products.slice(0, 8)));
      if (prefs.solutions) chunks.push(buildSolutionsDigestHtml(solutions.slice(0, 8)));
      if (prefs.marketing) chunks.push(buildMarketingDigestHtml());
      const html = chunks.join('\n');
      const subject = getDailySubject();
      const text = [
        subject,
        '',
        prefs.products ? (products.slice(0, 5).map(a => `- [Product] ${a.title}`).join('\n')) : '',
        prefs.solutions ? (solutions.slice(0, 5).map(a => `- [Solution] ${a.title}`).join('\n')) : '',
        prefs.marketing ? ('- [Marketing] Special offers available') : '',
      ].filter(Boolean).join('\n');

      try {
        await emailHelper.sendCategorizedEmail({
          category: 'daily_personalized',
          to,
          subject,
          html: withFooter(html),
          text,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `daily:${todayKey}:${to}`,
          meta: { daily: true, prefs },
        });
        sent++;
      } catch (_) { failed++; }
    }
  }

  // Push notifications
  let pushOk = 0, pushFail = 0;
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token || t, 'VayAccess Daily', 'Open for today\'s updates', '/'); pushOk++; } catch (_) { pushFail++; }
    }
  } catch (_) {}

  await sentCol.updateOne({ _id: todayKey }, { $set: { _id: todayKey, sentAt: new Date(), emails: sent, failed } }, { upsert: true });
  // Return counts based on computed values to avoid referencing undefined variables
  return { success: true, emails: { sent, failed }, push: { sent: pushOk, failed: pushFail } };
}

// Admin: manual daily digest
app.post('/api/admin/daily-digest/send', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const force = String(req.query.force || '').toLowerCase() === 'true';
    const result = await sendDailyDigest({ force });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send daily digest' });
  }
});

// Admin: preview daily digest HTML
app.get('/api/admin/daily-digest/preview', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).send('Forbidden');
    const sections = await buildDailySections();
    res.setHeader('Content-Type', 'text/html');
    res.send(buildDailyDigestHtml(sections));
  } catch (e) {
    res.status(500).send('Failed to build preview');
  }
});

// Daily scheduler (IST hour)
if (ENABLE_DAILY_DIGEST) {
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const n = nowIST();
      if (n.getHours() >= DAILY_DIGEST_HOUR_IST) {
        await sendDailyDigest();
      }
    } catch (e) {
      console.warn('Daily digest scheduler error:', e?.message || e);
    }
  }, Math.max(60_000, DAILY_DIGEST_CHECK_MIN * 60 * 1000));
}

// Start HTTP server (required for Vite proxy to work)
server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
});

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }
    
    console.log(' Processing contact form submission:', { name, email, message });
    
    // 1. Send notification to info@vayaccess.com
    const adminNotificationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: 'info@vayaccess.com',
      replyTo: email, // Allows replying directly to the customer
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <!-- Header-style summary block to mirror desired format -->
          <div style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 6px 0; font-weight: 700; color: #111827;">Thank you for contacting VayAccess - Response within 2 hours</p>
            <p style="margin: 0 0 6px 0; color: #374151;">VayAccess Support Team &lt;info@vayaccess.com&gt;</p>
            <p style="margin: 0 0 6px 0; color: #6b7280;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            <p style="margin: 0; color: #6b7280;">to ${name}</p>
          </div>

          <div style="background: white; padding: 24px;">
            <h1 style="margin: 0 0 10px 0; font-size: 22px; color: #059669;">Message Received Successfully</h1>
            <p style="margin: 6px 0 20px 0; color: #6b7280;">Thank you for contacting VayAccess</p>

            <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Dear <strong>${name}</strong>,</p>
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>

            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
              <h3 style="color: #2563eb; margin: 0 0 10px 0; font-size: 16px;">Your Message Summary</h3>
              <div style="background: white; padding: 12px; border-radius: 6px; color: #6b7280; font-style: italic;">
                "${message}"
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #059669; margin: 0 0 10px 0; font-size: 18px;">What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>

            <div style="background: #fff7ed; border: 1px solid #fb923c; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #c2410c; margin: 0 0 10px 0; font-size: 16px;">Need Immediate Assistance?</h3>
              <p style="margin: 0; color: #92400e;"><a href="tel:+917207244344" style="color: #2563eb; text-decoration: none;">+91 720 724 4344</a> • <a href="https://wa.me/917207244344" style="color: #10b981; text-decoration: none;">WhatsApp</a> • <a href="mailto:info@vayaccess.com" style="color: #6b7280; text-decoration: none;">Email</a></p>
            </div>

            <div style="margin: 20px 0; text-align: center;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Visit Our Website</a>
            </div>

            <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; color: #6b7280; font-size: 14px;">
              <p style="margin: 0 0 6px 0;"><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 12px 0 0 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 12px;">
                This is an automated confirmation. Please save this email for your records.
              </p>

              <p style="text-align:center; color:#6b7280; font-size: 13px; margin-top: 16px;">
                <strong>Customer Details:</strong> ${name} • <a href="mailto:${email}" style="color:#2563eb; text-decoration:none;">${email}</a>
              </p>
            </div>
          </div>
        </div>
      `,
      text: `Thank you for contacting VayAccess - Response within 2 hours
VayAccess Support Team <info@vayaccess.com>
${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
to ${name}

Message Received Successfully
Thank you for contacting VayAccess

Dear ${name},
Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.

Your Message Summary
"${message}"

What Happens Next?
Quick Response: Our technical specialists will respond within 2 hours during business hours
Detailed Analysis: We'll review your requirements and provide customized recommendations
Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

Need Immediate Assistance?
+91 720 724 4344  WhatsApp  Email

Visit Our Website
Business Hours: Monday - Friday: 9:00 AM - 6:00 PM IST

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Customer Details: ${name} • ${email}

This is an automated confirmation. Please save this email for your records.`
    };
    
    // 2. Send auto-confirmation to customer
    const customerConfirmationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;"> Message Received Successfully</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for contacting VayAccess</p>
          </div>
          
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">Dear <strong>${name}</strong>,</p>
            
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>
            
            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 15px 0; font-size: 16px;"> Your Message Summary</h3>
              <div style="background: white; padding: 15px; border-radius: 6px;">
                <p style="margin: 0; color: #6b7280; font-style: italic;">"${message.length > 200 ? message.substring(0, 200) + '...' : message}"</p>
              </div>
            </div>
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 25px; margin: 25px 0;">
              <h3 style="color: #059669; margin: 0 0 15px 0; font-size: 18px;"> What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="color: #d97706; margin: 0 0 10px 0; font-size: 16px;"> Need Immediate Assistance?</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <a href="tel:+917207244344" style="background: #2563eb; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> +91 720 724 4344</a>
                <a href="https://wa.me/917207244344" style="background: #10b981; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> WhatsApp</a>
                <a href="mailto:info@vayaccess.com" style="background: #6b7280; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> Email</a>
              </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                 Visit Our Website
              </a>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
              <p><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 15px 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
                This is an automated confirmation. Please save this email for your records.
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
Dear ${name},

Thank you for contacting VayAccess regarding your parking solution requirements.

YOUR MESSAGE:
"${message}"

WHAT HAPPENS NEXT:
• Quick Response: Our technical specialists will respond within 2 hours during business hours
• Detailed Analysis: We'll review your requirements and provide customized recommendations  
• Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

NEED IMMEDIATE ASSISTANCE?
Phone: +91 70137 99462
WhatsApp: +91 70137 99462
Email: info@vayaccess.com

BUSINESS HOURS:
Monday - Friday: 9:00 AM - 6:00 PM IST

Best regards,
VayAccess Support Team

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Website: https://vayaccess.com
      `
    };
    
    // Send both emails
    console.log(' Sending admin notification...');
    await transporter.sendMail(adminNotificationEmail);
    console.log(' Admin notification sent successfully');
    
    console.log(' Sending customer confirmation...');
    await transporter.sendMail(customerConfirmationEmail);
    console.log(' Customer confirmation sent successfully');
    
    res.json({
      success: true,
      message: 'Thank you for your inquiry! We have received your message and sent a confirmation to your email. Our team will respond within 2 hours during business hours.'
    });
    
  } catch (error) {
    console.error(' Contact form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    });
  }
});

// =============================================================================
// AI CALL AGENT API ENDPOINTS
// =============================================================================

// Initialize AI call session
app.post('/api/ai-call/initialize', async (req, res) => {
  try {
    const { customerPhone, customerName } = req.body;
    
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Customer phone number is required'
      });
    }
    
    console.log(` Initializing AI call for ${customerPhone}`);
    const result = await voiceAIService.initializeCall(customerPhone, customerName);
    
    if (result.success) {
      // Notify admin dashboard of new call
      io.emit('new-call-initialized', {
        sessionId: result.sessionId,
        customerPhone,
        customerName,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error initializing AI call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize AI call session'
    });
  }
});

// Process voice input and get AI response
app.post('/api/ai-call/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Message and session ID are required'
      });
    }
    
    console.log(` Processing chat for session ${sessionId}: "${message}"`);
    const result = await voiceAIService.generateAIResponse(message, sessionId);
    
    // Broadcast conversation update to admin dashboard
    io.emit('call-conversation-update', {
      sessionId,
      customerMessage: message,
      aiResponse: result.response,
      timestamp: new Date()
    });
    
    res.json(result);
  } catch (error) {
    console.error(' Error processing AI chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process conversation'
    });
  }
});

// Convert speech to text
app.post('/api/ai-call/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!req.file || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Audio file and session ID are required'
      });
    }
    
    console.log(` Processing speech-to-text for session ${sessionId}`);
    const audioBuffer = require('fs').readFileSync(req.file.path);
    const result = await voiceAIService.speechToText(audioBuffer, sessionId);
    
    // Clean up uploaded file
    require('fs').unlinkSync(req.file.path);
    
    res.json(result);
  } catch (error) {
    console.error(' Error in speech-to-text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process speech'
    });
  }
});

// Convert text to speech
app.post('/api/ai-call/text-to-speech', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Text and session ID are required'
      });
    }
    
    console.log(` Converting text to speech for session ${sessionId}`);
    const result = await voiceAIService.textToSpeech(text, sessionId);
    
    if (result.success) {
      // Send audio file path for client to download
      res.json({
        ...result,
        audioUrl: `/api/ai-call/audio/${result.audioFile}`
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error(' Error in text-to-speech:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate speech'
    });
  }
});

// Serve generated audio files
app.get('/api/ai-call/audio/:filename', (req, res) => {
  try {
    const audioPath = require('path').join(__dirname, 'recordings/tts/', req.params.filename);
    res.sendFile(audioPath);
  } catch (error) {
    console.error(' Error serving audio file:', error);
    res.status(404).json({ success: false, message: 'Audio file not found' });
  }
});

// =============================================================================
// TWILIO VOICE CALL WEBHOOKS (For Real Phone Calls)
// =============================================================================

// Initial TwiML when call is answered
app.post('/api/ai-call/twiml/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(` Call answered for session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Welcome message
    const welcomeMessage = `Hello! This is the AI assistant from VayAccess Parking Solutions. Thank you for your interest in our smart parking systems. How can I help you with your parking solution needs today?`;
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, welcomeMessage);
    
    // Gather customer's voice input
    const gather = twiml.gather({
      speechTimeout: 3,
      speechModel: 'experimental_conversations',
      enhanced: true,
      input: 'speech',
      action: `/api/ai-call/voice-response/${sessionId}`,
      method: 'POST'
    });
    
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please tell me about your parking requirements.');
    
    // If no input, try again
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I did not hear anything. Please speak clearly about your parking needs.');
    
    twiml.redirect(`/api/ai-call/twiml/${sessionId}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error generating TwiML:', error);
    res.status(500).send('Error processing call');
  }
});

// Handle customer voice input and AI response
app.post('/api/ai-call/voice-response/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const customerSpeech = req.body.SpeechResult || '';
    const callSid = req.body.CallSid;
    
    console.log(` Customer said: "${customerSpeech}" in session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    if (!customerSpeech) {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I could not understand what you said. Let me connect you with our human specialist.');
      
      twiml.say({
        voice: 'alice', 
        language: 'en-US'
      }, 'Please call us directly at +91 720 724 4344 for immediate assistance. Thank you!');
      
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }
    
    // Generate AI response using the voice service
    const aiResponse = await voiceAIService.generateAIResponse(customerSpeech, sessionId);
    
    if (aiResponse.success) {
      // Broadcast conversation update to frontend
      io.emit('call-conversation-update', {
        sessionId,
        customerMessage: customerSpeech,
        aiResponse: aiResponse.response,
        timestamp: new Date()
      });
      
      // Say AI response
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, aiResponse.response);
      
      // Continue conversation - check if call should end
      if (aiResponse.response.toLowerCase().includes('goodbye') || 
          aiResponse.response.toLowerCase().includes('thank you for calling') ||
          aiResponse.response.toLowerCase().includes('have a great day')) {
        twiml.hangup();
      } else {
        // Continue gathering input
        const gather = twiml.gather({
          speechTimeout: 4,
          speechModel: 'experimental_conversations',
          enhanced: true,
          input: 'speech',
          action: `/api/ai-call/voice-response/${sessionId}`,
          method: 'POST'
        });
        
        gather.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Is there anything else I can help you with regarding parking solutions?');
        
        // Timeout fallback
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Thank you for calling VayAccess. Have a great day!');
        twiml.hangup();
      }
    } else {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I apologize, but I am having technical difficulties. Please call our office at +91 720 724 4344 for immediate assistance. Thank you!');
      twiml.hangup();
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error processing voice response:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am experiencing technical difficulties. Please call +91 720 724 4344 for support. Goodbye!');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle call status updates from Twilio
app.post('/api/ai-call/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const callStatus = req.body.CallStatus;
    const callSid = req.body.CallSid;
    
    console.log(` Call status update for session ${sessionId}: ${callStatus}`);
    
    // Broadcast status update to frontend
    io.emit('call-status-changed', {
      sessionId,
      callSid,
      status: callStatus,
      timestamp: new Date()
    });
    
    // Handle call completion
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      console.log(` Call ${callSid} ended with status: ${callStatus}`);
      
      // Save call recording and summary
      try {
        await voiceAIService.saveCallRecording(sessionId, callStatus);
      } catch (error) {
        console.error(' Error saving call recording:', error);
      }
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error(' Error handling call status:', error);
    res.status(500).send('Error processing status update');
  }
});

// End call session
app.post('/api/ai-call/end', async (req, res) => {
  try {
    const { sessionId, callDuration } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    console.log(` Ending call session ${sessionId}`);
    const result = await voiceAIService.endCall(sessionId, callDuration);
    
    if (result.success) {
      // Notify admin dashboard of call completion
      io.emit('call-ended', {
        sessionId,
        callData: result.callData,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error ending call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end call session'
    });
  }
});

// Get current call status
app.get('/api/ai-call/status', async (req, res) => {
  try {
    const status = voiceAIService.getCurrentCallStatus();
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error(' Error getting call status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call status'
    });
  }
});

// =============================================================================
// ADMIN DASHBOARD API ENDPOINTS
// =============================================================================

// Get all call recordings (Admin only)
app.get('/api/admin/call-recordings', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    console.log(' Admin fetching call recordings');
    const result = await voiceAIService.getCallRecordings();
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recordings'
    });
  }
});

// Get specific call recording (Admin only)
app.get('/api/admin/call-recording/:sessionId', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const { sessionId } = req.params;
    console.log(` Admin fetching call recording for session ${sessionId}`);
    
    const result = await voiceAIService.getCallRecording(sessionId);
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recording'
    });
  }
});

// Admin dashboard statistics
app.get('/api/admin/call-statistics', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    const stats = {
      totalCalls: recordings.recordings.length,
      todayCalls: recordings.recordings.filter(call => {
        const today = new Date().toDateString();
        return new Date(call.startTime).toDateString() === today;
      }).length,
      averageDuration: recordings.recordings.reduce((acc, call) => acc + (call.duration || 0), 0) / recordings.recordings.length || 0,
      callsThisWeek: recordings.recordings.filter(call => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(call.startTime) >= weekAgo;
      }).length
    };

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error(' Error generating call statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate statistics'
    });
  }
});

// Send AI call recordings to parking system admin dashboard
app.post('/api/admin/sync-call-recordings', async (req, res) => {
  try {
    console.log(' Syncing AI call recordings with parking system admin dashboard...');
    
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    // Send recordings to parking system admin dashboard
    const parkingSystemUrl = 'http://localhost:8080';
    
    try {
      const axios = require('axios');
      
      const syncResponse = await axios.post(`${parkingSystemUrl}/api/admin/ai-call-recordings`, {
        recordings: recordings.recordings,
        source: 'vayaccess-ai-agent',
        syncTime: new Date().toISOString()
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(' Successfully synced AI call recordings to parking system');
      
      res.json({
        success: true,
        message: 'AI call recordings synced successfully',
        recordingsSynced: recordings.recordings.length,
        parkingSystemResponse: syncResponse.data
      });

    } catch (syncError) {
      console.log(' Parking system not available for sync, continuing with local storage');
      
      res.json({
        success: true,
        message: 'Recordings available locally, parking system sync will retry automatically',
        recordingsSynced: recordings.recordings.length,
        localRecordings: recordings.recordings
      });
    }

  } catch (error) {
    console.error(' Error syncing call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync call recordings'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test email endpoint (for development)
app.post('/api/test-email', async (req, res) => {
  try {
    const testEmail = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: 'VayAccess Email Service Test',
      html: '<h1>Email service is working!</h1><p>This is a test email from your VayAccess backend.</p>'
    };
    
    await transporter.sendMail(testEmail);
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Newsletter subscription endpoint (MongoDB-first, email optional)
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email, source = 'website' } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    // Persist to MongoDB if available; otherwise, skip persistence gracefully
    try {
      if (mongoDb) {
        const normalized = String(email).trim().toLowerCase();
        const now = new Date();
        const col = mongoDb.collection('subscribers');
        const existing = await col.findOne({ email: normalized });
        if (existing && existing.active !== false) {
          return res.json({ success: true, message: 'You are already subscribed. You will receive live news daily from VayAccess.' });
        }

        await col.updateOne(
          { email: normalized },
          {
            $setOnInsert: { createdAt: now, prefs: { products: true, solutions: true, marketing: true } },
            $set: { email: normalized, source, active: true, updatedAt: now },
          },
          { upsert: true }
        );
        // Ensure default prefs exist on existing records
        await col.updateOne(
          { email: normalized, $or: [ { prefs: { $exists: false } }, { prefs: null } ] },
          { $set: { 'prefs.products': true, 'prefs.solutions': true, 'prefs.marketing': true } }
        );
      } else {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
      }
    } catch (persistErr) {
      console.warn('Failed to persist subscriber to MongoDB (continuing):', persistErr?.message || persistErr);
    }

    // Optional welcome email; do not fail if SMTP is missing
    try {
      await emailHelper.sendCategorizedEmail({
        category: 'newsletter_welcome',
        to: String(email).trim().toLowerCase(),
        subject: 'Welcome to VayAccess Newsletter',
        html: withFooter(`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                 <h2 style="margin:0 0 12px 0;">Welcome to VayAccess Newsletter</h2>
                 <p style="color:#374151;line-height:1.6;">You will receive product news, articles, and live updates.</p>
                 <p style="margin-top:16px;"><a href="https://vayaccess.com" style="color:#2563eb;text-decoration:none;">Visit website</a></p>
               </div>`),
        text: 'Welcome to VayAccess Newsletter\nYou will receive product news, articles, and live updates.',
        meta: { source },
        headers: buildUnsubscribeHeaders(email),
        dedupeKey: `welcome:${String(email).trim().toLowerCase()}`
      });
    } catch (emailErr) {
      console.warn('Welcome email failed (continuing):', emailErr?.message || emailErr);
    }

    // Conditionally send present products/solutions digest immediately
    try {
      if (process.env.SEND_DIGEST_ON_SUBSCRIBE === 'true') {
        const snapshot = getContentSnapshot();
        await sendDigestToEmail(String(email).trim().toLowerCase(), snapshot);
      }
    } catch (e) {
      console.warn('Failed to send initial digest (continuing):', e?.message || e);
    }

    // Optional: send a marketing promo immediately on subscribe
    try {
      if ((process.env.SEND_MARKETING_ON_SUBSCRIBE || 'true').toLowerCase() !== 'false') {
        await emailHelper.sendCategorizedEmail({
          category: 'marketing',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Transform Your Parking with Smart Access',
          html: withFooter(`<div style='font-family:Arial,sans-serif;max-width:700px;margin:0 auto;'>
  <h2 style='margin:0 0 10px 0;color:#111827;'>Welcome to VayAccess</h2>
  <p style='color:#374151;line-height:1.6;margin:0 0 10px 0;'>Explore ANPR vehicle access, robust barrier gates, turnstiles, and real-time management.</p>
  <p style='margin-top:12px;'>
    <a href='https://vayaccess.com/products' style='background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;'>Explore Products</a>
    <span style='margin-left:12px;'><a href='https://vayaccess.com/solutions' style='color:#2563eb;text-decoration:none;'>View Solutions</a></span>
  </p>
</div>`),
          text: 'Explore VayAccess products and solutions: https://vayaccess.com',
          headers: buildUnsubscribeHeaders(email),
          dedupeKey: `marketing-on-subscribe:${String(email).trim().toLowerCase()}`,
          meta: { source, onSubscribe: true },
        });
      }
    } catch (marketingErr) {
      console.warn('Marketing email on subscribe failed (continuing):', marketingErr?.message || marketingErr);
    }

    return res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    console.error('Subscribe failed:', error);
    return res.status(500).json({ success: false, message: 'Subscription failed' });
  }
});

// Simple secured endpoint to send an update email to a recipient
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: to, subject, and html or text' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent.' });
  } catch (error) {
    console.error('Send update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// Broadcast to all subscribers (MongoDB)
app.post('/api/newsletter/broadcast', async (req, res) => {
  try {
    // security
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) {
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    const { subject, html, text, dryRun = false, onlyActive = true, category = 'marketing' } = req.body || {};
    if (!subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: subject and html or text' });
    }

    // fetch subscribers from MongoDB
    const filter = onlyActive ? { active: { $ne: false } } : {};
    const subsCursor = mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray())
      .map(d => d.email)
      .filter(e => /.+@.+\..+/.test(e));

    if (emails.length === 0) {
      return res.json({ success: true, message: 'No subscribers to send', count: 0, emails: [] });
    }

    if (dryRun) {
      return res.json({ success: true, message: 'Dry run: would send to these emails', count: emails.length, emails });
    }

    // send in sequence (simple). For large lists, batch/queue.
    let ok = 0, fail = 0;
    for (const to of emails) {
      try {
        await emailHelper.sendCategorizedEmail({
          category,
          to,
          subject,
          html: withFooter(html || ''),
          text: text || undefined,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `broadcast:${category}:${subject}:${String(to).toLowerCase()}`,
          meta: { broadcast: true },
        });
        ok++;
      } catch (e) {
        fail++;
      }
    }

    return res.json({ success: true, message: 'Broadcast completed', category, sent: ok, failed: fail, count: emails.length });
  } catch (error) {
    console.error('Broadcast failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to broadcast' });
  }
});

// Push token registration (MongoDB) — dev-safe fallback
app.post('/api/push/register', async (req, res) => {
  try {
    const { token, email } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'Missing token' });

    // If MongoDB is unavailable and dev fallback enabled, no-op to avoid UX break
    if (!mongoDb) {
      if (process.env.ALLOW_DEV_NO_DB === 'true') {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
        return res.json({ success: true, message: 'Token accepted (no DB in dev)' });
      }
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    await mongoDb.collection('pushTokens').updateOne(
      { token },
      {
        $set: {
          token,
          email: email || null,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Token registered' });
  } catch (e) {
    console.error('Register push token failed:', e);
    return res.status(500).json({ success: false, message: 'Failed to register token' });
  }
});

// --- Helpers for FCM HTTP v1 (web push) ---
const { google } = require('googleapis');
const fetch = require('node-fetch');
let FB_PROJECT_ID = process.env.FB_PROJECT_ID;
try {
  if (!FB_PROJECT_ID) {
    const svc = require('./service-account.json');
    FB_PROJECT_ID = svc.project_id;
  }
} catch (_) {}

async function getFcmAccessToken() {
  const key = require('./service-account.json');
  const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

async function sendFcmMessage(token, title, body, link) {
  if (!FB_PROJECT_ID) throw new Error('Missing FB_PROJECT_ID or service-account project_id');
  const accessToken = await getFcmAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${FB_PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token,
      notification: { title, body },
      webpush: {
        fcm_options: { link: link || '/' },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM error: ${txt}`);
  }
  return res.json();
}

// Publish update: save to MongoDB and auto-send email + push
app.post('/api/updates/publish', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { title, body, link = '/', previewOnly = false } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });

    // Save announcement to MongoDB
    const insertRes = await mongoDb.collection('announcements').insertOne({
      title,
      body,
      link,
      createdAt: new Date(),
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    if (previewOnly) {
      return res.json({ success: true, message: 'Preview only', id: insertRes.insertedId, emailsCount: emails.length, tokensCount: tokens.length });
    }

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    return res.json({ success: true, id: insertRes.insertedId, emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Publish update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to publish update' });
  }
});

// Auto-publish endpoint: idempotent broadcast by version (no separate admin UI needed)
app.post('/api/updates/auto-publish', async (req, res) => {
    console.log('Received auto-publish request:', req.body); // Log the request body
  try {
    // Optional security with token
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { version, title, body, link = '/' } = req.body || {};
    if (!version || !title || !body) return res.status(400).json({ success: false, message: 'Missing version, title or body' });

    const versionId = String(version).trim();

    // Skip if already sent for this version
    const already = await mongoDb.collection('announcements_sent').findOne({ version: versionId });
    if (already) {
      return res.json({ success: true, message: 'Already sent for this version' });
    }

    // Save announcement entry (optional)
    const annInsert = await mongoDb.collection('announcements').insertOne({
      version: versionId,
      title,
      body,
      link,
      createdAt: new Date(),
      auto: true,
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    // Mark version as sent
    await mongoDb.collection('announcements_sent').updateOne(
      { version: versionId },
      {
        $set: {
          version: versionId,
          title,
          body,
          link,
          sentAt: new Date(),
          announcementId: annInsert.insertedId,
        }
      },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Auto-publish sent', emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Auto-publish failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to auto-publish' });
  }
});





// Admin: send a single update email (manual)
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing to/subject/body' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    console.error('Manual send failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});


// --- Hourly Digest Scheduler ---
const ENABLE_HOURLY_DIGEST = (process.env.ENABLE_HOURLY_DIGEST || 'false').toLowerCase() === 'true';
const DIGEST_CATEGORY = process.env.DIGEST_CATEGORY || 'content_digest';
const DIGEST_EMAIL = (process.env.DIGEST_EMAIL || 'true').toLowerCase() === 'true';
const DIGEST_PUSH = (process.env.DIGEST_PUSH || 'true').toLowerCase() === 'true';
const DIGEST_DEDUPE_WINDOW_MIN = parseInt(process.env.DIGEST_DEDUPE_WINDOW_MINUTES || '60', 10);

async function sendHourlyDigestOnce() {
  try {
    if (!mongoDb) {
      console.warn('[digest] Skipped: MongoDB not initialized');
      return;
    }

    // Snapshot current site content
    const snapshot = getContentSnapshot();
    // Rotate templates by hour to guarantee variation across sends
    const tpl = pickRotatingTemplate();

    // Dedupe: prevent re-sending same template within the window (optional)
    const now = new Date();
    const since = new Date(now.getTime() - DIGEST_DEDUPE_WINDOW_MIN * 60 * 1000);
    const recentKey = `digest:${tpl.key}:${snapshot.hash}`;
    const alreadySent = await mongoDb.collection('email_events').findOne({
      dedupeKey: { $regex: `^${recentKey}:` }, // per recipient entry saved below
      createdAt: { $gte: since },
      result: 'sent',
    });
    if (alreadySent) {
      console.log('[digest] Recently sent this template+hash. Skipping to avoid repetition.');
      return;
    }

    // Fetch subscribers
    const subs = await mongoDb.collection('subscribers')
      .find({ active: { $ne: false } }, { projection: { email: 1 } })
      .toArray();
    const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

    // Fetch push tokens
    const tokens = DIGEST_PUSH
      ? (await mongoDb.collection('pushTokens')
          .find({ active: { $ne: false } }, { projection: { token: 1 } })
          .toArray()).map(d => d.token)
      : [];

    // Send email
    if (DIGEST_EMAIL && emails.length) {
      let sent = 0, fail = 0;
      for (const to of emails) {
        try {
          await emailHelper.sendCategorizedEmail({
            category: DIGEST_CATEGORY,
            to,
            subject: tpl.subject(snapshot),
            html: tpl.buildHtml(snapshot),
            text: tpl.buildText(snapshot),
            headers: buildUnsubscribeHeaders(to),
            dedupeKey: `digest:${tpl.key}:${snapshot.hash}:${String(to).toLowerCase()}`,
            meta: { template: tpl.key }
          });
          sent++;
        } catch (_) { fail++; }
      }
      console.log(`[digest] Email done: sent=${sent} fail=${fail}`);
    }

    // Push notifications
    if (DIGEST_PUSH && tokens.length) {
      let ok = 0, fail = 0;
      for (const t of tokens) {
        try { await sendFcmMessage(t, tpl.subject(snapshot), 'See the latest products and solutions', '/products'); ok++; } catch (_) { fail++; }
      }
      console.log(`[digest] Push done: sent=${ok} fail=${fail}`);
    }

  } catch (e) {
    console.error('[digest] Hourly digest failed:', e?.message || e);
  }
} // Make dedupe per-recipient

if (ENABLE_HOURLY_DIGEST) {
  // Fire soon after boot, then every hour
  setTimeout(sendHourlyDigestOnce, 15 * 1000);
  setInterval(sendHourlyDigestOnce, 60 * 60 * 1000);
}

// Start HTTP server
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const voiceAIService = require('./services/voiceAIService');
const asteriskService = require('./services/asteriskService');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// MongoDB Atlas (replaces Firestore for subscribers/tokens)
const { MongoClient } = require('mongodb');
let mongoClient = null;
let mongoDb = null;
(async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'vay_parking_system';
  if (!uri) {
    console.warn('MongoDB not initialized: missing MONGODB_URI. Newsletter persistence will be disabled.');
    return;
  }

  // Attempt robust connection strategy for Windows/OpenSSL TLS issues
  let mongoReconnectTimer = null;

  function setupMongoAutoReconnect() {
    if (!mongoClient) return;
    const events = ['topologyClosed', 'serverClosed', 'serverHeartbeatFailed'];
    events.forEach((ev) => {
      try { mongoClient.removeAllListeners(ev); } catch {}
      mongoClient.on(ev, (info) => {
        if (mongoReconnectTimer) return;
        const msg = info && info.message ? info.message : '';
        console.warn(`MongoDB ${ev} - scheduling reconnect in 5s`, msg);
        mongoReconnectTimer = setTimeout(async () => {
          mongoReconnectTimer = null;
          let connected = await tryConnect('reconnect', { ...baseOptions });
          if (!connected) connected = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
          if (!connected) {
            connected = await tryConnect('reconnect + insecure', {
              ...baseOptions,
              tlsAllowInvalidCertificates: true,
              tlsAllowInvalidHostnames: true,
              family: 4,
            });
          }
          if (!connected) {
            console.warn('MongoDB reconnection failed; retrying in 10s');
            mongoReconnectTimer = setTimeout(async () => {
              mongoReconnectTimer = null;
              let ok = await tryConnect('reconnect', { ...baseOptions });
              if (!ok) ok = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
              if (!ok) {
                await tryConnect('reconnect + insecure', {
                  ...baseOptions,
                  tlsAllowInvalidCertificates: true,
                  tlsAllowInvalidHostnames: true,
                  family: 4,
                });
              }
            }, 10000);
          }
        }, 5000);
      });
    });
  }

  async function tryConnect(optionsLabel, options) {
    try {
      // Close previous client to avoid socket leaks
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
      mongoClient = new MongoClient(uri, options);
      await mongoClient.connect();
      mongoDb = mongoClient.db(dbName);
      console.log(`Connected to MongoDB Atlas database: ${dbName} (${optionsLabel})`);
      setupMongoAutoReconnect();
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn(`MongoDB connect failed [${optionsLabel}]:`, msg);
      return false;
    }
  }

  const baseOptions = {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
    tls: true,
    // Note: keepAlive options are not supported by the MongoDB Node.js driver v5.
    // We rely on the driver's internal keep-alive and our event-based reconnection.
  };

  const insecureEnv = process.env.MONGODB_TLS_INSECURE === 'true';

  // 1) If insecure explicitly requested via env, use it directly
  if (insecureEnv) {
    const ok = await tryConnect('tls+insecure (env)', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
    if (!ok) {
      console.warn('MongoDB initialization failed under insecure mode. Newsletter persistence will be disabled.');
    } else {
      // Ensure indexes for deduplication and idempotency
      try {
        await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
        await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
        await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
        console.log('MongoDB indexes ensured');
      } catch (idxErr) {
        console.warn('MongoDB index ensure failed:', idxErr.message);
      }
    }
    return;
  }

  // 2) Try strict TLS first
  let connected = await tryConnect('tls strict', { ...baseOptions });

  // 3) If fails, try strict TLS forcing IPv4 (DNS/IPv6 issues)
  if (!connected) {
    connected = await tryConnect('tls strict + IPv4', { ...baseOptions, family: 4 });
  }

  // 4) If still fails with SSL-related error, try insecure TLS as fallback
  if (!connected) {
    connected = await tryConnect('tls+insecure fallback', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
  }

  if (!connected) {
    console.warn('MongoDB initialization failed after all attempts. Newsletter persistence will be disabled.');
    return;
  }

  // Ensure indexes for deduplication and idempotency
  try {
    await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
    await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
    console.log('MongoDB indexes ensured');
  } catch (idxErr) {
    console.warn('MongoDB index ensure failed:', idxErr.message);
  }
})();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

// Initialize Socket.IO for real-time call communication
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
    credentials: true
  }
});

// Configure multer for audio file uploads
const upload = multer({
  dest: 'temp/', // temporary directory for uploaded audio files
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
  credentials: true
}));
app.use(express.json());

// Serve assets with stable URLs for emails and previews
app.use('/assets', express.static(path.resolve(__dirname, '../src/assets')));

// Serve admin interface (protected by admin token in the HTML)
app.get('/admin/newsletter', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin-newsletter.html'));
});

// Demo routes (FREE - no Twilio needed)
const demoRoutes = require('./routes/demo');
app.use('/api', demoRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', mongo: !!mongoDb });
});

// One-click unsubscribe (for List-Unsubscribe-Post)
app.post('/api/newsletter/unsubscribe', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const email = (req.body?.email || req.query?.e || '').toString().toLowerCase();
    const token = (req.body?.token || req.query?.t || '').toString();
    if (!email || token !== signUnsubToken(email)) return res.status(400).send('Invalid request');
    if (mongoDb) {
      await mongoDb.collection('subscribers').updateOne({ email }, { $set: { active: false, updatedAt: new Date() } });
    }
    // RFC-compliant one-click: respond 200 with empty body
    return res.status(200).send('');
  } catch (e) {
    return res.status(500).send('');
  }
});

// Subscribe endpoint (name, email, frequency)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { name, email, frequency } = req.body || {};
    const n = String(name || '').trim();
    const em = String(email || '').trim().toLowerCase();
    const f = String(frequency || 'weekly').toLowerCase();
    if (!/.+@.+\..+/.test(em)) return res.status(400).json({ success:false, message:'Invalid email' });
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });

    const now = new Date();
    await mongoDb.collection('subscribers').updateOne(
      { email: em },
      { $setOnInsert: { createdAt: now, subscribedAt: now }, $set: { name: n, frequency: freq, active: true, updatedAt: now } },
      { upsert: true }
    );

    // Send welcome email
    const headers = buildUnsubscribeHeaders(em);
    const firstName = n ? n.split(' ')[0] : 'there';
    const html = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p>Hi ${firstName},</p>
        <p>Thanks for subscribing to VayAccess updates (${freq}). You'll receive ${freq} digests with our latest articles.</p>
      </div>
    `);
    await emailHelper.sendCategorizedEmail({
      category: 'newsletter_welcome',
      to: em,
      subject: 'Welcome to VayAccess Updates',
      html,
      headers
    });

    return res.json({ success:true, message:'Subscribed' });
  } catch (e) {
    const msg = e?.code === 11000 ? 'Already subscribed' : (e?.message || 'Server error');
    return res.status(500).json({ success:false, message: msg });
  }
});

// Preferences update endpoint
app.post('/api/newsletter/update-preferences', async (req, res) => {
  try {
    const { email, token, frequency } = req.body || {};
    const em = String(email || '').toLowerCase();
    if (!em || token !== signUnsubToken(em)) return res.status(400).json({ success:false, message:'Invalid token' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const f = String(frequency || '').toLowerCase();
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    await mongoDb.collection('subscribers').updateOne({ email: em }, { $set: { frequency: freq, updatedAt: new Date() } });
    return res.json({ success:true });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Manual trigger for individual email distribution (for testing)
app.post('/api/newsletter/distribute-individual', async (req, res) => {
  try {
    const result = await distributeIndividualEmails();
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Server error' });
  }
});

// Articles: create & list
app.post('/api/articles', async (req, res) => {
  try {
    const { title, summary, content, tags } = req.body || {};
    if (!title || !summary) return res.status(400).json({ success:false, message:'Missing title/summary' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const doc = { title: String(title), summary: String(summary), content: String(content||''), tags: Array.isArray(tags)? tags.map(String):[], createdAt: new Date() };
    const result = await mongoDb.collection('articles').insertOne(doc);
    return res.json({ success:true, id: result.insertedId, article: doc });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

app.get('/api/articles', async (req, res) => {
  try {
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const { tag, limit } = req.query;
    const q = tag ? { tags: String(tag) } : {};
    const lim = Math.min(Number(limit)||20, 100);
    const items = await mongoDb.collection('articles').find(q).sort({ createdAt:-1 }).limit(lim).toArray();
    return res.json({ success:true, items });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Connect to Asterisk AMI on server start (optional via ENABLE_AMI)
if (process.env.ENABLE_AMI === 'true') {
  asteriskService.connect().catch(err => {
    console.error(' Failed to connect to Asterisk AMI:', err);
  });
} else {
  console.log(' Skipping AMI connection (ENABLE_AMI not set to true)');
}

// API endpoint to initiate call via Asterisk AMI
app.post('/api/call', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    if (!asteriskService.isAlive()) {
      await asteriskService.connect();
    }

    const result = await asteriskService.originateCall(number);

    if (result.success) {
      // Emit call status to frontend clients
      io.emit('call-status-changed', {
        sessionId: result.sessionId,
        phoneNumber: number,
        status: 'initiated',
        timestamp: new Date()
      });
    }

    res.json(result);
  } catch (error) {
    console.error(' Error originating call:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

// Listen for call-originated event from asteriskService and broadcast
asteriskService.on('call-originated', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'ringing',
    timestamp: new Date()
  });
});

// Socket.IO connection handling for real-time call features
io.on('connection', (socket) => {
  console.log(` Client connected: ${socket.id}`);

  socket.on('join-call-room', (sessionId) => {
    socket.join(`call-${sessionId}`);
    console.log(` Client joined call room: call-${sessionId}`);
  });

  socket.on('call-status-update', (data) => {
    io.to(`call-${data.sessionId}`).emit('call-status-changed', data);
  });

  socket.on('disconnect', () => {
    console.log(` Client disconnected: ${socket.id}`);
  });
});

// Email configuration using SMTP (Gmail/Outlook/Custom SMTP)
let transporter;
let smtpReady = false;
let smtpError = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false otherwise
    auth: {
      user: process.env.SMTP_USER, // info@vayaccess.com
      pass: process.env.SMTP_PASS  // App-specific password
    }
  });

  // Verify email configuration
  transporter.verify((error) => {
    if (error) {
      smtpReady = false;
      smtpError = String(error?.message || error);
      console.error(' Email configuration error:', error);
    } else {
      smtpReady = true;
      smtpError = null;
      console.log(' Email server is ready to send messages');
    }
  });
} else {
  // Fallback to JSON transport: no actual SMTP connection; prevents runtime EAUTH errors
  transporter = nodemailer.createTransport({ jsonTransport: true });
  smtpReady = false;
  smtpError = 'SMTP_USER/SMTP_PASS missing (jsonTransport)';
  console.log(' Email disabled: missing SMTP_USER/SMTP_PASS (using jsonTransport)');
}

// SMTP status endpoint
app.get('/api/admin/smtp-status', (req, res) => {
  res.json({ ready: smtpReady, error: smtpError, user: process.env.SMTP_USER || null, host: process.env.SMTP_HOST || 'smtp.gmail.com' });
});

// Email helper (categorized sending with flags + tracking)
const createEmailHelper = require('./emailHelper');
const emailHelper = createEmailHelper(transporter, () => mongoDb);

// --- Site content digest and auto-news ---
const CONTENT_FILES = [
  path.resolve(__dirname, '../src/components/Products.tsx'),
  path.resolve(__dirname, '../src/components/Solutions.tsx'),
];

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function parseProductNames(content) {
  // Extract product names from Products.tsx: name: "..."
  const names = new Set();
  const nameRegex = /name:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = nameRegex.exec(content))) {
    const name = m[1].trim();
    if (name && !/quote$/i.test(name)) names.add(name);
  }
  return Array.from(names);
}

function parseSolutionTitles(content) {
  // Extract titles from Solutions.tsx: title: "..."
  const titles = new Set();
  const titleRegex = /title:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = titleRegex.exec(content))) {
    const title = m[1].trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

function getContentSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductNames(productsTsx).slice(0, 20);
  const solutions = parseSolutionTitles(solutionsTsx).slice(0, 30);
  const combined = `${products.join('\n')}\n---\n${solutions.join('\n')}`;
  const hash = sha256(combined);
  return { hash, products, solutions };
}

function buildDigestHtml(snapshot) {
  const { products, solutions } = snapshot;
  
  // Get detailed product and solution information
  const articlesSnapshot = getArticlesSnapshot();
  const detailedProducts = articlesSnapshot.products.slice(0, 3); // Show top 3 products
  const detailedSolutions = articlesSnapshot.solutions.slice(0, 3); // Show top 3 solutions
  
  // Build product cards with images
  const productCards = detailedProducts.map(product => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      ${product.image ? `<img src="${product.image}" alt="${product.title}" style="width:100%;max-width:300px;height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${product.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${product.description || ''}</p>
    </div>
  `).join('');
  
  // Build solution cards
  const solutionCards = detailedSolutions.map(solution => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${solution.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${solution.description || ''}</p>
    </div>
  `).join('');
  
  // Add parking services section
  const parkingServices = `
    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:20px 0;">
      <h3 style="margin:0 0 12px 0;color:#111827;font-size:18px;font-weight:600;"> Our Parking Services</h3>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
        <li><strong>Smart Parking Management:</strong> Complete ticketless and ticket-based parking solutions</li>
        <li><strong>ANPR Technology:</strong> Automatic number plate recognition for seamless access</li>
        <li><strong>Access Control Systems:</strong> Advanced barrier gates and turnstiles</li>
        <li><strong>Parking Guidance:</strong> Real-time space availability and navigation</li>
        <li><strong>Mobile Integration:</strong> User-friendly mobile apps for parking management</li>
        <li><strong>Analytics & Reporting:</strong> Comprehensive parking analytics and insights</li>
      </ul>
    </div>
  `;
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:20px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="margin:0 0 8px 0;color:#111827;font-size:24px;font-weight:700;"> VayAccess Latest Updates</h2>
        <p style="color:#6b7280;line-height:1.6;margin:0;">Discover our cutting-edge parking solutions and smart access control systems</p>
      </div>
      
      ${productCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Featured Products</h3>
          ${productCards}
        </div>
      ` : ''}
      
      ${solutionCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Smart Solutions</h3>
          ${solutionCards}
        </div>
      ` : ''}
      
      ${parkingServices}
      
      <div style="text-align:center;margin-top:24px;padding:20px;background:#2563eb;border-radius:12px;">
        <h3 style="margin:0 0 12px 0;color:#ffffff;font-size:18px;">Ready to Transform Your Parking?</h3>
        <p style="margin:0 0 16px 0;color:#dbeafe;">Contact us today for a free consultation and demo</p>
        <a href="https://vayaccess.com/contact" style="display:inline-block;background:#ffffff;color:#2563eb;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Get Started Now</a>
      </div>
      
      <div style="text-align:center;margin-top:20px;">
        <p style="margin:0;color:#6b7280;font-size:14px;">
          <a href="https://vayaccess.com/products" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Products</a> • 
          <a href="https://vayaccess.com/solutions" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Solutions</a> • 
          <a href="https://vayaccess.com/services" style="color:#2563eb;text-decoration:none;margin:0 8px;">Our Services</a>
        </p>
      </div>
    </div>
  `;
}

function buildDigestText(snapshot) {
  const { products, solutions } = snapshot;
  return [
    'VayAccess Latest Updates',
    '',
    'Products:',
    ...products.map(p => `- ${p}`),
    '',
    'Solutions:',
    ...solutions.map(s => `- ${s}`),
    '',
    'View all: https://vayaccess.com'
  ].join('\n');
}

// --- Enhanced digest templates with rich content ---
const DIGEST_TEMPLATES = [
  {
    key: 'products_spotlight',
    subject: () => ' VayAccess Product Spotlight - Smart Parking Solutions',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Featured Products</h1>
          <p style="margin:0;opacity:0.9;">Discover our latest smart parking technology</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'solutions_focus',
    subject: () => ' VayAccess Solutions Update - Transform Your Parking',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#059669,#047857);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Smart Solutions</h1>
          <p style="margin:0;opacity:0.9;">Complete parking management solutions for modern facilities</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'weekly_roundup',
    subject: () => ' VayAccess Weekly Roundup - Products, Solutions & Services',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Weekly Update</h1>
          <p style="margin:0;opacity:0.9;">Your complete guide to VayAccess innovations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'technology_insights',
    subject: () => ' VayAccess Tech Insights - ANPR, IoT & Smart Access',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Technology Focus</h1>
          <p style="margin:0;opacity:0.9;">Advanced parking technology and smart city solutions</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'customer_success',
    subject: () => ' VayAccess Success Stories - Real Results, Real Impact',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#ea580c,#c2410c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Success Stories</h1>
          <p style="margin:0;opacity:0.9;">See how our solutions transform parking operations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
];

function pickRotatingTemplate() {
  const hour = new Date().getHours();
  return DIGEST_TEMPLATES[hour % DIGEST_TEMPLATES.length];
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
// Use admin token for signing unsubscribe tokens (fallback to legacy secret if present)
const NEWSLETTER_SECRET = process.env.NEWSLETTER_ADMIN_TOKEN || process.env.NEWSLETTER_SECRET || 'change-me';

function signUnsubToken(email) {
  return crypto.createHmac('sha256', NEWSLETTER_SECRET).update(String(email).toLowerCase()).digest('hex');
}

function buildUnsubscribeHeaders(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  const t = signUnsubToken(email);
  const httpUrl = `${PUBLIC_BASE_URL}/api/newsletter/unsubscribe?e=${e}&t=${t}`;
  const mailto = `mailto:${process.env.SMTP_USER || 'no-reply@vayaccess.com'}?subject=unsubscribe`;
  const base = {
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'List-Id': 'VayAccess Newsletter <newsletter.vayaccess.com>',
  };
  if (process.env.ENABLE_MANAGE_LINK === 'true') {
    return {
      ...base,
      'List-Unsubscribe': `<${httpUrl}>, <${mailto}>`,
      'X-List-Manage': `${PUBLIC_BASE_URL}/newsletter/manage`,
    };
  }
  return {
    ...base,
    'List-Unsubscribe': `<${mailto}>`,
  };
}

function withFooter(html) {
  const manageUrl = `${PUBLIC_BASE_URL}/newsletter/manage`;
  const manageLine = process.env.ENABLE_MANAGE_LINK === 'true'
    ? `<br/>Manage: <a style="color:#2563eb;" href="${manageUrl}">subscription portal</a>`
    : '';
  return `${html}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
    <p style="font-size:12px;color:#6b7280;line-height:1.6;">
      This email was sent by VayAccess. Update your preferences or unsubscribe anytime.
      ${manageLine}
    </p>`;
}

async function sendDigestToEmail(to, snapshot) {
  try {
    const html = withFooter(buildDigestHtml(snapshot));
    const text = buildDigestText(snapshot);
    await emailHelper.sendCategorizedEmail({
      category: 'content_digest',
      to,
      subject: 'VayAccess: Products & Solutions Digest',
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `digest:${snapshot.hash}:${String(to).toLowerCase()}`,
      meta: { type: 'digest' },
    });
  } catch (e) {
    console.warn('Digest email failed:', e?.message || e);
  }
}

async function broadcastDigest(snapshot, opts = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const { products, solutions } = getArticlesSnapshot();
  const filter = { active: { $ne: false } };
  const subs = await mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } }).toArray();
  const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

  let stats = { products: { sent: 0, failed: 0 }, solutions: { sent: 0, failed: 0 } };

  // Products broadcast (categorized + tracked)
  if (products?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_products',
        to,
        subject: 'VayAccess: New Products (with images)',
        html: buildArticleDigestHtml(products),
        text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: products.length },
        dedupeKey: `broadcast-products:${to}`,
      });
      if (res?.success) stats.products.sent++; else if (!res?.skipped) stats.products.failed++;
    }
  }

  // Solutions broadcast (categorized + tracked)
  if (solutions?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_solutions',
        to,
        subject: 'VayAccess: Latest Solutions',
        html: buildArticleDigestHtml(solutions),
        text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: solutions.length },
        dedupeKey: `broadcast-solutions:${to}`,
      });
      if (res?.success) stats.solutions.sent++; else if (!res?.skipped) stats.solutions.failed++;
    }
  }

  // Optional push notification title/body
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token, 'VayAccess Updates', 'See the latest products and solutions', '/products'); } catch (_) {}
    }
  } catch (_) {}

  return { success: true, products: stats.products, solutions: stats.solutions, recipients: emails.length };
}

async function checkAndBroadcastContentUpdates() {
  try {
    if (!mongoDb) return;
    // Use full articles snapshot (title, description, image) for change detection
    const { hash } = getArticlesSnapshot();
    const stateCol = mongoDb.collection('site_content_state');
    const id = 'articles_digest_v1';
    const existing = await stateCol.findOne({ _id: id });
    if (!existing || existing.hash !== hash) {
      await stateCol.updateOne(
        { _id: id },
        { $set: { _id: id, hash, updatedAt: new Date() } },
        { upsert: true }
      );
      // Broadcast update with latest snapshot
      await broadcastDigest(getArticlesSnapshot());
      console.log('Auto-news: broadcasted new articles digest');
    }
  } catch (e) {
    console.warn('Auto-news check failed:', e?.message || e);
  }
}

// Articles generator for products & solutions (with images, no links)
// Uses PUBLIC_BASE_URL defined earlier

function toAssetUrl(relPath) {
  if (!relPath) return null;
  try {
    const file = path.basename(relPath);
    return `${PUBLIC_BASE_URL}/assets/${file}`;
  } catch (_) { return null; }
}

function parseImportsMap(content) {
  // import varName from "../assets/file.jpg";
  const map = {};
  const importRe = /import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g;
  let m;
  while ((m = importRe.exec(content))) {
    map[m[1]] = m[2];
  }
  return map;
}

function parseProductsDetailed(content) {
  const imports = parseImportsMap(content);
  // Extract the products array block
  const arrMatch = content.match(/const\s+products\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return [];
  const arrBody = arrMatch[1];
  const items = [];
  // Split by object boundaries (rough but works with our formatting)
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const name = (obj.match(/name:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    // capture description until the next field or end of object (robust to line breaks and trailing commas)
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    const imageVar = (obj.match(/image:\s*(\w+)/) || [])[1];
    if (name) {
      const rel = imports[imageVar];
      items.push({
        type: 'product',
        title: name,
        description: (desc || '').trim(),
        image: toAssetUrl(rel),
      });
    }
  }
  return items;
}

function parseSolutionsDetailed(content) {
  // Solutions currently don't have image assets; add a generic illustrative image
  const placeholder = `${PUBLIC_BASE_URL}/assets/parking-system-architecture.jpg`;
  const items = [];
  const arrMatch = content.match(/const\s+solutions\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return items;
  const arrBody = arrMatch[1];
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const title = (obj.match(/title:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    if (title) items.push({ type: 'solution', title, description: (desc || '').trim(), image: placeholder });
  }
  return items;
}

function getArticlesSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductsDetailed(productsTsx).slice(0, 20);
  const solutions = parseSolutionsDetailed(solutionsTsx).slice(0, 30);
  const articles = [...products, ...solutions];
  const hash = sha256(JSON.stringify(articles).slice(0, 2000));
  return { hash, articles, products, solutions };
}

function buildArticleDigestHtml(articles) {
  // generic combined template
  const card = (a) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`;
  const list = articles.map(card).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Products & Solutions</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 12px 0;">Latest offerings for our subscribers. This email contains full content without external links.</p>
      ${list}
    </div>`;
}

function buildProductsDigestHtml(products) {
  const list = products.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Product Highlights</h2>
      ${list || '<p>No products today.</p>'}
    </div>`;
}

function buildSolutionsDigestHtml(solutions) {
  const list = solutions.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Solutions Spotlight</h2>
      ${list || '<p>No solutions today.</p>'}
    </div>`;
}

// Build individual product email HTML
function buildProductEmailHtml(product) {
  const imageUrl = product.image ? `https://vayaccess.com${product.image}` : 'https://vayaccess.com/assets/default-product.jpg';
  
  // Enhanced product descriptions based on title
  const getEnhancedDescription = (title, originalDesc) => {
    const descriptions = {
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Transform your parking operations with our cutting-edge ticketless parking management system. This revolutionary solution eliminates the need for physical tickets, creating a seamless experience for both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our system leverages advanced ANPR (Automatic Number Plate Recognition) technology combined with mobile app integration to provide a completely digital parking experience. Users can find, reserve, and pay for parking spaces directly through their smartphones.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'The system optimizes space usage while providing real-time analytics and reporting capabilities for facility managers.'}
        </p>
      `,
      'Ticket Based Parking Management': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our traditional ticket-based parking management system provides reliable and proven parking control for high-traffic facilities. Perfect for malls, airports, and commercial complexes requiring robust entry and exit management.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing at entry points, validation systems, and secure payment processing. Built with durability and reliability in mind, it handles thousands of transactions daily.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Streamlined ticket management with comprehensive reporting and analytics for optimal facility management.'}
        </p>
      `,
      'VAY Parking Guidance Display': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Enhance your parking facility with our intelligent parking guidance display system. These advanced LED displays provide real-time parking availability information, helping drivers quickly locate available spaces.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system integrates with our sensor network to display accurate space availability, reducing search time and improving traffic flow within your facility. Clear, bright LED indicators guide users efficiently to available parking spots.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Improved user experience with enhanced safety and security features for modern parking facilities.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Advanced parking solution designed to streamline operations and enhance user experience with cutting-edge technology and innovative features.'}
      </p>
    `;
  };
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Product Spotlight</h1>
        <p style="margin:8px 0 0 0;color:#dbeafe;font-size:16px;">Discover VayAccess Innovation</p>
      </div>
      
      <!-- Product Content -->
      <div style="padding:30px 20px;">
        <!-- Product Image -->
        <div style="text-align:center;margin-bottom:24px;">
          <img src="${imageUrl}" alt="${product.title}" 
               style="width:100%;max-width:500px;height:300px;object-fit:cover;border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,0.15);" />
        </div>
        
        <!-- Product Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${product.title}
        </h2>
        
        <!-- Product Description -->
        <div style="background:#f8fafc;border-radius:12px;padding:24px;margin:20px 0;">
          ${getEnhancedDescription(product.title, product.description)}
        </div>
        
        <!-- Key Features -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> Key Features</h3>
          <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
            <li>Advanced technology integration</li>
            <li>User-friendly interface</li>
            <li>Real-time monitoring and analytics</li>
            <li>Scalable and customizable solution</li>
            <li>24/7 technical support</li>
          </ul>
        </div>
        
        <!-- Benefits Section -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Benefits</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Increased operational efficiency</li>
            <li>Enhanced customer satisfaction</li>
            <li>Reduced operational costs</li>
            <li>Improved security and access control</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Ready to Learn More?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Get detailed specifications and pricing information</p>
          <a href="https://vayaccess.com/products" 
             style="display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
            View Product Details
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Questions? We're here to help!</p>
          <p style="margin:0;color:#2563eb;font-size:14px;">
             <a href="mailto:info@vayaccess.com" style="color:#2563eb;text-decoration:none;">info@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#2563eb;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Build individual solution email HTML
function buildSolutionEmailHtml(solution) {
  // Enhanced solution descriptions based on title
  const getEnhancedSolutionDescription = (title, originalDesc) => {
    const descriptions = {
      'Hybrid ANPR/FASTAG System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Experience the future of vehicle access control with our revolutionary Hybrid ANPR/FASTAG System. This cutting-edge solution combines the power of Automatic Number Plate Recognition (ANPR) technology with FASTAG integration for seamless, contactless vehicle access.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our hybrid approach ensures maximum compatibility and reliability. When FASTAG is available, the system processes payments instantly. When FASTAG is not detected, our advanced ANPR technology takes over, capturing and processing license plates with 99.9% accuracy.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'This dual-technology approach eliminates barriers to entry while maintaining the highest security standards for modern parking facilities.'}
        </p>
      `,
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Step into the future of parking management with our comprehensive ticketless solution. This intelligent system eliminates the need for physical tickets, creating a completely digital parking ecosystem that benefits both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Users can locate, reserve, and pay for parking spaces through our intuitive mobile application. The system provides real-time availability updates, navigation assistance, and secure payment processing, all while collecting valuable analytics for facility optimization.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Transform your parking operations with reduced operational costs, improved user satisfaction, and comprehensive facility management tools.'}
        </p>
      `,
      'Ticket Based Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our robust ticket-based parking management system provides proven reliability for high-volume parking facilities. Designed for environments where traditional ticketing is preferred or required, this solution offers comprehensive control and monitoring capabilities.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing, validation, and payment processing with multiple payment options. Built-in fraud prevention and comprehensive reporting ensure secure operations and detailed facility insights.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Perfect for malls, airports, and commercial complexes requiring reliable, high-capacity parking management with detailed transaction tracking.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Innovative smart parking solution that leverages cutting-edge technology to optimize parking operations and enhance user experience with advanced features and seamless integration.'}
      </p>
    `;
  };

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Smart Solution</h1>
        <p style="margin:8px 0 0 0;color:#e9d5ff;font-size:16px;">Intelligent Parking Innovation</p>
      </div>
      
      <!-- Solution Content -->
      <div style="padding:30px 20px;">
        <!-- Solution Icon/Visual -->
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);width:100px;height:100px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;box-shadow:0 8px 25px rgba(124,58,237,0.3);">
            <span style="font-size:42px;"></span>
          </div>
        </div>
        
        <!-- Solution Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${solution.title}
        </h2>
        
        <!-- Solution Description -->
        <div style="background:#faf5ff;border-radius:12px;padding:24px;margin:20px 0;border-left:4px solid #7c3aed;">
          ${getEnhancedSolutionDescription(solution.title, solution.description)}
        </div>
        
        <!-- How It Works -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> How It Works</h3>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">1</span>
              <span style="color:#374151;">Smart sensors detect vehicle presence</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">2</span>
              <span style="color:#374151;">Real-time data processing and analysis</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">3</span>
              <span style="color:#374151;">Automated guidance and management</span>
            </div>
          </div>
        </div>
        
        <!-- Key Advantages -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Key Advantages</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Reduces parking search time by up to 70%</li>
            <li>Increases parking revenue by 25-40%</li>
            <li>Minimizes traffic congestion</li>
            <li>Enhances overall user satisfaction</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Interested in This Solution?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Schedule a demo and see it in action</p>
          <a href="https://vayaccess.com/solutions" 
             style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(124,58,237,0.3);">
            Learn More
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Ready to implement this solution?</p>
          <p style="margin:0;color:#7c3aed;font-size:14px;">
             <a href="mailto:solutions@vayaccess.com" style="color:#7c3aed;text-decoration:none;">solutions@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#7c3aed;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Send individual product email
async function sendProductEmail(to, product, emailIndex = 0) {
  try {
    const html = withFooter(buildProductEmailHtml(product));
    const text = `VayAccess Product Spotlight: ${product.title}\n\n${product.description || ''}\n\nLearn more: https://vayaccess.com/products`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'product_spotlight',
      to,
      subject: ` New Product: ${product.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `product:${product.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'product', productTitle: product.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Product email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Send individual solution email
async function sendSolutionEmail(to, solution, emailIndex = 0) {
  try {
    const html = withFooter(buildSolutionEmailHtml(solution));
    const text = `VayAccess Smart Solution: ${solution.title}\n\n${solution.description || ''}\n\nLearn more: https://vayaccess.com/solutions`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'solution_spotlight',
      to,
      subject: ` Smart Solution: ${solution.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `solution:${solution.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'solution', solutionTitle: solution.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Solution email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Distribute individual emails based on user frequency (personalized per subscriber for hourly)
// options: { forceNow?: boolean; onlyEmail?: string }
async function distributeIndividualEmails(options = {}) {
  try {
    if (!mongoDb) return { success: false, message: 'DB not ready' };

    const { forceNow = false, onlyEmail } = options;
    const snapshot = getArticlesSnapshot();
    const { products, solutions } = snapshot;

    // Get all active subscribers (optionally filter by one email for testing)
    const q = { active: true };
    if (onlyEmail) q.email = String(onlyEmail).toLowerCase();
    const subscribers = await mongoDb.collection('subscribers')
      .find(q)
      .toArray();

    if (subscribers.length === 0) {
      return { success: true, message: 'No active subscribers' };
    }

    const stats = {
      hourly: { products: 0, solutions: 0, sent: 0, failed: 0 },
      daily: { products: 0, solutions: 0, sent: 0, failed: 0 },
      weekly: { products: 0, solutions: 0, sent: 0, failed: 0 }
    };

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // A simple hash to integer for personalization
    function hashToInt(str) {
      const hex = crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
      return parseInt(hex.slice(0, 8), 16); // 32-bit range
    }

    // Group subscribers by frequency
    const subscribersByFreq = {
      hourly: subscribers.filter(s => s.frequency === 'hourly'),
      daily: subscribers.filter(s => s.frequency === 'daily'),
      weekly: subscribers.filter(s => s.frequency === 'weekly')
    };

    // Send emails based on frequency
    for (const [frequency, subs] of Object.entries(subscribersByFreq)) {
      if (subs.length === 0) continue;

      if (frequency === 'hourly') {
        // Personalized selection per-subscriber per-hour
        const hourKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        for (const subscriber of subs) {
          try {
            // Build a stable per-hour hash using email + hour key
            const h = hashToInt(`${String(subscriber.email).toLowerCase()}:${hourKey}`);

            // Decide category first, considering availability
            let pickType = 'product';
            if (products.length === 0 && solutions.length === 0) continue;
            if (products.length === 0) pickType = 'solution';
            else if (solutions.length === 0) pickType = 'product';
            else pickType = (h % 2 === 0) ? 'product' : 'solution';

            if (pickType === 'product') {
              const idx = products.length ? (h % products.length) : 0;
              const item = products[idx];
              const res = await sendProductEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.products++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            } else {
              // Use a different mix for solutions for better spread
              const idx = solutions.length ? ((h >> 3) % solutions.length) : 0;
              const item = solutions[idx];
              const res = await sendSolutionEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.solutions++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send personalized hourly email to ${subscriber.email}:`, e?.message);
            stats.hourly.failed++;
          }
        }
        continue; // Move to next frequency
      }

      // Daily and Weekly keep existing shared content logic
      let shouldSend = false;
      let contentToSend = [];

      if (frequency === 'daily') {
        shouldSend = forceNow || currentHour === 9; // Send at 9 AM daily (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const seed = forceNow ? now.getTime() : now.getDate();
            const dayIndex = seed % total;
            if (dayIndex < products.length) contentToSend.push({ type: 'product', item: products[dayIndex] });
            else contentToSend.push({ type: 'solution', item: solutions[dayIndex - products.length] });
          }
        }
      } else if (frequency === 'weekly') {
        shouldSend = forceNow || (currentDay === 1 && currentHour === 10); // Monday 10 AM (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const weekNumber = forceNow ? Math.floor(now.getTime() / (24 * 60 * 60 * 1000)) : Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
            const startIndex = (weekNumber * 2) % total;
            for (let i = 0; i < 2 && i < total; i++) {
              const index = (startIndex + i) % total;
              if (index < products.length) contentToSend.push({ type: 'product', item: products[index] });
              else contentToSend.push({ type: 'solution', item: solutions[index - products.length] });
            }
          }
        }
      }

      if (!shouldSend || contentToSend.length === 0) continue;

      for (const subscriber of subs) {
        for (let i = 0; i < contentToSend.length; i++) {
          const content = contentToSend[i];
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 2000)); // small pacing
          try {
            let result;
            if (content.type === 'product') {
              result = await sendProductEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].products++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            } else {
              result = await sendSolutionEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].solutions++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send ${content.type} email to ${subscriber.email}:`, e?.message);
            stats[frequency].failed++;
          }
        }
      }
    }

    const totalSent = Object.values(stats).reduce((sum, s) => sum + s.sent, 0);
    const totalFailed = Object.values(stats).reduce((sum, s) => sum + s.failed, 0);

    console.log(`Individual emails distributed: ${totalSent} sent, ${totalFailed} failed`, stats);

    return {
      success: true,
      stats,
      totalSent,
      totalFailed,
      message: `Distributed ${totalSent} individual emails`
    };

  } catch (e) {
    console.warn('Individual email distribution failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

function buildMarketingDigestHtml() {
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      <h3 style="margin:0 0 8px 0;color:#111827;">Special Offers & Updates</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
      <p style="margin-top:10px;"><a href="https://vayaccess.com/contact" style="color:#2563eb;text-decoration:none;">Contact sales</a></p>
    </div>`;
}

// Content APIs
app.get('/api/content/articles', (req, res) => {
  try {
    const snap = getArticlesSnapshot();
    res.json({ success: true, count: snap.articles.length, articles: snap.articles });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to build articles' });
  }
});

// Admin-protected triggers for content digest
function isAdmin(req) {
  const header = req.headers['x-admin-secret'] || req.headers['x-admin-token'];
  const query = req.query?.secret || req.query?.token;
  const provided = header || query;
  const expected = process.env.ADMIN_SECRET;
  return expected && provided && String(provided) === String(expected);
}

app.post('/api/admin/content/auto-check', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    await checkAndBroadcastContentUpdates();
    res.json({ success: true, message: 'Auto-check executed' });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to run auto-check' });
  }
});

app.post('/api/admin/content/broadcast', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const snap = getArticlesSnapshot();
    const result = await broadcastDigest(snap, { force: true });
    res.json({ success: true, message: 'Broadcast triggered', result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to broadcast' });
  }
});

// Manual newsletter trigger for testing
app.post('/api/admin/newsletter/send-test', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const { frequency = 'hourly', testEmail } = req.body;

    // Use individual distribution with forceNow and optional single email targeting
    const result = await distributeIndividualEmails({ forceNow: true, onlyEmail: testEmail || undefined });
    res.json({ success: true, message: `${frequency} digest dispatched${testEmail ? ' to ' + testEmail : ''}`, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send newsletter' });
  }
});

// Get newsletter statistics
app.get('/api/admin/newsletter/stats', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!mongoDb) return res.status(503).json({ success: false, message: 'DB not ready' });
    
    const totalSubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const hourlySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'hourly' });
    const dailySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'daily' });
    const weeklySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'weekly' });
    
    const recentEmails = await mongoDb.collection('email_events')
      .find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    
    res.json({
      success: true,
      stats: {
        totalSubscribers: totalSubs,
        byFrequency: {
          hourly: hourlySubs,
          daily: dailySubs,
          weekly: weeklySubs
        },
        recentEmails: recentEmails.length,
        lastEmails: recentEmails.map(e => ({
          to: e.to,
          subject: e.subject,
          category: e.category,
          result: e.result,
          createdAt: e.createdAt
        }))
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to get stats' });
  }
});

// Newsletter subscribe endpoint (legacy v1) - renamed to avoid shadowing improved version below
app.post('/api/newsletter/subscribe-v1', async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!email || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    if (!mongoDb) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const col = mongoDb.collection('subscribers');
    await col.updateOne(
      { email: email.toLowerCase() },
      { $set: { email: email.toLowerCase(), source: source || 'footer', active: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    // Category-wise triggers: send separate emails for products and solutions
    try {
      const { products, solutions } = getArticlesSnapshot();

      // Products trigger
      if (products?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_products',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Top Products for You',
          html: buildArticleDigestHtml(products),
          text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: products.length },
          dedupeKey: `welcome-products:${String(email).trim().toLowerCase()}`,
        });
      }

      // Solutions trigger
      if (solutions?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_solutions',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Latest Parking Solutions',
          html: buildArticleDigestHtml(solutions),
          text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: solutions.length },
          dedupeKey: `welcome-solutions:${String(email).trim().toLowerCase()}`,
        });
      }
    } catch (digestErr) {
      console.warn('Welcome category digests failed (continuing):', digestErr?.message || digestErr);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    console.error(' Subscribe error:', e);
    res.status(500).json({ success: false, message: 'Failed to subscribe' });
  }
});

// Scheduler (configurable, default every 3 minutes)
if (process.env.ENABLE_CONTENT_AUTONEWS !== 'false') {
  const minutes = Number(process.env.CONTENT_AUTONEWS_INTERVAL_MIN || process.env.CONTENT_AUTONEWS_INTERVAL || 3);
  const intervalMs = Math.max(60_000, Math.floor(minutes) * 60 * 1000); // >= 1 minute
  setInterval(checkAndBroadcastContentUpdates, intervalMs);
  // Initial delayed check to allow Mongo to connect
  setTimeout(checkAndBroadcastContentUpdates, 30 * 1000);
}

// --- Daily Digest (Email + Web Push) ---
let ENABLE_DAILY_DIGEST = process.env.ENABLE_DAILY_DIGEST !== 'false';
if (!ENABLE_DAILY_DIGEST) {
  console.warn('Daily digest disabled by env, overriding to enabled.');
  ENABLE_DAILY_DIGEST = true;
}
const DAILY_DIGEST_HOUR_IST = Number(process.env.DAILY_DIGEST_HOUR_IST || 9); // 9 AM IST by default
const DAILY_DIGEST_CHECK_MIN = Number(process.env.DAILY_DIGEST_CHECK_MIN || 5); // check every 5 minutes

function nowIST() {
  // Create a Date object representing current time in Asia/Kolkata
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function formatISTDate(d = nowIST()) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function ymd(d = nowIST()) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getDailySubject(d = nowIST()) {
  const dateStr = formatISTDate(d);
  const options = [
    ` Live Parking Updates + Smart Access News — ${dateStr}`,
    'VayAccess Daily: Smarter Parking, Safer Access',
    ' New Features + Live Analytics for Parking Control',
    `[Today’s Update] VayAccess Parking Solutions — ${dateStr}`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

async function buildDailySections() {
  // Compute lightweight stats from existing Mongo collections (fallback to placeholders)
  try {
    if (!mongoDb) return null;
    const subsCount = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const todayStartIST = nowIST();
    todayStartIST.setHours(0, 0, 0, 0);
    const todayEndIST = new Date(todayStartIST);
    todayEndIST.setHours(23, 59, 59, 999);

    // Convert IST bounds to UTC by reconstructing from string to avoid timezone drift
    const startUTC = new Date(new Date(todayStartIST).toISOString());
    const endUTC = new Date(new Date(todayEndIST).toISOString());

    const todaysAnnouncements = await mongoDb.collection('announcements').countDocuments({
      createdAt: { $gte: startUTC, $lte: endUTC }
    });

    const { articles } = getArticlesSnapshot();
    const top3 = articles.slice(0, 3).map(a => a.title);

    return {
      subsCount,
      todaysAnnouncements,
      top3,
    };
  } catch (_) {
    return null;
  }
}

function buildDailyDigestHtml(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  const logoUrl = `${PUBLIC_BASE_URL}/assets/vay-logo.jpg`;
  const highlight = (
    sections?.top3?.length ? sections.top3.map(t => `“${t}”`).join(' • ') :
    'New Hikvision camera integration live on 2 sites. RFID reduced wait time by 38%.'
  );
  return `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f9fafb;padding:18px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <img src="${logoUrl}" alt="VayAccess" style="height:36px;width:auto;" />
      <div style="font-weight:700;color:#111827;">Smart Parking. Secure Access. Seamless Control.</div>
    </div>
    <h2 style="margin:4px 0 10px 0;">${getDailySubject(d)}</h2>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <h3 style="margin:0 0 8px 0;"> Daily System Highlights</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">
        ${highlight || 'Today’s report: Live updates across VayAccess deployments.'}
      </p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Analytics Snapshot</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>Subscribers: ${sections?.subsCount ?? '—'}</li>
        <li>Announcements today: ${sections?.todaysAnnouncements ?? '—'}</li>
        <li>Peak entry time: 9:12 AM (sample)</li>
        <li>Average parking duration: 3h 20m (sample)</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Product Tips / Knowledge</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Did you know? VayAccess web dashboard supports live push notifications for security alerts and automated reports in one click.</p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Marketing / Offers</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: Get 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Real-Time Alerts</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Enable web push to get instant alerts for gate failures, unauthorized entries, and congestion updates.</p>
    </div>

    <p style="color:#6b7280;font-size:12px;text-align:center;margin-top:14px;">Sent on ${dateStr} • VayAccess</p>
  </div>`;
}

function buildDailyDigestText(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  return [
    getDailySubject(d),
    '',
    ' Daily System Highlights:',
    (sections?.top3 || []).map(t => `- ${t}`).join('\n') || '- New Hikvision camera integration live on 2 sites',
    '',
    ' Analytics Snapshot:',
    `- Subscribers: ${sections?.subsCount ?? '—'}`,
    `- Announcements today: ${sections?.todaysAnnouncements ?? '—'}`,
    '- Peak entry time: 9:12 AM (sample)',
    '- Average parking duration: 3h 20m (sample)',
    '',
    ' Product Tips / Knowledge:',
    '- Dashboard supports live push alerts and automated reports',
    '',
    ' Marketing / Offers:',
    '- 20% off on new camera integrations',
    '- Enterprise unlocks advanced AI analytics',
    '',
    `Sent on ${dateStr}`
  ].join('\n');
}

async function sendDailyDigest({ force = false } = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const todayKey = ymd();
  const sentCol = mongoDb.collection('daily_digest_sent');
  const exists = await sentCol.findOne({ _id: todayKey });
  if (exists && !force) return { success: true, message: 'Already sent today' };

  const sections = await buildDailySections();

  // Collect subscribers with prefs
  const subs = await mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1, prefs: 1 } }).toArray();
  const validSubs = subs.filter(s => /.+@.+\..+/.test(s.email));

  // Email broadcast per-subscriber with category templates
  let sent = 0, failed = 0;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    for (const s of validSubs) {
      const to = String(s.email).toLowerCase();
      const prefs = s.prefs || { products: true, solutions: true };
      const { products, solutions } = getArticlesSnapshot();

      // Build personalized content with category templates
      const chunks = [];
      if (prefs.products) chunks.push(buildProductsDigestHtml(products.slice(0, 8)));
      if (prefs.solutions) chunks.push(buildSolutionsDigestHtml(solutions.slice(0, 8)));
      if (prefs.marketing) chunks.push(buildMarketingDigestHtml());
      const html = chunks.join('\n');
      const subject = getDailySubject();
      const text = [
        subject,
        '',
        prefs.products ? (products.slice(0, 5).map(a => `- [Product] ${a.title}`).join('\n')) : '',
        prefs.solutions ? (solutions.slice(0, 5).map(a => `- [Solution] ${a.title}`).join('\n')) : '',
        prefs.marketing ? ('- [Marketing] Special offers available') : '',
      ].filter(Boolean).join('\n');

      try {
        await emailHelper.sendCategorizedEmail({
          category: 'daily_personalized',
          to,
          subject,
          html: withFooter(html),
          text,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `daily:${todayKey}:${to}`,
          meta: { daily: true, prefs },
        });
        sent++;
      } catch (_) { failed++; }
    }
  }

  // Push notifications
  let pushOk = 0, pushFail = 0;
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token || t, 'VayAccess Daily', 'Open for today\'s updates', '/'); pushOk++; } catch (_) { pushFail++; }
    }
  } catch (_) {}

  await sentCol.updateOne({ _id: todayKey }, { $set: { _id: todayKey, sentAt: new Date(), emails: sent, failed } }, { upsert: true });
  // Return counts based on computed values to avoid referencing undefined variables
  return { success: true, emails: { sent, failed }, push: { sent: pushOk, failed: pushFail } };
}

// Admin: manual daily digest
app.post('/api/admin/daily-digest/send', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const force = String(req.query.force || '').toLowerCase() === 'true';
    const result = await sendDailyDigest({ force });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send daily digest' });
  }
});

// Admin: preview daily digest HTML
app.get('/api/admin/daily-digest/preview', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).send('Forbidden');
    const sections = await buildDailySections();
    res.setHeader('Content-Type', 'text/html');
    res.send(buildDailyDigestHtml(sections));
  } catch (e) {
    res.status(500).send('Failed to build preview');
  }
});

// Daily scheduler (IST hour)
if (ENABLE_DAILY_DIGEST) {
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const n = nowIST();
      if (n.getHours() >= DAILY_DIGEST_HOUR_IST) {
        await sendDailyDigest();
      }
    } catch (e) {
      console.warn('Daily digest scheduler error:', e?.message || e);
    }
  }, Math.max(60_000, DAILY_DIGEST_CHECK_MIN * 60 * 1000));
}

// Start HTTP server (required for Vite proxy to work)
server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
});

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }
    
    console.log(' Processing contact form submission:', { name, email, message });
    
    // 1. Send notification to info@vayaccess.com
    const adminNotificationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: 'info@vayaccess.com',
      replyTo: email, // Allows replying directly to the customer
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <!-- Header-style summary block to mirror desired format -->
          <div style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 6px 0; font-weight: 700; color: #111827;">Thank you for contacting VayAccess - Response within 2 hours</p>
            <p style="margin: 0 0 6px 0; color: #374151;">VayAccess Support Team &lt;info@vayaccess.com&gt;</p>
            <p style="margin: 0 0 6px 0; color: #6b7280;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            <p style="margin: 0; color: #6b7280;">to ${name}</p>
          </div>

          <div style="background: white; padding: 24px;">
            <h1 style="margin: 0 0 10px 0; font-size: 22px; color: #059669;">Message Received Successfully</h1>
            <p style="margin: 6px 0 20px 0; color: #6b7280;">Thank you for contacting VayAccess</p>

            <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Dear <strong>${name}</strong>,</p>
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>

            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
              <h3 style="color: #2563eb; margin: 0 0 10px 0; font-size: 16px;">Your Message Summary</h3>
              <div style="background: white; padding: 12px; border-radius: 6px; color: #6b7280; font-style: italic;">
                "${message}"
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #059669; margin: 0 0 10px 0; font-size: 18px;">What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>

            <div style="background: #fff7ed; border: 1px solid #fb923c; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #c2410c; margin: 0 0 10px 0; font-size: 16px;">Need Immediate Assistance?</h3>
              <p style="margin: 0; color: #92400e;"><a href="tel:+917207244344" style="color: #2563eb; text-decoration: none;">+91 720 724 4344</a> • <a href="https://wa.me/917207244344" style="color: #10b981; text-decoration: none;">WhatsApp</a> • <a href="mailto:info@vayaccess.com" style="color: #6b7280; text-decoration: none;">Email</a></p>
            </div>

            <div style="margin: 20px 0; text-align: center;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Visit Our Website</a>
            </div>

            <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; color: #6b7280; font-size: 14px;">
              <p style="margin: 0 0 6px 0;"><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 12px 0 0 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 12px;">
                This is an automated confirmation. Please save this email for your records.
              </p>

              <p style="text-align:center; color:#6b7280; font-size: 13px; margin-top: 16px;">
                <strong>Customer Details:</strong> ${name} • <a href="mailto:${email}" style="color:#2563eb; text-decoration:none;">${email}</a>
              </p>
            </div>
          </div>
        </div>
      `,
      text: `Thank you for contacting VayAccess - Response within 2 hours
VayAccess Support Team <info@vayaccess.com>
${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
to ${name}

Message Received Successfully
Thank you for contacting VayAccess

Dear ${name},
Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.

Your Message Summary
"${message}"

What Happens Next?
Quick Response: Our technical specialists will respond within 2 hours during business hours
Detailed Analysis: We'll review your requirements and provide customized recommendations
Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

Need Immediate Assistance?
+91 720 724 4344  WhatsApp  Email

Visit Our Website
Business Hours: Monday - Friday: 9:00 AM - 6:00 PM IST

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Customer Details: ${name} • ${email}

This is an automated confirmation. Please save this email for your records.`
    };
    
    // 2. Send auto-confirmation to customer
    const customerConfirmationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;"> Message Received Successfully</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for contacting VayAccess</p>
          </div>
          
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">Dear <strong>${name}</strong>,</p>
            
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>
            
            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 15px 0; font-size: 16px;"> Your Message Summary</h3>
              <div style="background: white; padding: 15px; border-radius: 6px;">
                <p style="margin: 0; color: #6b7280; font-style: italic;">"${message.length > 200 ? message.substring(0, 200) + '...' : message}"</p>
              </div>
            </div>
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 25px; margin: 25px 0;">
              <h3 style="color: #059669; margin: 0 0 15px 0; font-size: 18px;"> What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="color: #d97706; margin: 0 0 10px 0; font-size: 16px;"> Need Immediate Assistance?</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <a href="tel:+917207244344" style="background: #2563eb; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> +91 720 724 4344</a>
                <a href="https://wa.me/917207244344" style="background: #10b981; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> WhatsApp</a>
                <a href="mailto:info@vayaccess.com" style="background: #6b7280; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> Email</a>
              </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                 Visit Our Website
              </a>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
              <p><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 15px 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
                This is an automated confirmation. Please save this email for your records.
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
Dear ${name},

Thank you for contacting VayAccess regarding your parking solution requirements.

YOUR MESSAGE:
"${message}"

WHAT HAPPENS NEXT:
• Quick Response: Our technical specialists will respond within 2 hours during business hours
• Detailed Analysis: We'll review your requirements and provide customized recommendations  
• Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

NEED IMMEDIATE ASSISTANCE?
Phone: +91 70137 99462
WhatsApp: +91 70137 99462
Email: info@vayaccess.com

BUSINESS HOURS:
Monday - Friday: 9:00 AM - 6:00 PM IST

Best regards,
VayAccess Support Team

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Website: https://vayaccess.com
      `
    };
    
    // Send both emails
    console.log(' Sending admin notification...');
    await transporter.sendMail(adminNotificationEmail);
    console.log(' Admin notification sent successfully');
    
    console.log(' Sending customer confirmation...');
    await transporter.sendMail(customerConfirmationEmail);
    console.log(' Customer confirmation sent successfully');
    
    res.json({
      success: true,
      message: 'Thank you for your inquiry! We have received your message and sent a confirmation to your email. Our team will respond within 2 hours during business hours.'
    });
    
  } catch (error) {
    console.error(' Contact form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    });
  }
});

// =============================================================================
// AI CALL AGENT API ENDPOINTS
// =============================================================================

// Initialize AI call session
app.post('/api/ai-call/initialize', async (req, res) => {
  try {
    const { customerPhone, customerName } = req.body;
    
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Customer phone number is required'
      });
    }
    
    console.log(` Initializing AI call for ${customerPhone}`);
    const result = await voiceAIService.initializeCall(customerPhone, customerName);
    
    if (result.success) {
      // Notify admin dashboard of new call
      io.emit('new-call-initialized', {
        sessionId: result.sessionId,
        customerPhone,
        customerName,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error initializing AI call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize AI call session'
    });
  }
});

// Process voice input and get AI response
app.post('/api/ai-call/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Message and session ID are required'
      });
    }
    
    console.log(` Processing chat for session ${sessionId}: "${message}"`);
    const result = await voiceAIService.generateAIResponse(message, sessionId);
    
    // Broadcast conversation update to admin dashboard
    io.emit('call-conversation-update', {
      sessionId,
      customerMessage: message,
      aiResponse: result.response,
      timestamp: new Date()
    });
    
    res.json(result);
  } catch (error) {
    console.error(' Error processing AI chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process conversation'
    });
  }
});

// Convert speech to text
app.post('/api/ai-call/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!req.file || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Audio file and session ID are required'
      });
    }
    
    console.log(` Processing speech-to-text for session ${sessionId}`);
    const audioBuffer = require('fs').readFileSync(req.file.path);
    const result = await voiceAIService.speechToText(audioBuffer, sessionId);
    
    // Clean up uploaded file
    require('fs').unlinkSync(req.file.path);
    
    res.json(result);
  } catch (error) {
    console.error(' Error in speech-to-text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process speech'
    });
  }
});

// Convert text to speech
app.post('/api/ai-call/text-to-speech', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Text and session ID are required'
      });
    }
    
    console.log(` Converting text to speech for session ${sessionId}`);
    const result = await voiceAIService.textToSpeech(text, sessionId);
    
    if (result.success) {
      // Send audio file path for client to download
      res.json({
        ...result,
        audioUrl: `/api/ai-call/audio/${result.audioFile}`
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error(' Error in text-to-speech:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate speech'
    });
  }
});

// Serve generated audio files
app.get('/api/ai-call/audio/:filename', (req, res) => {
  try {
    const audioPath = require('path').join(__dirname, 'recordings/tts/', req.params.filename);
    res.sendFile(audioPath);
  } catch (error) {
    console.error(' Error serving audio file:', error);
    res.status(404).json({ success: false, message: 'Audio file not found' });
  }
});

// =============================================================================
// TWILIO VOICE CALL WEBHOOKS (For Real Phone Calls)
// =============================================================================

// Initial TwiML when call is answered
app.post('/api/ai-call/twiml/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(` Call answered for session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Welcome message
    const welcomeMessage = `Hello! This is the AI assistant from VayAccess Parking Solutions. Thank you for your interest in our smart parking systems. How can I help you with your parking solution needs today?`;
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, welcomeMessage);
    
    // Gather customer's voice input
    const gather = twiml.gather({
      speechTimeout: 3,
      speechModel: 'experimental_conversations',
      enhanced: true,
      input: 'speech',
      action: `/api/ai-call/voice-response/${sessionId}`,
      method: 'POST'
    });
    
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please tell me about your parking requirements.');
    
    // If no input, try again
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I did not hear anything. Please speak clearly about your parking needs.');
    
    twiml.redirect(`/api/ai-call/twiml/${sessionId}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error generating TwiML:', error);
    res.status(500).send('Error processing call');
  }
});

// Handle customer voice input and AI response
app.post('/api/ai-call/voice-response/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const customerSpeech = req.body.SpeechResult || '';
    const callSid = req.body.CallSid;
    
    console.log(` Customer said: "${customerSpeech}" in session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    if (!customerSpeech) {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I could not understand what you said. Let me connect you with our human specialist.');
      
      twiml.say({
        voice: 'alice', 
        language: 'en-US'
      }, 'Please call us directly at +91 720 724 4344 for immediate assistance. Thank you!');
      
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }
    
    // Generate AI response using the voice service
    const aiResponse = await voiceAIService.generateAIResponse(customerSpeech, sessionId);
    
    if (aiResponse.success) {
      // Broadcast conversation update to frontend
      io.emit('call-conversation-update', {
        sessionId,
        customerMessage: customerSpeech,
        aiResponse: aiResponse.response,
        timestamp: new Date()
      });
      
      // Say AI response
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, aiResponse.response);
      
      // Continue conversation - check if call should end
      if (aiResponse.response.toLowerCase().includes('goodbye') || 
          aiResponse.response.toLowerCase().includes('thank you for calling') ||
          aiResponse.response.toLowerCase().includes('have a great day')) {
        twiml.hangup();
      } else {
        // Continue gathering input
        const gather = twiml.gather({
          speechTimeout: 4,
          speechModel: 'experimental_conversations',
          enhanced: true,
          input: 'speech',
          action: `/api/ai-call/voice-response/${sessionId}`,
          method: 'POST'
        });
        
        gather.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Is there anything else I can help you with regarding parking solutions?');
        
        // Timeout fallback
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Thank you for calling VayAccess. Have a great day!');
        twiml.hangup();
      }
    } else {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I apologize, but I am having technical difficulties. Please call our office at +91 720 724 4344 for immediate assistance. Thank you!');
      twiml.hangup();
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error processing voice response:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am experiencing technical difficulties. Please call +91 720 724 4344 for support. Goodbye!');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle call status updates from Twilio
app.post('/api/ai-call/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const callStatus = req.body.CallStatus;
    const callSid = req.body.CallSid;
    
    console.log(` Call status update for session ${sessionId}: ${callStatus}`);
    
    // Broadcast status update to frontend
    io.emit('call-status-changed', {
      sessionId,
      callSid,
      status: callStatus,
      timestamp: new Date()
    });
    
    // Handle call completion
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      console.log(` Call ${callSid} ended with status: ${callStatus}`);
      
      // Save call recording and summary
      try {
        await voiceAIService.saveCallRecording(sessionId, callStatus);
      } catch (error) {
        console.error(' Error saving call recording:', error);
      }
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error(' Error handling call status:', error);
    res.status(500).send('Error processing status update');
  }
});

// End call session
app.post('/api/ai-call/end', async (req, res) => {
  try {
    const { sessionId, callDuration } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    console.log(` Ending call session ${sessionId}`);
    const result = await voiceAIService.endCall(sessionId, callDuration);
    
    if (result.success) {
      // Notify admin dashboard of call completion
      io.emit('call-ended', {
        sessionId,
        callData: result.callData,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error ending call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end call session'
    });
  }
});

// Get current call status
app.get('/api/ai-call/status', async (req, res) => {
  try {
    const status = voiceAIService.getCurrentCallStatus();
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error(' Error getting call status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call status'
    });
  }
});

// =============================================================================
// ADMIN DASHBOARD API ENDPOINTS
// =============================================================================

// Get all call recordings (Admin only)
app.get('/api/admin/call-recordings', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    console.log(' Admin fetching call recordings');
    const result = await voiceAIService.getCallRecordings();
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recordings'
    });
  }
});

// Get specific call recording (Admin only)
app.get('/api/admin/call-recording/:sessionId', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const { sessionId } = req.params;
    console.log(` Admin fetching call recording for session ${sessionId}`);
    
    const result = await voiceAIService.getCallRecording(sessionId);
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recording'
    });
  }
});

// Admin dashboard statistics
app.get('/api/admin/call-statistics', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    const stats = {
      totalCalls: recordings.recordings.length,
      todayCalls: recordings.recordings.filter(call => {
        const today = new Date().toDateString();
        return new Date(call.startTime).toDateString() === today;
      }).length,
      averageDuration: recordings.recordings.reduce((acc, call) => acc + (call.duration || 0), 0) / recordings.recordings.length || 0,
      callsThisWeek: recordings.recordings.filter(call => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(call.startTime) >= weekAgo;
      }).length
    };

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error(' Error generating call statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate statistics'
    });
  }
});

// Send AI call recordings to parking system admin dashboard
app.post('/api/admin/sync-call-recordings', async (req, res) => {
  try {
    console.log(' Syncing AI call recordings with parking system admin dashboard...');
    
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    // Send recordings to parking system admin dashboard
    const parkingSystemUrl = 'http://localhost:8080';
    
    try {
      const axios = require('axios');
      
      const syncResponse = await axios.post(`${parkingSystemUrl}/api/admin/ai-call-recordings`, {
        recordings: recordings.recordings,
        source: 'vayaccess-ai-agent',
        syncTime: new Date().toISOString()
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(' Successfully synced AI call recordings to parking system');
      
      res.json({
        success: true,
        message: 'AI call recordings synced successfully',
        recordingsSynced: recordings.recordings.length,
        parkingSystemResponse: syncResponse.data
      });

    } catch (syncError) {
      console.log(' Parking system not available for sync, continuing with local storage');
      
      res.json({
        success: true,
        message: 'Recordings available locally, parking system sync will retry automatically',
        recordingsSynced: recordings.recordings.length,
        localRecordings: recordings.recordings
      });
    }

  } catch (error) {
    console.error(' Error syncing call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync call recordings'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test email endpoint (for development)
app.post('/api/test-email', async (req, res) => {
  try {
    const testEmail = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: 'VayAccess Email Service Test',
      html: '<h1>Email service is working!</h1><p>This is a test email from your VayAccess backend.</p>'
    };
    
    await transporter.sendMail(testEmail);
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Newsletter subscription endpoint (MongoDB-first, email optional)
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email, source = 'website' } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    // Persist to MongoDB if available; otherwise, skip persistence gracefully
    try {
      if (mongoDb) {
        const normalized = String(email).trim().toLowerCase();
        const now = new Date();
        const col = mongoDb.collection('subscribers');
        const existing = await col.findOne({ email: normalized });
        if (existing && existing.active !== false) {
          return res.json({ success: true, message: 'You are already subscribed. You will receive live news daily from VayAccess.' });
        }

        await col.updateOne(
          { email: normalized },
          {
            $setOnInsert: { createdAt: now, prefs: { products: true, solutions: true, marketing: true } },
            $set: { email: normalized, source, active: true, updatedAt: now },
          },
          { upsert: true }
        );
        // Ensure default prefs exist on existing records
        await col.updateOne(
          { email: normalized, $or: [ { prefs: { $exists: false } }, { prefs: null } ] },
          { $set: { 'prefs.products': true, 'prefs.solutions': true, 'prefs.marketing': true } }
        );
      } else {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
      }
    } catch (persistErr) {
      console.warn('Failed to persist subscriber to MongoDB (continuing):', persistErr?.message || persistErr);
    }

    // Optional welcome email; do not fail if SMTP is missing
    try {
      await emailHelper.sendCategorizedEmail({
        category: 'newsletter_welcome',
        to: String(email).trim().toLowerCase(),
        subject: 'Welcome to VayAccess Newsletter',
        html: withFooter(`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                 <h2 style="margin:0 0 12px 0;">Welcome to VayAccess Newsletter</h2>
                 <p style="color:#374151;line-height:1.6;">You will receive product news, articles, and live updates.</p>
                 <p style="margin-top:16px;"><a href="https://vayaccess.com" style="color:#2563eb;text-decoration:none;">Visit website</a></p>
               </div>`),
        text: 'Welcome to VayAccess Newsletter\nYou will receive product news, articles, and live updates.',
        meta: { source },
        headers: buildUnsubscribeHeaders(email),
        dedupeKey: `welcome:${String(email).trim().toLowerCase()}`
      });
    } catch (emailErr) {
      console.warn('Welcome email failed (continuing):', emailErr?.message || emailErr);
    }

    // Conditionally send present products/solutions digest immediately
    try {
      if (process.env.SEND_DIGEST_ON_SUBSCRIBE === 'true') {
        const snapshot = getContentSnapshot();
        await sendDigestToEmail(String(email).trim().toLowerCase(), snapshot);
      }
    } catch (e) {
      console.warn('Failed to send initial digest (continuing):', e?.message || e);
    }

    // Optional: send a marketing promo immediately on subscribe
    try {
      if ((process.env.SEND_MARKETING_ON_SUBSCRIBE || 'true').toLowerCase() !== 'false') {
        await emailHelper.sendCategorizedEmail({
          category: 'marketing',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Transform Your Parking with Smart Access',
          html: withFooter(`<div style='font-family:Arial,sans-serif;max-width:700px;margin:0 auto;'>
  <h2 style='margin:0 0 10px 0;color:#111827;'>Welcome to VayAccess</h2>
  <p style='color:#374151;line-height:1.6;margin:0 0 10px 0;'>Explore ANPR vehicle access, robust barrier gates, turnstiles, and real-time management.</p>
  <p style='margin-top:12px;'>
    <a href='https://vayaccess.com/products' style='background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;'>Explore Products</a>
    <span style='margin-left:12px;'><a href='https://vayaccess.com/solutions' style='color:#2563eb;text-decoration:none;'>View Solutions</a></span>
  </p>
</div>`),
          text: 'Explore VayAccess products and solutions: https://vayaccess.com',
          headers: buildUnsubscribeHeaders(email),
          dedupeKey: `marketing-on-subscribe:${String(email).trim().toLowerCase()}`,
          meta: { source, onSubscribe: true },
        });
      }
    } catch (marketingErr) {
      console.warn('Marketing email on subscribe failed (continuing):', marketingErr?.message || marketingErr);
    }

    return res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    console.error('Subscribe failed:', error);
    return res.status(500).json({ success: false, message: 'Subscription failed' });
  }
});

// Simple secured endpoint to send an update email to a recipient
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: to, subject, and html or text' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent.' });
  } catch (error) {
    console.error('Send update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// Broadcast to all subscribers (MongoDB)
app.post('/api/newsletter/broadcast', async (req, res) => {
  try {
    // security
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) {
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    const { subject, html, text, dryRun = false, onlyActive = true, category = 'marketing' } = req.body || {};
    if (!subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: subject and html or text' });
    }

    // fetch subscribers from MongoDB
    const filter = onlyActive ? { active: { $ne: false } } : {};
    const subsCursor = mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray())
      .map(d => d.email)
      .filter(e => /.+@.+\..+/.test(e));

    if (emails.length === 0) {
      return res.json({ success: true, message: 'No subscribers to send', count: 0, emails: [] });
    }

    if (dryRun) {
      return res.json({ success: true, message: 'Dry run: would send to these emails', count: emails.length, emails });
    }

    // send in sequence (simple). For large lists, batch/queue.
    let ok = 0, fail = 0;
    for (const to of emails) {
      try {
        await emailHelper.sendCategorizedEmail({
          category,
          to,
          subject,
          html: withFooter(html || ''),
          text: text || undefined,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `broadcast:${category}:${subject}:${String(to).toLowerCase()}`,
          meta: { broadcast: true },
        });
        ok++;
      } catch (e) {
        fail++;
      }
    }

    return res.json({ success: true, message: 'Broadcast completed', category, sent: ok, failed: fail, count: emails.length });
  } catch (error) {
    console.error('Broadcast failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to broadcast' });
  }
});

// Push token registration (MongoDB) — dev-safe fallback
app.post('/api/push/register', async (req, res) => {
  try {
    const { token, email } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'Missing token' });

    // If MongoDB is unavailable and dev fallback enabled, no-op to avoid UX break
    if (!mongoDb) {
      if (process.env.ALLOW_DEV_NO_DB === 'true') {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
        return res.json({ success: true, message: 'Token accepted (no DB in dev)' });
      }
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    await mongoDb.collection('pushTokens').updateOne(
      { token },
      {
        $set: {
          token,
          email: email || null,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Token registered' });
  } catch (e) {
    console.error('Register push token failed:', e);
    return res.status(500).json({ success: false, message: 'Failed to register token' });
  }
});

// --- Helpers for FCM HTTP v1 (web push) ---
const { google } = require('googleapis');
const fetch = require('node-fetch');
let FB_PROJECT_ID = process.env.FB_PROJECT_ID;
try {
  if (!FB_PROJECT_ID) {
    const svc = require('./service-account.json');
    FB_PROJECT_ID = svc.project_id;
  }
} catch (_) {}

async function getFcmAccessToken() {
  const key = require('./service-account.json');
  const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

async function sendFcmMessage(token, title, body, link) {
  if (!FB_PROJECT_ID) throw new Error('Missing FB_PROJECT_ID or service-account project_id');
  const accessToken = await getFcmAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${FB_PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token,
      notification: { title, body },
      webpush: {
        fcm_options: { link: link || '/' },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM error: ${txt}`);
  }
  return res.json();
}

// Publish update: save to MongoDB and auto-send email + push
app.post('/api/updates/publish', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { title, body, link = '/', previewOnly = false } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });

    // Save announcement to MongoDB
    const insertRes = await mongoDb.collection('announcements').insertOne({
      title,
      body,
      link,
      createdAt: new Date(),
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    if (previewOnly) {
      return res.json({ success: true, message: 'Preview only', id: insertRes.insertedId, emailsCount: emails.length, tokensCount: tokens.length });
    }

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    return res.json({ success: true, id: insertRes.insertedId, emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Publish update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to publish update' });
  }
});

// Auto-publish endpoint: idempotent broadcast by version (no separate admin UI needed)
app.post('/api/updates/auto-publish', async (req, res) => {
    console.log('Received auto-publish request:', req.body); // Log the request body
  try {
    // Optional security with token
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { version, title, body, link = '/' } = req.body || {};
    if (!version || !title || !body) return res.status(400).json({ success: false, message: 'Missing version, title or body' });

    const versionId = String(version).trim();

    // Skip if already sent for this version
    const already = await mongoDb.collection('announcements_sent').findOne({ version: versionId });
    if (already) {
      return res.json({ success: true, message: 'Already sent for this version' });
    }

    // Save announcement entry (optional)
    const annInsert = await mongoDb.collection('announcements').insertOne({
      version: versionId,
      title,
      body,
      link,
      createdAt: new Date(),
      auto: true,
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    // Mark version as sent
    await mongoDb.collection('announcements_sent').updateOne(
      { version: versionId },
      {
        $set: {
          version: versionId,
          title,
          body,
          link,
          sentAt: new Date(),
          announcementId: annInsert.insertedId,
        }
      },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Auto-publish sent', emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Auto-publish failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to auto-publish' });
  }
});





// Admin: send a single update email (manual)
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing to/subject/body' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    console.error('Manual send failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});


// --- Hourly Digest Scheduler ---
const ENABLE_HOURLY_DIGEST = (process.env.ENABLE_HOURLY_DIGEST || 'false').toLowerCase() === 'true';
const DIGEST_CATEGORY = process.env.DIGEST_CATEGORY || 'content_digest';
const DIGEST_EMAIL = (process.env.DIGEST_EMAIL || 'true').toLowerCase() === 'true';
const DIGEST_PUSH = (process.env.DIGEST_PUSH || 'true').toLowerCase() === 'true';
const DIGEST_DEDUPE_WINDOW_MIN = parseInt(process.env.DIGEST_DEDUPE_WINDOW_MINUTES || '60', 10);

async function sendHourlyDigestOnce() {
  try {
    if (!mongoDb) {
      console.warn('[digest] Skipped: MongoDB not initialized');
      return;
    }

    // Snapshot current site content
    const snapshot = getContentSnapshot();
    // Rotate templates by hour to guarantee variation across sends
    const tpl = pickRotatingTemplate();

    // Dedupe: prevent re-sending same template within the window (optional)
    const now = new Date();
    const since = new Date(now.getTime() - DIGEST_DEDUPE_WINDOW_MIN * 60 * 1000);
    const recentKey = `digest:${tpl.key}:${snapshot.hash}`;
    const alreadySent = await mongoDb.collection('email_events').findOne({
      dedupeKey: { $regex: `^${recentKey}:` }, // per recipient entry saved below
      createdAt: { $gte: since },
      result: 'sent',
    });
    if (alreadySent) {
      console.log('[digest] Recently sent this template+hash. Skipping to avoid repetition.');
      return;
    }

    // Fetch subscribers
    const subs = await mongoDb.collection('subscribers')
      .find({ active: { $ne: false } }, { projection: { email: 1 } })
      .toArray();
    const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

    // Fetch push tokens
    const tokens = DIGEST_PUSH
      ? (await mongoDb.collection('pushTokens')
          .find({ active: { $ne: false } }, { projection: { token: 1 } })
          .toArray()).map(d => d.token)
      : [];

    // Send email
    if (DIGEST_EMAIL && emails.length) {
      let sent = 0, fail = 0;
      for (const to of emails) {
        try {
          await emailHelper.sendCategorizedEmail({
            category: DIGEST_CATEGORY,
            to,
            subject: tpl.subject(snapshot),
            html: tpl.buildHtml(snapshot),
            text: tpl.buildText(snapshot),
            headers: buildUnsubscribeHeaders(to),
           require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const voiceAIService = require('./services/voiceAIService');
const asteriskService = require('./services/asteriskService');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// MongoDB Atlas (replaces Firestore for subscribers/tokens)
const { MongoClient } = require('mongodb');
let mongoClient = null;
let mongoDb = null;
(async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'vay_parking_system';
  if (!uri) {
    console.warn('MongoDB not initialized: missing MONGODB_URI. Newsletter persistence will be disabled.');
    return;
  }

  // Attempt robust connection strategy for Windows/OpenSSL TLS issues
  let mongoReconnectTimer = null;

  function setupMongoAutoReconnect() {
    if (!mongoClient) return;
    const events = ['topologyClosed', 'serverClosed', 'serverHeartbeatFailed'];
    events.forEach((ev) => {
      try { mongoClient.removeAllListeners(ev); } catch {}
      mongoClient.on(ev, (info) => {
        if (mongoReconnectTimer) return;
        const msg = info && info.message ? info.message : '';
        console.warn(`MongoDB ${ev} - scheduling reconnect in 5s`, msg);
        mongoReconnectTimer = setTimeout(async () => {
          mongoReconnectTimer = null;
          let connected = await tryConnect('reconnect', { ...baseOptions });
          if (!connected) connected = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
          if (!connected) {
            connected = await tryConnect('reconnect + insecure', {
              ...baseOptions,
              tlsAllowInvalidCertificates: true,
              tlsAllowInvalidHostnames: true,
              family: 4,
            });
          }
          if (!connected) {
            console.warn('MongoDB reconnection failed; retrying in 10s');
            mongoReconnectTimer = setTimeout(async () => {
              mongoReconnectTimer = null;
              let ok = await tryConnect('reconnect', { ...baseOptions });
              if (!ok) ok = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
              if (!ok) {
                await tryConnect('reconnect + insecure', {
                  ...baseOptions,
                  tlsAllowInvalidCertificates: true,
                  tlsAllowInvalidHostnames: true,
                  family: 4,
                });
              }
            }, 10000);
          }
        }, 5000);
      });
    });
  }

  async function tryConnect(optionsLabel, options) {
    try {
      // Close previous client to avoid socket leaks
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
      mongoClient = new MongoClient(uri, options);
      await mongoClient.connect();
      mongoDb = mongoClient.db(dbName);
      console.log(`Connected to MongoDB Atlas database: ${dbName} (${optionsLabel})`);
      setupMongoAutoReconnect();
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn(`MongoDB connect failed [${optionsLabel}]:`, msg);
      return false;
    }
  }

  const baseOptions = {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
    tls: true,
    // Note: keepAlive options are not supported by the MongoDB Node.js driver v5.
    // We rely on the driver's internal keep-alive and our event-based reconnection.
  };

  const insecureEnv = process.env.MONGODB_TLS_INSECURE === 'true';

  // 1) If insecure explicitly requested via env, use it directly
  if (insecureEnv) {
    const ok = await tryConnect('tls+insecure (env)', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
    if (!ok) {
      console.warn('MongoDB initialization failed under insecure mode. Newsletter persistence will be disabled.');
    } else {
      // Ensure indexes for deduplication and idempotency
      try {
        await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
        await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
        await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
        console.log('MongoDB indexes ensured');
      } catch (idxErr) {
        console.warn('MongoDB index ensure failed:', idxErr.message);
      }
    }
    return;
  }

  // 2) Try strict TLS first
  let connected = await tryConnect('tls strict', { ...baseOptions });

  // 3) If fails, try strict TLS forcing IPv4 (DNS/IPv6 issues)
  if (!connected) {
    connected = await tryConnect('tls strict + IPv4', { ...baseOptions, family: 4 });
  }

  // 4) If still fails with SSL-related error, try insecure TLS as fallback
  if (!connected) {
    connected = await tryConnect('tls+insecure fallback', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
  }

  if (!connected) {
    console.warn('MongoDB initialization failed after all attempts. Newsletter persistence will be disabled.');
    return;
  }

  // Ensure indexes for deduplication and idempotency
  try {
    await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
    await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
    console.log('MongoDB indexes ensured');
  } catch (idxErr) {
    console.warn('MongoDB index ensure failed:', idxErr.message);
  }
})();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

// Initialize Socket.IO for real-time call communication
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
    credentials: true
  }
});

// Configure multer for audio file uploads
const upload = multer({
  dest: 'temp/', // temporary directory for uploaded audio files
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
  credentials: true
}));
app.use(express.json());

// Serve assets with stable URLs for emails and previews
app.use('/assets', express.static(path.resolve(__dirname, '../src/assets')));

// Serve admin interface (protected by admin token in the HTML)
app.get('/admin/newsletter', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin-newsletter.html'));
});

// Demo routes (FREE - no Twilio needed)
const demoRoutes = require('./routes/demo');
app.use('/api', demoRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', mongo: !!mongoDb });
});

// One-click unsubscribe (for List-Unsubscribe-Post)
app.post('/api/newsletter/unsubscribe', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const email = (req.body?.email || req.query?.e || '').toString().toLowerCase();
    const token = (req.body?.token || req.query?.t || '').toString();
    if (!email || token !== signUnsubToken(email)) return res.status(400).send('Invalid request');
    if (mongoDb) {
      await mongoDb.collection('subscribers').updateOne({ email }, { $set: { active: false, updatedAt: new Date() } });
    }
    // RFC-compliant one-click: respond 200 with empty body
    return res.status(200).send('');
  } catch (e) {
    return res.status(500).send('');
  }
});

// Subscribe endpoint (name, email, frequency)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { name, email, frequency } = req.body || {};
    const n = String(name || '').trim();
    const em = String(email || '').trim().toLowerCase();
    const f = String(frequency || 'weekly').toLowerCase();
    if (!/.+@.+\..+/.test(em)) return res.status(400).json({ success:false, message:'Invalid email' });
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });

    const now = new Date();
    await mongoDb.collection('subscribers').updateOne(
      { email: em },
      { $setOnInsert: { createdAt: now, subscribedAt: now }, $set: { name: n, frequency: freq, active: true, updatedAt: now } },
      { upsert: true }
    );

    // Send welcome email
    const headers = buildUnsubscribeHeaders(em);
    const firstName = n ? n.split(' ')[0] : 'there';
    const html = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p>Hi ${firstName},</p>
        <p>Thanks for subscribing to VayAccess updates (${freq}). You'll receive ${freq} digests with our latest articles.</p>
      </div>
    `);
    await emailHelper.sendCategorizedEmail({
      category: 'newsletter_welcome',
      to: em,
      subject: 'Welcome to VayAccess Updates',
      html,
      headers
    });

    return res.json({ success:true, message:'Subscribed' });
  } catch (e) {
    const msg = e?.code === 11000 ? 'Already subscribed' : (e?.message || 'Server error');
    return res.status(500).json({ success:false, message: msg });
  }
});

// Preferences update endpoint
app.post('/api/newsletter/update-preferences', async (req, res) => {
  try {
    const { email, token, frequency } = req.body || {};
    const em = String(email || '').toLowerCase();
    if (!em || token !== signUnsubToken(em)) return res.status(400).json({ success:false, message:'Invalid token' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const f = String(frequency || '').toLowerCase();
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    await mongoDb.collection('subscribers').updateOne({ email: em }, { $set: { frequency: freq, updatedAt: new Date() } });
    return res.json({ success:true });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Manual trigger for individual email distribution (for testing)
app.post('/api/newsletter/distribute-individual', async (req, res) => {
  try {
    const result = await distributeIndividualEmails();
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Server error' });
  }
});

// Articles: create & list
app.post('/api/articles', async (req, res) => {
  try {
    const { title, summary, content, tags } = req.body || {};
    if (!title || !summary) return res.status(400).json({ success:false, message:'Missing title/summary' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const doc = { title: String(title), summary: String(summary), content: String(content||''), tags: Array.isArray(tags)? tags.map(String):[], createdAt: new Date() };
    const result = await mongoDb.collection('articles').insertOne(doc);
    return res.json({ success:true, id: result.insertedId, article: doc });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

app.get('/api/articles', async (req, res) => {
  try {
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const { tag, limit } = req.query;
    const q = tag ? { tags: String(tag) } : {};
    const lim = Math.min(Number(limit)||20, 100);
    const items = await mongoDb.collection('articles').find(q).sort({ createdAt:-1 }).limit(lim).toArray();
    return res.json({ success:true, items });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Connect to Asterisk AMI on server start (optional via ENABLE_AMI)
if (process.env.ENABLE_AMI === 'true') {
  asteriskService.connect().catch(err => {
    console.error(' Failed to connect to Asterisk AMI:', err);
  });
} else {
  console.log(' Skipping AMI connection (ENABLE_AMI not set to true)');
}

// API endpoint to initiate call via Asterisk AMI
app.post('/api/call', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    if (!asteriskService.isAlive()) {
      await asteriskService.connect();
    }

    const result = await asteriskService.originateCall(number);

    if (result.success) {
      // Emit call status to frontend clients
      io.emit('call-status-changed', {
        sessionId: result.sessionId,
        phoneNumber: number,
        status: 'initiated',
        timestamp: new Date()
      });
    }

    res.json(result);
  } catch (error) {
    console.error(' Error originating call:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

// Listen for call-originated event from asteriskService and broadcast
asteriskService.on('call-originated', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'ringing',
    timestamp: new Date()
  });
});

// Socket.IO connection handling for real-time call features
io.on('connection', (socket) => {
  console.log(` Client connected: ${socket.id}`);

  socket.on('join-call-room', (sessionId) => {
    socket.join(`call-${sessionId}`);
    console.log(` Client joined call room: call-${sessionId}`);
  });

  socket.on('call-status-update', (data) => {
    io.to(`call-${data.sessionId}`).emit('call-status-changed', data);
  });

  socket.on('disconnect', () => {
    console.log(` Client disconnected: ${socket.id}`);
  });
});

// Email configuration using SMTP (Gmail/Outlook/Custom SMTP)
let transporter;
let smtpReady = false;
let smtpError = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false otherwise
    auth: {
      user: process.env.SMTP_USER, // info@vayaccess.com
      pass: process.env.SMTP_PASS  // App-specific password
    }
  });

  // Verify email configuration
  transporter.verify((error) => {
    if (error) {
      smtpReady = false;
      smtpError = String(error?.message || error);
      console.error(' Email configuration error:', error);
    } else {
      smtpReady = true;
      smtpError = null;
      console.log(' Email server is ready to send messages');
    }
  });
} else {
  // Fallback to JSON transport: no actual SMTP connection; prevents runtime EAUTH errors
  transporter = nodemailer.createTransport({ jsonTransport: true });
  smtpReady = false;
  smtpError = 'SMTP_USER/SMTP_PASS missing (jsonTransport)';
  console.log(' Email disabled: missing SMTP_USER/SMTP_PASS (using jsonTransport)');
}

// SMTP status endpoint
app.get('/api/admin/smtp-status', (req, res) => {
  res.json({ ready: smtpReady, error: smtpError, user: process.env.SMTP_USER || null, host: process.env.SMTP_HOST || 'smtp.gmail.com' });
});

// Email helper (categorized sending with flags + tracking)
const createEmailHelper = require('./emailHelper');
const emailHelper = createEmailHelper(transporter, () => mongoDb);

// --- Site content digest and auto-news ---
const CONTENT_FILES = [
  path.resolve(__dirname, '../src/components/Products.tsx'),
  path.resolve(__dirname, '../src/components/Solutions.tsx'),
];

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function parseProductNames(content) {
  // Extract product names from Products.tsx: name: "..."
  const names = new Set();
  const nameRegex = /name:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = nameRegex.exec(content))) {
    const name = m[1].trim();
    if (name && !/quote$/i.test(name)) names.add(name);
  }
  return Array.from(names);
}

function parseSolutionTitles(content) {
  // Extract titles from Solutions.tsx: title: "..."
  const titles = new Set();
  const titleRegex = /title:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = titleRegex.exec(content))) {
    const title = m[1].trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

function getContentSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductNames(productsTsx).slice(0, 20);
  const solutions = parseSolutionTitles(solutionsTsx).slice(0, 30);
  const combined = `${products.join('\n')}\n---\n${solutions.join('\n')}`;
  const hash = sha256(combined);
  return { hash, products, solutions };
}

function buildDigestHtml(snapshot) {
  const { products, solutions } = snapshot;
  
  // Get detailed product and solution information
  const articlesSnapshot = getArticlesSnapshot();
  const detailedProducts = articlesSnapshot.products.slice(0, 3); // Show top 3 products
  const detailedSolutions = articlesSnapshot.solutions.slice(0, 3); // Show top 3 solutions
  
  // Build product cards with images
  const productCards = detailedProducts.map(product => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      ${product.image ? `<img src="${product.image}" alt="${product.title}" style="width:100%;max-width:300px;height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${product.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${product.description || ''}</p>
    </div>
  `).join('');
  
  // Build solution cards
  const solutionCards = detailedSolutions.map(solution => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${solution.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${solution.description || ''}</p>
    </div>
  `).join('');
  
  // Add parking services section
  const parkingServices = `
    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:20px 0;">
      <h3 style="margin:0 0 12px 0;color:#111827;font-size:18px;font-weight:600;"> Our Parking Services</h3>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
        <li><strong>Smart Parking Management:</strong> Complete ticketless and ticket-based parking solutions</li>
        <li><strong>ANPR Technology:</strong> Automatic number plate recognition for seamless access</li>
        <li><strong>Access Control Systems:</strong> Advanced barrier gates and turnstiles</li>
        <li><strong>Parking Guidance:</strong> Real-time space availability and navigation</li>
        <li><strong>Mobile Integration:</strong> User-friendly mobile apps for parking management</li>
        <li><strong>Analytics & Reporting:</strong> Comprehensive parking analytics and insights</li>
      </ul>
    </div>
  `;
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:20px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="margin:0 0 8px 0;color:#111827;font-size:24px;font-weight:700;"> VayAccess Latest Updates</h2>
        <p style="color:#6b7280;line-height:1.6;margin:0;">Discover our cutting-edge parking solutions and smart access control systems</p>
      </div>
      
      ${productCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Featured Products</h3>
          ${productCards}
        </div>
      ` : ''}
      
      ${solutionCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Smart Solutions</h3>
          ${solutionCards}
        </div>
      ` : ''}
      
      ${parkingServices}
      
      <div style="text-align:center;margin-top:24px;padding:20px;background:#2563eb;border-radius:12px;">
        <h3 style="margin:0 0 12px 0;color:#ffffff;font-size:18px;">Ready to Transform Your Parking?</h3>
        <p style="margin:0 0 16px 0;color:#dbeafe;">Contact us today for a free consultation and demo</p>
        <a href="https://vayaccess.com/contact" style="display:inline-block;background:#ffffff;color:#2563eb;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Get Started Now</a>
      </div>
      
      <div style="text-align:center;margin-top:20px;">
        <p style="margin:0;color:#6b7280;font-size:14px;">
          <a href="https://vayaccess.com/products" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Products</a> • 
          <a href="https://vayaccess.com/solutions" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Solutions</a> • 
          <a href="https://vayaccess.com/services" style="color:#2563eb;text-decoration:none;margin:0 8px;">Our Services</a>
        </p>
      </div>
    </div>
  `;
}

function buildDigestText(snapshot) {
  const { products, solutions } = snapshot;
  return [
    'VayAccess Latest Updates',
    '',
    'Products:',
    ...products.map(p => `- ${p}`),
    '',
    'Solutions:',
    ...solutions.map(s => `- ${s}`),
    '',
    'View all: https://vayaccess.com'
  ].join('\n');
}

// --- Enhanced digest templates with rich content ---
const DIGEST_TEMPLATES = [
  {
    key: 'products_spotlight',
    subject: () => ' VayAccess Product Spotlight - Smart Parking Solutions',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Featured Products</h1>
          <p style="margin:0;opacity:0.9;">Discover our latest smart parking technology</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'solutions_focus',
    subject: () => ' VayAccess Solutions Update - Transform Your Parking',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#059669,#047857);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Smart Solutions</h1>
          <p style="margin:0;opacity:0.9;">Complete parking management solutions for modern facilities</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'weekly_roundup',
    subject: () => ' VayAccess Weekly Roundup - Products, Solutions & Services',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Weekly Update</h1>
          <p style="margin:0;opacity:0.9;">Your complete guide to VayAccess innovations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'technology_insights',
    subject: () => ' VayAccess Tech Insights - ANPR, IoT & Smart Access',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Technology Focus</h1>
          <p style="margin:0;opacity:0.9;">Advanced parking technology and smart city solutions</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'customer_success',
    subject: () => ' VayAccess Success Stories - Real Results, Real Impact',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#ea580c,#c2410c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Success Stories</h1>
          <p style="margin:0;opacity:0.9;">See how our solutions transform parking operations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
];

function pickRotatingTemplate() {
  const hour = new Date().getHours();
  return DIGEST_TEMPLATES[hour % DIGEST_TEMPLATES.length];
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
// Use admin token for signing unsubscribe tokens (fallback to legacy secret if present)
const NEWSLETTER_SECRET = process.env.NEWSLETTER_ADMIN_TOKEN || process.env.NEWSLETTER_SECRET || 'change-me';

function signUnsubToken(email) {
  return crypto.createHmac('sha256', NEWSLETTER_SECRET).update(String(email).toLowerCase()).digest('hex');
}

function buildUnsubscribeHeaders(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  const t = signUnsubToken(email);
  const httpUrl = `${PUBLIC_BASE_URL}/api/newsletter/unsubscribe?e=${e}&t=${t}`;
  const mailto = `mailto:${process.env.SMTP_USER || 'no-reply@vayaccess.com'}?subject=unsubscribe`;
  const base = {
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'List-Id': 'VayAccess Newsletter <newsletter.vayaccess.com>',
  };
  if (process.env.ENABLE_MANAGE_LINK === 'true') {
    return {
      ...base,
      'List-Unsubscribe': `<${httpUrl}>, <${mailto}>`,
      'X-List-Manage': `${PUBLIC_BASE_URL}/newsletter/manage`,
    };
  }
  return {
    ...base,
    'List-Unsubscribe': `<${mailto}>`,
  };
}

function withFooter(html) {
  const manageUrl = `${PUBLIC_BASE_URL}/newsletter/manage`;
  const manageLine = process.env.ENABLE_MANAGE_LINK === 'true'
    ? `<br/>Manage: <a style="color:#2563eb;" href="${manageUrl}">subscription portal</a>`
    : '';
  return `${html}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
    <p style="font-size:12px;color:#6b7280;line-height:1.6;">
      This email was sent by VayAccess. Update your preferences or unsubscribe anytime.
      ${manageLine}
    </p>`;
}

async function sendDigestToEmail(to, snapshot) {
  try {
    const html = withFooter(buildDigestHtml(snapshot));
    const text = buildDigestText(snapshot);
    await emailHelper.sendCategorizedEmail({
      category: 'content_digest',
      to,
      subject: 'VayAccess: Products & Solutions Digest',
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `digest:${snapshot.hash}:${String(to).toLowerCase()}`,
      meta: { type: 'digest' },
    });
  } catch (e) {
    console.warn('Digest email failed:', e?.message || e);
  }
}

async function broadcastDigest(snapshot, opts = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const { products, solutions } = getArticlesSnapshot();
  const filter = { active: { $ne: false } };
  const subs = await mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } }).toArray();
  const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

  let stats = { products: { sent: 0, failed: 0 }, solutions: { sent: 0, failed: 0 } };

  // Products broadcast (categorized + tracked)
  if (products?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_products',
        to,
        subject: 'VayAccess: New Products (with images)',
        html: buildArticleDigestHtml(products),
        text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: products.length },
        dedupeKey: `broadcast-products:${to}`,
      });
      if (res?.success) stats.products.sent++; else if (!res?.skipped) stats.products.failed++;
    }
  }

  // Solutions broadcast (categorized + tracked)
  if (solutions?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_solutions',
        to,
        subject: 'VayAccess: Latest Solutions',
        html: buildArticleDigestHtml(solutions),
        text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: solutions.length },
        dedupeKey: `broadcast-solutions:${to}`,
      });
      if (res?.success) stats.solutions.sent++; else if (!res?.skipped) stats.solutions.failed++;
    }
  }

  // Optional push notification title/body
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token, 'VayAccess Updates', 'See the latest products and solutions', '/products'); } catch (_) {}
    }
  } catch (_) {}

  return { success: true, products: stats.products, solutions: stats.solutions, recipients: emails.length };
}

async function checkAndBroadcastContentUpdates() {
  try {
    if (!mongoDb) return;
    // Use full articles snapshot (title, description, image) for change detection
    const { hash } = getArticlesSnapshot();
    const stateCol = mongoDb.collection('site_content_state');
    const id = 'articles_digest_v1';
    const existing = await stateCol.findOne({ _id: id });
    if (!existing || existing.hash !== hash) {
      await stateCol.updateOne(
        { _id: id },
        { $set: { _id: id, hash, updatedAt: new Date() } },
        { upsert: true }
      );
      // Broadcast update with latest snapshot
      await broadcastDigest(getArticlesSnapshot());
      console.log('Auto-news: broadcasted new articles digest');
    }
  } catch (e) {
    console.warn('Auto-news check failed:', e?.message || e);
  }
}

// Articles generator for products & solutions (with images, no links)
// Uses PUBLIC_BASE_URL defined earlier

function toAssetUrl(relPath) {
  if (!relPath) return null;
  try {
    const file = path.basename(relPath);
    return `${PUBLIC_BASE_URL}/assets/${file}`;
  } catch (_) { return null; }
}

function parseImportsMap(content) {
  // import varName from "../assets/file.jpg";
  const map = {};
  const importRe = /import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g;
  let m;
  while ((m = importRe.exec(content))) {
    map[m[1]] = m[2];
  }
  return map;
}

function parseProductsDetailed(content) {
  const imports = parseImportsMap(content);
  // Extract the products array block
  const arrMatch = content.match(/const\s+products\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return [];
  const arrBody = arrMatch[1];
  const items = [];
  // Split by object boundaries (rough but works with our formatting)
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const name = (obj.match(/name:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    // capture description until the next field or end of object (robust to line breaks and trailing commas)
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    const imageVar = (obj.match(/image:\s*(\w+)/) || [])[1];
    if (name) {
      const rel = imports[imageVar];
      items.push({
        type: 'product',
        title: name,
        description: (desc || '').trim(),
        image: toAssetUrl(rel),
      });
    }
  }
  return items;
}

function parseSolutionsDetailed(content) {
  // Solutions currently don't have image assets; add a generic illustrative image
  const placeholder = `${PUBLIC_BASE_URL}/assets/parking-system-architecture.jpg`;
  const items = [];
  const arrMatch = content.match(/const\s+solutions\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return items;
  const arrBody = arrMatch[1];
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const title = (obj.match(/title:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    if (title) items.push({ type: 'solution', title, description: (desc || '').trim(), image: placeholder });
  }
  return items;
}

function getArticlesSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductsDetailed(productsTsx).slice(0, 20);
  const solutions = parseSolutionsDetailed(solutionsTsx).slice(0, 30);
  const articles = [...products, ...solutions];
  const hash = sha256(JSON.stringify(articles).slice(0, 2000));
  return { hash, articles, products, solutions };
}

function buildArticleDigestHtml(articles) {
  // generic combined template
  const card = (a) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`;
  const list = articles.map(card).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Products & Solutions</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 12px 0;">Latest offerings for our subscribers. This email contains full content without external links.</p>
      ${list}
    </div>`;
}

function buildProductsDigestHtml(products) {
  const list = products.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Product Highlights</h2>
      ${list || '<p>No products today.</p>'}
    </div>`;
}

function buildSolutionsDigestHtml(solutions) {
  const list = solutions.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Solutions Spotlight</h2>
      ${list || '<p>No solutions today.</p>'}
    </div>`;
}

// Build individual product email HTML
function buildProductEmailHtml(product) {
  const imageUrl = product.image ? `https://vayaccess.com${product.image}` : 'https://vayaccess.com/assets/default-product.jpg';
  
  // Enhanced product descriptions based on title
  const getEnhancedDescription = (title, originalDesc) => {
    const descriptions = {
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Transform your parking operations with our cutting-edge ticketless parking management system. This revolutionary solution eliminates the need for physical tickets, creating a seamless experience for both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our system leverages advanced ANPR (Automatic Number Plate Recognition) technology combined with mobile app integration to provide a completely digital parking experience. Users can find, reserve, and pay for parking spaces directly through their smartphones.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'The system optimizes space usage while providing real-time analytics and reporting capabilities for facility managers.'}
        </p>
      `,
      'Ticket Based Parking Management': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our traditional ticket-based parking management system provides reliable and proven parking control for high-traffic facilities. Perfect for malls, airports, and commercial complexes requiring robust entry and exit management.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing at entry points, validation systems, and secure payment processing. Built with durability and reliability in mind, it handles thousands of transactions daily.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Streamlined ticket management with comprehensive reporting and analytics for optimal facility management.'}
        </p>
      `,
      'VAY Parking Guidance Display': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Enhance your parking facility with our intelligent parking guidance display system. These advanced LED displays provide real-time parking availability information, helping drivers quickly locate available spaces.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system integrates with our sensor network to display accurate space availability, reducing search time and improving traffic flow within your facility. Clear, bright LED indicators guide users efficiently to available parking spots.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Improved user experience with enhanced safety and security features for modern parking facilities.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Advanced parking solution designed to streamline operations and enhance user experience with cutting-edge technology and innovative features.'}
      </p>
    `;
  };
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Product Spotlight</h1>
        <p style="margin:8px 0 0 0;color:#dbeafe;font-size:16px;">Discover VayAccess Innovation</p>
      </div>
      
      <!-- Product Content -->
      <div style="padding:30px 20px;">
        <!-- Product Image -->
        <div style="text-align:center;margin-bottom:24px;">
          <img src="${imageUrl}" alt="${product.title}" 
               style="width:100%;max-width:500px;height:300px;object-fit:cover;border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,0.15);" />
        </div>
        
        <!-- Product Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${product.title}
        </h2>
        
        <!-- Product Description -->
        <div style="background:#f8fafc;border-radius:12px;padding:24px;margin:20px 0;">
          ${getEnhancedDescription(product.title, product.description)}
        </div>
        
        <!-- Key Features -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> Key Features</h3>
          <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
            <li>Advanced technology integration</li>
            <li>User-friendly interface</li>
            <li>Real-time monitoring and analytics</li>
            <li>Scalable and customizable solution</li>
            <li>24/7 technical support</li>
          </ul>
        </div>
        
        <!-- Benefits Section -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Benefits</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Increased operational efficiency</li>
            <li>Enhanced customer satisfaction</li>
            <li>Reduced operational costs</li>
            <li>Improved security and access control</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Ready to Learn More?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Get detailed specifications and pricing information</p>
          <a href="https://vayaccess.com/products" 
             style="display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
            View Product Details
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Questions? We're here to help!</p>
          <p style="margin:0;color:#2563eb;font-size:14px;">
             <a href="mailto:info@vayaccess.com" style="color:#2563eb;text-decoration:none;">info@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#2563eb;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Build individual solution email HTML
function buildSolutionEmailHtml(solution) {
  // Enhanced solution descriptions based on title
  const getEnhancedSolutionDescription = (title, originalDesc) => {
    const descriptions = {
      'Hybrid ANPR/FASTAG System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Experience the future of vehicle access control with our revolutionary Hybrid ANPR/FASTAG System. This cutting-edge solution combines the power of Automatic Number Plate Recognition (ANPR) technology with FASTAG integration for seamless, contactless vehicle access.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our hybrid approach ensures maximum compatibility and reliability. When FASTAG is available, the system processes payments instantly. When FASTAG is not detected, our advanced ANPR technology takes over, capturing and processing license plates with 99.9% accuracy.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'This dual-technology approach eliminates barriers to entry while maintaining the highest security standards for modern parking facilities.'}
        </p>
      `,
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Step into the future of parking management with our comprehensive ticketless solution. This intelligent system eliminates the need for physical tickets, creating a completely digital parking ecosystem that benefits both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Users can locate, reserve, and pay for parking spaces through our intuitive mobile application. The system provides real-time availability updates, navigation assistance, and secure payment processing, all while collecting valuable analytics for facility optimization.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Transform your parking operations with reduced operational costs, improved user satisfaction, and comprehensive facility management tools.'}
        </p>
      `,
      'Ticket Based Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our robust ticket-based parking management system provides proven reliability for high-volume parking facilities. Designed for environments where traditional ticketing is preferred or required, this solution offers comprehensive control and monitoring capabilities.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing, validation, and payment processing with multiple payment options. Built-in fraud prevention and comprehensive reporting ensure secure operations and detailed facility insights.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Perfect for malls, airports, and commercial complexes requiring reliable, high-capacity parking management with detailed transaction tracking.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Innovative smart parking solution that leverages cutting-edge technology to optimize parking operations and enhance user experience with advanced features and seamless integration.'}
      </p>
    `;
  };

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Smart Solution</h1>
        <p style="margin:8px 0 0 0;color:#e9d5ff;font-size:16px;">Intelligent Parking Innovation</p>
      </div>
      
      <!-- Solution Content -->
      <div style="padding:30px 20px;">
        <!-- Solution Icon/Visual -->
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);width:100px;height:100px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;box-shadow:0 8px 25px rgba(124,58,237,0.3);">
            <span style="font-size:42px;"></span>
          </div>
        </div>
        
        <!-- Solution Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${solution.title}
        </h2>
        
        <!-- Solution Description -->
        <div style="background:#faf5ff;border-radius:12px;padding:24px;margin:20px 0;border-left:4px solid #7c3aed;">
          ${getEnhancedSolutionDescription(solution.title, solution.description)}
        </div>
        
        <!-- How It Works -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> How It Works</h3>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">1</span>
              <span style="color:#374151;">Smart sensors detect vehicle presence</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">2</span>
              <span style="color:#374151;">Real-time data processing and analysis</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">3</span>
              <span style="color:#374151;">Automated guidance and management</span>
            </div>
          </div>
        </div>
        
        <!-- Key Advantages -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Key Advantages</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Reduces parking search time by up to 70%</li>
            <li>Increases parking revenue by 25-40%</li>
            <li>Minimizes traffic congestion</li>
            <li>Enhances overall user satisfaction</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Interested in This Solution?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Schedule a demo and see it in action</p>
          <a href="https://vayaccess.com/solutions" 
             style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(124,58,237,0.3);">
            Learn More
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Ready to implement this solution?</p>
          <p style="margin:0;color:#7c3aed;font-size:14px;">
             <a href="mailto:solutions@vayaccess.com" style="color:#7c3aed;text-decoration:none;">solutions@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#7c3aed;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Send individual product email
async function sendProductEmail(to, product, emailIndex = 0) {
  try {
    const html = withFooter(buildProductEmailHtml(product));
    const text = `VayAccess Product Spotlight: ${product.title}\n\n${product.description || ''}\n\nLearn more: https://vayaccess.com/products`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'product_spotlight',
      to,
      subject: ` New Product: ${product.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `product:${product.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'product', productTitle: product.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Product email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Send individual solution email
async function sendSolutionEmail(to, solution, emailIndex = 0) {
  try {
    const html = withFooter(buildSolutionEmailHtml(solution));
    const text = `VayAccess Smart Solution: ${solution.title}\n\n${solution.description || ''}\n\nLearn more: https://vayaccess.com/solutions`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'solution_spotlight',
      to,
      subject: ` Smart Solution: ${solution.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `solution:${solution.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'solution', solutionTitle: solution.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Solution email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Distribute individual emails based on user frequency (personalized per subscriber for hourly)
// options: { forceNow?: boolean; onlyEmail?: string }
async function distributeIndividualEmails(options = {}) {
  try {
    if (!mongoDb) return { success: false, message: 'DB not ready' };

    const { forceNow = false, onlyEmail } = options;
    const snapshot = getArticlesSnapshot();
    const { products, solutions } = snapshot;

    // Get all active subscribers (optionally filter by one email for testing)
    const q = { active: true };
    if (onlyEmail) q.email = String(onlyEmail).toLowerCase();
    const subscribers = await mongoDb.collection('subscribers')
      .find(q)
      .toArray();

    if (subscribers.length === 0) {
      return { success: true, message: 'No active subscribers' };
    }

    const stats = {
      hourly: { products: 0, solutions: 0, sent: 0, failed: 0 },
      daily: { products: 0, solutions: 0, sent: 0, failed: 0 },
      weekly: { products: 0, solutions: 0, sent: 0, failed: 0 }
    };

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // A simple hash to integer for personalization
    function hashToInt(str) {
      const hex = crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
      return parseInt(hex.slice(0, 8), 16); // 32-bit range
    }

    // Group subscribers by frequency
    const subscribersByFreq = {
      hourly: subscribers.filter(s => s.frequency === 'hourly'),
      daily: subscribers.filter(s => s.frequency === 'daily'),
      weekly: subscribers.filter(s => s.frequency === 'weekly')
    };

    // Send emails based on frequency
    for (const [frequency, subs] of Object.entries(subscribersByFreq)) {
      if (subs.length === 0) continue;

      if (frequency === 'hourly') {
        // Personalized selection per-subscriber per-hour
        const hourKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        for (const subscriber of subs) {
          try {
            // Build a stable per-hour hash using email + hour key
            const h = hashToInt(`${String(subscriber.email).toLowerCase()}:${hourKey}`);

            // Decide category first, considering availability
            let pickType = 'product';
            if (products.length === 0 && solutions.length === 0) continue;
            if (products.length === 0) pickType = 'solution';
            else if (solutions.length === 0) pickType = 'product';
            else pickType = (h % 2 === 0) ? 'product' : 'solution';

            if (pickType === 'product') {
              const idx = products.length ? (h % products.length) : 0;
              const item = products[idx];
              const res = await sendProductEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.products++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            } else {
              // Use a different mix for solutions for better spread
              const idx = solutions.length ? ((h >> 3) % solutions.length) : 0;
              const item = solutions[idx];
              const res = await sendSolutionEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.solutions++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send personalized hourly email to ${subscriber.email}:`, e?.message);
            stats.hourly.failed++;
          }
        }
        continue; // Move to next frequency
      }

      // Daily and Weekly keep existing shared content logic
      let shouldSend = false;
      let contentToSend = [];

      if (frequency === 'daily') {
        shouldSend = forceNow || currentHour === 9; // Send at 9 AM daily (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const seed = forceNow ? now.getTime() : now.getDate();
            const dayIndex = seed % total;
            if (dayIndex < products.length) contentToSend.push({ type: 'product', item: products[dayIndex] });
            else contentToSend.push({ type: 'solution', item: solutions[dayIndex - products.length] });
          }
        }
      } else if (frequency === 'weekly') {
        shouldSend = forceNow || (currentDay === 1 && currentHour === 10); // Monday 10 AM (or immediately if forced)
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const weekNumber = forceNow ? Math.floor(now.getTime() / (24 * 60 * 60 * 1000)) : Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
            const startIndex = (weekNumber * 2) % total;
            for (let i = 0; i < 2 && i < total; i++) {
              const index = (startIndex + i) % total;
              if (index < products.length) contentToSend.push({ type: 'product', item: products[index] });
              else contentToSend.push({ type: 'solution', item: solutions[index - products.length] });
            }
          }
        }
      }

      if (!shouldSend || contentToSend.length === 0) continue;

      for (const subscriber of subs) {
        for (let i = 0; i < contentToSend.length; i++) {
          const content = contentToSend[i];
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 2000)); // small pacing
          try {
            let result;
            if (content.type === 'product') {
              result = await sendProductEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].products++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            } else {
              result = await sendSolutionEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].solutions++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send ${content.type} email to ${subscriber.email}:`, e?.message);
            stats[frequency].failed++;
          }
        }
      }
    }

    const totalSent = Object.values(stats).reduce((sum, s) => sum + s.sent, 0);
    const totalFailed = Object.values(stats).reduce((sum, s) => sum + s.failed, 0);

    console.log(`Individual emails distributed: ${totalSent} sent, ${totalFailed} failed`, stats);

    return {
      success: true,
      stats,
      totalSent,
      totalFailed,
      message: `Distributed ${totalSent} individual emails`
    };

  } catch (e) {
    console.warn('Individual email distribution failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

function buildMarketingDigestHtml() {
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      <h3 style="margin:0 0 8px 0;color:#111827;">Special Offers & Updates</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
      <p style="margin-top:10px;"><a href="https://vayaccess.com/contact" style="color:#2563eb;text-decoration:none;">Contact sales</a></p>
    </div>`;
}

// Content APIs
app.get('/api/content/articles', (req, res) => {
  try {
    const snap = getArticlesSnapshot();
    res.json({ success: true, count: snap.articles.length, articles: snap.articles });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to build articles' });
  }
});

// Admin-protected triggers for content digest
function isAdmin(req) {
  const header = req.headers['x-admin-secret'] || req.headers['x-admin-token'];
  const query = req.query?.secret || req.query?.token;
  const provided = header || query;
  const expected = process.env.ADMIN_SECRET;
  return expected && provided && String(provided) === String(expected);
}

app.post('/api/admin/content/auto-check', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    await checkAndBroadcastContentUpdates();
    res.json({ success: true, message: 'Auto-check executed' });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to run auto-check' });
  }
});

app.post('/api/admin/content/broadcast', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const snap = getArticlesSnapshot();
    const result = await broadcastDigest(snap, { force: true });
    res.json({ success: true, message: 'Broadcast triggered', result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to broadcast' });
  }
});

// Manual newsletter trigger for testing
app.post('/api/admin/newsletter/send-test', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const { frequency = 'hourly', testEmail } = req.body;

    // Use individual distribution with forceNow and optional single email targeting
    const result = await distributeIndividualEmails({ forceNow: true, onlyEmail: testEmail || undefined });
    res.json({ success: true, message: `${frequency} digest dispatched${testEmail ? ' to ' + testEmail : ''}`, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send newsletter' });
  }
});

// Get newsletter statistics
app.get('/api/admin/newsletter/stats', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!mongoDb) return res.status(503).json({ success: false, message: 'DB not ready' });
    
    const totalSubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const hourlySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'hourly' });
    const dailySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'daily' });
    const weeklySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'weekly' });
    
    const recentEmails = await mongoDb.collection('email_events')
      .find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    
    res.json({
      success: true,
      stats: {
        totalSubscribers: totalSubs,
        byFrequency: {
          hourly: hourlySubs,
          daily: dailySubs,
          weekly: weeklySubs
        },
        recentEmails: recentEmails.length,
        lastEmails: recentEmails.map(e => ({
          to: e.to,
          subject: e.subject,
          category: e.category,
          result: e.result,
          createdAt: e.createdAt
        }))
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to get stats' });
  }
});

// Newsletter subscribe endpoint (legacy v1) - renamed to avoid shadowing improved version below
app.post('/api/newsletter/subscribe-v1', async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!email || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    if (!mongoDb) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const col = mongoDb.collection('subscribers');
    await col.updateOne(
      { email: email.toLowerCase() },
      { $set: { email: email.toLowerCase(), source: source || 'footer', active: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    // Category-wise triggers: send separate emails for products and solutions
    try {
      const { products, solutions } = getArticlesSnapshot();

      // Products trigger
      if (products?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_products',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Top Products for You',
          html: buildArticleDigestHtml(products),
          text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: products.length },
          dedupeKey: `welcome-products:${String(email).trim().toLowerCase()}`,
        });
      }

      // Solutions trigger
      if (solutions?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_solutions',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Latest Parking Solutions',
          html: buildArticleDigestHtml(solutions),
          text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: solutions.length },
          dedupeKey: `welcome-solutions:${String(email).trim().toLowerCase()}`,
        });
      }
    } catch (digestErr) {
      console.warn('Welcome category digests failed (continuing):', digestErr?.message || digestErr);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    console.error(' Subscribe error:', e);
    res.status(500).json({ success: false, message: 'Failed to subscribe' });
  }
});

// Scheduler (configurable, default every 3 minutes)
if (process.env.ENABLE_CONTENT_AUTONEWS !== 'false') {
  const minutes = Number(process.env.CONTENT_AUTONEWS_INTERVAL_MIN || process.env.CONTENT_AUTONEWS_INTERVAL || 3);
  const intervalMs = Math.max(60_000, Math.floor(minutes) * 60 * 1000); // >= 1 minute
  setInterval(checkAndBroadcastContentUpdates, intervalMs);
  // Initial delayed check to allow Mongo to connect
  setTimeout(checkAndBroadcastContentUpdates, 30 * 1000);
}

// --- Daily Digest (Email + Web Push) ---
let ENABLE_DAILY_DIGEST = process.env.ENABLE_DAILY_DIGEST !== 'false';
if (!ENABLE_DAILY_DIGEST) {
  console.warn('Daily digest disabled by env, overriding to enabled.');
  ENABLE_DAILY_DIGEST = true;
}
const DAILY_DIGEST_HOUR_IST = Number(process.env.DAILY_DIGEST_HOUR_IST || 9); // 9 AM IST by default
const DAILY_DIGEST_CHECK_MIN = Number(process.env.DAILY_DIGEST_CHECK_MIN || 5); // check every 5 minutes

function nowIST() {
  // Create a Date object representing current time in Asia/Kolkata
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function formatISTDate(d = nowIST()) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function ymd(d = nowIST()) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getDailySubject(d = nowIST()) {
  const dateStr = formatISTDate(d);
  const options = [
    ` Live Parking Updates + Smart Access News — ${dateStr}`,
    'VayAccess Daily: Smarter Parking, Safer Access',
    ' New Features + Live Analytics for Parking Control',
    `[Today’s Update] VayAccess Parking Solutions — ${dateStr}`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

async function buildDailySections() {
  // Compute lightweight stats from existing Mongo collections (fallback to placeholders)
  try {
    if (!mongoDb) return null;
    const subsCount = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const todayStartIST = nowIST();
    todayStartIST.setHours(0, 0, 0, 0);
    const todayEndIST = new Date(todayStartIST);
    todayEndIST.setHours(23, 59, 59, 999);

    // Convert IST bounds to UTC by reconstructing from string to avoid timezone drift
    const startUTC = new Date(new Date(todayStartIST).toISOString());
    const endUTC = new Date(new Date(todayEndIST).toISOString());

    const todaysAnnouncements = await mongoDb.collection('announcements').countDocuments({
      createdAt: { $gte: startUTC, $lte: endUTC }
    });

    const { articles } = getArticlesSnapshot();
    const top3 = articles.slice(0, 3).map(a => a.title);

    return {
      subsCount,
      todaysAnnouncements,
      top3,
    };
  } catch (_) {
    return null;
  }
}

function buildDailyDigestHtml(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  const logoUrl = `${PUBLIC_BASE_URL}/assets/vay-logo.jpg`;
  const highlight = (
    sections?.top3?.length ? sections.top3.map(t => `“${t}”`).join(' • ') :
    'New Hikvision camera integration live on 2 sites. RFID reduced wait time by 38%.'
  );
  return `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f9fafb;padding:18px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <img src="${logoUrl}" alt="VayAccess" style="height:36px;width:auto;" />
      <div style="font-weight:700;color:#111827;">Smart Parking. Secure Access. Seamless Control.</div>
    </div>
    <h2 style="margin:4px 0 10px 0;">${getDailySubject(d)}</h2>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <h3 style="margin:0 0 8px 0;"> Daily System Highlights</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">
        ${highlight || 'Today’s report: Live updates across VayAccess deployments.'}
      </p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Analytics Snapshot</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>Subscribers: ${sections?.subsCount ?? '—'}</li>
        <li>Announcements today: ${sections?.todaysAnnouncements ?? '—'}</li>
        <li>Peak entry time: 9:12 AM (sample)</li>
        <li>Average parking duration: 3h 20m (sample)</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Product Tips / Knowledge</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Did you know? VayAccess web dashboard supports live push notifications for security alerts and automated reports in one click.</p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Marketing / Offers</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: Get 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Real-Time Alerts</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Enable web push to get instant alerts for gate failures, unauthorized entries, and congestion updates.</p>
    </div>

    <p style="color:#6b7280;font-size:12px;text-align:center;margin-top:14px;">Sent on ${dateStr} • VayAccess</p>
  </div>`;
}

function buildDailyDigestText(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  return [
    getDailySubject(d),
    '',
    ' Daily System Highlights:',
    (sections?.top3 || []).map(t => `- ${t}`).join('\n') || '- New Hikvision camera integration live on 2 sites',
    '',
    ' Analytics Snapshot:',
    `- Subscribers: ${sections?.subsCount ?? '—'}`,
    `- Announcements today: ${sections?.todaysAnnouncements ?? '—'}`,
    '- Peak entry time: 9:12 AM (sample)',
    '- Average parking duration: 3h 20m (sample)',
    '',
    ' Product Tips / Knowledge:',
    '- Dashboard supports live push alerts and automated reports',
    '',
    ' Marketing / Offers:',
    '- 20% off on new camera integrations',
    '- Enterprise unlocks advanced AI analytics',
    '',
    `Sent on ${dateStr}`
  ].join('\n');
}

async function sendDailyDigest({ force = false } = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const todayKey = ymd();
  const sentCol = mongoDb.collection('daily_digest_sent');
  const exists = await sentCol.findOne({ _id: todayKey });
  if (exists && !force) return { success: true, message: 'Already sent today' };

  const sections = await buildDailySections();

  // Collect subscribers with prefs
  const subs = await mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1, prefs: 1 } }).toArray();
  const validSubs = subs.filter(s => /.+@.+\..+/.test(s.email));

  // Email broadcast per-subscriber with category templates
  let sent = 0, failed = 0;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    for (const s of validSubs) {
      const to = String(s.email).toLowerCase();
      const prefs = s.prefs || { products: true, solutions: true };
      const { products, solutions } = getArticlesSnapshot();

      // Build personalized content with category templates
      const chunks = [];
      if (prefs.products) chunks.push(buildProductsDigestHtml(products.slice(0, 8)));
      if (prefs.solutions) chunks.push(buildSolutionsDigestHtml(solutions.slice(0, 8)));
      if (prefs.marketing) chunks.push(buildMarketingDigestHtml());
      const html = chunks.join('\n');
      const subject = getDailySubject();
      const text = [
        subject,
        '',
        prefs.products ? (products.slice(0, 5).map(a => `- [Product] ${a.title}`).join('\n')) : '',
        prefs.solutions ? (solutions.slice(0, 5).map(a => `- [Solution] ${a.title}`).join('\n')) : '',
        prefs.marketing ? ('- [Marketing] Special offers available') : '',
      ].filter(Boolean).join('\n');

      try {
        await emailHelper.sendCategorizedEmail({
          category: 'daily_personalized',
          to,
          subject,
          html: withFooter(html),
          text,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `daily:${todayKey}:${to}`,
          meta: { daily: true, prefs },
        });
        sent++;
      } catch (_) { failed++; }
    }
  }

  // Push notifications
  let pushOk = 0, pushFail = 0;
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token || t, 'VayAccess Daily', 'Open for today\'s updates', '/'); pushOk++; } catch (_) { pushFail++; }
    }
  } catch (_) {}

  await sentCol.updateOne({ _id: todayKey }, { $set: { _id: todayKey, sentAt: new Date(), emails: sent, failed } }, { upsert: true });
  // Return counts based on computed values to avoid referencing undefined variables
  return { success: true, emails: { sent, failed }, push: { sent: pushOk, failed: pushFail } };
}

// Admin: manual daily digest
app.post('/api/admin/daily-digest/send', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const force = String(req.query.force || '').toLowerCase() === 'true';
    const result = await sendDailyDigest({ force });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send daily digest' });
  }
});

// Admin: preview daily digest HTML
app.get('/api/admin/daily-digest/preview', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).send('Forbidden');
    const sections = await buildDailySections();
    res.setHeader('Content-Type', 'text/html');
    res.send(buildDailyDigestHtml(sections));
  } catch (e) {
    res.status(500).send('Failed to build preview');
  }
});

// Daily scheduler (IST hour)
if (ENABLE_DAILY_DIGEST) {
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const n = nowIST();
      if (n.getHours() >= DAILY_DIGEST_HOUR_IST) {
        await sendDailyDigest();
      }
    } catch (e) {
      console.warn('Daily digest scheduler error:', e?.message || e);
    }
  }, Math.max(60_000, DAILY_DIGEST_CHECK_MIN * 60 * 1000));
}

// Start HTTP server (required for Vite proxy to work)
server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
});

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }
    
    console.log(' Processing contact form submission:', { name, email, message });
    
    // 1. Send notification to info@vayaccess.com
    const adminNotificationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: 'info@vayaccess.com',
      replyTo: email, // Allows replying directly to the customer
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <!-- Header-style summary block to mirror desired format -->
          <div style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 6px 0; font-weight: 700; color: #111827;">Thank you for contacting VayAccess - Response within 2 hours</p>
            <p style="margin: 0 0 6px 0; color: #374151;">VayAccess Support Team &lt;info@vayaccess.com&gt;</p>
            <p style="margin: 0 0 6px 0; color: #6b7280;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            <p style="margin: 0; color: #6b7280;">to ${name}</p>
          </div>

          <div style="background: white; padding: 24px;">
            <h1 style="margin: 0 0 10px 0; font-size: 22px; color: #059669;">Message Received Successfully</h1>
            <p style="margin: 6px 0 20px 0; color: #6b7280;">Thank you for contacting VayAccess</p>

            <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Dear <strong>${name}</strong>,</p>
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>

            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
              <h3 style="color: #2563eb; margin: 0 0 10px 0; font-size: 16px;">Your Message Summary</h3>
              <div style="background: white; padding: 12px; border-radius: 6px; color: #6b7280; font-style: italic;">
                "${message}"
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #059669; margin: 0 0 10px 0; font-size: 18px;">What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>

            <div style="background: #fff7ed; border: 1px solid #fb923c; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #c2410c; margin: 0 0 10px 0; font-size: 16px;">Need Immediate Assistance?</h3>
              <p style="margin: 0; color: #92400e;"><a href="tel:+917207244344" style="color: #2563eb; text-decoration: none;">+91 720 724 4344</a> • <a href="https://wa.me/917207244344" style="color: #10b981; text-decoration: none;">WhatsApp</a> • <a href="mailto:info@vayaccess.com" style="color: #6b7280; text-decoration: none;">Email</a></p>
            </div>

            <div style="margin: 20px 0; text-align: center;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Visit Our Website</a>
            </div>

            <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; color: #6b7280; font-size: 14px;">
              <p style="margin: 0 0 6px 0;"><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 12px 0 0 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 12px;">
                This is an automated confirmation. Please save this email for your records.
              </p>

              <p style="text-align:center; color:#6b7280; font-size: 13px; margin-top: 16px;">
                <strong>Customer Details:</strong> ${name} • <a href="mailto:${email}" style="color:#2563eb; text-decoration:none;">${email}</a>
              </p>
            </div>
          </div>
        </div>
      `,
      text: `Thank you for contacting VayAccess - Response within 2 hours
VayAccess Support Team <info@vayaccess.com>
${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
to ${name}

Message Received Successfully
Thank you for contacting VayAccess

Dear ${name},
Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.

Your Message Summary
"${message}"

What Happens Next?
Quick Response: Our technical specialists will respond within 2 hours during business hours
Detailed Analysis: We'll review your requirements and provide customized recommendations
Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

Need Immediate Assistance?
+91 720 724 4344  WhatsApp  Email

Visit Our Website
Business Hours: Monday - Friday: 9:00 AM - 6:00 PM IST

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Customer Details: ${name} • ${email}

This is an automated confirmation. Please save this email for your records.`
    };
    
    // 2. Send auto-confirmation to customer
    const customerConfirmationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;"> Message Received Successfully</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for contacting VayAccess</p>
          </div>
          
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">Dear <strong>${name}</strong>,</p>
            
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>
            
            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 15px 0; font-size: 16px;"> Your Message Summary</h3>
              <div style="background: white; padding: 15px; border-radius: 6px;">
                <p style="margin: 0; color: #6b7280; font-style: italic;">"${message.length > 200 ? message.substring(0, 200) + '...' : message}"</p>
              </div>
            </div>
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 25px; margin: 25px 0;">
              <h3 style="color: #059669; margin: 0 0 15px 0; font-size: 18px;"> What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="color: #d97706; margin: 0 0 10px 0; font-size: 16px;"> Need Immediate Assistance?</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <a href="tel:+917207244344" style="background: #2563eb; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> +91 720 724 4344</a>
                <a href="https://wa.me/917207244344" style="background: #10b981; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> WhatsApp</a>
                <a href="mailto:info@vayaccess.com" style="background: #6b7280; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> Email</a>
              </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                 Visit Our Website
              </a>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
              <p><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 15px 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
                This is an automated confirmation. Please save this email for your records.
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
Dear ${name},

Thank you for contacting VayAccess regarding your parking solution requirements.

YOUR MESSAGE:
"${message}"

WHAT HAPPENS NEXT:
• Quick Response: Our technical specialists will respond within 2 hours during business hours
• Detailed Analysis: We'll review your requirements and provide customized recommendations  
• Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

NEED IMMEDIATE ASSISTANCE?
Phone: +91 70137 99462
WhatsApp: +91 70137 99462
Email: info@vayaccess.com

BUSINESS HOURS:
Monday - Friday: 9:00 AM - 6:00 PM IST

Best regards,
VayAccess Support Team

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Website: https://vayaccess.com
      `
    };
    
    // Send both emails
    console.log(' Sending admin notification...');
    await transporter.sendMail(adminNotificationEmail);
    console.log(' Admin notification sent successfully');
    
    console.log(' Sending customer confirmation...');
    await transporter.sendMail(customerConfirmationEmail);
    console.log(' Customer confirmation sent successfully');
    
    res.json({
      success: true,
      message: 'Thank you for your inquiry! We have received your message and sent a confirmation to your email. Our team will respond within 2 hours during business hours.'
    });
    
  } catch (error) {
    console.error(' Contact form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    });
  }
});

// =============================================================================
// AI CALL AGENT API ENDPOINTS
// =============================================================================

// Initialize AI call session
app.post('/api/ai-call/initialize', async (req, res) => {
  try {
    const { customerPhone, customerName } = req.body;
    
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Customer phone number is required'
      });
    }
    
    console.log(` Initializing AI call for ${customerPhone}`);
    const result = await voiceAIService.initializeCall(customerPhone, customerName);
    
    if (result.success) {
      // Notify admin dashboard of new call
      io.emit('new-call-initialized', {
        sessionId: result.sessionId,
        customerPhone,
        customerName,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error initializing AI call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize AI call session'
    });
  }
});

// Process voice input and get AI response
app.post('/api/ai-call/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Message and session ID are required'
      });
    }
    
    console.log(` Processing chat for session ${sessionId}: "${message}"`);
    const result = await voiceAIService.generateAIResponse(message, sessionId);
    
    // Broadcast conversation update to admin dashboard
    io.emit('call-conversation-update', {
      sessionId,
      customerMessage: message,
      aiResponse: result.response,
      timestamp: new Date()
    });
    
    res.json(result);
  } catch (error) {
    console.error(' Error processing AI chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process conversation'
    });
  }
});

// Convert speech to text
app.post('/api/ai-call/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!req.file || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Audio file and session ID are required'
      });
    }
    
    console.log(` Processing speech-to-text for session ${sessionId}`);
    const audioBuffer = require('fs').readFileSync(req.file.path);
    const result = await voiceAIService.speechToText(audioBuffer, sessionId);
    
    // Clean up uploaded file
    require('fs').unlinkSync(req.file.path);
    
    res.json(result);
  } catch (error) {
    console.error(' Error in speech-to-text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process speech'
    });
  }
});

// Convert text to speech
app.post('/api/ai-call/text-to-speech', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Text and session ID are required'
      });
    }
    
    console.log(` Converting text to speech for session ${sessionId}`);
    const result = await voiceAIService.textToSpeech(text, sessionId);
    
    if (result.success) {
      // Send audio file path for client to download
      res.json({
        ...result,
        audioUrl: `/api/ai-call/audio/${result.audioFile}`
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error(' Error in text-to-speech:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate speech'
    });
  }
});

// Serve generated audio files
app.get('/api/ai-call/audio/:filename', (req, res) => {
  try {
    const audioPath = require('path').join(__dirname, 'recordings/tts/', req.params.filename);
    res.sendFile(audioPath);
  } catch (error) {
    console.error(' Error serving audio file:', error);
    res.status(404).json({ success: false, message: 'Audio file not found' });
  }
});

// =============================================================================
// TWILIO VOICE CALL WEBHOOKS (For Real Phone Calls)
// =============================================================================

// Initial TwiML when call is answered
app.post('/api/ai-call/twiml/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(` Call answered for session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Welcome message
    const welcomeMessage = `Hello! This is the AI assistant from VayAccess Parking Solutions. Thank you for your interest in our smart parking systems. How can I help you with your parking solution needs today?`;
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, welcomeMessage);
    
    // Gather customer's voice input
    const gather = twiml.gather({
      speechTimeout: 3,
      speechModel: 'experimental_conversations',
      enhanced: true,
      input: 'speech',
      action: `/api/ai-call/voice-response/${sessionId}`,
      method: 'POST'
    });
    
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please tell me about your parking requirements.');
    
    // If no input, try again
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I did not hear anything. Please speak clearly about your parking needs.');
    
    twiml.redirect(`/api/ai-call/twiml/${sessionId}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error generating TwiML:', error);
    res.status(500).send('Error processing call');
  }
});

// Handle customer voice input and AI response
app.post('/api/ai-call/voice-response/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const customerSpeech = req.body.SpeechResult || '';
    const callSid = req.body.CallSid;
    
    console.log(` Customer said: "${customerSpeech}" in session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    if (!customerSpeech) {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I could not understand what you said. Let me connect you with our human specialist.');
      
      twiml.say({
        voice: 'alice', 
        language: 'en-US'
      }, 'Please call us directly at +91 720 724 4344 for immediate assistance. Thank you!');
      
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }
    
    // Generate AI response using the voice service
    const aiResponse = await voiceAIService.generateAIResponse(customerSpeech, sessionId);
    
    if (aiResponse.success) {
      // Broadcast conversation update to frontend
      io.emit('call-conversation-update', {
        sessionId,
        customerMessage: customerSpeech,
        aiResponse: aiResponse.response,
        timestamp: new Date()
      });
      
      // Say AI response
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, aiResponse.response);
      
      // Continue conversation - check if call should end
      if (aiResponse.response.toLowerCase().includes('goodbye') || 
          aiResponse.response.toLowerCase().includes('thank you for calling') ||
          aiResponse.response.toLowerCase().includes('have a great day')) {
        twiml.hangup();
      } else {
        // Continue gathering input
        const gather = twiml.gather({
          speechTimeout: 4,
          speechModel: 'experimental_conversations',
          enhanced: true,
          input: 'speech',
          action: `/api/ai-call/voice-response/${sessionId}`,
          method: 'POST'
        });
        
        gather.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Is there anything else I can help you with regarding parking solutions?');
        
        // Timeout fallback
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Thank you for calling VayAccess. Have a great day!');
        twiml.hangup();
      }
    } else {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I apologize, but I am having technical difficulties. Please call our office at +91 720 724 4344 for immediate assistance. Thank you!');
      twiml.hangup();
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error processing voice response:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am experiencing technical difficulties. Please call +91 720 724 4344 for support. Goodbye!');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle call status updates from Twilio
app.post('/api/ai-call/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const callStatus = req.body.CallStatus;
    const callSid = req.body.CallSid;
    
    console.log(` Call status update for session ${sessionId}: ${callStatus}`);
    
    // Broadcast status update to frontend
    io.emit('call-status-changed', {
      sessionId,
      callSid,
      status: callStatus,
      timestamp: new Date()
    });
    
    // Handle call completion
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      console.log(` Call ${callSid} ended with status: ${callStatus}`);
      
      // Save call recording and summary
      try {
        await voiceAIService.saveCallRecording(sessionId, callStatus);
      } catch (error) {
        console.error(' Error saving call recording:', error);
      }
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error(' Error handling call status:', error);
    res.status(500).send('Error processing status update');
  }
});

// End call session
app.post('/api/ai-call/end', async (req, res) => {
  try {
    const { sessionId, callDuration } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    console.log(` Ending call session ${sessionId}`);
    const result = await voiceAIService.endCall(sessionId, callDuration);
    
    if (result.success) {
      // Notify admin dashboard of call completion
      io.emit('call-ended', {
        sessionId,
        callData: result.callData,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error ending call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end call session'
    });
  }
});

// Get current call status
app.get('/api/ai-call/status', async (req, res) => {
  try {
    const status = voiceAIService.getCurrentCallStatus();
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error(' Error getting call status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call status'
    });
  }
});

// =============================================================================
// ADMIN DASHBOARD API ENDPOINTS
// =============================================================================

// Get all call recordings (Admin only)
app.get('/api/admin/call-recordings', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    console.log(' Admin fetching call recordings');
    const result = await voiceAIService.getCallRecordings();
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recordings'
    });
  }
});

// Get specific call recording (Admin only)
app.get('/api/admin/call-recording/:sessionId', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const { sessionId } = req.params;
    console.log(` Admin fetching call recording for session ${sessionId}`);
    
    const result = await voiceAIService.getCallRecording(sessionId);
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recording'
    });
  }
});

// Admin dashboard statistics
app.get('/api/admin/call-statistics', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    const stats = {
      totalCalls: recordings.recordings.length,
      todayCalls: recordings.recordings.filter(call => {
        const today = new Date().toDateString();
        return new Date(call.startTime).toDateString() === today;
      }).length,
      averageDuration: recordings.recordings.reduce((acc, call) => acc + (call.duration || 0), 0) / recordings.recordings.length || 0,
      callsThisWeek: recordings.recordings.filter(call => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(call.startTime) >= weekAgo;
      }).length
    };

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error(' Error generating call statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate statistics'
    });
  }
});

// Send AI call recordings to parking system admin dashboard
app.post('/api/admin/sync-call-recordings', async (req, res) => {
  try {
    console.log(' Syncing AI call recordings with parking system admin dashboard...');
    
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    // Send recordings to parking system admin dashboard
    const parkingSystemUrl = 'http://localhost:8080';
    
    try {
      const axios = require('axios');
      
      const syncResponse = await axios.post(`${parkingSystemUrl}/api/admin/ai-call-recordings`, {
        recordings: recordings.recordings,
        source: 'vayaccess-ai-agent',
        syncTime: new Date().toISOString()
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(' Successfully synced AI call recordings to parking system');
      
      res.json({
        success: true,
        message: 'AI call recordings synced successfully',
        recordingsSynced: recordings.recordings.length,
        parkingSystemResponse: syncResponse.data
      });

    } catch (syncError) {
      console.log(' Parking system not available for sync, continuing with local storage');
      
      res.json({
        success: true,
        message: 'Recordings available locally, parking system sync will retry automatically',
        recordingsSynced: recordings.recordings.length,
        localRecordings: recordings.recordings
      });
    }

  } catch (error) {
    console.error(' Error syncing call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync call recordings'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test email endpoint (for development)
app.post('/api/test-email', async (req, res) => {
  try {
    const testEmail = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: 'VayAccess Email Service Test',
      html: '<h1>Email service is working!</h1><p>This is a test email from your VayAccess backend.</p>'
    };
    
    await transporter.sendMail(testEmail);
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Newsletter subscription endpoint (MongoDB-first, email optional)
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email, source = 'website' } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    // Persist to MongoDB if available; otherwise, skip persistence gracefully
    try {
      if (mongoDb) {
        const normalized = String(email).trim().toLowerCase();
        const now = new Date();
        const col = mongoDb.collection('subscribers');
        const existing = await col.findOne({ email: normalized });
        if (existing && existing.active !== false) {
          return res.json({ success: true, message: 'You are already subscribed. You will receive live news daily from VayAccess.' });
        }

        await col.updateOne(
          { email: normalized },
          {
            $setOnInsert: { createdAt: now, prefs: { products: true, solutions: true, marketing: true } },
            $set: { email: normalized, source, active: true, updatedAt: now },
          },
          { upsert: true }
        );
        // Ensure default prefs exist on existing records
        await col.updateOne(
          { email: normalized, $or: [ { prefs: { $exists: false } }, { prefs: null } ] },
          { $set: { 'prefs.products': true, 'prefs.solutions': true, 'prefs.marketing': true } }
        );
      } else {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
      }
    } catch (persistErr) {
      console.warn('Failed to persist subscriber to MongoDB (continuing):', persistErr?.message || persistErr);
    }

    // Optional welcome email; do not fail if SMTP is missing
    try {
      await emailHelper.sendCategorizedEmail({
        category: 'newsletter_welcome',
        to: String(email).trim().toLowerCase(),
        subject: 'Welcome to VayAccess Newsletter',
        html: withFooter(`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                 <h2 style="margin:0 0 12px 0;">Welcome to VayAccess Newsletter</h2>
                 <p style="color:#374151;line-height:1.6;">You will receive product news, articles, and live updates.</p>
                 <p style="margin-top:16px;"><a href="https://vayaccess.com" style="color:#2563eb;text-decoration:none;">Visit website</a></p>
               </div>`),
        text: 'Welcome to VayAccess Newsletter\nYou will receive product news, articles, and live updates.',
        meta: { source },
        headers: buildUnsubscribeHeaders(email),
        dedupeKey: `welcome:${String(email).trim().toLowerCase()}`
      });
    } catch (emailErr) {
      console.warn('Welcome email failed (continuing):', emailErr?.message || emailErr);
    }

    // Conditionally send present products/solutions digest immediately
    try {
      if (process.env.SEND_DIGEST_ON_SUBSCRIBE === 'true') {
        const snapshot = getContentSnapshot();
        await sendDigestToEmail(String(email).trim().toLowerCase(), snapshot);
      }
    } catch (e) {
      console.warn('Failed to send initial digest (continuing):', e?.message || e);
    }

    // Optional: send a marketing promo immediately on subscribe
    try {
      if ((process.env.SEND_MARKETING_ON_SUBSCRIBE || 'true').toLowerCase() !== 'false') {
        await emailHelper.sendCategorizedEmail({
          category: 'marketing',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Transform Your Parking with Smart Access',
          html: withFooter(`<div style='font-family:Arial,sans-serif;max-width:700px;margin:0 auto;'>
  <h2 style='margin:0 0 10px 0;color:#111827;'>Welcome to VayAccess</h2>
  <p style='color:#374151;line-height:1.6;margin:0 0 10px 0;'>Explore ANPR vehicle access, robust barrier gates, turnstiles, and real-time management.</p>
  <p style='margin-top:12px;'>
    <a href='https://vayaccess.com/products' style='background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;'>Explore Products</a>
    <span style='margin-left:12px;'><a href='https://vayaccess.com/solutions' style='color:#2563eb;text-decoration:none;'>View Solutions</a></span>
  </p>
</div>`),
          text: 'Explore VayAccess products and solutions: https://vayaccess.com',
          headers: buildUnsubscribeHeaders(email),
          dedupeKey: `marketing-on-subscribe:${String(email).trim().toLowerCase()}`,
          meta: { source, onSubscribe: true },
        });
      }
    } catch (marketingErr) {
      console.warn('Marketing email on subscribe failed (continuing):', marketingErr?.message || marketingErr);
    }

    return res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    console.error('Subscribe failed:', error);
    return res.status(500).json({ success: false, message: 'Subscription failed' });
  }
});

// Simple secured endpoint to send an update email to a recipient
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: to, subject, and html or text' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent.' });
  } catch (error) {
    console.error('Send update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// Broadcast to all subscribers (MongoDB)
app.post('/api/newsletter/broadcast', async (req, res) => {
  try {
    // security
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) {
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    const { subject, html, text, dryRun = false, onlyActive = true, category = 'marketing' } = req.body || {};
    if (!subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: subject and html or text' });
    }

    // fetch subscribers from MongoDB
    const filter = onlyActive ? { active: { $ne: false } } : {};
    const subsCursor = mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray())
      .map(d => d.email)
      .filter(e => /.+@.+\..+/.test(e));

    if (emails.length === 0) {
      return res.json({ success: true, message: 'No subscribers to send', count: 0, emails: [] });
    }

    if (dryRun) {
      return res.json({ success: true, message: 'Dry run: would send to these emails', count: emails.length, emails });
    }

    // send in sequence (simple). For large lists, batch/queue.
    let ok = 0, fail = 0;
    for (const to of emails) {
      try {
        await emailHelper.sendCategorizedEmail({
          category,
          to,
          subject,
          html: withFooter(html || ''),
          text: text || undefined,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `broadcast:${category}:${subject}:${String(to).toLowerCase()}`,
          meta: { broadcast: true },
        });
        ok++;
      } catch (e) {
        fail++;
      }
    }

    return res.json({ success: true, message: 'Broadcast completed', category, sent: ok, failed: fail, count: emails.length });
  } catch (error) {
    console.error('Broadcast failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to broadcast' });
  }
});

// Push token registration (MongoDB) — dev-safe fallback
app.post('/api/push/register', async (req, res) => {
  try {
    const { token, email } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'Missing token' });

    // If MongoDB is unavailable and dev fallback enabled, no-op to avoid UX break
    if (!mongoDb) {
      if (process.env.ALLOW_DEV_NO_DB === 'true') {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
        return res.json({ success: true, message: 'Token accepted (no DB in dev)' });
      }
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    await mongoDb.collection('pushTokens').updateOne(
      { token },
      {
        $set: {
          token,
          email: email || null,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Token registered' });
  } catch (e) {
    console.error('Register push token failed:', e);
    return res.status(500).json({ success: false, message: 'Failed to register token' });
  }
});

// --- Helpers for FCM HTTP v1 (web push) ---
const { google } = require('googleapis');
const fetch = require('node-fetch');
let FB_PROJECT_ID = process.env.FB_PROJECT_ID;
try {
  if (!FB_PROJECT_ID) {
    const svc = require('./service-account.json');
    FB_PROJECT_ID = svc.project_id;
  }
} catch (_) {}

async function getFcmAccessToken() {
  const key = require('./service-account.json');
  const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

async function sendFcmMessage(token, title, body, link) {
  if (!FB_PROJECT_ID) throw new Error('Missing FB_PROJECT_ID or service-account project_id');
  const accessToken = await getFcmAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${FB_PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token,
      notification: { title, body },
      webpush: {
        fcm_options: { link: link || '/' },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM error: ${txt}`);
  }
  return res.json();
}

// Publish update: save to MongoDB and auto-send email + push
app.post('/api/updates/publish', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { title, body, link = '/', previewOnly = false } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });

    // Save announcement to MongoDB
    const insertRes = await mongoDb.collection('announcements').insertOne({
      title,
      body,
      link,
      createdAt: new Date(),
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    if (previewOnly) {
      return res.json({ success: true, message: 'Preview only', id: insertRes.insertedId, emailsCount: emails.length, tokensCount: tokens.length });
    }

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    return res.json({ success: true, id: insertRes.insertedId, emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Publish update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to publish update' });
  }
});

// Auto-publish endpoint: idempotent broadcast by version (no separate admin UI needed)
app.post('/api/updates/auto-publish', async (req, res) => {
    console.log('Received auto-publish request:', req.body); // Log the request body
  try {
    // Optional security with token
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { version, title, body, link = '/' } = req.body || {};
    if (!version || !title || !body) return res.status(400).json({ success: false, message: 'Missing version, title or body' });

    const versionId = String(version).trim();

    // Skip if already sent for this version
    const already = await mongoDb.collection('announcements_sent').findOne({ version: versionId });
    if (already) {
      return res.json({ success: true, message: 'Already sent for this version' });
    }

    // Save announcement entry (optional)
    const annInsert = await mongoDb.collection('announcements').insertOne({
      version: versionId,
      title,
      body,
      link,
      createdAt: new Date(),
      auto: true,
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    // Mark version as sent
    await mongoDb.collection('announcements_sent').updateOne(
      { version: versionId },
      {
        $set: {
          version: versionId,
          title,
          body,
          link,
          sentAt: new Date(),
          announcementId: annInsert.insertedId,
        }
      },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Auto-publish sent', emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Auto-publish failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to auto-publish' });
  }
});





// Admin: send a single update email (manual)
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing to/subject/body' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    console.error('Manual send failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});


// --- Hourly Digest Scheduler ---
const ENABLE_HOURLY_DIGEST = (process.env.ENABLE_HOURLY_DIGEST || 'false').toLowerCase() === 'true';
const DIGEST_CATEGORY = process.env.DIGEST_CATEGORY || 'content_digest';
const DIGEST_EMAIL = (process.env.DIGEST_EMAIL || 'true').toLowerCase() === 'true';
const DIGEST_PUSH = (process.env.DIGEST_PUSH || 'true').toLowerCase() === 'true';
const DIGEST_DEDUPE_WINDOW_MIN = parseInt(process.env.DIGEST_DEDUPE_WINDOW_MINUTES || '60', 10);

async function sendHourlyDigestOnce() {
  try {
    if (!mongoDb) {
      console.warn('[digest] Skipped: MongoDB not initialized');
      return;
    }

    // Snapshot current site content
    const snapshot = getContentSnapshot();
    // Rotate templates by hour to guarantee variation across sends
    const tpl = pickRotatingTemplate();

    // Dedupe: prevent re-sending same template within the window (optional)
    const now = new Date();
    const since = new Date(now.getTime() - DIGEST_DEDUPE_WINDOW_MIN * 60 * 1000);
    const recentKey = `digest:${tpl.key}:${snapshot.hash}`;
    const alreadySent = await mongoDb.collection('email_events').findOne({
      dedupeKey: { $regex: `^${recentKey}:` }, // per recipient entry saved below
      createdAt: { $gte: since },
      result: 'sent',
    });
    if (alreadySent) {
      console.log('[digest] Recently sent this template+hash. Skipping to avoid repetition.');
      return;
    }

    // Fetch subscribers
    const subs = await mongoDb.collection('subscribers')
      .find({ active: { $ne: false } }, { projection: { email: 1 } })
      .toArray();
    const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

    // Fetch push tokens
    const tokens = DIGEST_PUSH
      ? (await mongoDb.collection('pushTokens')
          .find({ active: { $ne: false } }, { projection: { token: 1 } })
          .toArray()).map(d => d.token)
      : [];

    // Send email
    if (DIGEST_EMAIL && emails.length) {
      let sent = 0, fail = 0;
      for (const to of emails) {
        try {
          await emailHelper.sendCategorizedEmail({
            category: DIGEST_CATEGORY,
            to,
            subject: tpl.subject(snapshot),
            html: tpl.buildHtml(snapshot),
            text: tpl.buildText(snapshot),
            headers: buildUnsubscribeHeaders(to),
           require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const voiceAIService = require('./services/voiceAIService');
const asteriskService = require('./services/asteriskService');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// MongoDB Atlas (replaces Firestore for subscribers/tokens)
const { MongoClient } = require('mongodb');
let mongoClient = null;
let mongoDb = null;
(async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'vay_parking_system';
  if (!uri) {
    console.warn('MongoDB not initialized: missing MONGODB_URI. Newsletter persistence will be disabled.');
    return;
  }

  // Attempt robust connection strategy for Windows/OpenSSL TLS issues
  let mongoReconnectTimer = null;

  function setupMongoAutoReconnect() {
    if (!mongoClient) return;
    const events = ['topologyClosed', 'serverClosed', 'serverHeartbeatFailed'];
    events.forEach((ev) => {
      try { mongoClient.removeAllListeners(ev); } catch {}
      mongoClient.on(ev, (info) => {
        if (mongoReconnectTimer) return;
        const msg = info && info.message ? info.message : '';
        console.warn(`MongoDB ${ev} - scheduling reconnect in 5s`, msg);
        mongoReconnectTimer = setTimeout(async () => {
          mongoReconnectTimer = null;
          let connected = await tryConnect('reconnect', { ...baseOptions });
          if (!connected) connected = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
          if (!connected) {
            connected = await tryConnect('reconnect + insecure', {
              ...baseOptions,
              tlsAllowInvalidCertificates: true,
              tlsAllowInvalidHostnames: true,
              family: 4,
            });
          }
          if (!connected) {
            console.warn('MongoDB reconnection failed; retrying in 10s');
            mongoReconnectTimer = setTimeout(async () => {
              mongoReconnectTimer = null;
              let ok = await tryConnect('reconnect', { ...baseOptions });
              if (!ok) ok = await tryConnect('reconnect + IPv4', { ...baseOptions, family: 4 });
              if (!ok) {
                await tryConnect('reconnect + insecure', {
                  ...baseOptions,
                  tlsAllowInvalidCertificates: true,
                  tlsAllowInvalidHostnames: true,
                  family: 4,
                });
              }
            }, 10000);
          }
        }, 5000);
      });
    });
  }

  async function tryConnect(optionsLabel, options) {
    try {
      // Close previous client to avoid socket leaks
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
      mongoClient = new MongoClient(uri, options);
      await mongoClient.connect();
      mongoDb = mongoClient.db(dbName);
      console.log(`Connected to MongoDB Atlas database: ${dbName} (${optionsLabel})`);
      setupMongoAutoReconnect();
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn(`MongoDB connect failed [${optionsLabel}]:`, msg);
      return false;
    }
  }

  const baseOptions = {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
    tls: true,
    // Note: keepAlive options are not supported by the MongoDB Node.js driver v5.
    // We rely on the driver's internal keep-alive and our event-based reconnection.
  };

  const insecureEnv = process.env.MONGODB_TLS_INSECURE === 'true';

  // 1) If insecure explicitly requested via env, use it directly
  if (insecureEnv) {
    const ok = await tryConnect('tls+insecure (env)', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
    if (!ok) {
      console.warn('MongoDB initialization failed under insecure mode. Newsletter persistence will be disabled.');
    } else {
      // Ensure indexes for deduplication and idempotency
      try {
        await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
        await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
        await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
        console.log('MongoDB indexes ensured');
      } catch (idxErr) {
        console.warn('MongoDB index ensure failed:', idxErr.message);
      }
    }
    return;
  }

  // 2) Try strict TLS first
  let connected = await tryConnect('tls strict', { ...baseOptions });

  // 3) If fails, try strict TLS forcing IPv4 (DNS/IPv6 issues)
  if (!connected) {
    connected = await tryConnect('tls strict + IPv4', { ...baseOptions, family: 4 });
  }

  // 4) If still fails with SSL-related error, try insecure TLS as fallback
  if (!connected) {
    connected = await tryConnect('tls+insecure fallback', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
  }

  if (!connected) {
    console.warn('MongoDB initialization failed after all attempts. Newsletter persistence will be disabled.');
    return;
  }

  // Ensure indexes for deduplication and idempotency
  try {
    await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
    await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
    console.log('MongoDB indexes ensured');
  } catch (idxErr) {
    console.warn('MongoDB index ensure failed:', idxErr.message);
  }
})();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

// Initialize Socket.IO for real-time call communication
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
    credentials: true
  }
});

// Configure multer for audio file uploads
const upload = multer({
  dest: 'temp/', // temporary directory for uploaded audio files
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
  credentials: true
}));
app.use(express.json());

// Serve assets with stable URLs for emails and previews
app.use('/assets', express.static(path.resolve(__dirname, '../src/assets')));

// Serve admin interface (protected by admin token in the HTML)
app.get('/admin/newsletter', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin-newsletter.html'));
});

// Demo routes (FREE - no Twilio needed)
const demoRoutes = require('./routes/demo');
app.use('/api', demoRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', mongo: !!mongoDb });
});

// One-click unsubscribe (for List-Unsubscribe-Post)
app.post('/api/newsletter/unsubscribe', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const email = (req.body?.email || req.query?.e || '').toString().toLowerCase();
    const token = (req.body?.token || req.query?.t || '').toString();
    if (!email || token !== signUnsubToken(email)) return res.status(400).send('Invalid request');
    if (mongoDb) {
      await mongoDb.collection('subscribers').updateOne({ email }, { $set: { active: false, updatedAt: new Date() } });
    }
    // RFC-compliant one-click: respond 200 with empty body
    return res.status(200).send('');
  } catch (e) {
    return res.status(500).send('');
  }
});

// Subscribe endpoint (name, email, frequency)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { name, email, frequency } = req.body || {};
    const n = String(name || '').trim();
    const em = String(email || '').trim().toLowerCase();
    const f = String(frequency || 'weekly').toLowerCase();
    if (!/.+@.+\..+/.test(em)) return res.status(400).json({ success:false, message:'Invalid email' });
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });

    const now = new Date();
    await mongoDb.collection('subscribers').updateOne(
      { email: em },
      { $setOnInsert: { createdAt: now, subscribedAt: now }, $set: { name: n, frequency: freq, active: true, updatedAt: now } },
      { upsert: true }
    );

    // Send welcome email
    const headers = buildUnsubscribeHeaders(em);
    const firstName = n ? n.split(' ')[0] : 'there';
    const html = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p>Hi ${firstName},</p>
        <p>Thanks for subscribing to VayAccess updates (${freq}). You'll receive ${freq} digests with our latest articles.</p>
      </div>
    `);
    await emailHelper.sendCategorizedEmail({
      category: 'newsletter_welcome',
      to: em,
      subject: 'Welcome to VayAccess Updates',
      html,
      headers
    });

    return res.json({ success:true, message:'Subscribed' });
  } catch (e) {
    const msg = e?.code === 11000 ? 'Already subscribed' : (e?.message || 'Server error');
    return res.status(500).json({ success:false, message: msg });
  }
});

// Preferences update endpoint
app.post('/api/newsletter/update-preferences', async (req, res) => {
  try {
    const { email, token, frequency } = req.body || {};
    const em = String(email || '').toLowerCase();
    if (!em || token !== signUnsubToken(em)) return res.status(400).json({ success:false, message:'Invalid token' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const f = String(frequency || '').toLowerCase();
    const freq = ['hourly','daily','weekly'].includes(f) ? f : 'weekly';
    await mongoDb.collection('subscribers').updateOne({ email: em }, { $set: { frequency: freq, updatedAt: new Date() } });
    return res.json({ success:true });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Manual trigger for individual email distribution (for testing)
app.post('/api/newsletter/distribute-individual', async (req, res) => {
  try {
    const result = await distributeIndividualEmails();
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Server error' });
  }
});

// Articles: create & list
app.post('/api/articles', async (req, res) => {
  try {
    const { title, summary, content, tags } = req.body || {};
    if (!title || !summary) return res.status(400).json({ success:false, message:'Missing title/summary' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const doc = { title: String(title), summary: String(summary), content: String(content||''), tags: Array.isArray(tags)? tags.map(String):[], createdAt: new Date() };
    const result = await mongoDb.collection('articles').insertOne(doc);
    return res.json({ success:true, id: result.insertedId, article: doc });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

app.get('/api/articles', async (req, res) => {
  try {
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const { tag, limit } = req.query;
    const q = tag ? { tags: String(tag) } : {};
    const lim = Math.min(Number(limit)||20, 100);
    const items = await mongoDb.collection('articles').find(q).sort({ createdAt:-1 }).limit(lim).toArray();
    return res.json({ success:true, items });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
  }
});

// Connect to Asterisk AMI on server start (optional via ENABLE_AMI)
if (process.env.ENABLE_AMI === 'true') {
  asteriskService.connect().catch(err => {
    console.error(' Failed to connect to Asterisk AMI:', err);
  });
} else {
  console.log(' Skipping AMI connection (ENABLE_AMI not set to true)');
}

// API endpoint to initiate call via Asterisk AMI
app.post('/api/call', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    if (!asteriskService.isAlive()) {
      await asteriskService.connect();
    }

    const result = await asteriskService.originateCall(number);

    if (result.success) {
      // Emit call status to frontend clients
      io.emit('call-status-changed', {
        sessionId: result.sessionId,
        phoneNumber: number,
        status: 'initiated',
        timestamp: new Date()
      });
    }

    res.json(result);
  } catch (error) {
    console.error(' Error originating call:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

// Listen for call-originated event from asteriskService and broadcast
asteriskService.on('call-originated', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'ringing',
    timestamp: new Date()
  });
});

// Socket.IO connection handling for real-time call features
io.on('connection', (socket) => {
  console.log(` Client connected: ${socket.id}`);

  socket.on('join-call-room', (sessionId) => {
    socket.join(`call-${sessionId}`);
    console.log(` Client joined call room: call-${sessionId}`);
  });

  socket.on('call-status-update', (data) => {
    io.to(`call-${data.sessionId}`).emit('call-status-changed', data);
  });

  socket.on('disconnect', () => {
    console.log(` Client disconnected: ${socket.id}`);
  });
});

// Email configuration using SMTP (Gmail/Outlook/Custom SMTP)
let transporter;
let smtpReady = false;
let smtpError = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false otherwise
    auth: {
      user: process.env.SMTP_USER, // info@vayaccess.com
      pass: process.env.SMTP_PASS  // App-specific password
    }
  });

  // Verify email configuration
  transporter.verify((error) => {
    if (error) {
      smtpReady = false;
      smtpError = String(error?.message || error);
      console.error(' Email configuration error:', error);
    } else {
      smtpReady = true;
      smtpError = null;
      console.log(' Email server is ready to send messages');
    }
  });
} else {
  // Fallback to JSON transport: no actual SMTP connection; prevents runtime EAUTH errors
  transporter = nodemailer.createTransport({ jsonTransport: true });
  smtpReady = false;
  smtpError = 'SMTP_USER/SMTP_PASS missing (jsonTransport)';
  console.log(' Email disabled: missing SMTP_USER/SMTP_PASS (using jsonTransport)');
}

// SMTP status endpoint
app.get('/api/admin/smtp-status', (req, res) => {
  res.json({ ready: smtpReady, error: smtpError, user: process.env.SMTP_USER || null, host: process.env.SMTP_HOST || 'smtp.gmail.com' });
});

// Email helper (categorized sending with flags + tracking)
const createEmailHelper = require('./emailHelper');
const emailHelper = createEmailHelper(transporter, () => mongoDb);

// --- Site content digest and auto-news ---
const CONTENT_FILES = [
  path.resolve(__dirname, '../src/components/Products.tsx'),
  path.resolve(__dirname, '../src/components/Solutions.tsx'),
];

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function parseProductNames(content) {
  // Extract product names from Products.tsx: name: "..."
  const names = new Set();
  const nameRegex = /name:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = nameRegex.exec(content))) {
    const name = m[1].trim();
    if (name && !/quote$/i.test(name)) names.add(name);
  }
  return Array.from(names);
}

function parseSolutionTitles(content) {
  // Extract titles from Solutions.tsx: title: "..."
  const titles = new Set();
  const titleRegex = /title:\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = titleRegex.exec(content))) {
    const title = m[1].trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

function getContentSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductNames(productsTsx).slice(0, 20);
  const solutions = parseSolutionTitles(solutionsTsx).slice(0, 30);
  const combined = `${products.join('\n')}\n---\n${solutions.join('\n')}`;
  const hash = sha256(combined);
  return { hash, products, solutions };
}

function buildDigestHtml(snapshot) {
  const { products, solutions } = snapshot;
  
  // Get detailed product and solution information
  const articlesSnapshot = getArticlesSnapshot();
  const detailedProducts = articlesSnapshot.products.slice(0, 3); // Show top 3 products
  const detailedSolutions = articlesSnapshot.solutions.slice(0, 3); // Show top 3 solutions
  
  // Build product cards with images
  const productCards = detailedProducts.map(product => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      ${product.image ? `<img src="${product.image}" alt="${product.title}" style="width:100%;max-width:300px;height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${product.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${product.description || ''}</p>
    </div>
  `).join('');
  
  // Build solution cards
  const solutionCards = detailedSolutions.map(solution => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:600;">${solution.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;font-size:14px;">${solution.description || ''}</p>
    </div>
  `).join('');
  
  // Add parking services section
  const parkingServices = `
    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:20px 0;">
      <h3 style="margin:0 0 12px 0;color:#111827;font-size:18px;font-weight:600;"> Our Parking Services</h3>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
        <li><strong>Smart Parking Management:</strong> Complete ticketless and ticket-based parking solutions</li>
        <li><strong>ANPR Technology:</strong> Automatic number plate recognition for seamless access</li>
        <li><strong>Access Control Systems:</strong> Advanced barrier gates and turnstiles</li>
        <li><strong>Parking Guidance:</strong> Real-time space availability and navigation</li>
        <li><strong>Mobile Integration:</strong> User-friendly mobile apps for parking management</li>
        <li><strong>Analytics & Reporting:</strong> Comprehensive parking analytics and insights</li>
      </ul>
    </div>
  `;
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:20px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="margin:0 0 8px 0;color:#111827;font-size:24px;font-weight:700;"> VayAccess Latest Updates</h2>
        <p style="color:#6b7280;line-height:1.6;margin:0;">Discover our cutting-edge parking solutions and smart access control systems</p>
      </div>
      
      ${productCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Featured Products</h3>
          ${productCards}
        </div>
      ` : ''}
      
      ${solutionCards ? `
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:20px;font-weight:600;border-bottom:2px solid #2563eb;padding-bottom:8px;"> Smart Solutions</h3>
          ${solutionCards}
        </div>
      ` : ''}
      
      ${parkingServices}
      
      <div style="text-align:center;margin-top:24px;padding:20px;background:#2563eb;border-radius:12px;">
        <h3 style="margin:0 0 12px 0;color:#ffffff;font-size:18px;">Ready to Transform Your Parking?</h3>
        <p style="margin:0 0 16px 0;color:#dbeafe;">Contact us today for a free consultation and demo</p>
        <a href="https://vayaccess.com/contact" style="display:inline-block;background:#ffffff;color:#2563eb;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Get Started Now</a>
      </div>
      
      <div style="text-align:center;margin-top:20px;">
        <p style="margin:0;color:#6b7280;font-size:14px;">
          <a href="https://vayaccess.com/products" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Products</a> • 
          <a href="https://vayaccess.com/solutions" style="color:#2563eb;text-decoration:none;margin:0 8px;">View All Solutions</a> • 
          <a href="https://vayaccess.com/services" style="color:#2563eb;text-decoration:none;margin:0 8px;">Our Services</a>
        </p>
      </div>
    </div>
  `;
}

function buildDigestText(snapshot) {
  const { products, solutions } = snapshot;
  return [
    'VayAccess Latest Updates',
    '',
    'Products:',
    ...products.map(p => `- ${p}`),
    '',
    'Solutions:',
    ...solutions.map(s => `- ${s}`),
    '',
    'View all: https://vayaccess.com'
  ].join('\n');
}

// --- Enhanced digest templates with rich content ---
const DIGEST_TEMPLATES = [
  {
    key: 'products_spotlight',
    subject: () => ' VayAccess Product Spotlight - Smart Parking Solutions',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Featured Products</h1>
          <p style="margin:0;opacity:0.9;">Discover our latest smart parking technology</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'solutions_focus',
    subject: () => ' VayAccess Solutions Update - Transform Your Parking',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#059669,#047857);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Smart Solutions</h1>
          <p style="margin:0;opacity:0.9;">Complete parking management solutions for modern facilities</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'weekly_roundup',
    subject: () => ' VayAccess Weekly Roundup - Products, Solutions & Services',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Weekly Update</h1>
          <p style="margin:0;opacity:0.9;">Your complete guide to VayAccess innovations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'technology_insights',
    subject: () => ' VayAccess Tech Insights - ANPR, IoT & Smart Access',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Technology Focus</h1>
          <p style="margin:0;opacity:0.9;">Advanced parking technology and smart city solutions</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'customer_success',
    subject: () => ' VayAccess Success Stories - Real Results, Real Impact',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="text-align:center;background:linear-gradient(135deg,#ea580c,#c2410c);color:white;padding:24px;border-radius:12px;margin-bottom:20px;">
          <h1 style="margin:0 0 8px 0;font-size:28px;"> Success Stories</h1>
          <p style="margin:0;opacity:0.9;">See how our solutions transform parking operations</p>
        </div>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
];

function pickRotatingTemplate() {
  const hour = new Date().getHours();
  return DIGEST_TEMPLATES[hour % DIGEST_TEMPLATES.length];
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
// Use admin token for signing unsubscribe tokens (fallback to legacy secret if present)
const NEWSLETTER_SECRET = process.env.NEWSLETTER_ADMIN_TOKEN || process.env.NEWSLETTER_SECRET || 'change-me';

function signUnsubToken(email) {
  return crypto.createHmac('sha256', NEWSLETTER_SECRET).update(String(email).toLowerCase()).digest('hex');
}

function buildUnsubscribeHeaders(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  const t = signUnsubToken(email);
  const httpUrl = `${PUBLIC_BASE_URL}/api/newsletter/unsubscribe?e=${e}&t=${t}`;
  const mailto = `mailto:${process.env.SMTP_USER || 'no-reply@vayaccess.com'}?subject=unsubscribe`;
  const base = {
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'List-Id': 'VayAccess Newsletter <newsletter.vayaccess.com>',
  };
  if (process.env.ENABLE_MANAGE_LINK === 'true') {
    return {
      ...base,
      'List-Unsubscribe': `<${httpUrl}>, <${mailto}>`,
      'X-List-Manage': `${PUBLIC_BASE_URL}/newsletter/manage`,
    };
  }
  return {
    ...base,
    'List-Unsubscribe': `<${mailto}>`,
  };
}

function withFooter(html) {
  const manageUrl = `${PUBLIC_BASE_URL}/newsletter/manage`;
  const manageLine = process.env.ENABLE_MANAGE_LINK === 'true'
    ? `<br/>Manage: <a style="color:#2563eb;" href="${manageUrl}">subscription portal</a>`
    : '';
  return `${html}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
    <p style="font-size:12px;color:#6b7280;line-height:1.6;">
      This email was sent by VayAccess. Update your preferences or unsubscribe anytime.
      ${manageLine}
    </p>`;
}

async function sendDigestToEmail(to, snapshot) {
  try {
    const html = withFooter(buildDigestHtml(snapshot));
    const text = buildDigestText(snapshot);
    await emailHelper.sendCategorizedEmail({
      category: 'content_digest',
      to,
      subject: 'VayAccess: Products & Solutions Digest',
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `digest:${snapshot.hash}:${String(to).toLowerCase()}`,
      meta: { type: 'digest' },
    });
  } catch (e) {
    console.warn('Digest email failed:', e?.message || e);
  }
}

async function broadcastDigest(snapshot, opts = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const { products, solutions } = getArticlesSnapshot();
  const filter = { active: { $ne: false } };
  const subs = await mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } }).toArray();
  const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

  let stats = { products: { sent: 0, failed: 0 }, solutions: { sent: 0, failed: 0 } };

  // Products broadcast (categorized + tracked)
  if (products?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_products',
        to,
        subject: 'VayAccess: New Products (with images)',
        html: buildArticleDigestHtml(products),
        text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: products.length },
        dedupeKey: `broadcast-products:${to}`,
      });
      if (res?.success) stats.products.sent++; else if (!res?.skipped) stats.products.failed++;
    }
  }

  // Solutions broadcast (categorized + tracked)
  if (solutions?.length) {
    for (const to of emails) {
      const res = await emailHelper.sendCategorizedEmail({
        category: 'content_digest_solutions',
        to,
        subject: 'VayAccess: Latest Solutions',
        html: buildArticleDigestHtml(solutions),
        text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
        headers: buildUnsubscribeHeaders(to),
        meta: { broadcast: true, count: solutions.length },
        dedupeKey: `broadcast-solutions:${to}`,
      });
      if (res?.success) stats.solutions.sent++; else if (!res?.skipped) stats.solutions.failed++;
    }
  }

  // Optional push notification title/body
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token, 'VayAccess Updates', 'See the latest products and solutions', '/products'); } catch (_) {}
    }
  } catch (_) {}

  return { success: true, products: stats.products, solutions: stats.solutions, recipients: emails.length };
}

async function checkAndBroadcastContentUpdates() {
  try {
    if (!mongoDb) return;
    // Use full articles snapshot (title, description, image) for change detection
    const { hash } = getArticlesSnapshot();
    const stateCol = mongoDb.collection('site_content_state');
    const id = 'articles_digest_v1';
    const existing = await stateCol.findOne({ _id: id });
    if (!existing || existing.hash !== hash) {
      await stateCol.updateOne(
        { _id: id },
        { $set: { _id: id, hash, updatedAt: new Date() } },
        { upsert: true }
      );
      // Broadcast update with latest snapshot
      await broadcastDigest(getArticlesSnapshot());
      console.log('Auto-news: broadcasted new articles digest');
    }
  } catch (e) {
    console.warn('Auto-news check failed:', e?.message || e);
  }
}

// Articles generator for products & solutions (with images, no links)
// Uses PUBLIC_BASE_URL defined earlier

function toAssetUrl(relPath) {
  if (!relPath) return null;
  try {
    const file = path.basename(relPath);
    return `${PUBLIC_BASE_URL}/assets/${file}`;
  } catch (_) { return null; }
}

function parseImportsMap(content) {
  // import varName from "../assets/file.jpg";
  const map = {};
  const importRe = /import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g;
  let m;
  while ((m = importRe.exec(content))) {
    map[m[1]] = m[2];
  }
  return map;
}

function parseProductsDetailed(content) {
  const imports = parseImportsMap(content);
  // Extract the products array block
  const arrMatch = content.match(/const\s+products\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return [];
  const arrBody = arrMatch[1];
  const items = [];
  // Split by object boundaries (rough but works with our formatting)
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const name = (obj.match(/name:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    // capture description until the next field or end of object (robust to line breaks and trailing commas)
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    const imageVar = (obj.match(/image:\s*(\w+)/) || [])[1];
    if (name) {
      const rel = imports[imageVar];
      items.push({
        type: 'product',
        title: name,
        description: (desc || '').trim(),
        image: toAssetUrl(rel),
      });
    }
  }
  return items;
}

function parseSolutionsDetailed(content) {
  // Solutions currently don't have image assets; add a generic illustrative image
  const placeholder = `${PUBLIC_BASE_URL}/assets/parking-system-architecture.jpg`;
  const items = [];
  const arrMatch = content.match(/const\s+solutions\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) return items;
  const arrBody = arrMatch[1];
  const objRe = /\{([\s\S]*?)\}/g;
  let om;
  while ((om = objRe.exec(arrBody))) {
    const obj = om[1];
    const title = (obj.match(/title:\s*["'`]([^"'`]+)["'`]/) || [])[1];
    const desc = (obj.match(/description:\s*["'`]([\s\S]*?)["'`](?:,|\n|\r|\s*\})/) || [])[1];
    if (title) items.push({ type: 'solution', title, description: (desc || '').trim(), image: placeholder });
  }
  return items;
}

function getArticlesSnapshot() {
  const productsTsx = readFileSafe(CONTENT_FILES[0]);
  const solutionsTsx = readFileSafe(CONTENT_FILES[1]);
  const products = parseProductsDetailed(productsTsx).slice(0, 20);
  const solutions = parseSolutionsDetailed(solutionsTsx).slice(0, 30);
  const articles = [...products, ...solutions];
  const hash = sha256(JSON.stringify(articles).slice(0, 2000));
  return { hash, articles, products, solutions };
}

function buildArticleDigestHtml(articles) {
  // generic combined template
  const card = (a) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`;
  const list = articles.map(card).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Products & Solutions</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 12px 0;">Latest offerings for our subscribers. This email contains full content without external links.</p>
      ${list}
    </div>`;
}

function buildProductsDigestHtml(products) {
  const list = products.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Product Highlights</h2>
      ${list || '<p>No products today.</p>'}
    </div>`;
}

function buildSolutionsDigestHtml(solutions) {
  const list = solutions.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
    </div>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Solutions Spotlight</h2>
      ${list || '<p>No solutions today.</p>'}
    </div>`;
}

// Build individual product email HTML
function buildProductEmailHtml(product) {
  const imageUrl = product.image ? `https://vayaccess.com${product.image}` : 'https://vayaccess.com/assets/default-product.jpg';
  
  // Enhanced product descriptions based on title
  const getEnhancedDescription = (title, originalDesc) => {
    const descriptions = {
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Transform your parking operations with our cutting-edge ticketless parking management system. This revolutionary solution eliminates the need for physical tickets, creating a seamless experience for both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our system leverages advanced ANPR (Automatic Number Plate Recognition) technology combined with mobile app integration to provide a completely digital parking experience. Users can find, reserve, and pay for parking spaces directly through their smartphones.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'The system optimizes space usage while providing real-time analytics and reporting capabilities for facility managers.'}
        </p>
      `,
      'Ticket Based Parking Management': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our traditional ticket-based parking management system provides reliable and proven parking control for high-traffic facilities. Perfect for malls, airports, and commercial complexes requiring robust entry and exit management.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing at entry points, validation systems, and secure payment processing. Built with durability and reliability in mind, it handles thousands of transactions daily.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Streamlined ticket management with comprehensive reporting and analytics for optimal facility management.'}
        </p>
      `,
      'VAY Parking Guidance Display': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Enhance your parking facility with our intelligent parking guidance display system. These advanced LED displays provide real-time parking availability information, helping drivers quickly locate available spaces.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system integrates with our sensor network to display accurate space availability, reducing search time and improving traffic flow within your facility. Clear, bright LED indicators guide users efficiently to available parking spots.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Improved user experience with enhanced safety and security features for modern parking facilities.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Advanced parking solution designed to streamline operations and enhance user experience with cutting-edge technology and innovative features.'}
      </p>
    `;
  };
  
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Product Spotlight</h1>
        <p style="margin:8px 0 0 0;color:#dbeafe;font-size:16px;">Discover VayAccess Innovation</p>
      </div>
      
      <!-- Product Content -->
      <div style="padding:30px 20px;">
        <!-- Product Image -->
        <div style="text-align:center;margin-bottom:24px;">
          <img src="${imageUrl}" alt="${product.title}" 
               style="width:100%;max-width:500px;height:300px;object-fit:cover;border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,0.15);" />
        </div>
        
        <!-- Product Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${product.title}
        </h2>
        
        <!-- Product Description -->
        <div style="background:#f8fafc;border-radius:12px;padding:24px;margin:20px 0;">
          ${getEnhancedDescription(product.title, product.description)}
        </div>
        
        <!-- Key Features -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> Key Features</h3>
          <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
            <li>Advanced technology integration</li>
            <li>User-friendly interface</li>
            <li>Real-time monitoring and analytics</li>
            <li>Scalable and customizable solution</li>
            <li>24/7 technical support</li>
          </ul>
        </div>
        
        <!-- Benefits Section -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Benefits</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Increased operational efficiency</li>
            <li>Enhanced customer satisfaction</li>
            <li>Reduced operational costs</li>
            <li>Improved security and access control</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Ready to Learn More?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Get detailed specifications and pricing information</p>
          <a href="https://vayaccess.com/products" 
             style="display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
            View Product Details
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Questions? We're here to help!</p>
          <p style="margin:0;color:#2563eb;font-size:14px;">
             <a href="mailto:info@vayaccess.com" style="color:#2563eb;text-decoration:none;">info@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#2563eb;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Build individual solution email HTML
function buildSolutionEmailHtml(solution) {
  // Enhanced solution descriptions based on title
  const getEnhancedSolutionDescription = (title, originalDesc) => {
    const descriptions = {
      'Hybrid ANPR/FASTAG System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Experience the future of vehicle access control with our revolutionary Hybrid ANPR/FASTAG System. This cutting-edge solution combines the power of Automatic Number Plate Recognition (ANPR) technology with FASTAG integration for seamless, contactless vehicle access.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our hybrid approach ensures maximum compatibility and reliability. When FASTAG is available, the system processes payments instantly. When FASTAG is not detected, our advanced ANPR technology takes over, capturing and processing license plates with 99.9% accuracy.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'This dual-technology approach eliminates barriers to entry while maintaining the highest security standards for modern parking facilities.'}
        </p>
      `,
      'Ticketless Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Step into the future of parking management with our comprehensive ticketless solution. This intelligent system eliminates the need for physical tickets, creating a completely digital parking ecosystem that benefits both operators and users.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Users can locate, reserve, and pay for parking spaces through our intuitive mobile application. The system provides real-time availability updates, navigation assistance, and secure payment processing, all while collecting valuable analytics for facility optimization.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Transform your parking operations with reduced operational costs, improved user satisfaction, and comprehensive facility management tools.'}
        </p>
      `,
      'Ticket Based Parking Management System': `
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          Our robust ticket-based parking management system provides proven reliability for high-volume parking facilities. Designed for environments where traditional ticketing is preferred or required, this solution offers comprehensive control and monitoring capabilities.
        </p>
        <p style="margin:0 0 16px 0;color:#374151;line-height:1.8;font-size:16px;">
          The system features automated ticket dispensing, validation, and payment processing with multiple payment options. Built-in fraud prevention and comprehensive reporting ensure secure operations and detailed facility insights.
        </p>
        <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
          ${originalDesc || 'Perfect for malls, airports, and commercial complexes requiring reliable, high-capacity parking management with detailed transaction tracking.'}
        </p>
      `
    };
    
    return descriptions[title] || `
      <p style="margin:0;color:#374151;line-height:1.8;font-size:16px;">
        ${originalDesc || 'Innovative smart parking solution that leverages cutting-edge technology to optimize parking operations and enhance user experience with advanced features and seamless integration.'}
      </p>
    `;
  };

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);padding:30px 20px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;"> Smart Solution</h1>
        <p style="margin:8px 0 0 0;color:#e9d5ff;font-size:16px;">Intelligent Parking Innovation</p>
      </div>
      
      <!-- Solution Content -->
      <div style="padding:30px 20px;">
        <!-- Solution Icon/Visual -->
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);width:100px;height:100px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;box-shadow:0 8px 25px rgba(124,58,237,0.3);">
            <span style="font-size:42px;"></span>
          </div>
        </div>
        
        <!-- Solution Title -->
        <h2 style="margin:0 0 24px 0;color:#111827;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
          ${solution.title}
        </h2>
        
        <!-- Solution Description -->
        <div style="background:#faf5ff;border-radius:12px;padding:24px;margin:20px 0;border-left:4px solid #7c3aed;">
          ${getEnhancedSolutionDescription(solution.title, solution.description)}
        </div>
        
        <!-- How It Works -->
        <div style="margin:24px 0;">
          <h3 style="margin:0 0 16px 0;color:#111827;font-size:18px;font-weight:600;"> How It Works</h3>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">1</span>
              <span style="color:#374151;">Smart sensors detect vehicle presence</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">2</span>
              <span style="color:#374151;">Real-time data processing and analysis</span>
            </div>
            <div style="display:flex;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">
              <span style="background:#7c3aed;color:#ffffff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;margin-right:12px;">3</span>
              <span style="color:#374151;">Automated guidance and management</span>
            </div>
          </div>
        </div>
        
        <!-- Key Advantages -->
        <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
          <h3 style="margin:0 0 12px 0;color:#065f46;font-size:18px;font-weight:600;"> Key Advantages</h3>
          <ul style="margin:0;padding-left:20px;color:#065f46;line-height:1.6;">
            <li>Reduces parking search time by up to 70%</li>
            <li>Increases parking revenue by 25-40%</li>
            <li>Minimizes traffic congestion</li>
            <li>Enhances overall user satisfaction</li>
          </ul>
        </div>
        
        <!-- CTA Section -->
        <div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:12px;">
          <h3 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:600;">Interested in This Solution?</h3>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:16px;">Schedule a demo and see it in action</p>
          <a href="https://vayaccess.com/solutions" 
             style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(124,58,237,0.3);">
            Learn More
          </a>
        </div>
        
        <!-- Contact Info -->
        <div style="text-align:center;padding:20px;background:#f9fafb;border-radius:8px;margin-top:24px;">
          <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Ready to implement this solution?</p>
          <p style="margin:0;color:#7c3aed;font-size:14px;">
             <a href="mailto:solutions@vayaccess.com" style="color:#7c3aed;text-decoration:none;">solutions@vayaccess.com</a> • 
             <a href="tel:+1234567890" style="color:#7c3aed;text-decoration:none;">+1 (234) 567-890</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Send individual product email
async function sendProductEmail(to, product, emailIndex = 0) {
  try {
    const html = withFooter(buildProductEmailHtml(product));
    const text = `VayAccess Product Spotlight: ${product.title}\n\n${product.description || ''}\n\nLearn more: https://vayaccess.com/products`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'product_spotlight',
      to,
      subject: ` New Product: ${product.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `product:${product.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'product', productTitle: product.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Product email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Send individual solution email
async function sendSolutionEmail(to, solution, emailIndex = 0) {
  try {
    const html = withFooter(buildSolutionEmailHtml(solution));
    const text = `VayAccess Smart Solution: ${solution.title}\n\n${solution.description || ''}\n\nLearn more: https://vayaccess.com/solutions`;
    
    await emailHelper.sendCategorizedEmail({
      category: 'solution_spotlight',
      to,
      subject: ` Smart Solution: ${solution.title} - VayAccess`,
      html,
      text,
      headers: buildUnsubscribeHeaders(to),
      dedupeKey: `solution:${solution.title}:${String(to).toLowerCase()}:${emailIndex}`,
      meta: { type: 'solution', solutionTitle: solution.title },
    });
    
    return { success: true };
  } catch (e) {
    console.warn('Solution email failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

// Distribute individual emails based on user frequency (personalized per subscriber for hourly)
async function distributeIndividualEmails() {
  try {
    if (!mongoDb) return { success: false, message: 'DB not ready' };

    const snapshot = getArticlesSnapshot();
    const { products, solutions } = snapshot;

    // Get all active subscribers
    const subscribers = await mongoDb.collection('subscribers')
      .find({ active: true })
      .toArray();

    if (subscribers.length === 0) {
      return { success: true, message: 'No active subscribers' };
    }

    const stats = {
      hourly: { products: 0, solutions: 0, sent: 0, failed: 0 },
      daily: { products: 0, solutions: 0, sent: 0, failed: 0 },
      weekly: { products: 0, solutions: 0, sent: 0, failed: 0 }
    };

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // A simple hash to integer for personalization
    function hashToInt(str) {
      const hex = crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
      return parseInt(hex.slice(0, 8), 16); // 32-bit range
    }

    // Group subscribers by frequency
    const subscribersByFreq = {
      hourly: subscribers.filter(s => s.frequency === 'hourly'),
      daily: subscribers.filter(s => s.frequency === 'daily'),
      weekly: subscribers.filter(s => s.frequency === 'weekly')
    };

    // Send emails based on frequency
    for (const [frequency, subs] of Object.entries(subscribersByFreq)) {
      if (subs.length === 0) continue;

      if (frequency === 'hourly') {
        // Personalized selection per-subscriber per-hour
        const hourKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        for (const subscriber of subs) {
          try {
            // Build a stable per-hour hash using email + hour key
            const h = hashToInt(`${String(subscriber.email).toLowerCase()}:${hourKey}`);

            // Decide category first, considering availability
            let pickType = 'product';
            if (products.length === 0 && solutions.length === 0) continue;
            if (products.length === 0) pickType = 'solution';
            else if (solutions.length === 0) pickType = 'product';
            else pickType = (h % 2 === 0) ? 'product' : 'solution';

            if (pickType === 'product') {
              const idx = products.length ? (h % products.length) : 0;
              const item = products[idx];
              const res = await sendProductEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.products++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            } else {
              // Use a different mix for solutions for better spread
              const idx = solutions.length ? ((h >> 3) % solutions.length) : 0;
              const item = solutions[idx];
              const res = await sendSolutionEmail(subscriber.email, item, hourKey);
              if (res?.success) { stats.hourly.solutions++; stats.hourly.sent++; } else { stats.hourly.failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send personalized hourly email to ${subscriber.email}:`, e?.message);
            stats.hourly.failed++;
          }
        }
        continue; // Move to next frequency
      }

      // Daily and Weekly keep existing shared content logic
      let shouldSend = false;
      let contentToSend = [];

      if (frequency === 'daily') {
        shouldSend = currentHour === 9; // Send at 9 AM daily
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const dayIndex = now.getDate() % total;
            if (dayIndex < products.length) contentToSend.push({ type: 'product', item: products[dayIndex] });
            else contentToSend.push({ type: 'solution', item: solutions[dayIndex - products.length] });
          }
        }
      } else if (frequency === 'weekly') {
        shouldSend = currentDay === 1 && currentHour === 10; // Monday 10 AM
        if (shouldSend) {
          const total = products.length + solutions.length;
          if (total > 0) {
            const weekNumber = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
            const startIndex = (weekNumber * 2) % total;
            for (let i = 0; i < 2 && i < total; i++) {
              const index = (startIndex + i) % total;
              if (index < products.length) contentToSend.push({ type: 'product', item: products[index] });
              else contentToSend.push({ type: 'solution', item: solutions[index - products.length] });
            }
          }
        }
      }

      if (!shouldSend || contentToSend.length === 0) continue;

      for (const subscriber of subs) {
        for (let i = 0; i < contentToSend.length; i++) {
          const content = contentToSend[i];
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 2000)); // small pacing
          try {
            let result;
            if (content.type === 'product') {
              result = await sendProductEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].products++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            } else {
              result = await sendSolutionEmail(subscriber.email, content.item, i);
              if (result?.success) { stats[frequency].solutions++; stats[frequency].sent++; } else { stats[frequency].failed++; }
            }
          } catch (e) {
            console.warn(`Failed to send ${content.type} email to ${subscriber.email}:`, e?.message);
            stats[frequency].failed++;
          }
        }
      }
    }

    const totalSent = Object.values(stats).reduce((sum, s) => sum + s.sent, 0);
    const totalFailed = Object.values(stats).reduce((sum, s) => sum + s.failed, 0);

    console.log(`Individual emails distributed: ${totalSent} sent, ${totalFailed} failed`, stats);

    return {
      success: true,
      stats,
      totalSent,
      totalFailed,
      message: `Distributed ${totalSent} individual emails`
    };

  } catch (e) {
    console.warn('Individual email distribution failed:', e?.message || e);
    return { success: false, error: e?.message };
  }
}

function buildMarketingDigestHtml() {
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      <h3 style="margin:0 0 8px 0;color:#111827;">Special Offers & Updates</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
      <p style="margin-top:10px;"><a href="https://vayaccess.com/contact" style="color:#2563eb;text-decoration:none;">Contact sales</a></p>
    </div>`;
}

// Content APIs
app.get('/api/content/articles', (req, res) => {
  try {
    const snap = getArticlesSnapshot();
    res.json({ success: true, count: snap.articles.length, articles: snap.articles });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to build articles' });
  }
});

// Admin-protected triggers for content digest
function isAdmin(req) {
  const header = req.headers['x-admin-secret'] || req.headers['x-admin-token'];
  const query = req.query?.secret || req.query?.token;
  const provided = header || query;
  const expected = process.env.ADMIN_SECRET;
  return expected && provided && String(provided) === String(expected);
}

app.post('/api/admin/content/auto-check', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    await checkAndBroadcastContentUpdates();
    res.json({ success: true, message: 'Auto-check executed' });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to run auto-check' });
  }
});

app.post('/api/admin/content/broadcast', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const snap = getArticlesSnapshot();
    const result = await broadcastDigest(snap, { force: true });
    res.json({ success: true, message: 'Broadcast triggered', result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to broadcast' });
  }
});

// Manual newsletter trigger for testing
app.post('/api/admin/newsletter/send-test', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const { frequency = 'hourly', testEmail } = req.body;
    
    if (frequency === 'hourly') {
      await sendHourlyDigestOnce();
      res.json({ success: true, message: 'Hourly digest sent to all subscribers' });
    } else {
      const since = new Date();
      since.setHours(since.getHours() - 1); // Last hour for testing
      await sendArticleDigestFor(frequency, since);
      res.json({ success: true, message: `${frequency} digest sent to all subscribers` });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send newsletter' });
  }
});

// Get newsletter statistics
app.get('/api/admin/newsletter/stats', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!mongoDb) return res.status(503).json({ success: false, message: 'DB not ready' });
    
    const totalSubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const hourlySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'hourly' });
    const dailySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'daily' });
    const weeklySubs = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false }, frequency: 'weekly' });
    
    const recentEmails = await mongoDb.collection('email_events')
      .find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    
    res.json({
      success: true,
      stats: {
        totalSubscribers: totalSubs,
        byFrequency: {
          hourly: hourlySubs,
          daily: dailySubs,
          weekly: weeklySubs
        },
        recentEmails: recentEmails.length,
        lastEmails: recentEmails.map(e => ({
          to: e.to,
          subject: e.subject,
          category: e.category,
          result: e.result,
          createdAt: e.createdAt
        }))
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to get stats' });
  }
});

// Newsletter subscribe endpoint (legacy v1) - renamed to avoid shadowing improved version below
app.post('/api/newsletter/subscribe-v1', async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!email || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    if (!mongoDb) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const col = mongoDb.collection('subscribers');
    await col.updateOne(
      { email: email.toLowerCase() },
      { $set: { email: email.toLowerCase(), source: source || 'footer', active: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    // Category-wise triggers: send separate emails for products and solutions
    try {
      const { products, solutions } = getArticlesSnapshot();

      // Products trigger
      if (products?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_products',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Top Products for You',
          html: buildArticleDigestHtml(products),
          text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: products.length },
          dedupeKey: `welcome-products:${String(email).trim().toLowerCase()}`,
        });
      }

      // Solutions trigger
      if (solutions?.length) {
        await emailHelper.sendCategorizedEmail({
          category: 'content_digest_solutions',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Latest Parking Solutions',
          html: buildArticleDigestHtml(solutions),
          text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
          meta: { source: source || 'footer', count: solutions.length },
          dedupeKey: `welcome-solutions:${String(email).trim().toLowerCase()}`,
        });
      }
    } catch (digestErr) {
      console.warn('Welcome category digests failed (continuing):', digestErr?.message || digestErr);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    console.error(' Subscribe error:', e);
    res.status(500).json({ success: false, message: 'Failed to subscribe' });
  }
});

// Scheduler (configurable, default every 3 minutes)
if (process.env.ENABLE_CONTENT_AUTONEWS !== 'false') {
  const minutes = Number(process.env.CONTENT_AUTONEWS_INTERVAL_MIN || process.env.CONTENT_AUTONEWS_INTERVAL || 3);
  const intervalMs = Math.max(60_000, Math.floor(minutes) * 60 * 1000); // >= 1 minute
  setInterval(checkAndBroadcastContentUpdates, intervalMs);
  // Initial delayed check to allow Mongo to connect
  setTimeout(checkAndBroadcastContentUpdates, 30 * 1000);
}

// --- Daily Digest (Email + Web Push) ---
let ENABLE_DAILY_DIGEST = process.env.ENABLE_DAILY_DIGEST !== 'false';
if (!ENABLE_DAILY_DIGEST) {
  console.warn('Daily digest disabled by env, overriding to enabled.');
  ENABLE_DAILY_DIGEST = true;
}
const DAILY_DIGEST_HOUR_IST = Number(process.env.DAILY_DIGEST_HOUR_IST || 9); // 9 AM IST by default
const DAILY_DIGEST_CHECK_MIN = Number(process.env.DAILY_DIGEST_CHECK_MIN || 5); // check every 5 minutes

function nowIST() {
  // Create a Date object representing current time in Asia/Kolkata
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function formatISTDate(d = nowIST()) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function ymd(d = nowIST()) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getDailySubject(d = nowIST()) {
  const dateStr = formatISTDate(d);
  const options = [
    ` Live Parking Updates + Smart Access News — ${dateStr}`,
    'VayAccess Daily: Smarter Parking, Safer Access',
    ' New Features + Live Analytics for Parking Control',
    `[Today’s Update] VayAccess Parking Solutions — ${dateStr}`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

async function buildDailySections() {
  // Compute lightweight stats from existing Mongo collections (fallback to placeholders)
  try {
    if (!mongoDb) return null;
    const subsCount = await mongoDb.collection('subscribers').countDocuments({ active: { $ne: false } });
    const todayStartIST = nowIST();
    todayStartIST.setHours(0, 0, 0, 0);
    const todayEndIST = new Date(todayStartIST);
    todayEndIST.setHours(23, 59, 59, 999);

    // Convert IST bounds to UTC by reconstructing from string to avoid timezone drift
    const startUTC = new Date(new Date(todayStartIST).toISOString());
    const endUTC = new Date(new Date(todayEndIST).toISOString());

    const todaysAnnouncements = await mongoDb.collection('announcements').countDocuments({
      createdAt: { $gte: startUTC, $lte: endUTC }
    });

    const { articles } = getArticlesSnapshot();
    const top3 = articles.slice(0, 3).map(a => a.title);

    return {
      subsCount,
      todaysAnnouncements,
      top3,
    };
  } catch (_) {
    return null;
  }
}

function buildDailyDigestHtml(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  const logoUrl = `${PUBLIC_BASE_URL}/assets/vay-logo.jpg`;
  const highlight = (
    sections?.top3?.length ? sections.top3.map(t => `“${t}”`).join(' • ') :
    'New Hikvision camera integration live on 2 sites. RFID reduced wait time by 38%.'
  );
  return `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f9fafb;padding:18px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <img src="${logoUrl}" alt="VayAccess" style="height:36px;width:auto;" />
      <div style="font-weight:700;color:#111827;">Smart Parking. Secure Access. Seamless Control.</div>
    </div>
    <h2 style="margin:4px 0 10px 0;">${getDailySubject(d)}</h2>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <h3 style="margin:0 0 8px 0;"> Daily System Highlights</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">
        ${highlight || 'Today’s report: Live updates across VayAccess deployments.'}
      </p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Analytics Snapshot</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>Subscribers: ${sections?.subsCount ?? '—'}</li>
        <li>Announcements today: ${sections?.todaysAnnouncements ?? '—'}</li>
        <li>Peak entry time: 9:12 AM (sample)</li>
        <li>Average parking duration: 3h 20m (sample)</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Product Tips / Knowledge</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Did you know? VayAccess web dashboard supports live push notifications for security alerts and automated reports in one click.</p>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Marketing / Offers</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;line-height:1.7;">
        <li>This week only: Get 20% off on new camera integrations.</li>
        <li>Upgrade to Enterprise to unlock advanced AI analytics.</li>
      </ul>
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-top:12px;">
      <h3 style="margin:0 0 8px 0;"> Real-Time Alerts</h3>
      <p style="color:#374151;line-height:1.6;margin:0;">Enable web push to get instant alerts for gate failures, unauthorized entries, and congestion updates.</p>
    </div>

    <p style="color:#6b7280;font-size:12px;text-align:center;margin-top:14px;">Sent on ${dateStr} • VayAccess</p>
  </div>`;
}

function buildDailyDigestText(sections, d = nowIST()) {
  const dateStr = formatISTDate(d);
  return [
    getDailySubject(d),
    '',
    ' Daily System Highlights:',
    (sections?.top3 || []).map(t => `- ${t}`).join('\n') || '- New Hikvision camera integration live on 2 sites',
    '',
    ' Analytics Snapshot:',
    `- Subscribers: ${sections?.subsCount ?? '—'}`,
    `- Announcements today: ${sections?.todaysAnnouncements ?? '—'}`,
    '- Peak entry time: 9:12 AM (sample)',
    '- Average parking duration: 3h 20m (sample)',
    '',
    ' Product Tips / Knowledge:',
    '- Dashboard supports live push alerts and automated reports',
    '',
    ' Marketing / Offers:',
    '- 20% off on new camera integrations',
    '- Enterprise unlocks advanced AI analytics',
    '',
    `Sent on ${dateStr}`
  ].join('\n');
}

async function sendDailyDigest({ force = false } = {}) {
  if (!mongoDb) return { success: false, message: 'MongoDB not initialized' };
  const todayKey = ymd();
  const sentCol = mongoDb.collection('daily_digest_sent');
  const exists = await sentCol.findOne({ _id: todayKey });
  if (exists && !force) return { success: true, message: 'Already sent today' };

  const sections = await buildDailySections();

  // Collect subscribers with prefs
  const subs = await mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1, prefs: 1 } }).toArray();
  const validSubs = subs.filter(s => /.+@.+\..+/.test(s.email));

  // Email broadcast per-subscriber with category templates
  let sent = 0, failed = 0;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    for (const s of validSubs) {
      const to = String(s.email).toLowerCase();
      const prefs = s.prefs || { products: true, solutions: true };
      const { products, solutions } = getArticlesSnapshot();

      // Build personalized content with category templates
      const chunks = [];
      if (prefs.products) chunks.push(buildProductsDigestHtml(products.slice(0, 8)));
      if (prefs.solutions) chunks.push(buildSolutionsDigestHtml(solutions.slice(0, 8)));
      if (prefs.marketing) chunks.push(buildMarketingDigestHtml());
      const html = chunks.join('\n');
      const subject = getDailySubject();
      const text = [
        subject,
        '',
        prefs.products ? (products.slice(0, 5).map(a => `- [Product] ${a.title}`).join('\n')) : '',
        prefs.solutions ? (solutions.slice(0, 5).map(a => `- [Solution] ${a.title}`).join('\n')) : '',
        prefs.marketing ? ('- [Marketing] Special offers available') : '',
      ].filter(Boolean).join('\n');

      try {
        await emailHelper.sendCategorizedEmail({
          category: 'daily_personalized',
          to,
          subject,
          html: withFooter(html),
          text,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `daily:${todayKey}:${to}`,
          meta: { daily: true, prefs },
        });
        sent++;
      } catch (_) { failed++; }
    }
  }

  // Push notifications
  let pushOk = 0, pushFail = 0;
  try {
    const tokens = await mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } }).toArray();
    for (const t of tokens) {
      try { await sendFcmMessage(t.token || t, 'VayAccess Daily', 'Open for today\'s updates', '/'); pushOk++; } catch (_) { pushFail++; }
    }
  } catch (_) {}

  await sentCol.updateOne({ _id: todayKey }, { $set: { _id: todayKey, sentAt: new Date(), emails: sent, failed } }, { upsert: true });
  // Return counts based on computed values to avoid referencing undefined variables
  return { success: true, emails: { sent, failed }, push: { sent: pushOk, failed: pushFail } };
}

// Admin: manual daily digest
app.post('/api/admin/daily-digest/send', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const force = String(req.query.force || '').toLowerCase() === 'true';
    const result = await sendDailyDigest({ force });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to send daily digest' });
  }
});

// Admin: preview daily digest HTML
app.get('/api/admin/daily-digest/preview', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).send('Forbidden');
    const sections = await buildDailySections();
    res.setHeader('Content-Type', 'text/html');
    res.send(buildDailyDigestHtml(sections));
  } catch (e) {
    res.status(500).send('Failed to build preview');
  }
});

// Daily scheduler (IST hour)
if (ENABLE_DAILY_DIGEST) {
  setInterval(async () => {
    try {
      if (!mongoDb) return;
      const n = nowIST();
      if (n.getHours() >= DAILY_DIGEST_HOUR_IST) {
        await sendDailyDigest();
      }
    } catch (e) {
      console.warn('Daily digest scheduler error:', e?.message || e);
    }
  }, Math.max(60_000, DAILY_DIGEST_CHECK_MIN * 60 * 1000));
}

// Start HTTP server (required for Vite proxy to work)
server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
});

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }
    
    console.log(' Processing contact form submission:', { name, email, message });
    
    // 1. Send notification to info@vayaccess.com
    const adminNotificationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: 'info@vayaccess.com',
      replyTo: email, // Allows replying directly to the customer
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <!-- Header-style summary block to mirror desired format -->
          <div style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 6px 0; font-weight: 700; color: #111827;">Thank you for contacting VayAccess - Response within 2 hours</p>
            <p style="margin: 0 0 6px 0; color: #374151;">VayAccess Support Team &lt;info@vayaccess.com&gt;</p>
            <p style="margin: 0 0 6px 0; color: #6b7280;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            <p style="margin: 0; color: #6b7280;">to ${name}</p>
          </div>

          <div style="background: white; padding: 24px;">
            <h1 style="margin: 0 0 10px 0; font-size: 22px; color: #059669;">Message Received Successfully</h1>
            <p style="margin: 6px 0 20px 0; color: #6b7280;">Thank you for contacting VayAccess</p>

            <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Dear <strong>${name}</strong>,</p>
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>

            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
              <h3 style="color: #2563eb; margin: 0 0 10px 0; font-size: 16px;">Your Message Summary</h3>
              <div style="background: white; padding: 12px; border-radius: 6px; color: #6b7280; font-style: italic;">
                "${message}"
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #059669; margin: 0 0 10px 0; font-size: 18px;">What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>

            <div style="background: #fff7ed; border: 1px solid #fb923c; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #c2410c; margin: 0 0 10px 0; font-size: 16px;">Need Immediate Assistance?</h3>
              <p style="margin: 0; color: #92400e;"><a href="tel:+917207244344" style="color: #2563eb; text-decoration: none;">+91 720 724 4344</a> • <a href="https://wa.me/917207244344" style="color: #10b981; text-decoration: none;">WhatsApp</a> • <a href="mailto:info@vayaccess.com" style="color: #6b7280; text-decoration: none;">Email</a></p>
            </div>

            <div style="margin: 20px 0; text-align: center;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Visit Our Website</a>
            </div>

            <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; color: #6b7280; font-size: 14px;">
              <p style="margin: 0 0 6px 0;"><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 12px 0 0 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 12px;">
                This is an automated confirmation. Please save this email for your records.
              </p>

              <p style="text-align:center; color:#6b7280; font-size: 13px; margin-top: 16px;">
                <strong>Customer Details:</strong> ${name} • <a href="mailto:${email}" style="color:#2563eb; text-decoration:none;">${email}</a>
              </p>
            </div>
          </div>
        </div>
      `,
      text: `Thank you for contacting VayAccess - Response within 2 hours
VayAccess Support Team <info@vayaccess.com>
${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
to ${name}

Message Received Successfully
Thank you for contacting VayAccess

Dear ${name},
Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.

Your Message Summary
"${message}"

What Happens Next?
Quick Response: Our technical specialists will respond within 2 hours during business hours
Detailed Analysis: We'll review your requirements and provide customized recommendations
Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

Need Immediate Assistance?
+91 720 724 4344  WhatsApp  Email

Visit Our Website
Business Hours: Monday - Friday: 9:00 AM - 6:00 PM IST

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Customer Details: ${name} • ${email}

This is an automated confirmation. Please save this email for your records.`
    };
    
    // 2. Send auto-confirmation to customer
    const customerConfirmationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;"> Message Received Successfully</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for contacting VayAccess</p>
          </div>
          
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">Dear <strong>${name}</strong>,</p>
            
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>
            
            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 15px 0; font-size: 16px;"> Your Message Summary</h3>
              <div style="background: white; padding: 15px; border-radius: 6px;">
                <p style="margin: 0; color: #6b7280; font-style: italic;">"${message.length > 200 ? message.substring(0, 200) + '...' : message}"</p>
              </div>
            </div>
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 25px; margin: 25px 0;">
              <h3 style="color: #059669; margin: 0 0 15px 0; font-size: 18px;"> What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="color: #d97706; margin: 0 0 10px 0; font-size: 16px;"> Need Immediate Assistance?</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <a href="tel:+917207244344" style="background: #2563eb; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> +91 720 724 4344</a>
                <a href="https://wa.me/917207244344" style="background: #10b981; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> WhatsApp</a>
                <a href="mailto:info@vayaccess.com" style="background: #6b7280; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;"> Email</a>
              </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                 Visit Our Website
              </a>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
              <p><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 15px 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
                This is an automated confirmation. Please save this email for your records.
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
Dear ${name},

Thank you for contacting VayAccess regarding your parking solution requirements.

YOUR MESSAGE:
"${message}"

WHAT HAPPENS NEXT:
• Quick Response: Our technical specialists will respond within 2 hours during business hours
• Detailed Analysis: We'll review your requirements and provide customized recommendations  
• Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

NEED IMMEDIATE ASSISTANCE?
Phone: +91 70137 99462
WhatsApp: +91 70137 99462
Email: info@vayaccess.com

BUSINESS HOURS:
Monday - Friday: 9:00 AM - 6:00 PM IST

Best regards,
VayAccess Support Team

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Website: https://vayaccess.com
      `
    };
    
    // Send both emails
    console.log(' Sending admin notification...');
    await transporter.sendMail(adminNotificationEmail);
    console.log(' Admin notification sent successfully');
    
    console.log(' Sending customer confirmation...');
    await transporter.sendMail(customerConfirmationEmail);
    console.log(' Customer confirmation sent successfully');
    
    res.json({
      success: true,
      message: 'Thank you for your inquiry! We have received your message and sent a confirmation to your email. Our team will respond within 2 hours during business hours.'
    });
    
  } catch (error) {
    console.error(' Contact form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    });
  }
});

// =============================================================================
// AI CALL AGENT API ENDPOINTS
// =============================================================================

// Initialize AI call session
app.post('/api/ai-call/initialize', async (req, res) => {
  try {
    const { customerPhone, customerName } = req.body;
    
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Customer phone number is required'
      });
    }
    
    console.log(` Initializing AI call for ${customerPhone}`);
    const result = await voiceAIService.initializeCall(customerPhone, customerName);
    
    if (result.success) {
      // Notify admin dashboard of new call
      io.emit('new-call-initialized', {
        sessionId: result.sessionId,
        customerPhone,
        customerName,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error initializing AI call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize AI call session'
    });
  }
});

// Process voice input and get AI response
app.post('/api/ai-call/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Message and session ID are required'
      });
    }
    
    console.log(` Processing chat for session ${sessionId}: "${message}"`);
    const result = await voiceAIService.generateAIResponse(message, sessionId);
    
    // Broadcast conversation update to admin dashboard
    io.emit('call-conversation-update', {
      sessionId,
      customerMessage: message,
      aiResponse: result.response,
      timestamp: new Date()
    });
    
    res.json(result);
  } catch (error) {
    console.error(' Error processing AI chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process conversation'
    });
  }
});

// Convert speech to text
app.post('/api/ai-call/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!req.file || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Audio file and session ID are required'
      });
    }
    
    console.log(` Processing speech-to-text for session ${sessionId}`);
    const audioBuffer = require('fs').readFileSync(req.file.path);
    const result = await voiceAIService.speechToText(audioBuffer, sessionId);
    
    // Clean up uploaded file
    require('fs').unlinkSync(req.file.path);
    
    res.json(result);
  } catch (error) {
    console.error(' Error in speech-to-text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process speech'
    });
  }
});

// Convert text to speech
app.post('/api/ai-call/text-to-speech', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Text and session ID are required'
      });
    }
    
    console.log(` Converting text to speech for session ${sessionId}`);
    const result = await voiceAIService.textToSpeech(text, sessionId);
    
    if (result.success) {
      // Send audio file path for client to download
      res.json({
        ...result,
        audioUrl: `/api/ai-call/audio/${result.audioFile}`
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error(' Error in text-to-speech:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate speech'
    });
  }
});

// Serve generated audio files
app.get('/api/ai-call/audio/:filename', (req, res) => {
  try {
    const audioPath = require('path').join(__dirname, 'recordings/tts/', req.params.filename);
    res.sendFile(audioPath);
  } catch (error) {
    console.error(' Error serving audio file:', error);
    res.status(404).json({ success: false, message: 'Audio file not found' });
  }
});

// =============================================================================
// TWILIO VOICE CALL WEBHOOKS (For Real Phone Calls)
// =============================================================================

// Initial TwiML when call is answered
app.post('/api/ai-call/twiml/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(` Call answered for session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Welcome message
    const welcomeMessage = `Hello! This is the AI assistant from VayAccess Parking Solutions. Thank you for your interest in our smart parking systems. How can I help you with your parking solution needs today?`;
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, welcomeMessage);
    
    // Gather customer's voice input
    const gather = twiml.gather({
      speechTimeout: 3,
      speechModel: 'experimental_conversations',
      enhanced: true,
      input: 'speech',
      action: `/api/ai-call/voice-response/${sessionId}`,
      method: 'POST'
    });
    
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please tell me about your parking requirements.');
    
    // If no input, try again
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I did not hear anything. Please speak clearly about your parking needs.');
    
    twiml.redirect(`/api/ai-call/twiml/${sessionId}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error generating TwiML:', error);
    res.status(500).send('Error processing call');
  }
});

// Handle customer voice input and AI response
app.post('/api/ai-call/voice-response/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const customerSpeech = req.body.SpeechResult || '';
    const callSid = req.body.CallSid;
    
    console.log(` Customer said: "${customerSpeech}" in session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    if (!customerSpeech) {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I could not understand what you said. Let me connect you with our human specialist.');
      
      twiml.say({
        voice: 'alice', 
        language: 'en-US'
      }, 'Please call us directly at +91 720 724 4344 for immediate assistance. Thank you!');
      
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }
    
    // Generate AI response using the voice service
    const aiResponse = await voiceAIService.generateAIResponse(customerSpeech, sessionId);
    
    if (aiResponse.success) {
      // Broadcast conversation update to frontend
      io.emit('call-conversation-update', {
        sessionId,
        customerMessage: customerSpeech,
        aiResponse: aiResponse.response,
        timestamp: new Date()
      });
      
      // Say AI response
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, aiResponse.response);
      
      // Continue conversation - check if call should end
      if (aiResponse.response.toLowerCase().includes('goodbye') || 
          aiResponse.response.toLowerCase().includes('thank you for calling') ||
          aiResponse.response.toLowerCase().includes('have a great day')) {
        twiml.hangup();
      } else {
        // Continue gathering input
        const gather = twiml.gather({
          speechTimeout: 4,
          speechModel: 'experimental_conversations',
          enhanced: true,
          input: 'speech',
          action: `/api/ai-call/voice-response/${sessionId}`,
          method: 'POST'
        });
        
        gather.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Is there anything else I can help you with regarding parking solutions?');
        
        // Timeout fallback
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Thank you for calling VayAccess. Have a great day!');
        twiml.hangup();
      }
    } else {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I apologize, but I am having technical difficulties. Please call our office at +91 720 724 4344 for immediate assistance. Thank you!');
      twiml.hangup();
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error processing voice response:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am experiencing technical difficulties. Please call +91 720 724 4344 for support. Goodbye!');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle call status updates from Twilio
app.post('/api/ai-call/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const callStatus = req.body.CallStatus;
    const callSid = req.body.CallSid;
    
    console.log(` Call status update for session ${sessionId}: ${callStatus}`);
    
    // Broadcast status update to frontend
    io.emit('call-status-changed', {
      sessionId,
      callSid,
      status: callStatus,
      timestamp: new Date()
    });
    
    // Handle call completion
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      console.log(` Call ${callSid} ended with status: ${callStatus}`);
      
      // Save call recording and summary
      try {
        await voiceAIService.saveCallRecording(sessionId, callStatus);
      } catch (error) {
        console.error(' Error saving call recording:', error);
      }
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error(' Error handling call status:', error);
    res.status(500).send('Error processing status update');
  }
});

// End call session
app.post('/api/ai-call/end', async (req, res) => {
  try {
    const { sessionId, callDuration } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    console.log(` Ending call session ${sessionId}`);
    const result = await voiceAIService.endCall(sessionId, callDuration);
    
    if (result.success) {
      // Notify admin dashboard of call completion
      io.emit('call-ended', {
        sessionId,
        callData: result.callData,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error ending call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end call session'
    });
  }
});

// Get current call status
app.get('/api/ai-call/status', async (req, res) => {
  try {
    const status = voiceAIService.getCurrentCallStatus();
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error(' Error getting call status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call status'
    });
  }
});

// =============================================================================
// ADMIN DASHBOARD API ENDPOINTS
// =============================================================================

// Get all call recordings (Admin only)
app.get('/api/admin/call-recordings', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    console.log(' Admin fetching call recordings');
    const result = await voiceAIService.getCallRecordings();
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recordings'
    });
  }
});

// Get specific call recording (Admin only)
app.get('/api/admin/call-recording/:sessionId', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const { sessionId } = req.params;
    console.log(` Admin fetching call recording for session ${sessionId}`);
    
    const result = await voiceAIService.getCallRecording(sessionId);
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recording'
    });
  }
});

// Admin dashboard statistics
app.get('/api/admin/call-statistics', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    const stats = {
      totalCalls: recordings.recordings.length,
      todayCalls: recordings.recordings.filter(call => {
        const today = new Date().toDateString();
        return new Date(call.startTime).toDateString() === today;
      }).length,
      averageDuration: recordings.recordings.reduce((acc, call) => acc + (call.duration || 0), 0) / recordings.recordings.length || 0,
      callsThisWeek: recordings.recordings.filter(call => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(call.startTime) >= weekAgo;
      }).length
    };

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error(' Error generating call statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate statistics'
    });
  }
});

// Send AI call recordings to parking system admin dashboard
app.post('/api/admin/sync-call-recordings', async (req, res) => {
  try {
    console.log(' Syncing AI call recordings with parking system admin dashboard...');
    
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    // Send recordings to parking system admin dashboard
    const parkingSystemUrl = 'http://localhost:8080';
    
    try {
      const axios = require('axios');
      
      const syncResponse = await axios.post(`${parkingSystemUrl}/api/admin/ai-call-recordings`, {
        recordings: recordings.recordings,
        source: 'vayaccess-ai-agent',
        syncTime: new Date().toISOString()
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(' Successfully synced AI call recordings to parking system');
      
      res.json({
        success: true,
        message: 'AI call recordings synced successfully',
        recordingsSynced: recordings.recordings.length,
        parkingSystemResponse: syncResponse.data
      });

    } catch (syncError) {
      console.log(' Parking system not available for sync, continuing with local storage');
      
      res.json({
        success: true,
        message: 'Recordings available locally, parking system sync will retry automatically',
        recordingsSynced: recordings.recordings.length,
        localRecordings: recordings.recordings
      });
    }

  } catch (error) {
    console.error(' Error syncing call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync call recordings'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test email endpoint (for development)
app.post('/api/test-email', async (req, res) => {
  try {
    const testEmail = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: 'VayAccess Email Service Test',
      html: '<h1>Email service is working!</h1><p>This is a test email from your VayAccess backend.</p>'
    };
    
    await transporter.sendMail(testEmail);
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Newsletter subscription endpoint (MongoDB-first, email optional)
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email, source = 'website' } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    // Persist to MongoDB if available; otherwise, skip persistence gracefully
    try {
      if (mongoDb) {
        const normalized = String(email).trim().toLowerCase();
        const now = new Date();
        const col = mongoDb.collection('subscribers');
        const existing = await col.findOne({ email: normalized });
        if (existing && existing.active !== false) {
          return res.json({ success: true, message: 'You are already subscribed. You will receive live news daily from VayAccess.' });
        }

        await col.updateOne(
          { email: normalized },
          {
            $setOnInsert: { createdAt: now, prefs: { products: true, solutions: true, marketing: true } },
            $set: { email: normalized, source, active: true, updatedAt: now },
          },
          { upsert: true }
        );
        // Ensure default prefs exist on existing records
        await col.updateOne(
          { email: normalized, $or: [ { prefs: { $exists: false } }, { prefs: null } ] },
          { $set: { 'prefs.products': true, 'prefs.solutions': true, 'prefs.marketing': true } }
        );
      } else {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
      }
    } catch (persistErr) {
      console.warn('Failed to persist subscriber to MongoDB (continuing):', persistErr?.message || persistErr);
    }

    // Optional welcome email; do not fail if SMTP is missing
    try {
      await emailHelper.sendCategorizedEmail({
        category: 'newsletter_welcome',
        to: String(email).trim().toLowerCase(),
        subject: 'Welcome to VayAccess Newsletter',
        html: withFooter(`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                 <h2 style="margin:0 0 12px 0;">Welcome to VayAccess Newsletter</h2>
                 <p style="color:#374151;line-height:1.6;">You will receive product news, articles, and live updates.</p>
                 <p style="margin-top:16px;"><a href="https://vayaccess.com" style="color:#2563eb;text-decoration:none;">Visit website</a></p>
               </div>`),
        text: 'Welcome to VayAccess Newsletter\nYou will receive product news, articles, and live updates.',
        meta: { source },
        headers: buildUnsubscribeHeaders(email),
        dedupeKey: `welcome:${String(email).trim().toLowerCase()}`
      });
    } catch (emailErr) {
      console.warn('Welcome email failed (continuing):', emailErr?.message || emailErr);
    }

    // Conditionally send present products/solutions digest immediately
    try {
      if (process.env.SEND_DIGEST_ON_SUBSCRIBE === 'true') {
        const snapshot = getContentSnapshot();
        await sendDigestToEmail(String(email).trim().toLowerCase(), snapshot);
      }
    } catch (e) {
      console.warn('Failed to send initial digest (continuing):', e?.message || e);
    }

    // Optional: send a marketing promo immediately on subscribe
    try {
      if ((process.env.SEND_MARKETING_ON_SUBSCRIBE || 'true').toLowerCase() !== 'false') {
        await emailHelper.sendCategorizedEmail({
          category: 'marketing',
          to: String(email).trim().toLowerCase(),
          subject: 'VayAccess — Transform Your Parking with Smart Access',
          html: withFooter(`<div style='font-family:Arial,sans-serif;max-width:700px;margin:0 auto;'>
  <h2 style='margin:0 0 10px 0;color:#111827;'>Welcome to VayAccess</h2>
  <p style='color:#374151;line-height:1.6;margin:0 0 10px 0;'>Explore ANPR vehicle access, robust barrier gates, turnstiles, and real-time management.</p>
  <p style='margin-top:12px;'>
    <a href='https://vayaccess.com/products' style='background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;'>Explore Products</a>
    <span style='margin-left:12px;'><a href='https://vayaccess.com/solutions' style='color:#2563eb;text-decoration:none;'>View Solutions</a></span>
  </p>
</div>`),
          text: 'Explore VayAccess products and solutions: https://vayaccess.com',
          headers: buildUnsubscribeHeaders(email),
          dedupeKey: `marketing-on-subscribe:${String(email).trim().toLowerCase()}`,
          meta: { source, onSubscribe: true },
        });
      }
    } catch (marketingErr) {
      console.warn('Marketing email on subscribe failed (continuing):', marketingErr?.message || marketingErr);
    }

    return res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    console.error('Subscribe failed:', error);
    return res.status(500).json({ success: false, message: 'Subscription failed' });
  }
});

// Simple secured endpoint to send an update email to a recipient
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: to, subject, and html or text' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent.' });
  } catch (error) {
    console.error('Send update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// Broadcast to all subscribers (MongoDB)
app.post('/api/newsletter/broadcast', async (req, res) => {
  try {
    // security
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) {
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    const { subject, html, text, dryRun = false, onlyActive = true, category = 'marketing' } = req.body || {};
    if (!subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: subject and html or text' });
    }

    // fetch subscribers from MongoDB
    const filter = onlyActive ? { active: { $ne: false } } : {};
    const subsCursor = mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray())
      .map(d => d.email)
      .filter(e => /.+@.+\..+/.test(e));

    if (emails.length === 0) {
      return res.json({ success: true, message: 'No subscribers to send', count: 0, emails: [] });
    }

    if (dryRun) {
      return res.json({ success: true, message: 'Dry run: would send to these emails', count: emails.length, emails });
    }

    // send in sequence (simple). For large lists, batch/queue.
    let ok = 0, fail = 0;
    for (const to of emails) {
      try {
        await emailHelper.sendCategorizedEmail({
          category,
          to,
          subject,
          html: withFooter(html || ''),
          text: text || undefined,
          headers: buildUnsubscribeHeaders(to),
          dedupeKey: `broadcast:${category}:${subject}:${String(to).toLowerCase()}`,
          meta: { broadcast: true },
        });
        ok++;
      } catch (e) {
        fail++;
      }
    }

    return res.json({ success: true, message: 'Broadcast completed', category, sent: ok, failed: fail, count: emails.length });
  } catch (error) {
    console.error('Broadcast failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to broadcast' });
  }
});

// Push token registration (MongoDB) — dev-safe fallback
app.post('/api/push/register', async (req, res) => {
  try {
    const { token, email } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'Missing token' });

    // If MongoDB is unavailable and dev fallback enabled, no-op to avoid UX break
    if (!mongoDb) {
      if (process.env.ALLOW_DEV_NO_DB === 'true') {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
        return res.json({ success: true, message: 'Token accepted (no DB in dev)' });
      }
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    await mongoDb.collection('pushTokens').updateOne(
      { token },
      {
        $set: {
          token,
          email: email || null,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Token registered' });
  } catch (e) {
    console.error('Register push token failed:', e);
    return res.status(500).json({ success: false, message: 'Failed to register token' });
  }
});

// --- Helpers for FCM HTTP v1 (web push) ---
const { google } = require('googleapis');
const fetch = require('node-fetch');
let FB_PROJECT_ID = process.env.FB_PROJECT_ID;
try {
  if (!FB_PROJECT_ID) {
    const svc = require('./service-account.json');
    FB_PROJECT_ID = svc.project_id;
  }
} catch (_) {}

async function getFcmAccessToken() {
  const key = require('./service-account.json');
  const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

async function sendFcmMessage(token, title, body, link) {
  if (!FB_PROJECT_ID) throw new Error('Missing FB_PROJECT_ID or service-account project_id');
  const accessToken = await getFcmAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${FB_PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token,
      notification: { title, body },
      webpush: {
        fcm_options: { link: link || '/' },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM error: ${txt}`);
  }
  return res.json();
}

// Publish update: save to MongoDB and auto-send email + push
app.post('/api/updates/publish', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { title, body, link = '/', previewOnly = false } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });

    // Save announcement to MongoDB
    const insertRes = await mongoDb.collection('announcements').insertOne({
      title,
      body,
      link,
      createdAt: new Date(),
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    if (previewOnly) {
      return res.json({ success: true, message: 'Preview only', id: insertRes.insertedId, emailsCount: emails.length, tokensCount: tokens.length });
    }

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    return res.json({ success: true, id: insertRes.insertedId, emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Publish update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to publish update' });
  }
});

// Auto-publish endpoint: idempotent broadcast by version (no separate admin UI needed)
app.post('/api/updates/auto-publish', async (req, res) => {
    console.log('Received auto-publish request:', req.body); // Log the request body
  try {
    // Optional security with token
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { version, title, body, link = '/' } = req.body || {};
    if (!version || !title || !body) return res.status(400).json({ success: false, message: 'Missing version, title or body' });

    const versionId = String(version).trim();

    // Skip if already sent for this version
    const already = await mongoDb.collection('announcements_sent').findOne({ version: versionId });
    if (already) {
      return res.json({ success: true, message: 'Already sent for this version' });
    }

    // Save announcement entry (optional)
    const annInsert = await mongoDb.collection('announcements').insertOne({
      version: versionId,
      title,
      body,
      link,
      createdAt: new Date(),
      auto: true,
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    // Mark version as sent
    await mongoDb.collection('announcements_sent').updateOne(
      { version: versionId },
      {
        $set: {
          version: versionId,
          title,
          body,
          link,
          sentAt: new Date(),
          announcementId: annInsert.insertedId,
        }
      },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Auto-publish sent', emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Auto-publish failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to auto-publish' });
  }
});





// Admin: send a single update email (manual)
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing to/subject/body' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    console.error('Manual send failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});


// --- Hourly Digest Scheduler ---
const ENABLE_HOURLY_DIGEST = (process.env.ENABLE_HOURLY_DIGEST || 'false').toLowerCase() === 'true';
const DIGEST_CATEGORY = process.env.DIGEST_CATEGORY || 'content_digest';
const DIGEST_EMAIL = (process.env.DIGEST_EMAIL || 'true').toLowerCase() === 'true';
const DIGEST_PUSH = (process.env.DIGEST_PUSH || 'true').toLowerCase() === 'true';
const DIGEST_DEDUPE_WINDOW_MIN = parseInt(process.env.DIGEST_DEDUPE_WINDOW_MINUTES || '60', 10);

async function sendHourlyDigestOnce() {
  try {
    if (!mongoDb) {
      console.warn('[digest] Skipped: MongoDB not initialized');
      return;
    }

    // Snapshot current site content
    const snapshot = getContentSnapshot();
    // Rotate templates by hour to guarantee variation across sends
    const tpl = pickRotatingTemplate();

    // Dedupe: prevent re-sending same template within the window (optional)
    const now = new Date();
    const since = new Date(now.getTime() - DIGEST_DEDUPE_WINDOW_MIN * 60 * 1000);
    const recentKey = `digest:${tpl.key}:${snapshot.hash}`;
    const alreadySent = await mongoDb.collection('email_events').findOne({
      dedupeKey: { $regex: `^${recentKey}:` }, // per recipient entry saved below
      createdAt: { $gte: since },
      result: 'sent',
    });
    if (alreadySent) {
      console.log('[digest] Recently sent this template+hash. Skipping to avoid repetition.');
      return;
    }

    // Fetch subscribers
    const subs = await mongoDb.collection('subscribers')
      .find({ active: { $ne: false } }, { projection: { email: 1 } })
      .toArray();
    const emails = subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e));

    // Fetch push tokens
    const tokens = DIGEST_PUSH
      ? (await mongoDb.collection('pushTokens')
          .find({ active: { $ne: false } }, { projection: { token: 1 } })
          .toArray()).map(d => d.token)
      : [];

    // Send email
    if (DIGEST_EMAIL && emails.length) {
      let sent = 0, fail = 0;
      for (const to of emails) {
        try {
          await emailHelper.sendCategorizedEmail({
            category: DIGEST_CATEGORY,
            to,
            subject: tpl.subject(snapshot),
            html: tpl.buildHtml(snapshot),
            text: tpl.buildText(snapshot),
            headers: buildUnsubscribeHeaders(to),
            dedupeKey: `digest:${tpl.key}:${snapshot.hash}:${String(to).toLowerCase()}`,
            meta: { template: tpl.key }
          });
          sent++;
        } catch (_) { fail++; }
      }
      console.log(`[digest] Email done: sent=${sent} fail=${fail}`);
    }

    // Push notifications
    if (DIGEST_PUSH && tokens.length) {
      let ok = 0, fail = 0;
      for (const t of tokens) {
        try { await sendFcmMessage(t, tpl.subject(snapshot), 'See the latest products and solutions', '/products'); ok++; } catch (_) { fail++; }
      }
      console.log(`[digest] Push done: sent=${ok} fail=${fail}`);
    }

  } catch (e) {
    console.error('[digest] Hourly digest failed:', e?.message || e);
  }
} // Make dedupe per-recipient

if (ENABLE_HOURLY_DIGEST) {
  // Fire soon after boot, then every hour
  setTimeout(sendHourlyDigestOnce, 15 * 1000);
  setInterval(sendHourlyDigestOnce, 60 * 60 * 1000);
}

