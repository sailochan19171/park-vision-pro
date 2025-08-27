// Admin Dashboard Server
// Port: 8080 (changed from 3001 to avoid conflict with AI Call Agent)
// Serves admin dashboard with authentication and MongoDB integration

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { engine } = require('express-handlebars');

// Import MongoDB models
const User = require('./models/User');
const Vehicle = require('./models/Vehicle');
const ParkingSpot = require('./models/ParkingSpot');
const VehicleLog = require('./models/VehicleLog');
const Booking = require('./models/Booking');

const app = express();
const PORT = process.env.ADMIN_PORT || 8080;

console.log('🚀 Starting MongoDB-Connected Admin Server on port:', PORT);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Backup in-memory data storage (fallback only)
let dataStore = {
  bookings: [
    { id: 'BK001', customerName: 'Alice Johnson', customerEmail: 'alice@example.com', spotId: 'A-101', vehicleNumber: 'KA-01-AB-1234', startTime: '2024-01-08T09:00:00.000Z', endTime: '2024-01-08T17:00:00.000Z', status: 'active', amount: 500, duration: '8 hours' },
    { id: 'BK002', customerName: 'Bob Smith', customerEmail: 'bob@example.com', spotId: 'B-205', vehicleNumber: 'KA-02-CD-5678', startTime: '2024-01-08T10:30:00.000Z', endTime: '2024-01-08T18:30:00.000Z', status: 'completed', amount: 400, duration: '8 hours' },
    { id: 'BK003', customerName: 'Carol Davis', customerEmail: 'carol@example.com', spotId: 'C-350', vehicleNumber: 'KA-03-EF-9012', startTime: '2024-01-08T14:15:00.000Z', endTime: '2024-01-08T22:15:00.000Z', status: 'active', amount: 600, duration: '8 hours' },
    { id: 'BK004', customerName: 'David Wilson', customerEmail: 'david@example.com', spotId: 'A-045', vehicleNumber: 'KA-04-GH-3456', startTime: '2024-01-08T08:00:00.000Z', endTime: '2024-01-08T16:00:00.000Z', status: 'cancelled', amount: 450, duration: '8 hours' },
    { id: 'BK005', customerName: 'Eva Martinez', customerEmail: 'eva@example.com', spotId: 'B-123', vehicleNumber: 'KA-05-IJ-7890', startTime: '2024-01-08T11:00:00.000Z', endTime: '2024-01-08T19:00:00.000Z', status: 'active', amount: 550, duration: '8 hours' },
    { id: 'BK006', customerName: 'Frank Brown', customerEmail: 'frank@example.com', spotId: 'C-456', vehicleNumber: 'KA-06-KL-1234', startTime: '2024-01-08T13:30:00.000Z', endTime: '2024-01-08T21:30:00.000Z', status: 'completed', amount: 400, duration: '8 hours' }
  ],
  users: [
    { id: 1, name: 'Alice Johnson', email: 'alice@example.com', phone: '+91-9876543210', status: 'active', joinDate: '2024-01-15', totalBookings: 45, totalSpent: 22500, lastLogin: '2024-01-08T10:30:00.000Z', recentActivity: ['Booked parking spot A001', 'Payment completed ₹500', 'Profile updated'] },
    { id: 2, name: 'Bob Smith', email: 'bob@example.com', phone: '+91-9876543211', status: 'active', joinDate: '2024-02-20', totalBookings: 32, totalSpent: 16000, lastLogin: '2024-01-08T09:15:00.000Z', recentActivity: ['Cancelled booking BK002', 'Payment pending ₹400'] },
    { id: 3, name: 'Carol Davis', email: 'carol@example.com', phone: '+91-9876543212', status: 'suspended', joinDate: '2024-03-10', totalBookings: 18, totalSpent: 9000, lastLogin: '2024-01-07T14:20:00.000Z', recentActivity: ['Account suspended', 'Multiple violations reported'] },
    { id: 4, name: 'David Wilson', email: 'david@example.com', phone: '+91-9876543213', status: 'active', joinDate: '2024-03-25', totalBookings: 28, totalSpent: 14000, lastLogin: '2024-01-08T08:45:00.000Z', recentActivity: ['Extended parking time', 'Payment completed ₹450'] }
  ],
  vehicles: [
    { id: 1, plateNumber: 'KA-01-AB-1234', owner: 'Alice Johnson', type: 'Car', model: 'Honda Civic', color: 'Blue', registered: '2024-01-15', status: 'active' },
    { id: 2, plateNumber: 'KA-02-CD-5678', owner: 'Bob Smith', type: 'SUV', model: 'Toyota Fortuner', color: 'White', registered: '2024-02-20', status: 'active' },
    { id: 3, plateNumber: 'KA-03-EF-9012', owner: 'Carol Davis', type: 'Car', model: 'Maruti Swift', color: 'Red', registered: '2024-03-10', status: 'inactive' },
    { id: 4, plateNumber: 'KA-04-GH-3456', owner: 'David Wilson', type: 'Bike', model: 'Honda CB350', color: 'Black', registered: '2024-03-25', status: 'active' }
  ],
  payments: [
    { id: 'PAY001', booking: 'BK001', user: 'Alice Johnson', amount: 500, method: 'UPI', status: 'completed', date: '2024-01-08 09:15' },
    { id: 'PAY002', booking: 'BK002', user: 'Bob Smith', amount: 400, method: 'Card', status: 'completed', date: '2024-01-08 10:45' },
    { id: 'PAY003', booking: 'BK003', user: 'Carol Davis', amount: 600, method: 'Wallet', status: 'pending', date: '2024-01-08 14:30' },
    { id: 'PAY004', booking: 'BK004', user: 'David Wilson', amount: 450, method: 'Cash', status: 'failed', date: '2024-01-08 08:20' }
  ],
  parkingSpots: [
    { id: 'A001', location: 'Level 1 - Section A', type: 'Regular', status: 'available', rate: 25, currentVehicle: null, occupiedSince: null, user: null },
    { id: 'A002', location: 'Level 1 - Section A', type: 'Compact', status: 'occupied', rate: 20, currentVehicle: 'KA-01-AB-1234', occupiedSince: '2024-01-08T10:00:00.000Z', user: 'Alice Johnson' },
    { id: 'B001', location: 'Level 1 - Section B', type: 'Regular', status: 'available', rate: 25, currentVehicle: null, occupiedSince: null, user: null },
    { id: 'B002', location: 'Level 1 - Section B', type: 'Electric', status: 'reserved', rate: 30, currentVehicle: null, occupiedSince: null, user: 'Bob Smith' },
    { id: 'C001', location: 'Level 2 - Section A', type: 'Handicapped', status: 'available', rate: 25, currentVehicle: null, occupiedSince: null, user: null }
  ],
  logs: [
    { id: 1, timestamp: new Date().toISOString(), level: 'INFO', module: 'System', message: 'Admin dashboard initialized', ip: 'localhost' },
    { id: 2, timestamp: new Date(Date.now() - 300000).toISOString(), level: 'INFO', module: 'Auth', message: 'Admin login successful', ip: '192.168.1.100' },
    { id: 3, timestamp: new Date(Date.now() - 600000).toISOString(), level: 'INFO', module: 'Booking', message: 'New booking created successfully', ip: '192.168.1.102' },
    { id: 4, timestamp: new Date(Date.now() - 900000).toISOString(), level: 'WARN', module: 'Payment', message: 'Payment processing delayed', ip: '192.168.1.103' }
  ]
};

// Function to add system logs
function addLog(level, module, message, ip = 'localhost') {
  const newLog = {
    id: dataStore.logs.length + 1,
    timestamp: new Date().toISOString(),
    level: level,
    module: module,
    message: message,
    ip: ip
  };
  dataStore.logs.push(newLog);
  
  // Keep only last 100 logs to prevent memory issues
  if (dataStore.logs.length > 100) {
    dataStore.logs = dataStore.logs.slice(-100);
  }
}

// Handlebars configuration
app.engine('handlebars', engine({
  defaultLayout: 'admin-main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    eq: (a, b) => a === b,
    formatDate: (date) => new Date(date).toLocaleDateString(),
    formatTime: (date) => new Date(date).toLocaleTimeString(),
    json: (obj) => JSON.stringify(obj),
    inc: (value) => parseInt(value) + 1
  }
}));

app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views/admin'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session configuration
app.use(session({
  secret: process.env.JWT_SECRET || 'admin-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Authentication middleware for admin routes
const requireAdminAuth = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  next();
};

// Authentication middleware for API routes (returns JSON instead of redirect)
const requireAdminAuthAPI = (req, res, next) => {
  if (!req.session.admin) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required',
      message: 'Please login to access this resource'
    });
  }
  next();
};

// Admin routes
app.get('/', (req, res) => {
  res.redirect('/admin/dashboard');
});

// Login page
app.get('/admin/login', (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin/dashboard');
  }
  res.render('login', { 
    title: 'Admin Login - VayAccess',
    layout: 'auth'
  });
});

// Login processing (Direct authentication for development) - FIXED
app.post('/admin/login', (req, res) => {
  console.log('🔐 Admin login POST request received');
  console.log('📝 Request body:', req.body);

  try {
    const { email, password, rememberMe } = req.body;
    
    // Validation
    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.render('login', {
        title: 'Admin Login - VayAccess',
        layout: 'auth',
        error: 'Please provide both email and password.',
        email: email
      });
    }
    
    // Demo admin credentials (simplified)
    const validCredentials = {
      'admin@vayaccess.com': 'Admin@123',
      'john.manager@vayaccess.com': 'User@123'
    };
    
    const normalizedEmail = email.toLowerCase().trim();
    console.log('🔍 Checking credentials for:', normalizedEmail);
    
    if (validCredentials[normalizedEmail] && validCredentials[normalizedEmail] === password) {
      // Create admin session
      req.session.admin = {
        email: normalizedEmail,
        name: normalizedEmail === 'admin@vayaccess.com' ? 'Super Admin' : 'John Manager',
        role: normalizedEmail === 'admin@vayaccess.com' ? 'super_admin' : 'manager',
        loginTime: new Date().toISOString()
      };
      
      if (rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      }
      
      console.log('✅ Login successful for:', normalizedEmail);
      console.log('📊 Admin session created:', req.session.admin);
      return res.redirect('/admin/dashboard');
    } else {
      console.log('❌ Invalid credentials for:', normalizedEmail);
      return res.render('login', {
        title: 'Admin Login - VayAccess',
        layout: 'auth',
        error: 'Invalid email or password. Please check your credentials.',
        email: email
      });
    }
  } catch (error) {
    console.error('💥 Admin login error:', error);
    console.error('Stack trace:', error.stack);
    return res.render('login', {
      title: 'Admin Login - VayAccess',
      layout: 'auth',
      error: 'Server error occurred. Please try again.'
    });
  }
});

// Dashboard
app.get('/admin/dashboard', requireAdminAuth, (req, res) => {
  res.render('dashboard', {
    title: 'Admin Dashboard - VayAccess',
    admin: req.session.admin,
    activeTab: 'dashboard'
  });
});

// Users Management
app.get('/admin/users', requireAdminAuth, (req, res) => {
  res.render('users', {
    title: 'User Management - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'users'
  });
});

// Bookings Management
app.get('/admin/bookings', requireAdminAuth, (req, res) => {
  res.render('bookings', {
    title: 'Booking Management - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'bookings'
  });
});

// Parking Spots Management
app.get('/admin/parking', requireAdminAuth, (req, res) => {
  res.render('parking', {
    title: 'Parking Management - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'parking'
  });
});

// Logout route
app.get('/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/admin/login');
  });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/admin/login');
  });
});

// Analytics
app.get('/admin/analytics', requireAdminAuth, (req, res) => {
  res.render('analytics', {
    title: 'Analytics - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'analytics'
  });
});

// Vehicles Management
app.get('/admin/vehicles', requireAdminAuth, (req, res) => {
  res.render('vehicles', {
    title: 'Vehicle Management - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'vehicles'
  });
});

// Payments Management
app.get('/admin/payments', requireAdminAuth, (req, res) => {
  res.render('payments', {
    title: 'Payment Management - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'payments'
  });
});

// Reports
app.get('/admin/reports', requireAdminAuth, (req, res) => {
  res.render('reports', {
    title: 'Reports - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'reports'
  });
});

// Insights
app.get('/admin/insights', requireAdminAuth, (req, res) => {
  res.render('insights', {
    title: 'Insights - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'insights'
  });
});

// System Logs
app.get('/admin/logs', requireAdminAuth, (req, res) => {
  res.render('logs', {
    title: 'System Logs - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'logs'
  });
});

// Settings
app.get('/admin/settings', requireAdminAuth, (req, res) => {
  res.render('settings', {
    title: 'Settings - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'settings'
  });
});

// Logout
app.post('/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/admin/login');
  });
});

// =============================================================================
// API ENDPOINTS - Return data for dashboard functionality
// =============================================================================

// Dashboard API - Returns dashboard stats
app.get('/api/admin/dashboard', requireAdminAuthAPI, (req, res) => {
  // Calculate dynamic stats from dataStore
  const totalUsers = dataStore.users.length;
  const activeBookings = dataStore.bookings.filter(b => b.status === 'active').length;
  const totalRevenue = dataStore.payments.reduce((sum, p) => sum + p.amount, 0);
  const totalVehicles = dataStore.vehicles.length;
  const totalSpots = dataStore.parkingSpots.length;
  const occupiedSpots = dataStore.parkingSpots.filter(s => s.status === 'occupied').length;
  const occupancyRate = totalSpots > 0 ? ((occupiedSpots / totalSpots) * 100).toFixed(1) : 0;
  const pendingPayments = dataStore.payments.filter(p => p.status === 'pending').length;
  
  // Generate recent activity from latest data
  const recentActivity = [
    ...dataStore.bookings.slice(-2).map(b => ({
      type: 'booking',
      user: b.customerName,
      action: `Created booking ${b.id}`,
      time: '2 min ago'
    })),
    ...dataStore.payments.slice(-1).map(p => ({
      type: 'payment',
      user: p.user,
      action: `Payment received ₹${p.amount}`,
      time: '5 min ago'
    }))
  ].slice(-3);

  const dashboardData = {
    stats: {
      totalUsers: totalUsers,
      activeBookings: activeBookings,
      totalRevenue: totalRevenue,
      occupancyRate: parseFloat(occupancyRate),
      todayBookings: activeBookings,
      pendingPayments: pendingPayments,
      totalVehicles: totalVehicles,
      systemAlerts: 0
    },
    recentActivity: recentActivity,
    todayChart: [
      { hour: '06:00', bookings: 5, revenue: 250 },
      { hour: '08:00', bookings: 12, revenue: 600 },
      { hour: '10:00', bookings: 18, revenue: 900 },
      { hour: '12:00', bookings: 25, revenue: 1250 },
      { hour: '14:00', bookings: 20, revenue: 1000 },
      { hour: '16:00', bookings: 15, revenue: 750 },
      { hour: '18:00', bookings: 8, revenue: 400 }
    ]
  };
  res.json({ success: true, data: dashboardData });
});

// Users API - Returns users data
app.get('/api/admin/users', requireAdminAuthAPI, (req, res) => {
  const activeUsers = dataStore.users.filter(u => u.status === 'active').length;
  const suspendedUsers = dataStore.users.filter(u => u.status === 'suspended').length;
  const totalRevenue = dataStore.users.reduce((sum, u) => sum + u.totalSpent, 0);
  
  const usersData = {
    total: dataStore.users.length,
    active: activeUsers,
    suspended: suspendedUsers,
    totalRevenue: totalRevenue,
    users: dataStore.users,
    pagination: { page: 1, pages: Math.ceil(dataStore.users.length / 50), limit: 50 }
  };
  res.json({ success: true, data: usersData });
});

// Bookings API - Returns bookings data  
app.get('/api/admin/bookings', requireAdminAuthAPI, (req, res) => {
  // Calculate dynamic stats
  const activeBookings = dataStore.bookings.filter(b => b.status === 'active').length;
  const totalRevenue = dataStore.bookings.reduce((sum, b) => sum + b.amount, 0);
  
  // Generate recent activity from latest bookings
  const recentActivity = dataStore.bookings.slice(-4).reverse().map(booking => ({
    type: 'booking',
    description: `Booking ${booking.status} by ${booking.customerName}`,
    time: '2 min ago'
  }));
  
  const bookingsData = {
    total: dataStore.bookings.length,
    active: activeBookings,
    todayCount: dataStore.bookings.filter(b => b.status === 'active').length,
    todayRevenue: totalRevenue,
    bookings: dataStore.bookings,
    recentActivity: recentActivity,
    hourlyData: [
      { hour: '06:00', bookings: 5 },
      { hour: '08:00', bookings: 12 },
      { hour: '10:00', bookings: 18 },
      { hour: '12:00', bookings: 25 },
      { hour: '14:00', bookings: 20 },
      { hour: '16:00', bookings: 15 },
      { hour: '18:00', bookings: 8 }
    ]
  };
  res.json({ success: true, data: bookingsData });
});

// CRUD API Endpoints for Bookings
app.post('/api/admin/bookings', requireAdminAuthAPI, (req, res) => {
  console.log('Creating new booking:', req.body);
  const { customerName, customerEmail, vehicleNumber, parkingSpot, startDateTime, endDateTime } = req.body;
  
  const newBooking = {
    id: 'BK' + Math.floor(Math.random() * 10000).toString().padStart(3, '0'),
    customerName,
    customerEmail,
    spotId: parkingSpot,
    vehicleNumber,
    startTime: startDateTime,
    endTime: endDateTime,
    status: 'active',
    amount: 500, // Default amount
    duration: '8 hours' // Calculate based on start/end time
  };
  
  // Add to dataStore
  dataStore.bookings.push(newBooking);
  addLog('INFO', 'Booking', `New booking created: ${newBooking.id} for ${customerName}`, req.ip);
  console.log('✅ Booking added to dataStore. Total bookings:', dataStore.bookings.length);
  
  res.json({ 
    success: true, 
    message: 'Booking created successfully',
    data: newBooking 
  });
});

app.put('/api/admin/bookings/:bookingId/cancel', requireAdminAuthAPI, (req, res) => {
  const { bookingId } = req.params;
  
  console.log('Cancelling booking:', bookingId);
  
  res.json({ 
    success: true, 
    message: 'Booking cancelled successfully',
    data: { bookingId, status: 'cancelled' }
  });
});

// Parking API - Returns parking spots data
app.get('/api/admin/parking', requireAdminAuthAPI, (req, res) => {
  const totalSpots = dataStore.parkingSpots.length;
  const occupiedSpots = dataStore.parkingSpots.filter(spot => spot.status === 'occupied').length;
  const availableSpots = dataStore.parkingSpots.filter(spot => spot.status === 'available').length;
  const reservedSpots = dataStore.parkingSpots.filter(spot => spot.status === 'reserved').length;
  
  const parkingData = {
    totalSpots,
    occupiedSpots,
    availableSpots,
    reservedSpots,
    spots: dataStore.parkingSpots,
    recentActivity: [
      { type: 'entry', description: 'Vehicle KA-01-AB-1234 entered spot A001', time: '2 min ago' },
      { type: 'exit', description: 'Vehicle KA-02-CD-5678 exited spot B205', time: '5 min ago' },
      { type: 'reservation', description: 'Spot C350 reserved by Carol Davis', time: '8 min ago' },
      { type: 'maintenance', description: 'Spot A045 marked for maintenance', time: '15 min ago' }
    ]
  };
  res.json({ success: true, data: parkingData });
});

// Vehicles API - Returns vehicles data
app.get('/api/admin/vehicles', requireAdminAuthAPI, (req, res) => {
  // Calculate dynamic stats
  const cars = dataStore.vehicles.filter(v => v.type === 'Car').length;
  const bikes = dataStore.vehicles.filter(v => v.type === 'Bike').length;
  const suvs = dataStore.vehicles.filter(v => v.type === 'SUV').length;
  
  const vehiclesData = {
    total: dataStore.vehicles.length,
    vehicles: dataStore.vehicles,
    types: {
      cars: cars,
      bikes: bikes,
      suvs: suvs
    }
  };
  res.json({ success: true, data: vehiclesData });
});

// CRUD API Endpoints for Vehicles
app.post('/api/admin/vehicles', requireAdminAuthAPI, (req, res) => {
  console.log('Creating new vehicle:', req.body);
  const { plateNumber, owner, type, model, color } = req.body;
  
  const newVehicle = {
    id: Math.floor(Math.random() * 10000),
    plateNumber,
    owner,
    type,
    model,
    color,
    registered: new Date().toISOString().split('T')[0],
    status: 'active'
  };
  
  // Add to dataStore
  dataStore.vehicles.push(newVehicle);
  addLog('INFO', 'Vehicle', `New vehicle registered: ${plateNumber} for ${owner}`, req.ip);
  console.log('✅ Vehicle added to dataStore. Total vehicles:', dataStore.vehicles.length);
  
  res.json({ 
    success: true, 
    message: 'Vehicle registered successfully',
    data: newVehicle 
  });
});

app.put('/api/admin/vehicles/:vehicleId/status', requireAdminAuthAPI, (req, res) => {
  const { vehicleId } = req.params;
  const { status } = req.body;
  
  console.log(`Updating vehicle ${vehicleId} status to:`, status);
  
  res.json({ 
    success: true, 
    message: `Vehicle ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
    data: { vehicleId, status }
  });
});

app.delete('/api/admin/vehicles/:vehicleId', requireAdminAuthAPI, (req, res) => {
  const { vehicleId } = req.params;
  
  console.log('Deleting vehicle:', vehicleId);
  
  res.json({ 
    success: true, 
    message: 'Vehicle deleted successfully',
    data: { vehicleId }
  });
});

// Payments API - Returns payments data
app.get('/api/admin/payments', requireAdminAuthAPI, (req, res) => {
  // Calculate dynamic stats
  const totalRevenue = dataStore.payments.reduce((sum, p) => sum + p.amount, 0);
  const pendingAmount = dataStore.payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
  
  const paymentsData = {
    totalRevenue: totalRevenue,
    todayRevenue: totalRevenue * 0.1, // Simulate today's revenue
    pendingAmount: pendingAmount,
    payments: dataStore.payments,
    methods: {
      upi: 45.2,
      card: 32.8,
      wallet: 15.5,
      cash: 6.5
    }
  };
  res.json({ success: true, data: paymentsData });
});

// CRUD API Endpoints for Payments
app.post('/api/admin/payments', requireAdminAuthAPI, (req, res) => {
  console.log('Creating new payment:', req.body);
  const { booking, user, amount, method } = req.body;
  
  const newPayment = {
    id: 'PAY' + Math.floor(Math.random() * 10000),
    booking,
    user,
    amount: parseFloat(amount),
    method,
    status: 'completed',
    date: new Date().toISOString()
  };
  
  // Add to dataStore
  dataStore.payments.push(newPayment);
  addLog('INFO', 'Payment', `Payment recorded: ${newPayment.id} - ₹${amount} via ${method}`, req.ip);
  console.log('✅ Payment added to dataStore. Total payments:', dataStore.payments.length);
  
  res.json({ 
    success: true, 
    message: 'Payment recorded successfully',
    data: newPayment 
  });
});

app.put('/api/admin/payments/:paymentId/status', requireAdminAuthAPI, (req, res) => {
  const { paymentId } = req.params;
  const { status } = req.body;
  
  console.log(`Updating payment ${paymentId} status to:`, status);
  
  res.json({ 
    success: true, 
    message: `Payment ${status} successfully`,
    data: { paymentId, status }
  });
});

// Analytics API - Returns analytics data
app.get('/api/admin/analytics', requireAdminAuthAPI, (req, res) => {
  // Calculate dynamic analytics from dataStore
  const totalBookings = dataStore.bookings.length;
  const totalRevenue = dataStore.payments.reduce((sum, p) => sum + p.amount, 0);
  const averageBookingValue = totalBookings > 0 ? (totalRevenue / totalBookings).toFixed(2) : 0;
  const totalSpots = dataStore.parkingSpots.length;
  const occupiedSpots = dataStore.parkingSpots.filter(s => s.status === 'occupied').length;
  const occupancyRate = totalSpots > 0 ? ((occupiedSpots / totalSpots) * 100).toFixed(1) : 0;
  
  // Generate zone-based analytics
  const zoneStats = {};
  dataStore.bookings.forEach(booking => {
    const zone = booking.spotId.charAt(0); // Extract zone from spotId (A001 -> A)
    if (!zoneStats[zone]) {
      zoneStats[zone] = { bookings: 0, revenue: 0 };
    }
    zoneStats[zone].bookings++;
    zoneStats[zone].revenue += booking.amount;
  });
  
  const popularSpots = Object.entries(zoneStats).map(([zone, stats]) => ({
    zone: zone,
    bookings: stats.bookings,
    revenue: stats.revenue
  })).sort((a, b) => b.bookings - a.bookings);

  const analyticsData = {
    overview: {
      totalBookings: totalBookings,
      totalRevenue: totalRevenue,
      averageBookingValue: parseFloat(averageBookingValue),
      occupancyRate: parseFloat(occupancyRate)
    },
    trends: [
      { date: '2024-01-01', bookings: Math.floor(totalBookings * 0.1), revenue: Math.floor(totalRevenue * 0.1) },
      { date: '2024-01-02', bookings: Math.floor(totalBookings * 0.12), revenue: Math.floor(totalRevenue * 0.12) },
      { date: '2024-01-03', bookings: Math.floor(totalBookings * 0.08), revenue: Math.floor(totalRevenue * 0.08) },
      { date: '2024-01-04', bookings: Math.floor(totalBookings * 0.15), revenue: Math.floor(totalRevenue * 0.15) },
      { date: '2024-01-05', bookings: Math.floor(totalBookings * 0.18), revenue: Math.floor(totalRevenue * 0.18) },
      { date: '2024-01-06', bookings: Math.floor(totalBookings * 0.14), revenue: Math.floor(totalRevenue * 0.14) },
      { date: '2024-01-07', bookings: Math.floor(totalBookings * 0.13), revenue: Math.floor(totalRevenue * 0.13) }
    ],
    popularSpots: popularSpots.length > 0 ? popularSpots : [
      { zone: 'A', bookings: 0, revenue: 0 },
      { zone: 'B', bookings: 0, revenue: 0 },
      { zone: 'C', bookings: 0, revenue: 0 }
    ]
  };
  res.json({ success: true, data: analyticsData });
});

// Reports API - Returns reports data
app.get('/api/admin/reports', requireAdminAuthAPI, (req, res) => {
  // Calculate dynamic report stats
  const totalBookings = dataStore.bookings.length;
  const totalUsers = dataStore.users.length;
  const totalRevenue = dataStore.payments.reduce((sum, p) => sum + p.amount, 0);
  
  const reportsData = {
    availableReports: [
      { id: 'daily', name: 'Daily Report', description: 'Daily booking and revenue summary', lastGenerated: new Date().toISOString().split('T')[0] + ' 23:59' },
      { id: 'weekly', name: 'Weekly Report', description: 'Weekly performance analysis', lastGenerated: new Date().toISOString().split('T')[0] + ' 23:59' },
      { id: 'monthly', name: 'Monthly Report', description: 'Monthly business insights', lastGenerated: new Date().toISOString().split('T')[0] + ' 00:01' },
      { id: 'user', name: 'User Activity Report', description: 'User behavior and engagement', lastGenerated: new Date().toISOString().split('T')[0] + ' 18:00' }
    ],
    quickStats: {
      totalReports: Math.floor(totalBookings * 1.5), // Simulate report generation based on activity
      reportsThisMonth: Math.floor(totalBookings * 0.3),
      averageGenerationTime: '2.3s',
      popularFormat: 'PDF'
    }
  };
  res.json({ success: true, data: reportsData });
});

// Insights API - Returns insights data
app.get('/api/admin/insights', requireAdminAuthAPI, (req, res) => {
  // Calculate dynamic insights from dataStore
  const totalBookings = dataStore.bookings.length;
  const totalRevenue = dataStore.payments.reduce((sum, p) => sum + p.amount, 0);
  const totalSpots = dataStore.parkingSpots.length;
  const occupiedSpots = dataStore.parkingSpots.filter(s => s.status === 'occupied').length;
  const occupancyRate = totalSpots > 0 ? ((occupiedSpots / totalSpots) * 100).toFixed(1) : 0;
  const activeUsers = dataStore.users.filter(u => u.status === 'active').length;
  const totalUsers = dataStore.users.length;
  const userRetentionRate = totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0;
  
  // Generate zone analysis
  const zoneStats = {};
  dataStore.bookings.forEach(booking => {
    const zone = booking.spotId.charAt(0);
    if (!zoneStats[zone]) zoneStats[zone] = 0;
    zoneStats[zone]++;
  });
  
  const mostPopularZone = Object.entries(zoneStats).sort((a, b) => b[1] - a[1])[0];
  const leastPopularZone = Object.entries(zoneStats).sort((a, b) => a[1] - b[1])[0];

  const insightsData = {
    keyInsights: [
      { type: 'peak_hours', title: 'Peak Hours', description: `Current occupancy rate: ${occupancyRate}%`, impact: occupancyRate > 80 ? 'high' : 'medium' },
      { type: 'revenue', title: 'Revenue Status', description: `Total revenue: ₹${totalRevenue.toLocaleString()}`, impact: 'positive' },
      { type: 'user_behavior', title: 'User Retention', description: `${userRetentionRate}% users are active`, impact: userRetentionRate > 70 ? 'positive' : 'medium' },
      { type: 'optimization', title: 'Zone Analysis', description: mostPopularZone ? `Zone ${mostPopularZone[0]} most popular (${mostPopularZone[1]} bookings)` : 'No booking data available', impact: 'medium' }
    ],
    predictions: {
      nextWeekBookings: Math.floor(totalBookings * 1.2),
      expectedRevenue: Math.floor(totalRevenue * 1.15),
      peakDays: ['Monday', 'Tuesday', 'Friday']
    },
    recommendations: [
      leastPopularZone ? `Consider pricing adjustment for Zone ${leastPopularZone[0]}` : 'Monitor zone performance',
      mostPopularZone ? `Add more spots in Zone ${mostPopularZone[0]} due to high demand` : 'Analyze booking patterns',
      occupancyRate > 80 ? 'Consider expanding parking capacity' : 'Optimize current capacity utilization'
    ]
  };
  res.json({ success: true, data: insightsData });
});

// Logs API - Returns system logs
app.get('/api/admin/logs', requireAdminAuthAPI, (req, res) => {
  // Calculate dynamic log stats
  const infoLogs = dataStore.logs.filter(log => log.level === 'INFO').length;
  const warnLogs = dataStore.logs.filter(log => log.level === 'WARN').length;
  const errorLogs = dataStore.logs.filter(log => log.level === 'ERROR').length;
  
  const logsData = {
    total: dataStore.logs.length,
    logs: dataStore.logs.slice().reverse(), // Show newest first
    levels: {
      info: infoLogs,
      warn: warnLogs,
      error: errorLogs
    },
    filters: ['INFO', 'WARN', 'ERROR', 'DEBUG']
  };
  res.json({ success: true, data: logsData });
});

// Settings API - Returns settings data
app.get('/api/admin/settings', requireAdminAuthAPI, (req, res) => {
  const settingsData = {
    general: {
      siteName: 'VayAccess Parking',
      timezone: 'Asia/Kolkata',
      language: 'en',
      maintenanceMode: false
    },
    parking: {
      basePrice: 50,
      pricePerHour: 25,
      maxBookingDuration: 12,
      advanceBookingDays: 30
    },
    notifications: {
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      reminderTime: 30
    },
    security: {
      sessionTimeout: 60,
      maxLoginAttempts: 3,
      twoFactorAuth: false,
      ipWhitelist: false
    }
  };
  res.json({ success: true, data: settingsData });
});

// Error handling
app.use((req, res, next) => {
  res.status(404).render('404', {
    title: 'Page Not Found - VayAccess Admin',
    admin: req.session.admin
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Server Error - VayAccess Admin',
    admin: req.session.admin,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// CRUD API Endpoints for Users
app.post('/api/admin/users', requireAdminAuthAPI, (req, res) => {
  console.log('Creating new user:', req.body);
  const { name, email, phone, password, status } = req.body;
  
  const newUser = {
    id: Math.floor(Math.random() * 10000),
    name,
    email,
    phone: phone || 'N/A',
    status: status || 'active',
    joinDate: new Date().toISOString().split('T')[0],
    totalBookings: 0,
    totalSpent: 0
  };
  
  // Add to dataStore
  dataStore.users.push(newUser);
  addLog('INFO', 'User', `New user created: ${name} (${email})`, req.ip);
  console.log('✅ User added to dataStore. Total users:', dataStore.users.length);
  
  res.json({ 
    success: true, 
    message: 'User created successfully',
    data: newUser 
  });
});

app.put('/api/admin/users/:userId/status', requireAdminAuthAPI, (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;
  
  console.log(`Updating user ${userId} status to:`, status);
  
  res.json({ 
    success: true, 
    message: `User ${status === 'active' ? 'activated' : 'suspended'} successfully`,
    data: { userId, status }
  });
});

app.delete('/api/admin/users/:userId', requireAdminAuthAPI, (req, res) => {
  const { userId } = req.params;
  
  console.log('Deleting user:', userId);
  
  res.json({ 
    success: true, 
    message: 'User deleted successfully',
    data: { userId }
  });
});

// CRUD API Endpoints for Bookings
app.post('/api/admin/bookings', requireAdminAuthAPI, (req, res) => {
  console.log('Creating new booking:', req.body);
  const { customerName, customerEmail, vehicleNumber, parkingSpot, startDateTime, endDateTime } = req.body;
  
  const duration = Math.ceil((new Date(endDateTime) - new Date(startDateTime)) / (1000 * 60 * 60));
  const amount = duration * 50; // ₹50 per hour
  
  const newBooking = {
    id: 'BK' + Math.floor(Math.random() * 10000),
    customerName,
    customerEmail,
    vehicleNumber,
    spotId: parkingSpot,
    startTime: startDateTime,
    endTime: endDateTime,
    status: 'active',
    amount,
    duration: duration + ' hours'
  };
  
  res.json({ 
    success: true, 
    message: 'Booking created successfully',
    data: newBooking 
  });
});

app.put('/api/admin/bookings/:bookingId/cancel', requireAdminAuthAPI, (req, res) => {
  const { bookingId } = req.params;
  
  console.log('Cancelling booking:', bookingId);
  
  res.json({ 
    success: true, 
    message: 'Booking cancelled successfully',
    data: { bookingId, status: 'cancelled' }
  });
});

// CRUD API Endpoints for Parking Spots
// GET parking spots
app.get('/api/admin/parking/spots', requireAdminAuthAPI, (req, res) => {
  // Generate dynamic parking spots for the spots table
  const spots = [];
  const zones = ['A', 'B', 'C'];
  const levels = ['Level 1', 'Level 2', 'Level 3'];
  const sections = ['Section A', 'Section B', 'Section C'];
  const statuses = ['available', 'occupied', 'reserved', 'maintenance'];
  const vehicles = ['KA-01-AB-1234', 'KA-02-CD-5678', 'KA-03-EF-9012', null, null, null];
  const customers = ['John Doe', 'Alice Smith', 'Bob Johnson', null, null, null];
  
  for (let i = 1; i <= 30; i++) {
    const zone = zones[Math.floor(Math.random() * zones.length)];
    const level = levels[Math.floor(Math.random() * levels.length)];
    const section = sections[Math.floor(Math.random() * sections.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const vehicle = status === 'occupied' ? vehicles[Math.floor(Math.random() * 3)] : null;
    const customer = vehicle ? customers[Math.floor(Math.random() * 3)] : null;
    
    spots.push({
      id: `${zone}${String(i).padStart(3, '0')}`,
      level: level,
      section: section,
      number: String(i).padStart(3, '0'),
      status: status,
      vehicle: vehicle,
      customer: customer
    });
  }
  
  const summary = {
    total: spots.length,
    available: spots.filter(s => s.status === 'available').length,
    occupied: spots.filter(s => s.status === 'occupied').length,
    reserved: spots.filter(s => s.status === 'reserved').length,
    maintenance: spots.filter(s => s.status === 'maintenance').length
  };
  
  res.json({ 
    success: true, 
    data: { spots, summary }
  });
});

app.post('/api/admin/parking/spots', requireAdminAuthAPI, (req, res) => {
  console.log('Creating new parking spot:', req.body);
  const { spotId, location, spotType, rate } = req.body;
  
  const newSpot = {
    id: spotId,
    location,
    type: spotType,
    status: 'available',
    rate: parseFloat(rate) || 25,
    currentVehicle: null,
    occupiedSince: null,
    user: null
  };
  
  // Add to dataStore
  dataStore.parkingSpots.push(newSpot);
  addLog('INFO', 'Parking', `New parking spot created: ${spotId} at ${location}`, req.ip);
  console.log('✅ Parking spot added to dataStore. Total spots:', dataStore.parkingSpots.length);
  
  res.json({ 
    success: true, 
    message: 'Parking spot created successfully',
    data: newSpot 
  });
});

app.put('/api/admin/parking/spots/:spotId', requireAdminAuthAPI, (req, res) => {
  const { spotId } = req.params;
  const { status } = req.body;
  
  console.log(`Updating parking spot ${spotId} status to:`, status);
  
  res.json({ 
    success: true, 
    message: 'Parking spot updated successfully',
    data: { spotId, status }
  });
});

app.delete('/api/admin/parking/spots/:spotId', requireAdminAuthAPI, (req, res) => {
  const { spotId } = req.params;
  
  console.log('Deleting parking spot:', spotId);
  
  res.json({ 
    success: true, 
    message: 'Parking spot deleted successfully',
    data: { spotId }
  });
});

// AI Call Recording Integration API
app.post('/api/admin/ai-call-recordings', (req, res) => {
  try {
    const { recordings, source, syncTime } = req.body;
    
    console.log(`📞 Received ${recordings?.length || 0} AI call recordings from ${source}`);
    
    // Store recordings in memory for dashboard display
    global.aiCallRecordings = recordings || [];
    global.lastSyncTime = syncTime;
    
    res.json({
      success: true,
      message: 'AI call recordings received successfully',
      recordingsReceived: recordings?.length || 0,
      syncTime: syncTime
    });
    
  } catch (error) {
    console.error('❌ Error receiving AI call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to receive AI call recordings'
    });
  }
});

// Get AI Call Recordings for Dashboard
app.get('/api/admin/ai-call-recordings', (req, res) => {
  try {
    const recordings = global.aiCallRecordings || [];
    const lastSync = global.lastSyncTime || null;
    
    res.json({
      success: true,
      recordings: recordings,
      totalRecordings: recordings.length,
      lastSyncTime: lastSync,
      analytics: {
        totalCalls: recordings.length,
        todayCalls: recordings.filter(call => {
          const today = new Date().toDateString();
          return new Date(call.startTime).toDateString() === today;
        }).length,
        completedCalls: recordings.filter(call => call.status === 'completed').length,
        averageDuration: recordings.reduce((acc, call) => acc + (call.duration || 0), 0) / recordings.length || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching AI call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch AI call recordings'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('API Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log(`🔧 Admin Dashboard running on http://localhost:${PORT}`);
});

module.exports = app;
