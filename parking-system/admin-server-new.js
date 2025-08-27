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
const requireAuth = (req, res, next) => {
  if (req.session.adminId) {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

// ===== AUTHENTICATION ROUTES =====

// Login page
app.get('/admin/login', (req, res) => {
  res.render('admin/login', { 
    layout: 'auth',
    title: 'Admin Login',
    error: req.query.error 
  });
});

// Login POST
app.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find admin user in MongoDB
    const admin = await User.findOne({ 
      email: email.toLowerCase(), 
      role: 'admin' 
    });
    
    if (!admin) {
      return res.redirect('/admin/login?error=Invalid credentials');
    }
    
    // Check password
    const isValidPassword = await admin.comparePassword(password);
    if (!isValidPassword) {
      return res.redirect('/admin/login?error=Invalid credentials');
    }
    
    // Set session
    req.session.adminId = admin._id;
    req.session.adminName = admin.name;
    req.session.adminEmail = admin.email;
    
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('Login error:', error);
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
  console.log(`✅ MongoDB-Connected Admin Server running on http://localhost:${PORT}/admin/`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/admin/dashboard`);
  console.log(`🔐 Login: http://localhost:${PORT}/admin/login`);
});

module.exports = app;