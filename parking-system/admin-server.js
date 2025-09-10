// MongoDB-Connected Admin Dashboard Server
// Port: 8080
// Serves admin dashboard with real MongoDB data

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
const Payment = require('./models/Payment');
const Report = require('./models/Report');
const Setting = require('./models/Setting');
const ActivityLog = require('./models/ActivityLog');

// Import middlewares
const { activityLogger, getActivityLogs, getActivityStats } = require('./middlewares/activityLogger');
const { logger } = require('./middlewares/logger');

const app = express();
const PORT = process.env.ADMIN_PORT || 8081;

console.log(' Starting MongoDB-Connected Admin Server on port:', PORT);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log(' MongoDB connected successfully'))
.catch(err => console.error(' MongoDB connection error:', err));

// Handlebars setup with helpers
app.engine('handlebars', engine({
  defaultLayout: 'admin-main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    formatDate: function(date) {
      if (!date) return 'N/A';
      return new Date(date).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    },
    formatCurrency: function(amount) {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
      }).format(amount || 0);
    },
    eq: function(a, b) {
      return a === b;
    },
    inc: function(value) {
      return parseInt(value) + 1;
    },
    json: function(context) {
      return JSON.stringify(context);
    },
    formatDuration: function(minutes) {
      if (!minutes) return '0 min';
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    },
    capitalize: function(str) {
      return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    }
  }
}));

app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use(logger);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'admin-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Authentication middleware
const requireAuth = async (req, res, next) => {
  if (req.session.adminId) {
    // Add user info to request for activity logging
    try {
      const user = await User.findById(req.session.adminId);
      if (user) {
        req.user = {
          id: user._id,
          email: user.email,
          role: user.role || 'admin',
          name: user.name
        };
      }
    } catch (error) {
      console.error('Error fetching user for activity logging:', error);
    }
    next();
  } else {
    // Check if it's an API request
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        redirect: '/admin/login'
      });
    } else {
      res.redirect('/admin/login');
    }
  }
};

// Apply activity logging to all API routes
app.use('/api/', activityLogger);

// ===== AUTHENTICATION ROUTES =====

// Test login endpoint (for development only)
app.post('/api/test/login', async (req, res) => {
  try {
    // Find or create a test admin user
    let admin = await User.findOne({ email: 'admin@test.com', role: 'admin' });
    
    if (!admin) {
      // Create test admin user
      admin = new User({
        name: 'Test Admin',
        email: 'admin@test.com',
        phone: '0000000000',
        password: 'admin123',
        role: 'admin',
        status: 'active'
      });
      await admin.save();
      console.log(' Test admin user created');
    }
    
    // Set session
    req.session.adminId = admin._id;
    req.session.adminName = admin.name;
    req.session.adminEmail = admin.email;
    
    res.json({
      success: true,
      message: 'Test login successful',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });
  } catch (error) {
    console.error('Test login error:', error);
    res.status(500).json({
      success: false,
      message: 'Test login failed'
    });
  }
});

// Login page
app.get('/admin/login', (req, res) => {
  res.render('admin/login', { 
    layout: 'auth',
    title: 'Admin Login',
    error: req.query.error,
    success: req.query.success
  });
});

// Register page
app.get('/admin/register', (req, res) => {
  res.render('admin/register', { 
    layout: 'auth',
    title: 'Admin Registration',
    error: req.query.error
  });
});

// Register POST
app.post('/admin/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone, adminKey } = req.body;
    
    console.log('Admin registration attempt for:', email);
    
    // Validate input
    if (!name || !email || !password || !confirmPassword || !phone) {
      return res.redirect('/admin/register?error=All fields are required');
    }
    
    // Check admin key (simple security measure)
    const expectedAdminKey = process.env.ADMIN_REGISTRATION_KEY || 'VAYACCESS_ADMIN_2024';
    if (adminKey !== expectedAdminKey) {
      return res.redirect('/admin/register?error=Invalid admin registration key');
    }
    
    // Check password match
    if (password !== confirmPassword) {
      return res.redirect('/admin/register?error=Passwords do not match');
    }
    
    // Check password strength
    if (password.length < 6) {
      return res.redirect('/admin/register?error=Password must be at least 6 characters');
    }
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      email: email.toLowerCase() 
    });
    
    if (existingAdmin) {
      return res.redirect('/admin/register?error=Email already registered');
    }
    
    // Create admin user
    const adminUser = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      phone: phone.trim(),
      role: 'admin',
      status: 'active'
    });
    
    console.log(' Creating admin with password:', password ? '***' + password.slice(-2) : 'NO PASSWORD');
    
    await adminUser.save();
    
    console.log(' Admin user created successfully:', adminUser.name);
    console.log(' Admin email:', adminUser.email);
    
    // Test the password immediately after creation
    const testAdmin = await User.findOne({ email: adminUser.email }).select('+password');
    if (testAdmin) {
      const testResult = await testAdmin.comparePassword(password);
      console.log(' Immediate password test result:', testResult);
    }
    
    res.redirect('/admin/login?success=Admin account created successfully. Please login.');
  } catch (error) {
    console.error('Admin registration error:', error);
    if (error.code === 11000) {
      return res.redirect('/admin/register?error=Email already registered');
    }
    res.redirect('/admin/register?error=Registration failed. Please try again.');
  }
});

// Login POST
app.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log(' Login attempt for:', email);
    console.log(' Password provided:', password ? '***' + password.slice(-2) : 'NO PASSWORD');
    
    // Validate input
    if (!email || !password) {
      console.log(' Missing email or password');
      return res.redirect('/admin/login?error=Email and password are required');
    }
    
    // Find admin user in MongoDB (explicitly select password field)
    const admin = await User.findOne({ 
      email: email.toLowerCase(), 
      role: 'admin' 
    }).select('+password');
    
    if (!admin) {
      console.log(' Admin user not found:', email);
      // List all admin emails for debugging
      const allAdmins = await User.find({ role: 'admin' }).select('email name');
      console.log(' Available admin emails:', allAdmins.map(a => a.email));
      return res.redirect('/admin/login?error=Invalid credentials');
    }
    
    console.log(' Admin found:', admin.name, 'Email:', admin.email);
    console.log(' Password hash exists:', !!admin.password);
    console.log(' Password hash length:', admin.password ? admin.password.length : 0);
    
    // Check password
    try {
      const isValidPassword = await admin.comparePassword(password);
      console.log(' Password comparison result:', isValidPassword);
      
      if (!isValidPassword) {
        console.log(' Invalid password for:', email);
        return res.redirect('/admin/login?error=Invalid credentials');
      }
    } catch (passwordError) {
      console.error(' Password comparison error:', passwordError);
      return res.redirect('/admin/login?error=Authentication error');
    }
    
    console.log(' Login successful for:', admin.name);
    
    // Set session
    req.session.adminId = admin._id;
    req.session.adminName = admin.name;
    req.session.adminEmail = admin.email;
    
    console.log(' Session set for admin:', admin.name);
    
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error(' Login error:', error);
    res.redirect('/admin/login?error=Login failed');
  }
});

// Logout
app.post('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ===== DASHBOARD ROUTES =====

// Dashboard
app.get('/admin/dashboard', requireAuth, async (req, res) => {
  try {
    // Get real statistics from MongoDB
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalVehicles = await Vehicle.countDocuments();
    const totalSpots = await ParkingSpot.countDocuments();
    const occupiedSpots = await ParkingSpot.countDocuments({ status: 'occupied' });
    const availableSpots = await ParkingSpot.countDocuments({ status: 'available' });
    const totalBookings = await Booking.countDocuments();
    const activeBookings = await Booking.countDocuments({ status: 'active' });
    
    // Calculate revenue (mock for now)
    const totalRevenue = activeBookings * 500; // Approximate
    const todayRevenue = Math.floor(totalRevenue * 0.1); // 10% of total as today's
    
    // Recent activity from MongoDB
    const recentUsers = await User.find({ role: 'user' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email createdAt');
      
    const recentVehicles = await Vehicle.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('owner', 'name email')
      .select('licensePlate make model owner createdAt');
      
    const recentBookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name email')
      .populate('vehicle', 'licensePlate')
      .populate('parkingSpot', 'spotNumber')
      .select('user vehicle parkingSpot status amount createdAt');

    const stats = {
      totalUsers,
      totalVehicles,
      totalSpots,
      occupiedSpots,
      availableSpots,
      occupancyRate: totalSpots > 0 ? Math.round((occupiedSpots / totalSpots) * 100) : 0,
      totalBookings,
      activeBookings,
      totalRevenue,
      todayRevenue
    };

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      adminName: req.session.adminName,
      stats,
      recentUsers,
      recentVehicles,
      recentBookings
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load dashboard data' 
    });
  }
});

// ===== USER MANAGEMENT =====

// Users list
app.get('/admin/users', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    
    let query = { role: 'user' };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-password');
      
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

    res.render('admin/users', {
      title: 'User Management',
      adminName: req.session.adminName,
      users,
      currentPage: page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page + 1,
      prevPage: page - 1,
      search
    });
  } catch (error) {
    console.error('Users page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load users data' 
    });
  }
});

// ===== VEHICLE MANAGEMENT =====

// Vehicles list
app.get('/admin/vehicles', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    
    let query = {};
    if (search) {
      query.$or = [
        { licensePlate: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } }
      ];
    }
    
    const vehicles = await Vehicle.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('owner', 'name email phone');
      
    const totalVehicles = await Vehicle.countDocuments(query);
    const totalPages = Math.ceil(totalVehicles / limit);

    res.render('admin/vehicles', {
      title: 'Vehicle Management',
      adminName: req.session.adminName,
      vehicles,
      currentPage: page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page + 1,
      prevPage: page - 1,
      search
    });
  } catch (error) {
    console.error('Vehicles page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load vehicles data' 
    });
  }
});

// ===== PARKING MANAGEMENT =====

// Parking spots list
app.get('/admin/parking', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';
    
    let query = {};
    if (search) {
      query.$or = [
        { spotNumber: { $regex: search, $options: 'i' } },
        { 'location.name': { $regex: search, $options: 'i' } }
      ];
    }
    if (status) {
      query.status = status;
    }
    
    const spots = await ParkingSpot.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('currentVehicle', 'licensePlate make model');
      
    const totalSpots = await ParkingSpot.countDocuments(query);
    const totalPages = Math.ceil(totalSpots / limit);

    res.render('admin/parking', {
      title: 'Parking Management',
      adminName: req.session.adminName,
      spots,
      currentPage: page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page + 1,
      prevPage: page - 1,
      search,
      status
    });
  } catch (error) {
    console.error('Parking page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load parking data' 
    });
  }
});

// ===== BOOKINGS MANAGEMENT =====

// Bookings list
app.get('/admin/bookings', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const status = req.query.status || '';
    
    let query = {};
    if (status) {
      query.status = status;
    }
    
    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email phone')
      .populate('vehicle', 'licensePlate make model')
      .populate('parkingSpot', 'spotNumber location.name');
      
    const totalBookings = await Booking.countDocuments(query);
    const totalPages = Math.ceil(totalBookings / limit);

    res.render('admin/bookings', {
      title: 'Booking Management',
      adminName: req.session.adminName,
      bookings,
      currentPage: page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page + 1,
      prevPage: page - 1,
      status
    });
  } catch (error) {
    console.error('Bookings page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load bookings data' 
    });
  }
});

// ===== VEHICLE LOGS =====

// Payments page
app.get('/admin/payments', requireAuth, async (req, res) => {
  try {
    res.render('admin/payments', {
      title: 'Payment Management',
      adminName: req.session.adminName,
      currentPage: 'payments'
    });
  } catch (error) {
    console.error('Payments page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load payments page' 
    });
  }
});

// Vehicle logs
app.get('/admin/logs', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;
    const logType = req.query.type || '';
    
    let query = {};
    if (logType) {
      query.logType = logType;
    }
    
    const logs = await VehicleLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('vehicle', 'licensePlate make model')
      .populate('user', 'name email')
      .populate('parkingSpot', 'spotNumber location.name');
      
    const totalLogs = await VehicleLog.countDocuments(query);
    const totalPages = Math.ceil(totalLogs / limit);

    res.render('admin/logs', {
      title: 'Vehicle Logs',
      adminName: req.session.adminName,
      logs,
      currentPage: page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page + 1,
      prevPage: page - 1,
      logType
    });
  } catch (error) {
    console.error('Logs page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load logs data' 
    });
  }
});

// Activity Logs page
app.get('/admin/activity-logs', requireAuth, async (req, res) => {
  try {
    res.render('admin/activity-logs', {
      title: 'Activity Logs',
      adminName: req.session.adminName
    });
  } catch (error) {
    console.error('Activity logs page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load activity logs page' 
    });
  }
});

// Reports page
app.get('/admin/reports', requireAuth, async (req, res) => {
  try {
    res.render('admin/reports', {
      title: 'Reports Center',
      adminName: req.session.adminName
    });
  } catch (error) {
    console.error('Reports page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load reports page' 
    });
  }
});

// Analytics page
app.get('/admin/analytics', requireAuth, async (req, res) => {
  try {
    res.render('admin/analytics', {
      title: 'Analytics Dashboard',
      adminName: req.session.adminName
    });
  } catch (error) {
    console.error('Analytics page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load analytics page' 
    });
  }
});

// Insights page
app.get('/admin/insights', requireAuth, async (req, res) => {
  try {
    res.render('admin/insights', {
      title: 'Business Insights',
      adminName: req.session.adminName
    });
  } catch (error) {
    console.error('Insights page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load insights page' 
    });
  }
});

// Settings page
app.get('/admin/settings', requireAuth, async (req, res) => {
  try {
    res.render('admin/settings', {
      title: 'System Settings',
      adminName: req.session.adminName
    });
  } catch (error) {
    console.error('Settings page error:', error);
    res.render('admin/error', { 
      title: 'Error',
      message: 'Failed to load settings page' 
    });
  }
});

// ===== API ENDPOINTS FOR ADMIN ACTIONS =====

// Create new user
app.post('/admin/api/users', requireAuth, async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email already exists' 
      });
    }
    
    // Create new user
    const user = new User({
      name,
      email: email.toLowerCase(),
      phone,
      password,
      role: 'user',
      status: 'active'
    });
    
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create user' 
    });
  }
});

// Create new vehicle
app.post('/admin/api/vehicles', requireAuth, async (req, res) => {
  try {
    const { licensePlate, make, model, year, color, type, fuelType, ownerEmail } = req.body;
    
    // Find owner
    const owner = await User.findOne({ email: ownerEmail.toLowerCase(), role: 'user' });
    if (!owner) {
      return res.status(400).json({ 
        success: false, 
        message: 'Owner not found' 
      });
    }
    
    // Check if vehicle already exists
    const existingVehicle = await Vehicle.findOne({ 
      licensePlate: licensePlate.toUpperCase() 
    });
    if (existingVehicle) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vehicle with this license plate already exists' 
      });
    }
    
    // Create new vehicle
    const vehicle = new Vehicle({
      licensePlate: licensePlate.toUpperCase(),
      make,
      model,
      year,
      color,
      type: type || 'car',
      owner: owner._id,
      status: 'active',
      specifications: {
        fuelType: fuelType || 'petrol'
      },
      registration: {
        registrationNumber: licensePlate.toUpperCase()
      }
    });
    
    await vehicle.save();
    
    res.json({ 
      success: true, 
      message: 'Vehicle created successfully',
      vehicle: {
        id: vehicle._id,
        licensePlate: vehicle.licensePlate,
        make: vehicle.make,
        model: vehicle.model,
        owner: owner.name,
        status: vehicle.status,
        createdAt: vehicle.createdAt
      }
    });
  } catch (error) {
    console.error('Create vehicle error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create vehicle' 
    });
  }
});

// Create new parking spot
app.post('/admin/api/parking-spots', requireAuth, async (req, res) => {
  try {
    const { 
      spotNumber, 
      locationName, 
      locationAddress, 
      latitude, 
      longitude, 
      type, 
      hourlyRate 
    } = req.body;
    
    // Check if spot already exists
    const existingSpot = await ParkingSpot.findOne({ spotNumber });
    if (existingSpot) {
      return res.status(400).json({ 
        success: false, 
        message: 'Parking spot with this number already exists' 
      });
    }
    
    // Create new parking spot
    const spot = new ParkingSpot({
      spotNumber,
      location: {
        name: locationName,
        address: locationAddress,
        coordinates: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude)
        }
      },
      type: type || 'regular',
      dimensions: {
        length: 5.0,
        width: 2.5
      },
      pricing: {
        hourlyRate: parseFloat(hourlyRate)
      },
      status: 'available'
    });
    
    await spot.save();
    
    res.json({ 
      success: true, 
      message: 'Parking spot created successfully',
      spot: {
        id: spot._id,
        spotNumber: spot.spotNumber,
        location: spot.location.name,
        type: spot.type,
        status: spot.status,
        hourlyRate: spot.pricing.hourlyRate,
        createdAt: spot.createdAt
      }
    });
  } catch (error) {
    console.error('Create parking spot error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create parking spot' 
    });
  }
});

// ==========================================
// API ROUTES FOR FRONTEND AJAX CALLS
// ==========================================

// API: Get Users
app.get('/api/admin/users', requireAuth, async (req, res) => {
  try {
    const users = await User.find({})
      .populate('vehicles')
      .sort({ createdAt: -1 });
    
    const formattedUsers = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      vehicleCount: user.vehicles.length,
      walletBalance: user.wallet.balance,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }));
    
    res.json({
      success: true,
      users: formattedUsers,
      total: formattedUsers.length
    });
  } catch (error) {
    console.error('API Get users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users' 
    });
  }
});

// API: Create User
app.post('/api/admin/users', requireAuth, async (req, res) => {
  try {
    const { name, email, phone, role, password, status } = req.body;
    
    console.log('Creating user:', email, 'with role:', role);
    
    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone, and password are required'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Validate role
    const userRole = role || 'user';
    const validRoles = ['user', 'premium', 'admin', 'super_admin'];
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified. Valid roles are: ' + validRoles.join(', ')
      });
    }
    
    // Validate status
    const validStatuses = ['active', 'inactive', 'suspended'];
    const userStatus = status || 'active';
    if (!validStatuses.includes(userStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status specified'
      });
    }
    
    // Create new user with only valid fields
    const newUser = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      role: userRole,
      password: password,
      status: userStatus,
      profile: {
        // Only include fields that exist in the schema
        address: '',
        city: '',
        state: '',
        pincode: ''
      }
    });
    
    await newUser.save();
    console.log(' User created successfully:', newUser.email, 'ID:', newUser._id.toString().substring(0, 8));
    
    console.log('User created successfully:', newUser._id);
    
    res.json({
      success: true,
      message: 'User created successfully',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        status: newUser.status,
        createdAt: newUser.createdAt
      }
    });
  } catch (error) {
    console.error('API Create user error - Full error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error: ' + validationErrors.join(', '),
        details: error.errors
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      console.error('Duplicate key error:', error.keyPattern);
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email already exists'
      });
    }
    
    // Handle cast errors
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid data format: ' + error.message
      });
    }
    
    // Generic error with more details
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create user: ' + error.message,
      errorType: error.name,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// API: Update User
app.put('/api/admin/users/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, status } = req.body;
    
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { name, email: email.toLowerCase(), phone, role, status },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        status: updatedUser.status
      }
    });
  } catch (error) {
    console.error('API Update user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user' 
    });
  }
});

// API: Update User Status
app.put('/api/admin/users/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User status updated successfully',
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        status: updatedUser.status
      }
    });
  } catch (error) {
    console.error('API Update user status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user status' 
    });
  }
});

// API: Delete User
app.delete('/api/admin/users/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedUser = await User.findByIdAndDelete(id);
    
    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('API Delete user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user' 
    });
  }
});

// API: Get Vehicles
app.get('/api/admin/vehicles', requireAuth, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({})
      .populate('owner', 'name email phone')
      .sort({ createdAt: -1 });
    
    const formattedVehicles = vehicles.map(vehicle => ({
      id: vehicle._id,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      type: vehicle.type,
      owner: vehicle.owner ? {
        id: vehicle.owner._id,
        name: vehicle.owner.name,
        email: vehicle.owner.email,
        phone: vehicle.owner.phone
      } : null,
      status: vehicle.status,
      createdAt: vehicle.createdAt
    }));
    
    res.json({
      success: true,
      vehicles: formattedVehicles,
      total: formattedVehicles.length
    });
  } catch (error) {
    console.error('API Get vehicles error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch vehicles' 
    });
  }
});

// API: Create Vehicle
app.post('/api/admin/vehicles', requireAuth, async (req, res) => {
  try {
    const { licensePlate, make, model, color, type, ownerId } = req.body;
    
    // Check if vehicle already exists
    const existingVehicle = await Vehicle.findOne({ 
      licensePlate: licensePlate.toUpperCase() 
    });
    if (existingVehicle) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle with this license plate already exists'
      });
    }
    
    // Verify owner exists
    const owner = await User.findById(ownerId);
    if (!owner) {
      return res.status(400).json({
        success: false,
        message: 'Owner not found'
      });
    }
    
    // Create new vehicle with all required fields
    const newVehicle = new Vehicle({
      licensePlate: licensePlate.toUpperCase(),
      make,
      model,
      year: new Date().getFullYear(), // Default to current year
      color,
      type: type || 'car',
      owner: ownerId,
      status: 'active',
      specifications: {
        fuelType: 'petrol' // Default fuel type
      },
      registration: {
        registrationNumber: licensePlate.toUpperCase(), // Use license plate as registration number
        registrationDate: new Date(),
        state: 'Unknown',
        rto: 'Unknown'
      }
    });
    
    await newVehicle.save();
    
    // Add vehicle to owner's vehicles array
    await User.findByIdAndUpdate(ownerId, {
      $push: { vehicles: newVehicle._id }
    });
    
    // Populate owner data for response
    await newVehicle.populate('owner', 'name email phone');
    
    res.json({
      success: true,
      message: 'Vehicle created successfully',
      vehicle: {
        id: newVehicle._id,
        licensePlate: newVehicle.licensePlate,
        make: newVehicle.make,
        model: newVehicle.model,
        color: newVehicle.color,
        type: newVehicle.type,
        owner: {
          id: newVehicle.owner._id,
          name: newVehicle.owner.name,
          email: newVehicle.owner.email
        },
        status: newVehicle.status,
        createdAt: newVehicle.createdAt
      }
    });
  } catch (error) {
    console.error('API Create vehicle error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create vehicle' 
    });
  }
});

// API: Create Parking Spot (Frontend expects /parking/spots)
app.post('/api/admin/parking/spots', requireAuth, async (req, res) => {
  try {
    const { spotNumber, location, type, hourlyRate } = req.body;
    
    // Check if spot already exists
    const existingSpot = await ParkingSpot.findOne({ spotNumber });
    if (existingSpot) {
      return res.status(400).json({
        success: false,
        message: 'Parking spot with this number already exists'
      });
    }
    
    // Create new parking spot with all required fields
    const newSpot = new ParkingSpot({
      spotNumber,
      location: {
        name: location || 'Main Parking',
        address: 'VayAccess Parking Facility',
        coordinates: {
          latitude: 12.9716,
          longitude: 77.5946
        }
      },
      type: type === 'standard' ? 'regular' : (type || 'regular'), // Map 'standard' to 'regular'
      status: 'available',
      dimensions: {
        length: 5.0, // Default parking spot length
        width: 2.5   // Default parking spot width
      },
      pricing: {
        hourlyRate: hourlyRate || 50,
        dailyRate: (hourlyRate || 50) * 24
      }
    });
    
    await newSpot.save();
    
    res.json({
      success: true,
      message: 'Parking spot created successfully',
      spot: {
        id: newSpot._id,
        spotNumber: newSpot.spotNumber,
        location: newSpot.location.name,
        type: newSpot.type,
        status: newSpot.status,
        hourlyRate: newSpot.pricing.hourlyRate,
        createdAt: newSpot.createdAt
      }
    });
  } catch (error) {
    console.error('API Create parking spot error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create parking spot' 
    });
  }
});

// API: Get Parking Data (Dashboard stats)
app.get('/api/admin/parking', requireAuth, async (req, res) => {
  try {
    const totalSpots = await ParkingSpot.countDocuments();
    const availableSpots = await ParkingSpot.countDocuments({ status: 'available' });
    const occupiedSpots = await ParkingSpot.countDocuments({ status: 'occupied' });
    const reservedSpots = await ParkingSpot.countDocuments({ status: 'reserved' });
    
    res.json({
      success: true,
      data: {
        totalSpots,
        availableSpots,
        occupiedSpots,
        reservedSpots,
        occupancyRate: totalSpots > 0 ? Math.round((occupiedSpots / totalSpots) * 100) : 0
      }
    });
  } catch (error) {
    console.error('API Get parking data error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch parking data' 
    });
  }
});

// API: Get Parking Data (Dashboard stats)
app.get('/api/admin/parking', requireAuth, async (req, res) => {
  try {
    const totalSpots = await ParkingSpot.countDocuments();
    const availableSpots = await ParkingSpot.countDocuments({ status: 'available' });
    const occupiedSpots = await ParkingSpot.countDocuments({ status: 'occupied' });
    const reservedSpots = await ParkingSpot.countDocuments({ status: 'reserved' });
    
    res.json({
      success: true,
      data: {
        totalSpots,
        availableSpots,
        occupiedSpots,
        reservedSpots,
        occupancyRate: totalSpots > 0 ? Math.round((occupiedSpots / totalSpots) * 100) : 0
      }
    });
  } catch (error) {
    console.error('API Get parking data error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch parking data' 
    });
  }
});

// API: Get Parking Spots (Frontend expects /parking/spots)
app.get('/api/admin/parking/spots', requireAuth, async (req, res) => {
  try {
    const parkingSpots = await ParkingSpot.find({})
      .populate('currentVehicle', 'licensePlate make model')
      .sort({ spotNumber: 1 });
    
    const formattedSpots = parkingSpots.map(spot => ({
      id: spot._id,
      spotNumber: spot.spotNumber,
      location: spot.location.name,
      type: spot.type,
      status: spot.status,
      hourlyRate: spot.pricing.hourlyRate,
      currentVehicle: spot.currentVehicle ? {
        id: spot.currentVehicle._id,
        licensePlate: spot.currentVehicle.licensePlate,
        make: spot.currentVehicle.make,
        model: spot.currentVehicle.model
      } : null,
      createdAt: spot.createdAt
    }));
    
    res.json({
      success: true,
      parkingSpots: formattedSpots,
      total: formattedSpots.length
    });
  } catch (error) {
    console.error('API Get parking spots error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch parking spots' 
    });
  }
});

// API: Get Bookings
app.get('/api/admin/bookings', requireAuth, async (req, res) => {
  try {
    const bookings = await Booking.find({})
      .populate('user', 'name email phone')
      .populate('vehicle', 'licensePlate make model')
      .populate('parkingSpot', 'spotNumber location.name')
      .sort({ createdAt: -1 });
    
    const formattedBookings = bookings.map(booking => ({
      id: booking._id,
      user: booking.user ? {
        id: booking.user._id,
        name: booking.user.name,
        email: booking.user.email,
        phone: booking.user.phone
      } : null,
      vehicle: booking.vehicle ? {
        id: booking.vehicle._id,
        licensePlate: booking.vehicle.licensePlate,
        make: booking.vehicle.make,
        model: booking.vehicle.model
      } : null,
      parkingSpot: booking.parkingSpot ? {
        id: booking.parkingSpot._id,
        spotNumber: booking.parkingSpot.spotNumber,
        location: booking.parkingSpot.location.name
      } : null,
      startTime: booking.timeline ? booking.timeline.startTime : booking.startTime,
      endTime: booking.timeline ? booking.timeline.endTime : booking.endTime,
      status: booking.status,
      totalAmount: booking.pricing ? booking.pricing.totalAmount : (booking.payment ? booking.payment.totalAmount : 0),
      paymentStatus: booking.payment ? booking.payment.status : 'pending',
      createdAt: booking.createdAt
    }));
    
    // Calculate additional stats for frontend
    const activeBookings = formattedBookings.filter(b => b.status === 'active' || b.status === 'confirmed').length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBookings = formattedBookings.filter(b => new Date(b.createdAt) >= today);
    const todayRevenue = todayBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    
    // Generate hourly data for chart
    const hourlyData = [];
    for (let i = 0; i < 24; i++) {
      const hour = `${i.toString().padStart(2, '0')}:00`;
      const bookingsCount = formattedBookings.filter(b => {
        const bookingHour = new Date(b.createdAt).getHours();
        return bookingHour === i;
      }).length;
      hourlyData.push({ hour, bookings: bookingsCount });
    }
    
    res.json({
      success: true,
      bookings: formattedBookings,
      total: formattedBookings.length,
      active: activeBookings,
      todayCount: todayBookings.length,
      todayRevenue: todayRevenue,
      recentActivity: formattedBookings.slice(0, 5),
      hourlyData: hourlyData
    });
  } catch (error) {
    console.error('API Get bookings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch bookings' 
    });
  }
});

// API: Create Booking  
app.post('/api/admin/bookings', requireAuth, async (req, res) => {
  console.log(' Booking API called with body:', JSON.stringify(req.body, null, 2));
  
  try {
    // Handle both old format (IDs) and new format (names/numbers)
    let { userId, vehicleId, parkingSpotId, startTime, endTime, totalAmount } = req.body;
    const { customerName, customerEmail, vehicleNumber, parkingSpot, startDateTime, endDateTime } = req.body;
    
    console.log(' Extracted data:', {
      userId, vehicleId, parkingSpotId, startTime, endTime, totalAmount,
      customerName, customerEmail, vehicleNumber, parkingSpot, startDateTime, endDateTime
    });
    
    // If frontend sends customer info, find/create the entities
    if (customerName || customerEmail || vehicleNumber || parkingSpot) {
      console.log(' Creating booking from form data:', { customerName, customerEmail, vehicleNumber, parkingSpot });
      
      // Find or create user
      console.log(' Looking for user...');
      let user;
      if (customerEmail) {
        console.log(` Searching for user by email: ${customerEmail}`);
        user = await User.findOne({ email: customerEmail.toLowerCase() });
        console.log(` User found by email:`, user ? user.name : 'Not found');
      }
      if (!user && customerName) {
        console.log(` Searching for user by name: ${customerName}`);
        user = await User.findOne({ name: { $regex: new RegExp(customerName, 'i') } });
        console.log(` User found by name:`, user ? user.name : 'Not found');
      }
      
      // If user doesn't exist, create one
      if (!user) {
        console.log(' Creating new user...');
        const email = customerEmail || `${customerName.toLowerCase().replace(/\s+/g, '.')}@temp.com`;
        user = new User({
          name: customerName || 'Guest User',
          email: email,
          phone: '0000000000',
          role: 'user',
          password: 'temp123',
          status: 'active'
        });
        console.log(' Saving new user:', user.name, user.email);
        await user.save();
        console.log(' Created new user:', user.name);
      } else {
        console.log(' Using existing user:', user.name);
      }
      userId = user._id;
      
      // Find vehicle by license plate
      console.log(' Looking for vehicle...');
      let vehicle;
      if (vehicleNumber) {
        console.log(` Searching for vehicle: ${vehicleNumber}`);
        vehicle = await Vehicle.findOne({ licensePlate: vehicleNumber.toUpperCase() });
        console.log(` Vehicle found:`, vehicle ? vehicle.licensePlate : 'Not found');
      }
      
      // If vehicle doesn't exist, create one
      if (!vehicle && vehicleNumber) {
        console.log(' Creating new vehicle...');
        vehicle = new Vehicle({
          licensePlate: vehicleNumber.toUpperCase(),
          make: 'Unknown',
          model: 'Unknown',
          year: new Date().getFullYear(),
          color: 'Unknown',
          type: 'car',
          owner: userId,
          status: 'active',
          specifications: { fuelType: 'petrol' },
          registration: {
            registrationNumber: vehicleNumber.toUpperCase(),
            registrationDate: new Date(),
            state: 'Unknown',
            rto: 'Unknown'
          }
        });
        console.log(' Saving new vehicle:', vehicle.licensePlate);
        await vehicle.save();
        
        // Add vehicle to user's vehicles array
        console.log(' Linking vehicle to user...');
        await User.findByIdAndUpdate(userId, {
          $push: { vehicles: vehicle._id }
        });
        console.log(' Created new vehicle:', vehicle.licensePlate);
      } else if (vehicle) {
        console.log(' Using existing vehicle:', vehicle.licensePlate);
      }
      
      if (!vehicle) {
        console.log(' No vehicle available');
        throw new Error('Vehicle creation failed');
      }
      
      vehicleId = vehicle._id;
      
      // Find parking spot by spot number
      console.log(' Looking for parking spot...');
      let spot;
      if (parkingSpot) {
        console.log(` Searching for parking spot: ${parkingSpot}`);
        spot = await ParkingSpot.findOne({ spotNumber: parkingSpot });
        console.log(` Parking spot found:`, spot ? `${spot.spotNumber} (${spot.status})` : 'Not found');
      }
      if (!spot) {
        console.log(' Parking spot not found');
        return res.status(400).json({
          success: false,
          message: `Parking spot "${parkingSpot}" not found. Available spots: BLR-001, BLR-002, BLR-003, MUM-001, MUM-002`
        });
      }
      parkingSpotId = spot._id;
      
      // Convert and validate datetime formats from datetime-local inputs (e.g., "YYYY-MM-DDTHH:mm")
      console.log(' Converting datetime formats...');
      const parseDateTimeLocal = (val) => {
        if (!val || typeof val !== 'string') return null;
        let s = val.trim();
        // If seconds are missing, append ":00"
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
          s = s + ':00';
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
      };

      const parsedStart = parseDateTimeLocal(startDateTime);
      const parsedEnd = parseDateTimeLocal(endDateTime);
      if (!parsedStart || !parsedEnd) {
        console.log(' Invalid date values received:', { startDateTime, endDateTime });
        return res.status(400).json({
          success: false,
          message: 'Invalid date/time. Please provide valid Start and End date-times.'
        });
      }
      if (parsedEnd <= parsedStart) {
        console.log(' End time is not after start time:', { parsedStart, parsedEnd });
        return res.status(400).json({
          success: false,
          message: 'End time must be after start time.'
        });
      }

      startTime = parsedStart;
      endTime = parsedEnd;
      totalAmount = 100; // Default amount
      console.log(' Times set:', { startTime, endTime, totalAmount });
    }
    
    // Verify all required entities exist
    console.log(' Verifying all entities exist...');
    console.log('IDs to verify:', { userId, vehicleId, parkingSpotId });
    
    const user = await User.findById(userId);
    const vehicle = await Vehicle.findById(vehicleId);
    const spotEntity = await ParkingSpot.findById(parkingSpotId);
    
    console.log('Entity verification:', { 
      user: user ? `${user.name} (${user.email})` : 'Not found',
      vehicle: vehicle ? vehicle.licensePlate : 'Not found',
      spotEntity: spotEntity ? `${spotEntity.spotNumber} (${spotEntity.status})` : 'Not found'
    });
    
    if (!user || !vehicle || !spotEntity) {
      console.log(' Entity verification failed');
      return res.status(400).json({
        success: false,
        message: `Invalid references - User: ${!!user}, Vehicle: ${!!vehicle}, ParkingSpot: ${!!spotEntity}`
      });
    }
    
    // Check if parking spot is available
    console.log(' Checking parking spot availability...');
    if (spotEntity.status !== 'available') {
      console.log(' Parking spot not available:', spotEntity.status);
      return res.status(400).json({
        success: false,
        message: 'Parking spot is not available'
      });
    }
    
    // Create new booking with correct structure
    console.log(' Creating new booking...');
    const bookingAmount = totalAmount || 100; // Default amount
    const newBooking = new Booking({
      user: userId,
      vehicle: vehicleId,
      parkingSpot: parkingSpotId,
      timeline: {
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        bookedAt: new Date()
      },
      pricing: {
        baseAmount: bookingAmount,
        taxes: 0,
        discount: 0,
        extraCharges: 0,
        totalAmount: bookingAmount
      },
      payment: {
        status: 'pending',
        method: 'cash',
        paidAmount: 0
      },
      status: 'confirmed',
      bookingType: 'hourly',
      metadata: {
        source: 'web'
      }
    });
    
    console.log(' Saving booking...');
    await newBooking.save();
    console.log(' Booking saved successfully:', newBooking._id);
    
    // Update parking spot status
    await ParkingSpot.findByIdAndUpdate(parkingSpotId, {
      status: 'occupied',
      currentVehicle: vehicleId
    });
    
    // Populate data for response
    await newBooking.populate([
      { path: 'user', select: 'name email phone' },
      { path: 'vehicle', select: 'licensePlate make model' },
      { path: 'parkingSpot', select: 'spotNumber location.name' }
    ]);
    
    res.json({
      success: true,
      message: 'Booking created successfully',
      booking: {
        id: newBooking._id,
        user: newBooking.user,
        vehicle: newBooking.vehicle,
        parkingSpot: newBooking.parkingSpot,
        startTime: newBooking.timeline.startTime,
        endTime: newBooking.timeline.endTime,
        status: newBooking.status,
        totalAmount: newBooking.pricing.totalAmount,
        createdAt: newBooking.createdAt
      }
    });
  } catch (error) {
    console.error('API Create booking error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    // Return more detailed error information
    res.status(500).json({ 
      success: false, 
      message: `Failed to create booking: ${error.message}`,
      error: process.env.NODE_ENV === 'development' ? error.stack : 'Internal server error'
    });
  }
});

// API: Get Parking Spots
app.get('/api/admin/parking-spots', requireAuth, async (req, res) => {
  try {
    const spots = await ParkingSpot.find({})
      .sort({ spotNumber: 1 });
    
    const formattedSpots = spots.map(spot => ({
      id: spot._id,
      spotNumber: spot.spotNumber,
      location: spot.location,
      type: spot.type,
      status: spot.status,
      pricing: spot.pricing,
      createdAt: spot.createdAt
    }));
    
    res.json({
      success: true,
      spots: formattedSpots,
      total: formattedSpots.length,
      available: formattedSpots.filter(s => s.status === 'available').length
    });
  } catch (error) {
    console.error('API Get parking spots error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch parking spots' 
    });
  }
});

// API: Get Logs
app.get('/api/admin/logs', requireAuth, async (req, res) => {
  try {
    const logs = await VehicleLog.find({})
      .populate('vehicle', 'licensePlate make model')
      .populate('parkingSpot', 'spotNumber location.name')
      .sort({ timestamp: -1 })
      .limit(100);
    
    const formattedLogs = logs.map(log => ({
      id: log._id,
      vehicle: log.vehicle ? {
        id: log.vehicle._id,
        licensePlate: log.vehicle.licensePlate,
        make: log.vehicle.make,
        model: log.vehicle.model
      } : null,
      parkingSpot: log.parkingSpot ? {
        id: log.parkingSpot._id,
        spotNumber: log.parkingSpot.spotNumber,
        location: log.parkingSpot.location.name
      } : null,
      action: log.action,
      timestamp: log.timestamp,
      confidence: log.confidence,
      imageUrl: log.imageUrl
    }));
    
    res.json({
      success: true,
      logs: formattedLogs,
      total: formattedLogs.length
    });
  } catch (error) {
    console.error('API Get logs error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch logs' 
    });
  }
});

// API: Update Vehicle
app.put('/api/admin/vehicles/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { licensePlate, make, model, color, type, ownerId, status } = req.body;
    
    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      id,
      { 
        licensePlate: licensePlate.toUpperCase(), 
        make, 
        model, 
        color, 
        type, 
        owner: ownerId,
        status 
      },
      { new: true }
    ).populate('owner', 'name email phone');
    
    if (!updatedVehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      vehicle: {
        id: updatedVehicle._id,
        licensePlate: updatedVehicle.licensePlate,
        make: updatedVehicle.make,
        model: updatedVehicle.model,
        color: updatedVehicle.color,
        type: updatedVehicle.type,
        owner: updatedVehicle.owner,
        status: updatedVehicle.status
      }
    });
  } catch (error) {
    console.error('API Update vehicle error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update vehicle' 
    });
  }
});

// API: Delete Vehicle
app.delete('/api/admin/vehicles/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedVehicle = await Vehicle.findByIdAndDelete(id);
    
    if (!deletedVehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }
    
    // Remove vehicle from owner's vehicles array
    if (deletedVehicle.owner) {
      await User.findByIdAndUpdate(deletedVehicle.owner, {
        $pull: { vehicles: id }
      });
    }
    
    res.json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (error) {
    console.error('API Delete vehicle error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete vehicle' 
    });
  }
});

// API: Update Parking Spot (Frontend expects /parking/spots/:id)
app.put('/api/admin/parking/spots/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { spotNumber, location, type, status, hourlyRate } = req.body;
    
    const updatedSpot = await ParkingSpot.findByIdAndUpdate(
      id,
      { 
        spotNumber,
        'location.name': location,
        type,
        status,
        'pricing.hourlyRate': hourlyRate
      },
      { new: true }
    ).populate('currentVehicle', 'licensePlate make model');
    
    if (!updatedSpot) {
      return res.status(404).json({
        success: false,
        message: 'Parking spot not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Parking spot updated successfully',
      spot: {
        id: updatedSpot._id,
        spotNumber: updatedSpot.spotNumber,
        location: updatedSpot.location.name,
        type: updatedSpot.type,
        status: updatedSpot.status,
        hourlyRate: updatedSpot.pricing.hourlyRate,
        currentVehicle: updatedSpot.currentVehicle
      }
    });
  } catch (error) {
    console.error('API Update parking spot error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update parking spot' 
    });
  }
});

// API: Delete Parking Spot (Frontend expects /parking/spots/:id)
app.delete('/api/admin/parking/spots/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedSpot = await ParkingSpot.findByIdAndDelete(id);
    
    if (!deletedSpot) {
      return res.status(404).json({
        success: false,
        message: 'Parking spot not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Parking spot deleted successfully'
    });
  } catch (error) {
    console.error('API Delete parking spot error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete parking spot' 
    });
  }
});

// API: Update Booking
app.put('/api/admin/bookings/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, endTime, totalAmount, paymentStatus } = req.body;
    
    const updateData = { status };
    if (endTime) updateData.endTime = new Date(endTime);
    if (totalAmount) updateData['payment.totalAmount'] = totalAmount;
    if (paymentStatus) updateData['payment.status'] = paymentStatus;
    
    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate([
      { path: 'user', select: 'name email phone' },
      { path: 'vehicle', select: 'licensePlate make model' },
      { path: 'parkingSpot', select: 'spotNumber location.name' }
    ]);
    
    if (!updatedBooking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // If booking is completed, free up the parking spot
    if (status === 'completed') {
      await ParkingSpot.findByIdAndUpdate(updatedBooking.parkingSpot._id, {
        status: 'available',
        $unset: { currentVehicle: 1 }
      });
    }
    
    res.json({
      success: true,
      message: 'Booking updated successfully',
      booking: {
        id: updatedBooking._id,
        user: updatedBooking.user,
        vehicle: updatedBooking.vehicle,
        parkingSpot: updatedBooking.parkingSpot,
        startTime: updatedBooking.startTime,
        endTime: updatedBooking.endTime,
        status: updatedBooking.status,
        totalAmount: updatedBooking.payment.totalAmount,
        paymentStatus: updatedBooking.payment.status
      }
    });
  } catch (error) {
    console.error('API Update booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update booking' 
    });
  }
});

// API: Delete Booking
app.delete('/api/admin/bookings/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedBooking = await Booking.findByIdAndDelete(id);
    
    if (!deletedBooking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Free up the parking spot
    if (deletedBooking.parkingSpot) {
      await ParkingSpot.findByIdAndUpdate(deletedBooking.parkingSpot, {
        status: 'available',
        $unset: { currentVehicle: 1 }
      });
    }
    
    res.json({
      success: true,
      message: 'Booking deleted successfully'
    });
  } catch (error) {
    console.error('API Delete booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete booking' 
    });
  }
});

// API: Get Payments
app.get('/api/admin/payments', requireAuth, async (req, res) => {
  try {
    const bookings = await Booking.find({})
      .populate('user', 'name email phone')
      .populate('vehicle', 'licensePlate make model')
      .populate('parkingSpot', 'spotNumber location.name')
      .sort({ createdAt: -1 });
    
    const payments = bookings.map(booking => ({
      id: booking._id,
      booking: booking.bookingId || booking._id,
      user: booking.user ? booking.user.name : 'Unknown',
      vehicle: booking.vehicle ? booking.vehicle.licensePlate : 'Unknown',
      parkingSpot: booking.parkingSpot ? booking.parkingSpot.spotNumber : 'Unknown',
      amount: booking.pricing ? booking.pricing.totalAmount : 0,
      status: booking.payment ? booking.payment.status : 'pending',
      method: booking.payment ? booking.payment.method : 'cash',
      transactionId: booking.payment ? booking.payment.transactionId : '',
      paidAt: booking.payment ? booking.payment.paidAt : null,
      bookingStatus: booking.status,
      startTime: booking.timeline ? booking.timeline.startTime : booking.startTime,
      endTime: booking.timeline ? booking.timeline.endTime : booking.endTime,
      date: booking.createdAt,
      createdAt: booking.createdAt
    }));
    
    // Calculate payment method statistics
    const totalRevenue = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const todayRevenue = payments
      .filter(p => new Date(p.createdAt).toDateString() === new Date().toDateString())
      .reduce((sum, payment) => sum + (payment.amount || 0), 0);
    
    const methodCounts = {
      upi: payments.filter(p => p.method && p.method === 'upi').length,
      card: payments.filter(p => p.method && p.method === 'card').length,
      wallet: payments.filter(p => p.method && p.method === 'wallet').length,
      cash: payments.filter(p => !p.method || p.method === 'cash' || p.method === 'admin_created' || p.method === 'free').length
    };
    
    const totalPayments = payments.length;
    const methods = {
      upi: totalPayments > 0 ? Math.round((methodCounts.upi / totalPayments) * 100) : 0,
      card: totalPayments > 0 ? Math.round((methodCounts.card / totalPayments) * 100) : 0,
      wallet: totalPayments > 0 ? Math.round((methodCounts.wallet / totalPayments) * 100) : 0,
      cash: totalPayments > 0 ? Math.round((methodCounts.cash / totalPayments) * 100) : 0
    };
    
    const pendingAmount = payments
      .filter(p => p.status === 'pending')
      .reduce((sum, payment) => sum + (payment.amount || 0), 0);

    res.json({
      success: true,
      data: {
        totalRevenue: totalRevenue,
        todayRevenue: todayRevenue,
        pendingAmount: pendingAmount,
        methods: methods,
        payments: payments
      },
      total: payments.length
    });
  } catch (error) {
    console.error('API Get payments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payments' 
    });
  }
});

// API: Update Payment Status
app.put('/api/admin/payments/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transactionId } = req.body;
    
    const updateData = {
      'payment.status': status
    };
    
    if (transactionId) {
      updateData['payment.transactionId'] = transactionId;
    }
    
    if (status === 'completed') {
      updateData['payment.paidAt'] = new Date();
    }
    
    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate([
      { path: 'user', select: 'name email phone' },
      { path: 'vehicle', select: 'licensePlate make model' },
      { path: 'parkingSpot', select: 'spotNumber location.name' }
    ]);
    
    if (!updatedBooking) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Payment updated successfully',
      payment: {
        id: updatedBooking._id,
        amount: updatedBooking.payment.totalAmount,
        status: updatedBooking.payment.status,
        method: updatedBooking.payment.method,
        transactionId: updatedBooking.payment.transactionId,
        paidAt: updatedBooking.payment.paidAt
      }
    });
  } catch (error) {
    console.error('API Update payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update payment' 
    });
  }
});

// API: Get Insights
app.get('/api/admin/insights', requireAuth, async (req, res) => {
  try {
    const [userCount, vehicleCount, parkingSpotCount, bookingCount] = await Promise.all([
      User.countDocuments({}),
      Vehicle.countDocuments({}),
      ParkingSpot.countDocuments({}),
      Booking.countDocuments({})
    ]);
    
    const [availableSpots, occupiedSpots, totalRevenue] = await Promise.all([
      ParkingSpot.countDocuments({ status: 'available' }),
      ParkingSpot.countDocuments({ status: 'occupied' }),
      Booking.aggregate([
        { $match: { 'payment.status': 'completed' } },
        { $group: { _id: null, total: { $sum: '$payment.totalAmount' } } }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        totalUsers: userCount,
        totalVehicles: vehicleCount,
        totalParkingSpots: parkingSpotCount,
        totalBookings: bookingCount,
        availableSpots: availableSpots,
        occupiedSpots: occupiedSpots,
        totalRevenue: totalRevenue[0]?.total || 0,
        occupancyRate: parkingSpotCount > 0 ? ((occupiedSpots / parkingSpotCount) * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    console.error('API Get insights error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch insights' 
    });
  }
});

// API: Get Analytics
app.get('/api/admin/analytics', requireAuth, async (req, res) => {
  try {
    const [userCount, vehicleCount, bookingCount, totalRevenue] = await Promise.all([
      User.countDocuments({}),
      Vehicle.countDocuments({}),
      Booking.countDocuments({}),
      Booking.aggregate([
        { $match: { 'payment.status': 'completed' } },
        { $group: { _id: null, total: { $sum: '$payment.totalAmount' } } }
      ])
    ]);
    
    // Generate monthly data for charts
    const monthlyData = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthName = date.toLocaleString('default', { month: 'short' });
      
      const monthBookings = await Booking.countDocuments({
        createdAt: {
          $gte: new Date(date.getFullYear(), date.getMonth(), 1),
          $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
        }
      });
      
      monthlyData.push({ month: monthName, bookings: monthBookings });
    }
    
    res.json({
      success: true,
      data: {
        totalUsers: userCount,
        totalVehicles: vehicleCount,
        totalBookings: bookingCount,
        totalRevenue: totalRevenue[0]?.total || 0,
        monthlyData: monthlyData
      }
    });
  } catch (error) {
    console.error('API Get analytics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch analytics' 
    });
  }
});

// API: Get Dashboard Stats
app.get('/api/admin/dashboard', requireAuth, async (req, res) => {
  try {
    const [userCount, vehicleCount, parkingSpotCount, bookingCount] = await Promise.all([
      User.countDocuments({}),
      Vehicle.countDocuments({}),
      ParkingSpot.countDocuments({}),
      Booking.countDocuments({})
    ]);
    
    const [availableSpots, occupiedSpots, totalRevenue] = await Promise.all([
      ParkingSpot.countDocuments({ status: 'available' }),
      ParkingSpot.countDocuments({ status: 'occupied' }),
      Booking.aggregate([
        { $match: { 'payment.status': 'completed' } },
        { $group: { _id: null, total: { $sum: '$payment.totalAmount' } } }
      ])
    ]);
    
    const recentBookings = await Booking.find({})
      .populate('user', 'name email')
      .populate('vehicle', 'licensePlate')
      .populate('parkingSpot', 'spotNumber')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Normalized response shape to match frontend admin.js expectations
    const recentActivity = recentBookings.map(booking => ({
      type: 'booking',
      message: `${booking.user?.name || 'Unknown'} booked spot ${booking.parkingSpot?.spotNumber || 'N/A'} for ${booking.vehicle?.licensePlate || 'Unknown'}`,
      status: booking.status === 'completed' ? 'success' : (booking.status === 'cancelled' ? 'warning' : 'info'),
      time: booking.createdAt
    }));

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers: userCount,
          totalVehicles: vehicleCount,
          totalSpots: parkingSpotCount,
          totalBookings: bookingCount,
          availableSpots,
          occupiedSpots,
          totalRevenue: totalRevenue[0]?.total || 0,
          todayBookings: recentBookings.filter(b => {
            const d = new Date(); d.setHours(0,0,0,0);
            return new Date(b.createdAt) >= d;
          }).length
        },
        recentActivity
      }
    });
  } catch (error) {
    console.error('API Get dashboard stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard stats' 
    });
  }
});

// API: Create Payment
app.post('/api/admin/payments', requireAuth, async (req, res) => {
  try {
    const { bookingId, userId, amount, method, description } = req.body;
    
    // Validate required fields
    if (!bookingId || !userId || !amount || !method) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: bookingId, userId, amount, method'
      });
    }

    // Create new payment
    const newPayment = new Payment({
      bookingId,
      userId,
      amount,
      method,
      description: description || '',
      status: 'completed', // Default to completed for admin-created payments
      transactionId: `TXN${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`
    });

    await newPayment.save();
    await newPayment.populate(['bookingId', 'userId']);

    res.json({
      success: true,
      message: 'Payment created successfully',
      payment: newPayment
    });
  } catch (error) {
    console.error('API Create payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create payment' 
    });
  }
});

// ==================== REPORTS API ====================

// API: Get Reports
app.get('/api/admin/reports', requireAuth, async (req, res) => {
  try {
    const reports = await Report.find({})
      .populate('generatedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);

    // Generate sample data for reports
    const revenueData = await Booking.aggregate([
      {
        $match: {
          'payment.status': 'completed',
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$pricing.totalAmount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const usageData = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const occupancyData = await ParkingSpot.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        reports: reports,
        analytics: {
          revenue: revenueData,
          usage: usageData,
          occupancy: occupancyData
        },
        summary: {
          totalReports: reports.length,
          completedReports: reports.filter(r => r.status === 'completed').length,
          totalRevenue: revenueData.reduce((sum, item) => sum + item.revenue, 0)
        }
      }
    });
  } catch (error) {
    console.error('API Get reports error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch reports' 
    });
  }
});

// API: Create Report
app.post('/api/admin/reports', requireAuth, async (req, res) => {
  try {
    const { title, type, dateRange, filters } = req.body;
    
    // Generate report data based on type
    let reportData = {};
    
    switch (type) {
      case 'revenue':
        reportData = await Booking.aggregate([
          {
            $match: {
              createdAt: { 
                $gte: new Date(dateRange.start), 
                $lte: new Date(dateRange.end) 
              }
            }
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$pricing.totalAmount" },
              totalBookings: { $sum: 1 },
              avgRevenue: { $avg: "$pricing.totalAmount" }
            }
          }
        ]);
        break;
      case 'usage':
        reportData = await Booking.aggregate([
          {
            $match: {
              createdAt: { 
                $gte: new Date(dateRange.start), 
                $lte: new Date(dateRange.end) 
              }
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              bookings: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);
        break;
      default:
        reportData = { message: 'Report type not implemented' };
    }

    const newReport = new Report({
      title,
      type,
      dateRange,
      filters: filters || {},
      data: reportData,
      generatedBy: req.user.id,
      status: 'completed',
      summary: {
        totalRecords: Array.isArray(reportData) ? reportData.length : 1,
        totalRevenue: reportData[0]?.totalRevenue || 0,
        averageValue: reportData[0]?.avgRevenue || 0
      }
    });

    await newReport.save();
    await newReport.populate('generatedBy', 'name email');

    res.json({
      success: true,
      message: 'Report generated successfully',
      report: newReport
    });
  } catch (error) {
    console.error('API Create report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create report' 
    });
  }
});

// ==================== ANALYTICS API ====================

// API: Get Analytics
app.get('/api/admin/analytics', requireAuth, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let startDate;
    switch (period) {
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    // Revenue Analytics
    const revenueAnalytics = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          'payment.status': 'completed'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$pricing.totalAmount" },
          bookings: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Usage Analytics
    const usageAnalytics = await Booking.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Vehicle Type Analytics
    const vehicleAnalytics = await Vehicle.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 }
        }
      }
    ]);

    // Occupancy Analytics
    const occupancyAnalytics = await ParkingSpot.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // User Growth Analytics
    const userGrowth = await User.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          newUsers: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        revenue: revenueAnalytics,
        usage: usageAnalytics,
        vehicles: vehicleAnalytics,
        occupancy: occupancyAnalytics,
        userGrowth: userGrowth,
        summary: {
          totalRevenue: revenueAnalytics.reduce((sum, item) => sum + item.revenue, 0),
          totalBookings: revenueAnalytics.reduce((sum, item) => sum + item.bookings, 0),
          avgDailyRevenue: revenueAnalytics.length > 0 ? 
            revenueAnalytics.reduce((sum, item) => sum + item.revenue, 0) / revenueAnalytics.length : 0,
          peakHour: usageAnalytics.length > 0 ? 
            usageAnalytics.reduce((max, item) => item.count > max.count ? item : max, usageAnalytics[0])._id : 0
        }
      }
    });
  } catch (error) {
    console.error('API Get analytics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch analytics' 
    });
  }
});

// ==================== INSIGHTS API ====================

// API: Get Insights
app.get('/api/admin/insights', requireAuth, async (req, res) => {
  try {
    // Revenue Insights
    const totalRevenue = await Booking.aggregate([
      { $match: { 'payment.status': 'completed' } },
      { $group: { _id: null, total: { $sum: "$pricing.totalAmount" } } }
    ]);

    const monthlyRevenue = await Booking.aggregate([
      {
        $match: {
          'payment.status': 'completed',
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      { $group: { _id: null, total: { $sum: "$pricing.totalAmount" } } }
    ]);

    // Usage Insights
    const totalBookings = await Booking.countDocuments();
    const activeBookings = await Booking.countDocuments({ status: 'active' });
    const completedBookings = await Booking.countDocuments({ status: 'completed' });

    // Peak Hours Analysis
    const peakHours = await Booking.aggregate([
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Popular Parking Spots
    const popularSpots = await Booking.aggregate([
      {
        $lookup: {
          from: 'parkingspots',
          localField: 'parkingSpot',
          foreignField: '_id',
          as: 'spot'
        }
      },
      { $unwind: '$spot' },
      {
        $group: {
          _id: '$spot.spotNumber',
          bookings: { $sum: 1 },
          revenue: { $sum: '$pricing.totalAmount' }
        }
      },
      { $sort: { bookings: -1 } },
      { $limit: 10 }
    ]);

    // User Behavior Insights
    const userInsights = await User.aggregate([
      {
        $lookup: {
          from: 'bookings',
          localField: '_id',
          foreignField: 'user',
          as: 'bookings'
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          bookingCount: { $size: '$bookings' },
          totalSpent: {
            $sum: {
              $map: {
                input: '$bookings',
                as: 'booking',
                in: '$$booking.pricing.totalAmount'
              }
            }
          }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 }
    ]);

    // Predictive Insights
    const predictions = {
      nextWeekRevenue: monthlyRevenue[0]?.total * 0.25 || 0,
      expectedBookings: Math.ceil(totalBookings * 0.1),
      recommendedPricing: {
        peak: 150,
        normal: 100,
        off: 75
      }
    };

    res.json({
      success: true,
      data: {
        revenue: {
          total: totalRevenue[0]?.total || 0,
          monthly: monthlyRevenue[0]?.total || 0,
          growth: monthlyRevenue[0]?.total > 0 ? 
            ((monthlyRevenue[0].total / (totalRevenue[0]?.total || 1)) * 100).toFixed(1) : 0
        },
        usage: {
          totalBookings,
          activeBookings,
          completedBookings,
          utilizationRate: totalBookings > 0 ? 
            ((completedBookings / totalBookings) * 100).toFixed(1) : 0
        },
        peakHours,
        popularSpots,
        topUsers: userInsights,
        predictions,
        recommendations: [
          {
            type: 'pricing',
            title: 'Optimize Peak Hour Pricing',
            description: 'Consider increasing prices during peak hours (9-11 AM, 6-8 PM)',
            impact: 'high',
            priority: 1
          },
          {
            type: 'capacity',
            title: 'Add More Spots in Popular Areas',
            description: 'High demand areas need additional parking capacity',
            impact: 'medium',
            priority: 2
          },
          {
            type: 'marketing',
            title: 'Target Off-Peak Usage',
            description: 'Promote discounted rates during low-usage hours',
            impact: 'medium',
            priority: 3
          }
        ]
      }
    });
  } catch (error) {
    console.error('API Get insights error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch insights' 
    });
  }
});

// ==================== SETTINGS API ====================

// API: Get Settings
app.get('/api/admin/settings', requireAuth, async (req, res) => {
  try {
    const settings = await Setting.find({})
      .populate('lastModifiedBy', 'name email')
      .sort({ category: 1, key: 1 });

    // Group settings by category
    const groupedSettings = settings.reduce((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = [];
      }
      acc[setting.category].push(setting);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        settings: groupedSettings,
        categories: Object.keys(groupedSettings),
        total: settings.length
      }
    });
  } catch (error) {
    console.error('API Get settings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch settings' 
    });
  }
});

// API: Update Setting
app.put('/api/admin/settings/:key', requireAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    const setting = await Setting.findOneAndUpdate(
      { key },
      { 
        value, 
        description: description || '',
        lastModifiedBy: req.user.id,
        updatedAt: new Date()
      },
      { new: true, upsert: true }
    ).populate('lastModifiedBy', 'name email');

    res.json({
      success: true,
      message: 'Setting updated successfully',
      setting
    });
  } catch (error) {
    console.error('API Update setting error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update setting' 
    });
  }
});

// API: Create Setting
app.post('/api/admin/settings', requireAuth, async (req, res) => {
  try {
    const { key, value, type, category, description, isPublic } = req.body;

    const existingSetting = await Setting.findOne({ key });
    if (existingSetting) {
      return res.status(400).json({
        success: false,
        message: 'Setting with this key already exists'
      });
    }

    const newSetting = new Setting({
      key,
      value,
      type,
      category,
      description: description || '',
      isPublic: isPublic || false,
      lastModifiedBy: req.user.id
    });

    await newSetting.save();
    await newSetting.populate('lastModifiedBy', 'name email');

    res.json({
      success: true,
      message: 'Setting created successfully',
      setting: newSetting
    });
  } catch (error) {
    console.error('API Create setting error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create setting' 
    });
  }
});

// API: Delete Setting
app.delete('/api/admin/settings/:key', requireAuth, async (req, res) => {
  try {
    const { key } = req.params;

    const setting = await Setting.findOneAndDelete({ key });
    if (!setting) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    res.json({
      success: true,
      message: 'Setting deleted successfully'
    });
  } catch (error) {
    console.error('API Delete setting error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete setting' 
    });
  }
});

// Initialize default settings
async function initializeDefaultSettings() {
  try {
    const defaultSettings = [
      { key: 'general_site_name', value: 'Parking Management System', type: 'string', category: 'general', description: 'Site Name' },
      { key: 'general_timezone', value: 'Asia/Kolkata', type: 'string', category: 'general', description: 'Timezone' },
      { key: 'general_language', value: 'en', type: 'string', category: 'general', description: 'Default Language' },
      { key: 'general_maintenance_mode', value: false, type: 'boolean', category: 'general', description: 'Maintenance Mode' },
      { key: 'parking_base_price', value: 50, type: 'number', category: 'parking', description: 'Base Price (₹)' },
      { key: 'parking_price_per_hour', value: 25, type: 'number', category: 'parking', description: 'Price Per Hour (₹)' },
      { key: 'parking_max_booking_duration', value: 12, type: 'number', category: 'parking', description: 'Max Booking Duration (hours)' },
      { key: 'parking_advance_booking_days', value: 7, type: 'number', category: 'parking', description: 'Advance Booking (days)' },
      { key: 'parking_dynamic_pricing', value: false, type: 'boolean', category: 'parking', description: 'Enable Dynamic Pricing' },
      { key: 'notification_email_notifications', value: true, type: 'boolean', category: 'notification', description: 'Email Notifications' },
      { key: 'notification_sms_notifications', value: false, type: 'boolean', category: 'notification', description: 'SMS Notifications' },
      { key: 'notification_push_notifications', value: true, type: 'boolean', category: 'notification', description: 'Push Notifications' },
      { key: 'notification_reminder_time', value: 30, type: 'number', category: 'notification', description: 'Reminder Time (minutes)' },
      { key: 'security_session_timeout', value: 120, type: 'number', category: 'security', description: 'Session Timeout (minutes)' },
      { key: 'security_max_login_attempts', value: 5, type: 'number', category: 'security', description: 'Max Login Attempts' },
      { key: 'security_two_factor_auth', value: false, type: 'boolean', category: 'security', description: 'Two-Factor Authentication' },
      { key: 'security_ip_whitelist', value: false, type: 'boolean', category: 'security', description: 'IP Whitelist' }
    ];

    for (const setting of defaultSettings) {
      const existingSetting = await Setting.findOne({ key: setting.key });
      if (!existingSetting) {
        await Setting.create(setting);
      }
    }
    console.log(' Default settings initialized');
  } catch (error) {
    console.error(' Error initializing default settings:', error);
  }
}

// Initialize default admin users
async function initializeDefaultAdmins() {
  try {
    // Check if any admin users exist
    const adminCount = await User.countDocuments({ role: 'admin' });
    
    if (adminCount === 0) {
      console.log(' Creating default admin users...');
      
      // Create Super Admin
      const superAdminPassword = await bcrypt.hash('Admin@123', 10);
      const superAdmin = new User({
        name: 'Super Admin',
        email: 'admin@vayaccess.com',
        phone: '+1234567890',
        password: superAdminPassword,
        role: 'admin',
        permissions: ['all'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await superAdmin.save();
      console.log(' Super Admin created: admin@vayaccess.com / Admin@123');
      
      // Create Manager
      const managerPassword = await bcrypt.hash('User@123', 10);
      const manager = new User({
        name: 'John Manager',
        email: 'john.manager@vayaccess.com',
        phone: '+1234567891',
        password: managerPassword,
        role: 'admin',
        permissions: ['dashboard', 'bookings', 'payments', 'reports'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await manager.save();
      console.log(' Manager created: john.manager@vayaccess.com / User@123');
      
      // Create Test Admin for development
      const testAdminPassword = await bcrypt.hash('test123', 10);
      const testAdmin = new User({
        name: 'Test Admin',
        email: 'admin@test.com',
        phone: '+1234567892',
        password: testAdminPassword,
        role: 'admin',
        permissions: ['all'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await testAdmin.save();
      console.log(' Test Admin created: admin@test.com / test123');
      
      console.log(' Default admin users created successfully!');
    } else {
      console.log(` Found ${adminCount} existing admin user(s)`);
    }
  } catch (error) {
    console.error(' Error creating default admin users:', error);
  }
}

// Initialize default settings and admin users on startup
initializeDefaultSettings();
initializeDefaultAdmins();

// ===== ACTIVITY LOG API ENDPOINTS =====

// API: Get Activity Logs
app.get('/api/admin/activity-logs', requireAuth, getActivityLogs);

// API: Get Activity Statistics
app.get('/api/admin/activity-stats', requireAuth, getActivityStats);

// API: Get User Activity History
app.get('/api/admin/user-activity/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const activities = await ActivityLog.getUserActivities(userId, parseInt(limit), parseInt(page));
    const total = await ActivityLog.countDocuments({ userId });
    
    res.json({
      success: true,
      data: {
        activities: activities.map(activity => activity.toSafeObject()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user activity'
    });
  }
});

// API: Export Activity Logs
app.get('/api/admin/export-activity-logs', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate, userRole, format = 'json' } = req.query;
    
    const query = {};
    if (userRole) query.userRole = userRole;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    const logs = await ActivityLog.find(query)
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(10000); // Limit for performance
    
    if (format === 'csv') {
      const csv = logs.map(log => ({
        timestamp: log.timestamp.toISOString(),
        userEmail: log.userEmail,
        userRole: log.userRole,
        action: log.action,
        method: log.method,
        endpoint: log.endpoint,
        responseStatus: log.responseStatus,
        success: log.success,
        duration: log.duration,
        ipAddress: log.ipAddress
      }));
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="activity-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      
      // Simple CSV conversion
      const headers = Object.keys(csv[0] || {});
      const csvContent = [
        headers.join(','),
        ...csv.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
      ].join('\n');
      
      res.send(csvContent);
    } else {
      res.json({
        success: true,
        data: logs.map(log => log.toSafeObject()),
        exportedAt: new Date().toISOString(),
        totalRecords: logs.length
      });
    }
  } catch (error) {
    console.error('Error exporting activity logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export activity logs'
    });
  }
});

// Default redirects
app.get('/admin', (req, res) => {
  res.redirect('/admin/dashboard');
});

app.get('/', (req, res) => {
  res.redirect('/admin/dashboard');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).render('admin/error', {
    title: 'Server Error',
    message: 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('admin/404', {
    title: 'Page Not Found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(` MongoDB-Connected Admin Server running on http://localhost:${PORT}/admin/`);
  console.log(` Dashboard: http://localhost:${PORT}/admin/dashboard`);
  console.log(` Login: http://localhost:${PORT}/admin/login`);
});

module.exports = app;
