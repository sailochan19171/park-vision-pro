/**
 * User Dashboard Server
 * Port: 3002
 * Serves user dashboard with authentication
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { engine } = require('express-handlebars');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Import middlewares
const { activityLogger } = require('./middlewares/activityLogger');
const { logger } = require('./middlewares/logger');

const app = express();
const PORT = process.env.USER_PORT || 3002;

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/parking_system';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log(' MongoDB connected successfully to User Server');
  })
  .catch((error) => {
    console.error(' MongoDB connection error:', error);
    process.exit(1);
  });

// MongoDB Models (reusing from admin server)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const vehicleSchema = new mongoose.Schema({
  licensePlate: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  model: { type: String, required: true },
  color: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

const parkingSpotSchema = new mongoose.Schema({
  spotNumber: { type: String, required: true, unique: true },
  location: {
    name: { type: String, required: true },
    floor: { type: String, required: true },
    section: { type: String, required: true }
  },
  type: { type: String, enum: ['regular', 'premium', 'disabled'], default: 'regular' },
  status: { type: String, enum: ['available', 'occupied', 'maintenance'], default: 'available' },
  pricePerHour: { type: Number, required: true, default: 25 },
  createdAt: { type: Date, default: Date.now }
});

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  parkingSpot: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSpot', required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  duration: { type: Number, required: true }, // in minutes
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['card', 'upi', 'wallet', 'cash'], required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  transactionId: { type: String, unique: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Create models
const User = mongoose.model('User', userSchema);
const Vehicle = mongoose.model('Vehicle', vehicleSchema);
const ParkingSpot = mongoose.model('ParkingSpot', parkingSpotSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// Handlebars configuration
app.engine('handlebars', engine({
  defaultLayout: 'user-main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    eq: (a, b) => a === b,
    formatDate: (date) => new Date(date).toLocaleDateString(),
    formatTime: (date) => new Date(date).toLocaleTimeString(),
    json: (obj) => JSON.stringify(obj),
    formatDuration: (minutes) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    },
    formatCurrency: (amount) => `₹${amount.toFixed(2)}`
  }
}));

app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views/user'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging middleware
app.use(logger);

// Session configuration
app.use(session({
  secret: process.env.JWT_SECRET || 'user-secret-key',
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

// Authentication middleware for user routes
const requireUserAuth = async (req, res, next) => {
  if (!req.session.user) {
    // Check if this is an API request
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
        error: 'UNAUTHORIZED'
      });
    }
    return res.redirect('/user/login');
  }
  
  // Add user info to request for activity logging
  try {
    const user = await User.findById(req.session.user.id);
    if (user) {
      req.user = {
        id: user._id,
        email: user.email,
        role: 'user',
        name: user.name
      };
    }
  } catch (error) {
    console.error('Error fetching user for activity logging:', error);
  }
  
  next();
};

// Apply activity logging to all API routes
app.use('/api/', activityLogger);

// User routes
app.get('/', (req, res) => {
  res.redirect('/user/dashboard');
});

// Redirect common paths
app.get('/register', (req, res) => {
  res.redirect('/user/register');
});

// Test API page (for development)
app.get('/test-api', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-api.html'));
});

app.get('/login', (req, res) => {
  res.redirect('/user/login');
});

app.get('/bookings', (req, res) => {
  res.redirect('/user/bookings');
});

app.get('/payments', (req, res) => {
  res.redirect('/user/payments');
});

// Login/Register pages
app.get('/user/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/user/dashboard');
  }
  res.render('login', { 
    title: 'User Login - VayAccess',
    layout: 'auth'
  });
});

app.get('/user/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/user/dashboard');
  }
  res.render('register', { 
    title: 'User Registration - VayAccess',
    layout: 'auth'
  });
});

// Dashboard redirect
app.get('/dashboard', requireUserAuth, (req, res) => {
  res.redirect('/user/dashboard');
});

// Dashboard
app.get('/user/dashboard', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Fetch user's data
    const [userVehicles, userBookings, userPayments, availableSpots] = await Promise.all([
      Vehicle.find({ owner: userId }).lean(),
      Booking.find({ user: userId })
        .populate('vehicle', 'licensePlate type model')
        .populate('parkingSpot', 'spotNumber location')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Payment.find({ userId: userId })
        .populate('bookingId', 'startTime endTime')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      ParkingSpot.find({ status: 'available' }).limit(10).lean()
    ]);

    // Calculate dashboard stats
    const totalBookings = await Booking.countDocuments({ user: userId });
    const activeBookings = await Booking.countDocuments({ user: userId, status: 'active' });
    const totalSpent = await Payment.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const dashboardData = {
      stats: {
        totalVehicles: userVehicles.length,
        totalBookings,
        activeBookings,
        totalSpent: totalSpent.length > 0 ? totalSpent[0].total : 0,
        availableSpots: availableSpots.length
      },
      recentBookings: userBookings,
      recentPayments: userPayments,
      userVehicles,
      availableSpots
    };

    res.render('dashboard', {
      title: 'Dashboard - VayAccess User',
      user: req.session.user,
      activeTab: 'dashboard',
      data: dashboardData
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('dashboard', {
      title: 'Dashboard - VayAccess User',
      user: req.session.user,
      activeTab: 'dashboard',
      error: 'Failed to load dashboard data'
    });
  }
});

// Parking Spots
app.get('/user/parking', requireUserAuth, (req, res) => {
  res.render('parking', {
    title: 'Find Parking - VayAccess User',
    user: req.session.user,
    activeTab: 'parking'
  });
});

// My Bookings
app.get('/user/bookings', requireUserAuth, (req, res) => {
  res.render('bookings', {
    title: 'My Bookings - VayAccess User',
    user: req.session.user,
    activeTab: 'bookings'
  });
});

// Vehicle Management
app.get('/user/vehicles', requireUserAuth, (req, res) => {
  res.render('vehicles', {
    title: 'My Vehicles - VayAccess User',
    user: req.session.user,
    activeTab: 'vehicles'
  });
});

// Payment History
app.get('/user/payments', requireUserAuth, (req, res) => {
  res.render('payments', {
    title: 'Payment History - VayAccess User',
    user: req.session.user,
    activeTab: 'payments'
  });
});

// Profile Management
app.get('/user/profile', requireUserAuth, (req, res) => {
  res.render('profile', {
    title: 'My Profile - VayAccess User',
    user: req.session.user,
    activeTab: 'profile'
  });
});

// Notifications
app.get('/user/notifications', requireUserAuth, (req, res) => {
  res.render('notifications', {
    title: 'Notifications - VayAccess User',
    user: req.session.user,
    activeTab: 'notifications'
  });
});

// Profile Settings
app.get('/user/profile', requireUserAuth, (req, res) => {
  res.render('profile', {
    title: 'Profile Settings - VayAccess User',
    user: req.session.user,
    activeTab: 'profile'
  });
});

// ==================== ADDITIONAL ROUTES (without /user prefix) ====================

// Find Parking (alias for /user/parking)
app.get('/find-parking', requireUserAuth, (req, res) => {
  res.render('parking', {
    title: 'Find Parking - VayAccess User',
    user: req.session.user,
    activeTab: 'parking'
  });
});

// Bookings (alias for /user/bookings)
app.get('/bookings', requireUserAuth, (req, res) => {
  res.render('bookings', {
    title: 'My Bookings - VayAccess User',
    user: req.session.user,
    activeTab: 'bookings'
  });
});

// Vehicles (alias for /user/vehicles)
app.get('/vehicles', requireUserAuth, (req, res) => {
  res.render('vehicles', {
    title: 'My Vehicles - VayAccess User',
    user: req.session.user,
    activeTab: 'vehicles'
  });
});

// Add Vehicle
app.get('/vehicles/add', requireUserAuth, (req, res) => {
  res.render('add-vehicle', {
    title: 'Add Vehicle - VayAccess User',
    user: req.session.user,
    activeTab: 'vehicles'
  });
});

// Payments (alias for /user/payments)
app.get('/payments', requireUserAuth, (req, res) => {
  res.render('payments', {
    title: 'Payment History - VayAccess User',
    user: req.session.user,
    activeTab: 'payments'
  });
});

// Profile (alias for /user/profile)
app.get('/profile', requireUserAuth, (req, res) => {
  res.render('profile', {
    title: 'My Profile - VayAccess User',
    user: req.session.user,
    activeTab: 'profile'
  });
});

// Settings
app.get('/settings', requireUserAuth, (req, res) => {
  res.render('settings', {
    title: 'Settings - VayAccess User',
    user: req.session.user,
    activeTab: 'settings'
  });
});

// Notifications
app.get('/notifications', requireUserAuth, (req, res) => {
  res.render('notifications', {
    title: 'Notifications - VayAccess User',
    user: req.session.user,
    activeTab: 'notifications'
  });
});

// Logout routes
app.get('/user/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/user/login');
  });
});

app.post('/user/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/user/login');
  });
});

app.get('/logout', (req, res) => {
  res.redirect('/user/logout');
});

app.post('/logout', (req, res) => {
  res.redirect('/user/logout');
});

// Login processing (MongoDB authentication)
app.post('/user/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    
    console.log('User login attempt:', { email, rememberMe });
    
    // Find user in database
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Create demo users if they don't exist
      const demoUsers = [
        {
          name: 'Alice Johnson',
          email: 'alice@example.com',
          phone: '+91 98765 43210',
          password: await bcrypt.hash('User@123', 10),
          isActive: true
        },
        {
          name: 'Bob Smith',
          email: 'bob@example.com',
          phone: '+91 87654 32109',
          password: await bcrypt.hash('User@123', 10),
          isActive: true
        },
        {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+91 76543 21098',
          password: await bcrypt.hash('User@123', 10),
          isActive: true
        }
      ];
      
      // Create demo user if it's one of the demo emails
      const demoUser = demoUsers.find(u => u.email === email.toLowerCase());
      if (demoUser) {
        const newUser = new User(demoUser);
        await newUser.save();
        
        // Set session
        req.session.user = {
          id: newUser._id.toString(),
          email: newUser.email,
          name: newUser.name,
          phone: newUser.phone,
          loginTime: new Date().toISOString()
        };
        
        if (rememberMe) {
          req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        }
        
        console.log('Demo user created and logged in:', req.session.user);
        return res.redirect('/user/dashboard');
      }
      
      return res.render('login', {
        title: 'User Login - VayAccess',
        layout: 'auth',
        error: 'Invalid email or password. Please check your credentials.',
        email: email
      });
    }
    
    // Validate password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.render('login', {
        title: 'User Login - VayAccess',
        layout: 'auth',
        error: 'Invalid email or password. Please check your credentials.',
        email: email
      });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.render('login', {
        title: 'User Login - VayAccess',
        layout: 'auth',
        error: 'Your account has been deactivated. Please contact support.',
        email: email
      });
    }
    
    // Set session
    req.session.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      phone: user.phone,
      loginTime: new Date().toISOString()
    };
    
    // Set session expiry
    if (rememberMe) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }
    
    console.log('User login successful:', req.session.user);
    return res.redirect('/user/dashboard');
    
  } catch (error) {
    console.error('User login error:', error);
    res.render('login', {
      title: 'User Login - VayAccess',
      layout: 'auth',
      error: 'Login failed due to server error. Please try again.'
    });
  }
});

// POST route for /login (redirects to user login)
app.post('/login', (req, res) => {
  // Forward the request to /user/login
  req.url = '/user/login';
  app._router.handle(req, res);
});

// Register processing (MongoDB registration)
app.post('/user/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    
    console.log('User registration attempt:', { name, email, phone });
    
    // Basic validation
    if (!name || !email || !password) {
      return res.render('register', {
        title: 'User Registration - VayAccess',
        layout: 'auth',
        error: 'Please fill in all required fields.',
        name, email, phone
      });
    }
    
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.render('register', {
        title: 'User Registration - VayAccess',
        layout: 'auth',
        error: 'Please enter a valid email address.',
        name, email, phone
      });
    }
    
    // Password validation
    if (password.length < 6) {
      return res.render('register', {
        title: 'User Registration - VayAccess',
        layout: 'auth',
        error: 'Password must be at least 6 characters long.',
        name, email, phone
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.render('register', {
        title: 'User Registration - VayAccess',
        layout: 'auth',
        error: 'An account with this email already exists. Please try logging in.',
        name, phone
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      password: hashedPassword,
      isActive: true
    });
    
    await newUser.save();
    
    // Create user session
    req.session.user = {
      id: newUser._id.toString(),
      email: newUser.email,
      name: newUser.name,
      phone: newUser.phone,
      registrationTime: new Date().toISOString(),
      loginTime: new Date().toISOString()
    };
    
    console.log('User registration successful:', req.session.user);
    return res.redirect('/user/dashboard?welcome=true');
    
  } catch (error) {
    console.error('User registration error:', error);
    res.render('register', {
      title: 'User Registration - VayAccess',
      layout: 'auth',
      error: 'Registration failed due to server error. Please try again.'
    });
  }
});

// ==================== USER API ENDPOINTS ====================

// API: Get User Dashboard Data
app.get('/api/user/dashboard', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Fetch user's data
    const [userVehicles, userBookings, userPayments, availableSpots] = await Promise.all([
      Vehicle.find({ owner: userId }).lean(),
      Booking.find({ user: userId })
        .populate('vehicle', 'licensePlate type model')
        .populate('parkingSpot', 'spotNumber location')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Payment.find({ userId: userId })
        .populate('bookingId', 'startTime endTime')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      ParkingSpot.find({ status: 'available' }).limit(20).lean()
    ]);

    // Calculate dashboard stats
    const totalBookings = await Booking.countDocuments({ user: userId });
    const activeBookings = await Booking.countDocuments({ user: userId, status: 'active' });
    const totalSpent = await Payment.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalVehicles: userVehicles.length,
          totalBookings,
          activeBookings,
          totalSpent: totalSpent.length > 0 ? totalSpent[0].total : 0,
          availableSpots: availableSpots.length
        },
        recentBookings: userBookings,
        recentPayments: userPayments,
        userVehicles,
        availableSpots
      }
    });
  } catch (error) {
    console.error('API Dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load dashboard data' 
    });
  }
});

// API: Get User Profile
app.get('/api/user/profile', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const user = await User.findById(userId).select('-password').lean();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          isActive: user.isActive,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('API Profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load profile data' 
    });
  }
});

// API: Get User Bookings
app.get('/api/user/bookings', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const bookings = await Booking.find({ user: userId })
      .populate('vehicle', 'licensePlate type model color')
      .populate('parkingSpot', 'spotNumber location pricePerHour')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalBookings = await Booking.countDocuments({ user: userId });

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalBookings / limit),
          totalBookings,
          hasNext: page < Math.ceil(totalBookings / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('API Bookings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load bookings' 
    });
  }
});

// API: Create New Booking
app.post('/api/user/bookings', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { vehicleId, parkingSpotId, startTime, endTime } = req.body;

    // Validate required fields
    if (!vehicleId || !parkingSpotId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if parking spot is available
    const parkingSpot = await ParkingSpot.findById(parkingSpotId);
    if (!parkingSpot || parkingSpot.status !== 'available') {
      return res.status(400).json({
        success: false,
        message: 'Parking spot is not available'
      });
    }

    // Calculate duration and amount
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = Math.ceil((end - start) / (1000 * 60)); // in minutes
    const totalAmount = Math.ceil(duration / 60) * parkingSpot.pricePerHour;

    // Create booking
    const newBooking = new Booking({
      user: userId,
      vehicle: vehicleId,
      parkingSpot: parkingSpotId,
      startTime: start,
      endTime: end,
      duration,
      totalAmount,
      status: 'active',
      paymentStatus: 'pending'
    });

    await newBooking.save();

    // Update parking spot status
    await ParkingSpot.findByIdAndUpdate(parkingSpotId, { status: 'occupied' });

    // Populate the booking for response
    await newBooking.populate(['vehicle', 'parkingSpot']);

    res.json({
      success: true,
      message: 'Booking created successfully',
      data: newBooking
    });
  } catch (error) {
    console.error('API Create booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create booking' 
    });
  }
});

// API: Get User Vehicles
app.get('/api/user/vehicles', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const vehicles = await Vehicle.find({ owner: userId }).lean();

    res.json({
      success: true,
      data: vehicles
    });
  } catch (error) {
    console.error('API Vehicles error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load vehicles' 
    });
  }
});

// API: Add New Vehicle
app.post('/api/user/vehicles', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { licensePlate, type, model, color } = req.body;

    // Validate required fields
    if (!licensePlate || !type || !model || !color) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if vehicle already exists
    const existingVehicle = await Vehicle.findOne({ licensePlate: licensePlate.toUpperCase() });
    if (existingVehicle) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle with this license plate already exists'
      });
    }

    // Create new vehicle
    const newVehicle = new Vehicle({
      licensePlate: licensePlate.toUpperCase(),
      owner: userId,
      type,
      model,
      color,
      status: 'active'
    });

    await newVehicle.save();

    res.json({
      success: true,
      message: 'Vehicle added successfully',
      data: newVehicle
    });
  } catch (error) {
    console.error('API Add vehicle error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to add vehicle' 
    });
  }
});

// API: Get User Payments
app.get('/api/user/payments', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const payments = await Payment.find({ userId: userId })
      .populate({
        path: 'bookingId',
        populate: {
          path: 'vehicle parkingSpot',
          select: 'licensePlate type spotNumber location'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPayments = await Payment.countDocuments({ userId: userId });

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalPayments / limit),
          totalPayments,
          hasNext: page < Math.ceil(totalPayments / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('API Payments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load payments' 
    });
  }
});

// API: Get Available Parking Spots
app.get('/api/user/parking-spots', requireUserAuth, async (req, res) => {
  try {
    const { location, type, priceRange } = req.query;
    
    let query = { status: 'available' };
    
    if (location) {
      query['location.name'] = new RegExp(location, 'i');
    }
    
    if (type && type !== 'all') {
      query.type = type;
    }
    
    if (priceRange) {
      const [min, max] = priceRange.split('-').map(Number);
      query.pricePerHour = { $gte: min, $lte: max };
    }

    const parkingSpots = await ParkingSpot.find(query)
      .sort({ pricePerHour: 1 })
      .lean();

    res.json({
      success: true,
      data: parkingSpots
    });
  } catch (error) {
    console.error('API Parking spots error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load parking spots' 
    });
  }
});

// API: Update User Profile
app.put('/api/user/profile', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name and phone are required'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, phone, updatedAt: new Date() },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update session
    req.session.user.name = updatedUser.name;
    req.session.user.phone = updatedUser.phone;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        name: updatedUser.name,
        phone: updatedUser.phone
      }
    });
  } catch (error) {
    console.error('API Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update profile' 
    });
  }
});

// API: Change Password
app.post('/api/user/change-password', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await User.findByIdAndUpdate(userId, {
      password: hashedNewPassword,
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('API Change password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to change password' 
    });
  }
});

// API: Delete Account
app.delete('/api/user/delete-account', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Delete user's data
    await Promise.all([
      Vehicle.deleteMany({ owner: userId }),
      Booking.deleteMany({ user: userId }),
      Payment.deleteMany({ userId: userId }),
      User.findByIdAndDelete(userId)
    ]);

    // Destroy session
    req.session.destroy();

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('API Delete account error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete account' 
    });
  }
});

// API: Cancel Booking
app.put('/api/user/bookings/:id/cancel', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const bookingId = req.params.id;

    // Find the booking
    const booking = await Booking.findOne({ _id: bookingId, user: userId });
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking can be cancelled
    if (booking.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only active bookings can be cancelled'
      });
    }

    // Update booking status
    booking.status = 'cancelled';
    await booking.save();

    // Free up the parking spot
    await ParkingSpot.findByIdAndUpdate(booking.parkingSpot, { status: 'available' });

    // Create refund payment record
    const refundAmount = booking.totalAmount * 0.9; // 10% cancellation fee
    const refund = new Payment({
      bookingId: booking._id,
      userId: userId,
      amount: -refundAmount,
      method: 'refund',
      status: 'completed',
      transactionId: `REF_${Date.now()}`,
      description: `Refund for cancelled booking ${booking._id}`
    });
    await refund.save();

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        booking,
        refundAmount
      }
    });
  } catch (error) {
    console.error('API Cancel booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to cancel booking' 
    });
  }
});

// API: Extend Booking
app.put('/api/user/bookings/:id/extend', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const bookingId = req.params.id;
    const { additionalHours } = req.body;

    if (!additionalHours || additionalHours <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Additional hours must be provided and greater than 0'
      });
    }

    // Find the booking
    const booking = await Booking.findOne({ _id: bookingId, user: userId })
      .populate('parkingSpot');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking can be extended
    if (booking.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only active bookings can be extended'
      });
    }

    // Calculate additional cost
    const additionalCost = additionalHours * booking.parkingSpot.pricePerHour;
    const newEndTime = new Date(booking.endTime);
    newEndTime.setHours(newEndTime.getHours() + additionalHours);

    // Update booking
    booking.endTime = newEndTime;
    booking.duration += (additionalHours * 60); // Convert to minutes
    booking.totalAmount += additionalCost;
    await booking.save();

    // Create payment record for extension
    const extensionPayment = new Payment({
      bookingId: booking._id,
      userId: userId,
      amount: additionalCost,
      method: 'card', // Default method
      status: 'completed',
      transactionId: `EXT_${Date.now()}`,
      description: `Extension payment for booking ${booking._id}`
    });
    await extensionPayment.save();

    res.json({
      success: true,
      message: 'Booking extended successfully',
      data: {
        booking,
        additionalCost,
        newEndTime
      }
    });
  } catch (error) {
    console.error('API Extend booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to extend booking' 
    });
  }
});

// API: Get Booking Receipt
app.get('/api/user/bookings/:id/receipt', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const bookingId = req.params.id;

    // Find the booking with all related data
    const booking = await Booking.findOne({ _id: bookingId, user: userId })
      .populate('vehicle', 'licensePlate type model color')
      .populate('parkingSpot', 'spotNumber location pricePerHour')
      .populate('user', 'name email phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Get payment records for this booking
    const payments = await Payment.find({ bookingId: booking._id });

    const receiptData = {
      booking: {
        id: booking._id,
        spotNumber: booking.parkingSpot.spotNumber,
        location: booking.parkingSpot.location,
        startTime: booking.startTime,
        endTime: booking.endTime,
        duration: booking.duration,
        status: booking.status,
        totalAmount: booking.totalAmount
      },
      vehicle: booking.vehicle,
      user: booking.user,
      payments,
      generatedAt: new Date()
    };

    res.json({
      success: true,
      data: receiptData
    });
  } catch (error) {
    console.error('API Get receipt error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate receipt' 
    });
  }
});

// API: Book Again (Create new booking from existing one)
app.post('/api/user/bookings/:id/book-again', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const originalBookingId = req.params.id;
    const { startTime, endTime } = req.body;

    // Find the original booking
    const originalBooking = await Booking.findOne({ _id: originalBookingId, user: userId })
      .populate('parkingSpot');

    if (!originalBooking) {
      return res.status(404).json({
        success: false,
        message: 'Original booking not found'
      });
    }

    // Check if parking spot is available
    if (originalBooking.parkingSpot.status !== 'available') {
      return res.status(400).json({
        success: false,
        message: 'Parking spot is not available'
      });
    }

    // Calculate duration and amount
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = Math.ceil((end - start) / (1000 * 60)); // in minutes
    const totalAmount = Math.ceil(duration / 60) * originalBooking.parkingSpot.pricePerHour;

    // Create new booking
    const newBooking = new Booking({
      user: userId,
      vehicle: originalBooking.vehicle,
      parkingSpot: originalBooking.parkingSpot._id,
      startTime: start,
      endTime: end,
      duration,
      totalAmount,
      status: 'active',
      paymentStatus: 'pending'
    });

    await newBooking.save();

    // Update parking spot status
    await ParkingSpot.findByIdAndUpdate(originalBooking.parkingSpot._id, { status: 'occupied' });

    // Populate the booking for response
    await newBooking.populate(['vehicle', 'parkingSpot']);

    res.json({
      success: true,
      message: 'New booking created successfully',
      data: newBooking
    });
  } catch (error) {
    console.error('API Book again error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create new booking' 
    });
  }
});

// API: Get Directions to Parking Spot
app.get('/api/user/bookings/:id/directions', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const bookingId = req.params.id;

    // Find the booking
    const booking = await Booking.findOne({ _id: bookingId, user: userId })
      .populate('parkingSpot', 'spotNumber location');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Mock coordinates for demo (in real app, these would be stored in database)
    const locationCoordinates = {
      'City Mall': { lat: 28.6139, lng: 77.2090 },
      'Tech Park': { lat: 28.6129, lng: 77.2295 },
      'Shopping Center': { lat: 28.6169, lng: 77.2090 },
      'Airport': { lat: 28.5562, lng: 77.1000 },
      'Hospital': { lat: 28.6289, lng: 77.2065 }
    };

    const locationName = booking.parkingSpot.location.name;
    const coordinates = locationCoordinates[locationName] || { lat: 28.6139, lng: 77.2090 };

    const directionsData = {
      destination: {
        name: locationName,
        address: `${booking.parkingSpot.location.section}, ${booking.parkingSpot.location.floor}`,
        coordinates,
        spotNumber: booking.parkingSpot.spotNumber
      },
      googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lng}`,
      appleMapsUrl: `http://maps.apple.com/?daddr=${coordinates.lat},${coordinates.lng}`,
      instructions: [
        `Navigate to ${locationName}`,
        `Go to ${booking.parkingSpot.location.floor}`,
        `Find section ${booking.parkingSpot.location.section}`,
        `Look for spot ${booking.parkingSpot.spotNumber}`
      ]
    };

    res.json({
      success: true,
      data: directionsData
    });
  } catch (error) {
    console.error('API Get directions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get directions' 
    });
  }
});

// API: Get Available Parking Spots
app.get('/api/user/parking-spots', requireUserAuth, async (req, res) => {
  try {
    const { location, type, priceRange, sortBy, page = 1, limit = 20 } = req.query;
    
    // Build query
    let query = {};
    
    // Location filter
    if (location) {
      query['location.name'] = { $regex: location, $options: 'i' };
    }
    
    // Type filter
    if (type) {
      query.type = type;
    }
    
    // Price range filter
    if (priceRange) {
      const ranges = {
        '0-50': { $gte: 0, $lte: 50 },
        '50-100': { $gte: 50, $lte: 100 },
        '100-200': { $gte: 100, $lte: 200 },
        '200+': { $gte: 200 }
      };
      
      if (ranges[priceRange]) {
        query.pricePerHour = ranges[priceRange];
      }
    }
    
    // Build sort
    let sort = {};
    switch (sortBy) {
      case 'price':
        sort.pricePerHour = 1;
        break;
      case 'rating':
        sort.createdAt = -1; // Mock rating sort by newest
        break;
      case 'distance':
      default:
        sort['location.name'] = 1;
        break;
    }
    
    // Execute query with pagination
    const skip = (page - 1) * limit;
    const spots = await ParkingSpot.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await ParkingSpot.countDocuments(query);
    
    res.json({
      success: true,
      data: spots,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalSpots: total,
        hasNext: skip + spots.length < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('API Get parking spots error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get parking spots' 
    });
  }
});

// API: Create New Booking
app.post('/api/user/bookings', requireUserAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { vehicleId, parkingSpotId, startTime, endTime } = req.body;

    // Validate required fields
    if (!vehicleId || !parkingSpotId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle, parking spot, start time, and end time are required'
      });
    }

    // Verify vehicle belongs to user
    const vehicle = await Vehicle.findOne({ _id: vehicleId, owner: userId });
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found or does not belong to you'
      });
    }

    // Verify parking spot exists and is available
    const parkingSpot = await ParkingSpot.findById(parkingSpotId);
    if (!parkingSpot) {
      return res.status(404).json({
        success: false,
        message: 'Parking spot not found'
      });
    }

    if (parkingSpot.status !== 'available') {
      return res.status(400).json({
        success: false,
        message: 'Parking spot is not available'
      });
    }

    // Calculate duration and amount
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time'
      });
    }

    const duration = Math.ceil((end - start) / (1000 * 60)); // in minutes
    const totalAmount = Math.ceil(duration / 60) * parkingSpot.pricePerHour;

    // Create booking
    const booking = new Booking({
      user: userId,
      vehicle: vehicleId,
      parkingSpot: parkingSpotId,
      startTime: start,
      endTime: end,
      duration,
      totalAmount,
      status: 'active',
      paymentStatus: 'paid' // For demo, assume payment is completed
    });

    await booking.save();

    // Update parking spot status
    await ParkingSpot.findByIdAndUpdate(parkingSpotId, { status: 'occupied' });

    // Create payment record
    const payment = new Payment({
      bookingId: booking._id,
      userId: userId,
      amount: totalAmount,
      method: 'card', // Default method
      status: 'completed',
      transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      description: `Payment for booking ${booking._id}`
    });
    await payment.save();

    // Populate the booking for response
    await booking.populate(['vehicle', 'parkingSpot']);

    res.json({
      success: true,
      message: 'Booking created successfully',
      data: booking
    });
  } catch (error) {
    console.error('API Create booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create booking' 
    });
  }
});

// Error handling
app.use((req, res, next) => {
  res.status(404).render('404', {
    title: 'Page Not Found - VayAccess User',
    user: req.session.user
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Server Error - VayAccess User',
    user: req.session.user,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  console.log(` User Dashboard running on http://localhost:${PORT}`);
});

module.exports = app;
