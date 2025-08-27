/**
 * Main API Server
 * Port: 3000
 * Handles all API endpoints for authentication, parking management, etc.
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import routes
const authRoutes = require('./routes/auth');
const parkingRoutes = require('./routes/parking');
const vehicleRoutes = require('./routes/vehicle');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

// Import middleware
const { errorHandler } = require('./middlewares/errorHandler');
const { logger } = require('./middlewares/logger');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      `http://localhost:${process.env.ADMIN_PORT}`, 
      `http://localhost:${process.env.USER_PORT}`,
      "http://localhost:5173", // Vite dev server
      "http://localhost:8000", // Vite frontend (current)
      "http://localhost:3000"  // Alternative frontend port
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

const PORT = process.env.API_PORT || 3000;

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Security middleware
app.use(helmet());
app.use(cors({
  origin: [
    `http://localhost:${process.env.ADMIN_PORT}`, 
    `http://localhost:${process.env.USER_PORT}`,
    "http://localhost:5173", // Vite dev server
    "http://localhost:8000", // Vite frontend (current)
    "http://localhost:3000"  // Alternative frontend port
  ],
  credentials: true
}));

// Rate limiting (relaxed for development)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Higher limit for development
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging middleware
app.use(logger);

// Static files
app.use('/uploads', express.static('public/uploads'));

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('join-admin', () => {
    socket.join('admin-room');
    console.log('👤 Admin joined real-time updates');
  });
  
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`👤 User ${userId} joined real-time updates`);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/parking', parkingRoutes);
app.use('/api/vehicle', vehicleRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Dashboard API endpoints (for network tab visibility)
app.get('/api/dashboard/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalRevenue: 234567,
      activeUsers: 1247,
      occupiedSpots: 186,
      totalSpots: 250,
      todayBookings: 89,
      monthlyGrowth: 12,
      userGrowth: 8,
      occupancyRate: 74
    }
  });
});

app.get('/api/admin/users/list', (req, res) => {
  res.json({
    success: true,
    data: {
      users: [
        { id: 'U001', name: 'John Doe', email: 'john@example.com', status: 'active', role: 'premium' },
        { id: 'U002', name: 'Alice Smith', email: 'alice@example.com', status: 'active', role: 'regular' },
        { id: 'U003', name: 'Bob Johnson', email: 'bob@example.com', status: 'suspended', role: 'regular' }
      ],
      total: 1247,
      active: 892,
      newToday: 23,
      premium: 156
    }
  });
});

app.get('/api/admin/bookings/list', (req, res) => {
  res.json({
    success: true,
    data: {
      bookings: [
        { id: 'BK001', user: 'John Doe', spot: 'A-12', status: 'active', amount: 150 },
        { id: 'BK002', user: 'Alice Smith', spot: 'B-05', status: 'completed', amount: 480 },
        { id: 'BK003', user: 'Bob Johnson', spot: 'C-08', status: 'cancelled', amount: 200 }
      ],
      total: 5847,
      active: 127,
      todayRevenue: 45230,
      cancelled: 23
    }
  });
});

app.get('/api/user/payments/history', (req, res) => {
  res.json({
    success: true,
    data: {
      transactions: [
        { id: 'TXN001', type: 'booking', amount: 150, status: 'completed', date: '2024-12-16' },
        { id: 'TXN002', type: 'booking', amount: 480, status: 'completed', date: '2024-12-15' },
        { id: 'TXN003', type: 'refund', amount: 200, status: 'refunded', date: '2024-12-14' }
      ],
      totalSpent: 12450,
      monthlySpent: 1890,
      lastPayment: 150,
      pending: 0
    }
  });
});

// Admin payment endpoints
app.get('/api/admin/payments', (req, res) => {
  res.json({
    success: true,
    data: {
      totalRevenue: 234567,
      todayRevenue: 12450,
      pendingAmount: 2340,
      methods: {
        upi: 45,
        card: 30,
        wallet: 15,
        cash: 10
      },
      payments: [
        { 
          id: 'PAY001', 
          booking: 'BK001', 
          user: 'John Doe', 
          amount: 150, 
          method: 'UPI', 
          status: 'completed', 
          date: '2024-12-16T10:30:00Z' 
        },
        { 
          id: 'PAY002', 
          booking: 'BK002', 
          user: 'Alice Smith', 
          amount: 480, 
          method: 'Card', 
          status: 'completed', 
          date: '2024-12-15T09:00:00Z' 
        },
        { 
          id: 'PAY003', 
          booking: 'BK003', 
          user: 'Bob Johnson', 
          amount: 200, 
          method: 'Wallet', 
          status: 'pending', 
          date: '2024-12-14T14:20:00Z' 
        },
        { 
          id: 'PAY004', 
          booking: 'BK004', 
          user: 'Sarah Wilson', 
          amount: 320, 
          method: 'UPI', 
          status: 'completed', 
          date: '2024-12-13T16:45:00Z' 
        },
        { 
          id: 'PAY005', 
          booking: 'BK005', 
          user: 'Mike Davis', 
          amount: 180, 
          method: 'Cash', 
          status: 'failed', 
          date: '2024-12-12T11:15:00Z' 
        }
      ]
    }
  });
});

// Payment processing endpoints
app.post('/api/user/payments/process', (req, res) => {
  const { bookingId, amount, method, cardDetails } = req.body;
  console.log('Processing payment:', { bookingId, amount, method });
  
  // Simulate payment processing
  const transactionId = 'TXN' + Date.now();
  const success = Math.random() > 0.1; // 90% success rate
  
  if (success) {
    res.json({
      success: true,
      data: {
        transactionId: transactionId,
        status: 'completed',
        amount: amount,
        method: method,
        timestamp: new Date().toISOString(),
        receiptUrl: `/api/payments/receipt/${transactionId}`
      },
      message: 'Payment processed successfully'
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Payment failed. Please try again.',
      error: 'PAYMENT_DECLINED'
    });
  }
});

app.post('/api/user/payments/add-method', (req, res) => {
  const { type, cardNumber, expiryDate, cvv, holderName, upiId, walletProvider, walletId, isDefault } = req.body;
  
  let responseData = {
    methodId: 'PM' + Date.now(),
    type: type,
    isDefault: isDefault || false
  };
  
  // Handle different payment method types
  switch(type) {
    case 'card':
      if (!cardNumber) {
        return res.status(400).json({
          success: false,
          message: 'Card number is required for card payments'
        });
      }
      console.log('Adding card payment method:', { type, cardNumber: '****' + cardNumber.slice(-4) });
      responseData.lastFour = cardNumber.slice(-4);
      responseData.expiryDate = expiryDate;
      responseData.holderName = holderName;
      break;
      
    case 'upi':
      if (!upiId) {
        return res.status(400).json({
          success: false,
          message: 'UPI ID is required for UPI payments'
        });
      }
      console.log('Adding UPI payment method:', { type, upiId });
      responseData.upiId = upiId;
      responseData.displayName = upiId;
      break;
      
    case 'wallet':
      if (!walletProvider || !walletId) {
        return res.status(400).json({
          success: false,
          message: 'Wallet provider and ID are required for wallet payments'
        });
      }
      console.log('Adding wallet payment method:', { type, walletProvider, walletId });
      responseData.walletProvider = walletProvider;
      responseData.walletId = walletId;
      responseData.displayName = `${walletProvider} - ${walletId}`;
      break;
      
    default:
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method type'
      });
  }
  
  res.json({
    success: true,
    data: responseData,
    message: 'Payment method added successfully'
  });
});

app.put('/api/user/payments/method/:id', (req, res) => {
  const methodId = req.params.id;
  const { isDefault } = req.body;
  console.log('Updating payment method:', methodId, { isDefault });
  
  res.json({
    success: true,
    message: 'Payment method updated successfully'
  });
});

app.delete('/api/user/payments/method/:id', (req, res) => {
  const methodId = req.params.id;
  console.log('Deleting payment method:', methodId);
  
  res.json({
    success: true,
    message: 'Payment method deleted successfully'
  });
});

app.get('/api/payments/receipt/:transactionId', (req, res) => {
  const transactionId = req.params.transactionId;
  console.log('Generating receipt for:', transactionId);
  
  res.json({
    success: true,
    data: {
      transactionId: transactionId,
      receiptNumber: 'RCP' + Date.now(),
      timestamp: new Date().toISOString(),
      amount: 150,
      method: 'UPI',
      status: 'completed',
      merchantName: 'VayAccess Parking Solutions',
      description: 'Parking fee payment'
    }
  });
});

app.put('/api/admin/payments/:id/approve', (req, res) => {
  const paymentId = req.params.id;
  console.log('Approving payment:', paymentId);
  
  // Emit real-time update to admin dashboard
  const io = req.app.get('io');
  io.to('admin-room').emit('payment-approved', {
    paymentId: paymentId,
    timestamp: new Date().toISOString()
  });
  
  res.json({
    success: true,
    message: 'Payment approved successfully'
  });
});

app.put('/api/admin/payments/:id/refund', (req, res) => {
  const paymentId = req.params.id;
  const { reason, amount } = req.body;
  console.log('Processing refund for payment:', paymentId, 'Reason:', reason, 'Amount:', amount);
  
  const refundId = 'REF' + Date.now();
  
  // Emit real-time update to admin dashboard
  const io = req.app.get('io');
  io.to('admin-room').emit('refund-processed', {
    paymentId: paymentId,
    refundId: refundId,
    amount: amount,
    reason: reason,
    timestamp: new Date().toISOString()
  });
  
  res.json({
    success: true,
    data: {
      refundId: refundId,
      status: 'processed',
      amount: amount,
      timestamp: new Date().toISOString()
    },
    message: 'Refund processed successfully'
  });
});

app.post('/api/admin/payments/bulk-approve', (req, res) => {
  const { paymentIds } = req.body;
  console.log('Bulk approving payments:', paymentIds);
  
  res.json({
    success: true,
    data: {
      approved: paymentIds.length,
      timestamp: new Date().toISOString()
    },
    message: `${paymentIds.length} payments approved successfully`
  });
});

app.get('/api/admin/payments/export', (req, res) => {
  const { startDate, endDate, format = 'csv' } = req.query;
  console.log('Exporting payments:', { startDate, endDate, format });
  
  res.json({
    success: true,
    data: {
      downloadUrl: `/api/downloads/payments-${Date.now()}.${format}`,
      recordCount: 150,
      timestamp: new Date().toISOString()
    },
    message: 'Export generated successfully'
  });
});

// User payment statement download
app.get('/api/user/payments/statement', (req, res) => {
  const { startDate, endDate, format = 'pdf' } = req.query;
  console.log('Generating user payment statement:', { startDate, endDate, format });
  
  res.json({
    success: true,
    data: {
      downloadUrl: `/api/downloads/statement-${Date.now()}.${format}`,
      recordCount: 25,
      totalAmount: 12450,
      period: `${startDate || '2024-01-01'} to ${endDate || new Date().toISOString().split('T')[0]}`,
      timestamp: new Date().toISOString()
    },
    message: 'Statement generated successfully'
  });
});

// Retry payment endpoint
app.post('/api/user/payments/:transactionId/retry', (req, res) => {
  const transactionId = req.params.transactionId;
  const { method, amount } = req.body;
  console.log('Retrying payment:', transactionId, { method, amount });
  
  // Simulate retry with 85% success rate
  const success = Math.random() > 0.15;
  
  if (success) {
    const newTransactionId = 'TXN' + Date.now();
    res.json({
      success: true,
      data: {
        originalTransactionId: transactionId,
        newTransactionId: newTransactionId,
        status: 'completed',
        amount: amount || 150,
        method: method || 'upi',
        timestamp: new Date().toISOString()
      },
      message: 'Payment retry successful'
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Payment retry failed. Please try again later.',
      error: 'RETRY_FAILED'
    });
  }
});

// Load more transactions with pagination
app.get('/api/user/payments/transactions', (req, res) => {
  const { page = 1, limit = 10, status, type, search } = req.query;
  console.log('Loading transactions:', { page, limit, status, type, search });
  
  // Generate more sample transactions
  const allTransactions = [];
  for (let i = 1; i <= 50; i++) {
    const statuses = ['completed', 'pending', 'failed', 'refunded'];
    const types = ['booking', 'refund', 'penalty', 'subscription'];
    const methods = ['UPI', 'Card', 'Wallet', 'Cash'];
    
    allTransactions.push({
      id: `TXN${String(i).padStart(3, '0')}`,
      type: types[Math.floor(Math.random() * types.length)],
      amount: Math.floor(Math.random() * 500) + 50,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      method: methods[Math.floor(Math.random() * methods.length)],
      date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      description: `Transaction ${i} - Parking fee payment`,
      bookingId: `BK${String(Math.floor(Math.random() * 100) + 1).padStart(3, '0')}`
    });
  }
  
  // Apply filters
  let filteredTransactions = allTransactions;
  
  if (status && status !== 'all') {
    filteredTransactions = filteredTransactions.filter(t => t.status === status);
  }
  
  if (type && type !== 'all') {
    filteredTransactions = filteredTransactions.filter(t => t.type === type);
  }
  
  if (search) {
    filteredTransactions = filteredTransactions.filter(t => 
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.bookingId.toLowerCase().includes(search.toLowerCase())
    );
  }
  
  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + parseInt(limit);
  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);
  
  res.json({
    success: true,
    data: {
      transactions: paginatedTransactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(filteredTransactions.length / limit),
        totalRecords: filteredTransactions.length,
        hasMore: endIndex < filteredTransactions.length,
        limit: parseInt(limit)
      }
    }
  });
});

// View transaction details
app.get('/api/user/payments/transaction/:id', (req, res) => {
  const transactionId = req.params.id;
  console.log('Getting transaction details:', transactionId);
  
  res.json({
    success: true,
    data: {
      id: transactionId,
      type: 'booking',
      amount: 150,
      status: 'completed',
      method: 'UPI',
      date: new Date().toISOString(),
      description: 'Parking fee payment',
      bookingId: 'BK001',
      receiptUrl: `/api/payments/receipt/${transactionId}`,
      details: {
        merchantName: 'VayAccess Parking Solutions',
        location: 'City Mall - Sector 18',
        duration: '2 hours',
        vehicleNumber: 'DL01AB1234',
        spotNumber: 'A-12',
        entryTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        exitTime: new Date().toISOString()
      }
    }
  });
});

app.get('/api/user/profile', (req, res) => {
  res.json({
    success: true,
    data: {
      id: 'U001',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      memberSince: '2024-01-15',
      totalBookings: 45,
      totalSpent: 12450
    }
  });
});

app.get('/api/parking/analytics', (req, res) => {
  res.json({
    success: true,
    data: {
      occupancyRate: 74,
      totalSpots: 250,
      availableSpots: 64,
      occupiedSpots: 186,
      maintenanceSpots: 3,
      topLocations: [
        { name: 'City Mall', revenue: 12450, spots: 50 },
        { name: 'Tech Park', revenue: 10230, spots: 75 },
        { name: 'Shopping Center', revenue: 8890, spots: 100 }
      ]
    }
  });
});

// User management endpoints
app.post('/api/admin/users/create', (req, res) => {
  console.log('Creating new user:', req.body);
  res.json({
    success: true,
    message: 'User created successfully',
    data: {
      id: 'U' + String(Date.now()).slice(-3),
      ...req.body
    }
  });
});

app.put('/api/admin/users/:id/status', (req, res) => {
  const userId = req.params.id;
  const { status } = req.body;
  console.log(`Updating user ${userId} status to:`, status);
  res.json({
    success: true,
    message: `User ${status} successfully`
  });
});

app.delete('/api/admin/users/:id', (req, res) => {
  const userId = req.params.id;
  console.log('Deleting user:', userId);
  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// Booking management endpoints
app.post('/api/admin/bookings/:id/extend', (req, res) => {
  const bookingId = req.params.id;
  console.log('Extending booking:', bookingId);
  res.json({
    success: true,
    message: 'Booking extended successfully'
  });
});

app.put('/api/admin/bookings/:id/cancel', (req, res) => {
  const bookingId = req.params.id;
  console.log('Cancelling booking:', bookingId);
  res.json({
    success: true,
    message: 'Booking cancelled successfully'
  });
});

// Parking spot management endpoints
app.post('/api/admin/parking/create', (req, res) => {
  console.log('Creating new parking spot:', req.body);
  res.json({
    success: true,
    message: 'Parking spot created successfully',
    data: {
      id: req.body.spotId,
      ...req.body
    }
  });
});

app.put('/api/admin/parking/:id/maintenance', (req, res) => {
  const spotId = req.params.id;
  console.log('Setting maintenance for spot:', spotId);
  res.json({
    success: true,
    message: 'Spot set to maintenance mode'
  });
});

// Real-time notifications endpoint
app.get('/api/notifications/recent', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, type: 'user-join', message: 'New user registered', time: '2 min ago' },
      { id: 2, type: 'booking-complete', message: 'Payment received for #BK001', time: '5 min ago' },
      { id: 3, type: 'system-alert', message: 'High server load detected', time: '15 min ago' }
    ]
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📊 Admin Dashboard: http://localhost:${process.env.ADMIN_PORT}`);
  console.log(`👤 User Dashboard: http://localhost:${process.env.USER_PORT}`);
});

module.exports = { app, io };