require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const axios = require('axios');
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
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:8000',
      'http://localhost:4173',
      'https://vayaccess.com',
      'https://www.vayaccess.com'
    ],
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
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://localhost:4173',
    'https://vayaccess.com',
    'https://www.vayaccess.com'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token'],
  credentials: false
}));

// Handle CORS preflight
app.options('*', cors());
app.use(express.json());

// Serve assets with stable URLs for emails and previews
app.use('/assets', express.static(path.resolve(__dirname, '../src/assets')));

// Demo routes (FREE - no Twilio needed)
const demoRoutes = require('./routes/demo');
app.use('/api', demoRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', mongo: !!mongoDb });
});

// Root OK route for uptime checks
app.get('/', (req, res) => {
  res.status(200).send('OK');
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
    const result = await mongoDb.collection('subscribers').updateOne(
      { email: em },
      { $setOnInsert: { createdAt: now, subscribedAt: now }, $set: { name: n, frequency: freq, active: true, updatedAt: now } },
      { upsert: true }
    );

    // If newly inserted, send a welcome email. If already exists, return a friendly message.
    if (result && (result.upsertedCount || (result.upsertedId ? 1 : 0))) {
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
      return res.json({ success:true, message:`Subscribed! You'll receive ${freq} live updates.` });
    }

    // Existing subscriber: confirm and avoid duplicate welcome
    return res.json({ success:true, message:`You're already subscribed. You'll receive ${freq} live updates with the latest products and solutions.` });
  } catch (e) {
    return res.status(500).json({ success:false, message: e?.message || 'Server error' });
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

// Articles: create & list
app.post('/api/articles', async (req, res) => {
  try {
    const { title, summary, content, tags, image, link } = req.body || {};
    if (!title || !summary) return res.status(400).json({ success:false, message:'Missing title/summary' });
    if (!mongoDb) return res.status(503).json({ success:false, message:'DB not ready' });
    const doc = {
      title: String(title),
      summary: String(summary),
      content: String(content||''),
      tags: Array.isArray(tags)? tags.map(String):[],
      // Optional rich fields used in digests
      image: image ? String(image) : undefined,
      link: link ? String(link) : undefined,
      createdAt: new Date()
    };
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

// Email configuration with Resend (preferred) or SMTP fallback
let transporter;
let mailProvider = 'none';
let smtpReady = false;
let smtpError = null;



// Resend transport using HTTP API
function createResendTransport(apiKey) {
  const httpClient = axios.create({
    baseURL: 'https://api.resend.com',
    timeout: Number(process.env.RESEND_TIMEOUT || 20000),
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });

  return {
    sendMail: async (opts) => {
      const toList = Array.isArray(opts.to) ? opts.to : [opts.to];
      const from = opts.from; // e.g., "Name <email@domain>"

      // Build attachments compatible with Resend API
      let attachments = [];
      if (Array.isArray(opts.attachments) && opts.attachments.length) {
        attachments = await Promise.all(opts.attachments.map(async (att) => {
          try {
            // If path provided, read and base64 encode
            if (att.path && fs.existsSync(att.path)) {
              const buf = fs.readFileSync(att.path);
              return { filename: att.filename || path.basename(att.path), content: buf.toString('base64') };
            }
            // If content provided as Buffer/string
            if (att.content) {
              const buf = Buffer.isBuffer(att.content) ? att.content : Buffer.from(String(att.content));
              return { filename: att.filename || 'attachment', content: buf.toString('base64') };
            }
          } catch (_) { /* skip invalid attachment */ }
          return null;
        }));
        attachments = attachments.filter(Boolean);
      }

      const payload = {
        from,
        to: toList,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        headers: opts.headers || {},
        attachments: attachments.length ? attachments : undefined,
      };

      const resp = await httpClient.post('/emails', payload);
      if (!resp || resp.status >= 300) {
        throw new Error(`Resend send failed: status ${resp?.status}`);
      }
      return { accepted: toList, response: 'sent-via-resend', id: resp.data?.id };
    },
  };
}

if (process.env.RESEND_API_KEY) {
  transporter = createResendTransport(process.env.RESEND_API_KEY);
  mailProvider = 'resend';
  smtpReady = true;
  smtpError = null;
  console.log(' Email provider: Resend');
} else if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false otherwise
    requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
    connectionTimeout: Number(process.env.SMTP_CONN_TIMEOUT || 15000),
    greetingTimeout: Number(process.env.SMTP_GREET_TIMEOUT || 15000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 20000),
    auth: {
      user: process.env.SMTP_USER, // info@vayaccess.com
      pass: process.env.SMTP_PASS  // App-specific password
    },
    tls: {
      // Use TLSv1.2+ to avoid old OpenSSL issues on Windows
      minVersion: process.env.SMTP_MIN_TLS || 'TLSv1.2',
      servername: process.env.SMTP_HOST || 'smtp.gmail.com',
      // Allow disabling strict cert verification via env for local testing behind intercepting proxies/AV
      rejectUnauthorized: (process.env.SMTP_TLS_REJECT_UNAUTH === 'false') ? false : true,
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
  mailProvider = 'smtp';
} else {
  // Fallback to JSON transport: no actual provider connection; prevents runtime errors
  transporter = nodemailer.createTransport({ jsonTransport: true });
  smtpReady = false;
  smtpError = 'No Resend key, Postmark token, or SMTP credentials (jsonTransport)';
  console.log(' Email disabled: missing RESEND_API_KEY/POSTMARK_TOKEN and SMTP_USER/SMTP_PASS (using jsonTransport)');
}

// Email provider status endpoint
app.get('/api/admin/smtp-status', (req, res) => {
  res.json({
    provider: mailProvider,
    ready: smtpReady,
    error: smtpError,
    user: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || null,
    host: mailProvider === 'smtp' ? (process.env.SMTP_HOST || 'smtp.gmail.com') : mailProvider,
  });
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
  const productsList = products.map(p => `<li>${p}</li>`).join('');
  const solutionsList = solutions.map(s => `<li>${s}</li>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
      <h2 style="margin:0 0 12px 0;">VayAccess Products & Solutions</h2>
      <p style="color:#374151;line-height:1.6;">Here are our current offerings. You will also receive future updates automatically.</p>
      <div style="margin:16px 0;">
        <h3 style="margin:8px 0;">Products</h3>
        <ul style="padding-left:18px;color:#374151;">${productsList || '<li>See all on our website</li>'}</ul>
      </div>
      <div style="margin:16px 0;">
        <h3 style="margin:8px 0;">Solutions</h3>
        <ul style="padding-left:18px;color:#374151;">${solutionsList || '<li>See all on our website</li>'}</ul>
      </div>
      <p style="margin-top:18px;"><a href="https://vayaccess.com/products" style="color:#2563eb;text-decoration:none;">View all products</a> • <a href="https://vayaccess.com/solutions" style="color:#2563eb;text-decoration:none;">View all solutions</a></p>
    </div>
  `;
}

function buildDigestText(snapshot) {
  const { products, solutions } = snapshot;
  return [
    'VayAccess Products & Solutions',
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

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://vayaccess-59fdd.web.app';
// Base for serving raw assets in emails. Prefer backend/API origin if set, else fall back.
const ASSETS_BASE_URL = process.env.ASSETS_BASE_URL || process.env.BACKEND_PUBLIC_URL || PUBLIC_BASE_URL;
// Use admin token for signing unsubscribe tokens (fallback to legacy secret if present)
const NEWSLETTER_SECRET = process.env.NEWSLETTER_ADMIN_TOKEN || process.env.NEWSLETTER_SECRET || 'change-me';

function signUnsubToken(email) {
  return crypto.createHmac('sha256', NEWSLETTER_SECRET).update(String(email).toLowerCase()).digest('hex');
}

function buildUnsubscribeHeaders(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  const t = signUnsubToken(email);
  const httpUrl = `${PUBLIC_BASE_URL}/api/newsletter/unsubscribe?e=${e}&t=${t}`;
  const mailto = `mailto:${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || 'no-reply@vayaccess.com'}?subject=unsubscribe`;
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

// --- Hourly digest templates (random rotation) ---
const DIGEST_TEMPLATES = [
  {
    key: 'p1',
    subject: () => 'VayAccess Hourly Update: Products you may like',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <h2 style="margin:0 0 10px 0;">Popular Products</h2>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 's1',
    subject: () => 'VayAccess Hourly Update: Solutions spotlight',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <h2 style="margin:0 0 10px 0;">Featured Solutions</h2>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
  {
    key: 'm1',
    subject: () => 'VayAccess Hourly Update',
    buildHtml: (snapshot) => withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <h2 style="margin:0 0 10px 0;">Latest from VayAccess</h2>
        ${buildDigestHtml(snapshot)}
      </div>`),
    buildText: (snapshot) => buildDigestText(snapshot),
  },
];

function pickRandomTemplate() {
  return DIGEST_TEMPLATES[Math.floor(Math.random() * DIGEST_TEMPLATES.length)];
}

function pickRotatingTemplate(offset = 0) {
  // Deterministic hourly rotation to avoid repetition
  const hourIndex = Math.floor(Date.now() / (60 * 60 * 1000));
  const idx = (hourIndex + (offset || 0)) % DIGEST_TEMPLATES.length;
  return DIGEST_TEMPLATES[idx];
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
    return `${ASSETS_BASE_URL}/assets/${file}`;
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
  // Parse imports to resolve image variables to filenames
  const imports = parseImportsMap(content);
  const placeholder = `${ASSETS_BASE_URL}/assets/parking-system-architecture.jpg`;
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
    const imageVar = (obj.match(/image:\s*(\w+)/) || [])[1];
    let image = placeholder;
    if (imageVar && imports[imageVar]) {
      image = toAssetUrl(imports[imageVar]) || placeholder;
    }
    if (title) items.push({ type: 'solution', title, description: (desc || '').trim(), image });
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
  const list = products.map(a => {
    const url = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/ai/learn-more?type=product&title=${encodeURIComponent(a.title)}&desc=${encodeURIComponent(a.description || '')}${a.image ? `&image=${encodeURIComponent(a.image)}` : ''}`;
    return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
      <p style="margin-top:8px;"><a href="${url}" style="color:#2563eb;text-decoration:none;">Learn more </a></p>
    </div>`;
  }).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Product Highlights</h2>
      ${list || '<p>No products today.</p>'}
    </div>`;
}

function buildSolutionsDigestHtml(solutions) {
  const list = solutions.map(a => {
    const url = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/ai/learn-more?type=solution&title=${encodeURIComponent(a.title)}&desc=${encodeURIComponent(a.description || '')}${a.image ? `&image=${encodeURIComponent(a.image)}` : ''}`;
    return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:14px 0;background:#ffffff;">
      ${a.image ? `<img src="${a.image}" alt="${a.title}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:10px;" />` : ''}
      <h3 style="margin:0 0 8px 0;color:#111827;">${a.title}</h3>
      <p style="margin:0;color:#374151;line-height:1.6;">${a.description || ''}</p>
      <p style="margin-top:8px;"><a href="${url}" style="color:#2563eb;text-decoration:none;">Learn more </a></p>
    </div>`;
  }).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;padding:12px;">
      <h2 style="margin:8px 0 12px 0;">VayAccess Solutions Spotlight</h2>
      ${list || '<p>No solutions today.</p>'}
    </div>`;
}

// --- AI Learn More Endpoint ---
// Renders a simple HTML page that uses AI to expand on the item details when user clicks from email
app.get('/ai/learn-more', async (req, res) => {
  try {
    const type = String(req.query.type || 'item');
    const title = String(req.query.title || '');
    const desc = String(req.query.desc || '');
    const image = String(req.query.image || '');

    const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — VayAccess</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 0; background:#f9fafb; color:#111827; }
  .container { max-width: 860px; margin: 0 auto; padding: 18px; }
  .card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:18px; }
  .hero { display:flex; gap:16px; align-items:flex-start; }
  .hero img { max-width: 360px; width:100%; height:auto; border-radius:10px; }
  .title { margin:0 0 8px 0; font-size: 22px; font-weight: 700; }
  .subtitle { margin:0 0 16px 0; color:#374151; }
  .ai { margin-top:16px; padding-top:16px; border-top:1px solid #e5e7eb; }
  .muted { color:#6b7280; font-size: 12px; }
  .btn { background:#2563eb; color:#fff; text-decoration:none; padding:10px 14px; border-radius:8px; display:inline-block; }
</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="hero">
        ${image ? `<img src="${image}" alt="${title}" />` : ''}
        <div>
          <h1 class="title">${title}</h1>
          <p class="subtitle">${desc}</p>
          <p><a class="btn" href="/products">Browse all ${type === 'solution' ? 'solutions' : 'products'}</a></p>
        </div>
      </div>
      <div class="ai">
        <h3 style="margin:0 0 8px 0;">Detailed overview</h3>
        <div id="ai-content" class="subtitle">Generating detailed information...</div>
      </div>
      <p class="muted">This page uses AI to generate more details based on our product catalog and knowledge base.</p>
    </div>
  </div>
  <script>
    (async () => {
      try {
        const qs = new URLSearchParams({ title: '${'${title}'.replace(/'/g, "\\'")}', desc: '${'${desc}'.replace(/'/g, "\\'")}', type: '${'${type}'.replace(/'/g, "\\'")}' });
        const r = await fetch('/api/ai/expand-item?' + qs.toString());
        const j = await r.json();
        const el = document.getElementById('ai-content');
        el.textContent = j.success ? j.text : (j.message || 'Failed to load details.');
      } catch (e) {
        const el = document.getElementById('ai-content');
        el.textContent = 'Failed to load details.';
      }
    })();
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(page);
  } catch (e) {
    return res.status(500).send('Failed to render page');
  }
});

// Backend AI endpoint that expands a single item using existing knowledge base
app.get('/api/ai/expand-item', async (req, res) => {
  try {
    const OpenAI = require('openai');
    if (!process.env.OPENAI_API_KEY) {
      return res.json({ success: false, message: 'AI is not configured.' });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const type = String(req.query.type || 'item');
    const title = String(req.query.title || '').slice(0, 200);
    const desc = String(req.query.desc || '').slice(0, 1000);

    const system = `You are an expert copywriter for VayAccess, specializing in ${type}s.`;
    const user = `Write a concise, helpful overview for website visitors about: "${title}".\n\nBase description: ${desc}\n\nInclude:\n- Key benefits\n- Typical use-cases\n- Compatibility/integration notes\n- A short closing CTA`;

    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 280,
      temperature: 0.7,
    });

    const text = resp?.choices?.[0]?.message?.content || 'Details coming soon.';
    return res.json({ success: true, text });
  } catch (e) {
    return res.json({ success: false, message: e?.message || 'AI request failed' });
  }
});

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

// Send brochure to user via email and notify admin
app.post('/api/send-brochure', async (req, res) => {
  try {
    const { name, email, phone, countryCode, city } = req.body || {};
    const n = String(name || '').trim();
    const em = String(email || '').trim().toLowerCase();
    const ph = String(phone || '').trim();
    const cc = String(countryCode || '').trim();
    const cy = String(city || '').trim();

    if (!n || !/.+@.+\..+/.test(em) || !ph || !cy) {
      return res.status(400).json({ success: false, message: 'Please provide name, valid email, phone, and city.' });
    }

    // Build attachment path for brochure: prefer compressed, then original, then fallback
    const compressedPath = path.resolve(__dirname, '../public/Vay Gate_compressed.pdf');
    const originalPath = path.resolve(__dirname, '../public/Vay Gate.pdf');
    const fallbackPath = path.resolve(__dirname, '../public/vay-gate-brochure.pdf');
    let brochurePath = compressedPath;
    let brochureExists = false;
    let attachBrochure = false;
    try {
      if (!fs.existsSync(brochurePath)) {
        brochurePath = fs.existsSync(originalPath) ? originalPath : fallbackPath;
      }
      brochureExists = fs.existsSync(brochurePath);
      if (brochureExists) {
        const stat = fs.statSync(brochurePath);
        const maxAttachBytes = Number(process.env.BROCHURE_MAX_ATTACH_BYTES || 9 * 1024 * 1024); // 9MB safety limit
        attachBrochure = stat.size <= maxAttachBytes && (process.env.BROCHURE_ATTACH !== 'false');
      }
    } catch {
      brochureExists = false;
      attachBrochure = false;
    }

    const fromName = process.env.EMAIL_FROM_NAME || 'VayAccess';
    const fromEmail = process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || 'info@vayaccess.com';

    // Build a public URL that matches the selected file (spaces must be URL-encoded)
    const selectedPublicName = brochurePath.endsWith('Vay Gate_compressed.pdf')
      ? 'Vay%20Gate_compressed.pdf'
      : brochurePath.endsWith('Vay Gate.pdf')
        ? 'Vay%20Gate.pdf'
        : 'vay-gate-brochure.pdf';
    const brochureUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/${selectedPublicName}`;
    const customerHtml = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p>Hi ${n.split(' ')[0]},</p>
        <p>Thanks for your interest in VayAccess.</p>
        ${attachBrochure ? `<p>We've attached our brochure for your review.</p>` : `<p>You can download our brochure here: <a href="${brochureUrl}" style="color:#2563eb;">Download brochure</a></p>`}
        <p><strong>Details you provided:</strong><br/>
        Name: ${n}<br/>
        Email: ${em}<br/>
        Phone: ${cc ? cc + ' ' : ''}${ph}<br/>
        City: ${cy}</p>
        <p>Our team will contact you shortly.</p>
      </div>
    `);

    // Send to customer (attach only when size is safe)
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: em,
      subject: 'VayAccess Brochure',
      html: customerHtml,
      attachments: attachBrochure ? [
        { filename: path.basename(brochurePath), path: brochurePath, contentType: 'application/pdf', contentDisposition: 'attachment' }
      ] : []
    });

    // Notify admin with details
    const adminTo = (process.env.BROCHURE_ADMIN_EMAIL || 'info@vayaccess.com');
    const adminHtml = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p><strong>New brochure request</strong></p>
        <ul>
          <li>Name: ${n}</li>
          <li>Email: ${em}</li>
          <li>Phone: ${cc ? cc + ' ' : ''}${ph}</li>
          <li>City: ${cy}</li>
          <li>Timestamp: ${new Date().toISOString()}</li>
        </ul>
      </div>
    `);

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: adminTo,
      subject: 'New Brochure Request',
      html: adminHtml
    });

    return res.json({ success: true, message: 'Brochure sent successfully.' });
  } catch (e) {
    console.error('send-brochure error:', e);
    return res.status(500).json({ success: false, message: e?.message || 'Failed to send brochure' });
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
            // Make dedupe per-recipient
            dedupeKey: `${recentKey}:${String(to).toLowerCase()}`,
            meta: { hourly: true, template: tpl.key },
          });
          sent++;
        } catch (_) { fail++; }
      }
      console.log(`[digest] Email done: sent=${sent} fail=${fail}`);
    }

    // Send push
    if (DIGEST_PUSH && tokens.length) {
      let ok = 0, fail = 0;
      const pushTitle = 'VayAccess Update';
      const pushBody = 'Check the latest products and solutions.';
      const pushLink = '/';
      for (const t of tokens) {
        try {
          await sendFcmMessage(t, pushTitle, pushBody, pushLink);
          ok++;
        } catch (_) { fail++; }
      }
      console.log(`[digest] Push done: sent=${ok} fail=${fail}`);
    }

  } catch (e) {
    console.error('[digest] Failed:', e?.message || e);
  }
}

if (ENABLE_HOURLY_DIGEST) {
  // Fire soon after boot, then every hour
  setTimeout(sendHourlyDigestOnce, 15 * 1000);
  setInterval(sendHourlyDigestOnce, 60 * 60 * 1000);
  console.log('[digest] Hourly digest scheduler enabled');
}

// --- Frequency-based Article Digest (from articles collection) ---
async function sendArticleDigestFor(freq, since) {
  if (!mongoDb) return;
  const sinceDate = since instanceof Date ? since : new Date(since);
  const subs = await mongoDb.collection('subscribers').find({ active: { $ne: false }, frequency: freq }).toArray();
  if (!subs.length) return;
  const articles = await mongoDb.collection('articles').find({ createdAt: { $gte: sinceDate } }).sort({ createdAt: -1 }).limit(50).toArray();
  const items = articles.map(a => ({ title: a.title, summary: a.summary, image: a.image, link: a.link || '/news' }));

  for (const s of subs) {
    const headers = buildUnsubscribeHeaders(s.email);
    const name = s.name ? s.name.split(' ')[0] : 'there';
    const list = items.map(i => `
      <li style="display:flex;gap:12px;margin-bottom:14px;align-items:flex-start;">
        ${i.image ? `<img src="${i.image}" alt="${i.title}" width="72" height="72" style="border-radius:8px;object-fit:cover;border:1px solid #e5e7eb"/>` : ''}
        <div>
          <div style="font-weight:600;font-size:15px;color:#111827;">${i.title}</div>
          <div style="color:#4b5563;font-size:13px;line-height:1.5;margin-top:4px;">${i.summary || ''}</div>
          <a href="${PUBLIC_BASE_URL}${i.link}" style="color:#2563eb;font-size:13px;text-decoration:none;display:inline-block;margin-top:6px;">Read more </a>
        </div>
      </li>
    `).join('');
    const html = withFooter(`
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <p>Hi ${name},</p>
        <p>Here are the latest products & solutions for you:</p>
        <ul style="padding-left:0;list-style:none;margin:0;">${list || '<li>No new items.</li>'}</ul>
      </div>
    `);
    await emailHelper.sendCategorizedEmail({
      category: 'content_digest',
      to: s.email,
      subject: freq === 'hourly' ? 'Hourly Digest' : freq === 'daily' ? 'Daily Digest' : 'Weekly Newsletter',
      html,
      headers
    });
  }
}

const ENABLE_DIGEST_SCHEDULES = (process.env.ENABLE_DIGEST_SCHEDULES || 'true').toLowerCase() === 'true';
if (ENABLE_DIGEST_SCHEDULES) {
  setInterval(async () => {
    const now = new Date();
    // Hourly at minute 0
    if (now.getMinutes() === 0) {
      const since = new Date(now); since.setHours(now.getHours() - 1);
      await sendArticleDigestFor('hourly', since);
    }
    // Daily at 08:00
    if (now.getHours() === 8 && now.getMinutes() === 0) {
      const since = new Date(now); since.setDate(now.getDate() - 1);
      await sendArticleDigestFor('daily', since);
    }
    // Weekly Monday at 09:00
    if (now.getDay() === 1 && now.getHours() === 9 && now.getMinutes() === 0) {
      const since = new Date(now); since.setDate(now.getDate() - 7);
      await sendArticleDigestFor('weekly', since);
    }
  }, 60 * 1000);
  console.log('[digest] Frequency-based article digests enabled');
}

// --- Website Snapshot Category Digests by Subscriber Frequency (additive) ---
const ENABLE_WEBSITE_FREQUENCY_DIGESTS = (process.env.ENABLE_WEBSITE_FREQUENCY_DIGESTS || 'true').toLowerCase() === 'true';

function pad2(n) { return String(n).padStart(2, '0'); }
function weekOfYear(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
function freqWindowKey(freq, d = new Date()) {
  if (freq === 'hourly') return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}-${pad2(d.getHours())}`;
  if (freq === 'daily') return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  if (freq === 'weekly') return `${d.getFullYear()}-W${pad2(weekOfYear(d))}`;
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

async function sendWebsiteSnapshotCategoryDigestsFor(freq) {
  try {
    if (!mongoDb) return;
    const subs = await mongoDb.collection('subscribers')
      .find({ active: { $ne: false }, frequency: freq }, { projection: { email: 1 } })
      .toArray();
    if (!subs.length) return;

    const { products, solutions } = getArticlesSnapshot();
    const emails = subs.map(s => String(s.email || '').toLowerCase()).filter(e => /.+@.+\..+/.test(e));
    const key = freqWindowKey(freq);

    for (const to of emails) {
      const headers = buildUnsubscribeHeaders(to);

      if (products?.length) {
        try {
          await emailHelper.sendCategorizedEmail({
            category: 'content_digest_products',
            to,
            subject: (freq === 'hourly') ? 'Hourly — Products' : (freq === 'daily') ? 'Daily — Product Highlights' : 'Weekly — Product Highlights',
            html: withFooter(buildProductsDigestHtml(products)),
            text: products.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
            headers,
            dedupeKey: `websnap:products:${freq}:${key}:${to}`,
            meta: { source: 'website_snapshot', freq },
          });
        } catch (_) { /* continue other recipients/categories */ }
      }

      if (solutions?.length) {
        try {
          await emailHelper.sendCategorizedEmail({
            category: 'content_digest_solutions',
            to,
            subject: (freq === 'hourly') ? 'Hourly — Solutions' : (freq === 'daily') ? 'Daily — Solutions Spotlight' : 'Weekly — Solutions Spotlight',
            html: withFooter(buildSolutionsDigestHtml(solutions)),
            text: solutions.map(a => `${a.title}\n${a.description || ''}`).join('\n\n'),
            headers,
            dedupeKey: `websnap:solutions:${freq}:${key}:${to}`,
            meta: { source: 'website_snapshot', freq },
          });
        } catch (_) { /* continue */ }
      }
    }
  } catch (e) {
    console.warn('[website-frequency-digest] Failed:', e?.message || e);
  }
}

if (ENABLE_WEBSITE_FREQUENCY_DIGESTS) {
  setInterval(async () => {
    const now = new Date();
    try {
      if (now.getMinutes() === 0) {
        await sendWebsiteSnapshotCategoryDigestsFor('hourly');
      }
      if (now.getHours() === 8 && now.getMinutes() === 0) {
        await sendWebsiteSnapshotCategoryDigestsFor('daily');
      }
      if (now.getDay() === 1 && now.getHours() === 9 && now.getMinutes() === 0) {
        await sendWebsiteSnapshotCategoryDigestsFor('weekly');
      }
    } catch (_) { /* ignore */ }
  }, 60 * 1000);
  console.log('[digest] Website category digests (by frequency) enabled');
}

// Start the HTTP server (guard to avoid double-listen when imported or re-evaluated)
if (require.main === module) {
  if (!server.listening) {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
}
