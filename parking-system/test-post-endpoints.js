require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Import routes
const authRoutes = require('./routes/auth');
const parkingRoutes = require('./routes/parking');
const vehicleRoutes = require('./routes/vehicle');
const adminRoutes = require('./routes/admin');

// Import middleware
const { errorHandler } = require('./middlewares/errorHandler');
const { logger } = require('./middlewares/logger');

const app = express();
const PORT = 3001; // Use different port for testing

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(cors({
  origin: "*",
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(logger);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/parking', parkingRoutes);
app.use('/api/vehicle', vehicleRoutes);
app.use('/api/admin', adminRoutes);

// Test endpoint to verify server is working
app.post('/api/test', (req, res) => {
  console.log('📝 Test POST request received:', req.body);
  res.json({
    success: true,
    message: 'Test POST endpoint working',
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Test Server running on http://localhost:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('  GET  /api/health');
  console.log('  POST /api/test');
  console.log('  POST /api/auth/register');
  console.log('  POST /api/auth/login');
  console.log('  POST /api/parking/spots (requires auth)');
  console.log('  POST /api/vehicle/register (requires auth)');
  console.log('');
  console.log('🧪 Test with curl:');
  console.log(`  curl -X POST http://localhost:${PORT}/api/test -H "Content-Type: application/json" -d "{\\"test\\": \\"data\\"}"`);
  console.log(`  curl -X POST http://localhost:${PORT}/api/auth/register -H "Content-Type: application/json" -d "{\\"name\\": \\"John Doe\\", \\"email\\": \\"john@test.com\\", \\"password\\": \\"Password123\\", \\"phone\\": \\"+1234567890\\"}"`);
});

module.exports = app;