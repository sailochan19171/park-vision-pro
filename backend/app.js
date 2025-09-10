// backend/app.js
// Minimal Express server entry to avoid corrupted server.js

const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Health checks
app.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy', service: 'vayaccess-backend', time: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy', service: 'vayaccess-backend', time: new Date().toISOString() });
});

// Routes
try {
  const demoRoutes = require(path.resolve(__dirname, 'routes', 'demo.js'));
  app.use('/api', demoRoutes);
} catch (err) {
  console.warn('Warning: demo routes could not be loaded:', err.message);
}

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

const PORT = Number(process.env.PORT) || 4001;
app.listen(PORT, () => {
  console.log(` Server running on http://localhost:${PORT}`);
});
