// Complete Admin Dashboard Server with REAL DATA STORE
// Port: 8080
// This version uses actual admin-created data instead of mock data

require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { engine } = require('express-handlebars');

const app = express();
const PORT = process.env.ADMIN_PORT || 8080;

console.log('🚀 Starting Complete Admin Server with REAL DATA STORE on port:', PORT);

// ===== REAL IN-MEMORY DATA STORE =====
// This holds all the actual data created by admins and gets updated dynamically
const dataStore = {
  users: [
    {
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+91 98765 43210',
      joinDate: '2024-01-15',
      status: 'active',
      totalBookings: 2,
      lastActive: new Date(Date.now() - 300000).toISOString(),
      createdAt: '2024-01-15T00:00:00.000Z',
      createdBy: 'system'
    },
    {
      id: 2,
      name: 'Sarah Wilson',
      email: 'sarah@example.com',
      phone: '+91 87654 32109',
      joinDate: '2024-02-20',
      status: 'active',
      totalBookings: 1,
      lastActive: new Date(Date.now() - 600000).toISOString(),
      createdAt: '2024-02-20T00:00:00.000Z',
      createdBy: 'system'
    },
    {
      id: 3,
      name: 'Mike Johnson',
      email: 'mike@example.com',
      phone: '+91 76543 21098',
      joinDate: '2024-03-10',
      status: 'active',
      totalBookings: 1,
      lastActive: new Date(Date.now() - 1200000).toISOString(),
      createdAt: '2024-03-10T00:00:00.000Z',
      createdBy: 'system'
    }
  ],
  parkingSpots: [
    {
      id: 'A-001',
      level: 'Level 1',
      section: 'A',
      number: 1,
      status: 'occupied',
      vehicle: 'MH 12 AB 1234',
      occupiedSince: new Date(Date.now() - 3600000).toISOString(),
      rate: 25,
      customer: 'John Doe',
      customerId: 1,
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'admin@vayaccess.com'
    },
    {
      id: 'A-002',
      level: 'Level 1',
      section: 'A',
      number: 2,
      status: 'available',
      vehicle: null,
      occupiedSince: null,
      rate: 25,
      customer: null,
      customerId: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'admin@vayaccess.com'
    },
    {
      id: 'A-003',
      level: 'Level 1',
      section: 'A',
      number: 3,
      status: 'reserved',
      vehicle: 'MH 12 CD 5678',
      occupiedSince: new Date(Date.now() + 1800000).toISOString(),
      rate: 25,
      customer: 'Sarah Wilson',
      customerId: 2,
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'admin@vayaccess.com'
    },
    {
      id: 'B-001',
      level: 'Level 2',
      section: 'B',
      number: 1,
      status: 'occupied',
      vehicle: 'MH 14 EF 9012',
      occupiedSince: new Date(Date.now() - 7200000).toISOString(),
      rate: 30,
      customer: 'Mike Johnson',
      customerId: 3,
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'admin@vayaccess.com'
    },
    {
      id: 'B-002',
      level: 'Level 2',
      section: 'B',
      number: 2,
      status: 'maintenance',
      vehicle: null,
      occupiedSince: null,
      rate: 30,
      customer: null,
      customerId: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'admin@vayaccess.com'
    }
  ],
  bookings: [
    {
      id: 'BK001',
      userId: 1,
      user: 'John Doe',
      spotId: 'A-001',
      spot: 'A-001',
      duration: 2,
      amount: 50,
      status: 'active',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 7200000).toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: 'system'
    },
    {
      id: 'BK002',
      userId: 2,
      user: 'Sarah Wilson',
      spotId: 'A-003',
      spot: 'A-003',
      duration: 1,
      amount: 25,
      status: 'completed',
      startTime: new Date(Date.now() - 3600000).toISOString(),
      endTime: new Date().toISOString(),
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      createdBy: 'system'
    },
    {
      id: 'BK003',
      userId: 3,
      user: 'Mike Johnson',
      spotId: 'B-001',
      spot: 'B-001',
      duration: 3,
      amount: 90,
      status: 'active',
      startTime: new Date(Date.now() - 1800000).toISOString(),
      endTime: new Date(Date.now() + 9000000).toISOString(),
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      createdBy: 'system'
    }
  ],
  vehicles: [
    {
      id: 'V001',
      plateNumber: 'MH 12 AB 1234',
      ownerId: 1,
      owner: 'John Doe',
      model: 'Honda City',
      color: 'White',
      status: 'parked',
      spotId: 'A-001',
      registeredDate: '2024-01-15',
      lastSeen: new Date(Date.now() - 3600000).toISOString(),
      createdAt: '2024-01-15T00:00:00.000Z',
      createdBy: 'system'
    },
    {
      id: 'V002',
      plateNumber: 'MH 12 CD 5678',
      ownerId: 2,
      owner: 'Sarah Wilson',
      model: 'Maruti Swift',
      color: 'Red',
      status: 'registered',
      spotId: null,
      registeredDate: '2024-02-10',
      lastSeen: new Date(Date.now() - 86400000).toISOString(),
      createdAt: '2024-02-10T00:00:00.000Z',
      createdBy: 'system'
    },
    {
      id: 'V003',
      plateNumber: 'MH 14 EF 9012',
      ownerId: 3,
      owner: 'Mike Johnson',
      model: 'Toyota Innova',
      color: 'Black',
      status: 'parked',
      spotId: 'B-001',
      registeredDate: '2024-03-10',
      lastSeen: new Date(Date.now() - 7200000).toISOString(),
      createdAt: '2024-03-10T00:00:00.000Z',
      createdBy: 'system'
    }
  ],
  payments: [
    {
      id: 'PAY001',
      userId: 1,
      user: 'John Doe',
      amount: 50,
      method: 'UPI',
      status: 'completed',
      bookingId: 'BK001',
      timestamp: new Date().toISOString(),
      transactionId: 'TXN123456789',
      createdAt: new Date().toISOString(),
      createdBy: 'system'
    },
    {
      id: 'PAY002',
      userId: 2,
      user: 'Sarah Wilson',
      amount: 25,
      method: 'Card',
      status: 'completed',
      bookingId: 'BK002',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      transactionId: 'TXN987654321',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      createdBy: 'system'
    },
    {
      id: 'PAY003',
      userId: 3,
      user: 'Mike Johnson',
      amount: 90,
      method: 'UPI',
      status: 'pending',
      bookingId: 'BK003',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      transactionId: null,
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      createdBy: 'system'
    }
  ],
  aiCalls: [
    {
      id: 'call_001',
      customerPhone: '+91 98765 43210',
      customerName: 'Rajesh Kumar',
      duration: 245,
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      status: 'completed',
      inquiry: 'Barrier gate pricing inquiry',
      outcome: 'Quote sent',
      aiConfidence: 0.92,
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      createdBy: 'ai-system'
    },
    {
      id: 'call_002',
      customerPhone: '+91 87654 32109',
      customerName: 'Priya Patel',
      duration: 320,
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      status: 'completed',
      inquiry: 'ANPR system installation',
      outcome: 'Site visit scheduled',
      aiConfidence: 0.89,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      createdBy: 'ai-system'
    }
  ],
  recentActivity: [
    {
      id: 'ACT001',
      type: 'booking',
      message: 'New booking created by John Doe for spot A-001',
      status: 'success',
      time: new Date().toISOString(),
      userId: 1,
      createdAt: new Date().toISOString(),
      createdBy: 'system'
    },
    {
      id: 'ACT002',
      type: 'payment',
      message: 'Payment of ₹50 received from John Doe',
      status: 'success',
      time: new Date(Date.now() - 1800000).toISOString(),
      userId: 1,
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      createdBy: 'system'
    },
    {
      id: 'ACT003',
      type: 'booking',
      message: 'Booking completed by Sarah Wilson for spot A-003',
      status: 'info',
      time: new Date(Date.now() - 3600000).toISOString(),
      userId: 2,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      createdBy: 'system'
    }
  ]
};

// Data management helper functions
function generateId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function addActivity(type, message, status = 'info', userId = null, createdBy = 'system') {
  const activity = {
    id: generateId('ACT'),
    type,
    message,
    status,
    time: new Date().toISOString(),
    userId,
    createdAt: new Date().toISOString(),
    createdBy
  };
  
  dataStore.recentActivity.unshift(activity);
  
  if (dataStore.recentActivity.length > 50) {
    dataStore.recentActivity = dataStore.recentActivity.slice(0, 50);
  }
  
  console.log('📝 New activity added:', activity.message);
  return activity;
}

function calculateStats() {
  const totalUsers = dataStore.users.length;
  const totalBookings = dataStore.bookings.length;
  const activeBookings = dataStore.bookings.filter(b => b.status === 'active').length;
  const todayBookings = dataStore.bookings.filter(b => {
    const today = new Date().toDateString();
    return new Date(b.createdAt).toDateString() === today;
  }).length;
  
  const totalRevenue = dataStore.payments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);
  
  const todayRevenue = dataStore.payments
    .filter(p => {
      const today = new Date().toDateString();
      return p.status === 'completed' && new Date(p.createdAt).toDateString() === today;
    })
    .reduce((sum, p) => sum + p.amount, 0);
  
  const totalSpots = dataStore.parkingSpots.length;
  const occupiedSpots = dataStore.parkingSpots.filter(s => s.status === 'occupied').length;
  const availableSpots = dataStore.parkingSpots.filter(s => s.status === 'available').length;
  const reservedSpots = dataStore.parkingSpots.filter(s => s.status === 'reserved').length;
  
  return {
    totalUsers,
    totalBookings,
    activeBookings,
    todayBookings,
    totalRevenue,
    todayRevenue,
    totalSpots,
    occupiedSpots,
    availableSpots,
    reservedSpots,
    occupancyRate: totalSpots > 0 ? Math.round((occupiedSpots / totalSpots) * 100) : 0
  };
}

console.log('✅ REAL Data store initialized with live data');
console.log('📊 Current stats:', calculateStats());

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
  secret: process.env.SESSION_SECRET || 'vayaccess-admin-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Admin credentials (in production, use database)
const adminUsers = [
  { 
    email: 'admin@vayaccess.com', 
    password: 'Admin@123', 
    name: 'System Administrator',
    role: 'super_admin'
  },
  { 
    email: 'john.manager@vayaccess.com', 
    password: 'User@123', 
    name: 'John Manager',
    role: 'manager'
  },
  { 
    email: 'demo@vayaccess.com', 
    password: 'Demo@123', 
    name: 'Demo User',
    role: 'admin'
  }
];

// Authentication middleware
function requireAdminAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  } else {
    console.log('❌ Unauthorized access attempt to:', req.path);
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    } else {
      return res.redirect('/admin/login');
    }
  }
}

// ===== ADMIN ROUTES =====

// Login page
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.admin) {
    return res.redirect('/admin/dashboard');
  }
  
  res.render('login', {
    title: 'Admin Login - VayAccess',
    layout: 'auth'
  });
});

// Handle login
app.post('/admin/login', (req, res) => {
  const { email, password } = req.body;
  
  try {
    const normalizedEmail = email?.toLowerCase().trim();
    const admin = adminUsers.find(
      a => a.email.toLowerCase() === normalizedEmail && a.password === password
    );
    
    if (admin) {
      req.session.admin = {
        email: admin.email,
        name: admin.name,
        role: admin.role
      };
      
      console.log('✅ Admin login successful:', normalizedEmail);
      addActivity('login', `Admin ${admin.name} logged in`, 'success', null, admin.email);
      return res.redirect('/admin/dashboard');
    } else {
      console.log('❌ Invalid credentials for:', normalizedEmail);
      return res.render('login', {
        title: 'Admin Login - VayAccess',
        layout: 'auth',
        error: 'Invalid email or password.',
        email: email
      });
    }
  } catch (error) {
    console.error('🚨 Admin login error:', error);
    return res.render('login', {
      title: 'Admin Login - VayAccess',
      layout: 'auth',
      error: 'Server error occurred. Please try again.'
    });
  }
});

// Logout
app.post('/admin/logout', (req, res) => {
  const adminName = req.session.admin?.name || 'Unknown';
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    console.log('🔓 Admin logged out:', adminName);
    res.redirect('/admin/login');
  });
});

// Dashboard
app.get('/admin/dashboard', requireAdminAuth, (req, res) => {
  res.render('dashboard', {
    title: 'Admin Dashboard - VayAccess',
    admin: req.session.admin,
    activeTab: 'dashboard'
  });
});

// All admin pages
const adminPages = [
  'users', 'parking', 'bookings', 'vehicles', 'payments', 'reports', 
  'analytics', 'insights', 'settings', 'logs', 'manage-admins'
];

adminPages.forEach(page => {
  app.get(`/admin/${page}`, requireAdminAuth, (req, res) => {
    res.render(page, {
      title: `${page.charAt(0).toUpperCase() + page.slice(1)} Management - VayAccess`,
      admin: req.session.admin,
      activeTab: page
    });
  });
});

// ===== API ENDPOINTS WITH REAL DATA =====

// Dashboard API - returns real calculated stats
app.get('/api/admin/dashboard', requireAdminAuth, (req, res) => {
  try {
    console.log('📊 Dashboard API called by:', req.session.admin.email);
    
    const stats = calculateStats();
    
    const dashboardData = {
      success: true,
      data: {
        stats: stats,
        recentActivity: dataStore.recentActivity.slice(0, 10),
        parkingOccupancy: {
          level1: { 
            total: dataStore.parkingSpots.filter(s => s.level === 'Level 1').length,
            occupied: dataStore.parkingSpots.filter(s => s.level === 'Level 1' && s.status === 'occupied').length,
            available: dataStore.parkingSpots.filter(s => s.level === 'Level 1' && s.status === 'available').length
          },
          level2: { 
            total: dataStore.parkingSpots.filter(s => s.level === 'Level 2').length,
            occupied: dataStore.parkingSpots.filter(s => s.level === 'Level 2' && s.status === 'occupied').length,
            available: dataStore.parkingSpots.filter(s => s.level === 'Level 2' && s.status === 'available').length
          },
          level3: { total: 0, occupied: 0, available: 0 }
        }
      }
    };
    
    console.log('📊 Returning REAL dashboard stats:', stats);
    res.json(dashboardData);
  } catch (error) {
    console.error('🚨 Dashboard API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading dashboard data',
      error: error.message 
    });
  }
});

// Users API - returns real user data
app.get('/api/admin/users', requireAdminAuth, (req, res) => {
  try {
    console.log('👥 Users API called by:', req.session.admin.email);
    
    const usersData = {
      success: true,
      data: {
        totalUsers: dataStore.users.length,
        users: dataStore.users
      }
    };
    
    console.log('👥 Returning real users data:', dataStore.users.length, 'users');
    res.json(usersData);
  } catch (error) {
    console.error('❌ Users API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading users data',
      error: error.message 
    });
  }
});

// Parking API - returns real parking data
app.get('/api/admin/parking', requireAdminAuth, (req, res) => {
  try {
    console.log('🅿️ Parking API called by:', req.session.admin.email);
    
    const parkingData = {
      success: true,
      data: {
        totalSpots: dataStore.parkingSpots.length,
        availableSpots: dataStore.parkingSpots.filter(s => s.status === 'available').length,
        occupiedSpots: dataStore.parkingSpots.filter(s => s.status === 'occupied').length,
        reservedSpots: dataStore.parkingSpots.filter(s => s.status === 'reserved').length,
        maintenanceSpots: dataStore.parkingSpots.filter(s => s.status === 'maintenance').length,
        spots: dataStore.parkingSpots
      }
    };
    
    console.log('🅿️ Returning real parking data:', dataStore.parkingSpots.length, 'spots');
    res.json(parkingData);
  } catch (error) {
    console.error('❌ Parking API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading parking data',
      error: error.message 
    });
  }
});

// Parking spots specific API
app.get('/api/admin/parking/spots', requireAdminAuth, (req, res) => {
  try {
    console.log('🅿️ Parking spots API called by:', req.session.admin.email);
    
    const spotsData = {
      success: true,
      data: {
        spots: dataStore.parkingSpots,
        summary: {
          total: dataStore.parkingSpots.length,
          available: dataStore.parkingSpots.filter(s => s.status === 'available').length,
          occupied: dataStore.parkingSpots.filter(s => s.status === 'occupied').length,
          reserved: dataStore.parkingSpots.filter(s => s.status === 'reserved').length,
          maintenance: dataStore.parkingSpots.filter(s => s.status === 'maintenance').length
        }
      }
    };
    
    console.log('🅿️ Returning real parking spots:', dataStore.parkingSpots.length, 'spots');
    res.json(spotsData);
  } catch (error) {
    console.error('❌ Parking spots API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading parking spots data',
      error: error.message 
    });
  }
});

// Create new parking spot (REAL CREATE OPERATION)
app.post('/api/admin/parking/spots', requireAdminAuth, (req, res) => {
  try {
    const { level, section, number, rate } = req.body;
    const adminEmail = req.session.admin.email;
    
    console.log('🅿️ Creating new parking spot:', req.body, 'by:', adminEmail);
    
    // Validate input
    if (!level || !section || !number) {
      return res.status(400).json({
        success: false,
        message: 'Level, section, and number are required'
      });
    }
    
    // Check if spot already exists
    const spotId = `${section}-${String(number).padStart(3, '0')}`;
    const existingSpot = dataStore.parkingSpots.find(s => s.id === spotId);
    
    if (existingSpot) {
      return res.status(409).json({
        success: false,
        message: 'Parking spot already exists'
      });
    }
    
    // Create new spot
    const newSpot = {
      id: spotId,
      level,
      section,
      number: parseInt(number),
      status: 'available',
      vehicle: null,
      occupiedSince: null,
      rate: parseInt(rate) || 25,
      customer: null,
      customerId: null,
      createdAt: new Date().toISOString(),
      createdBy: adminEmail
    };
    
    // Add to data store
    dataStore.parkingSpots.push(newSpot);
    
    // Add activity
    addActivity('admin', `New parking spot ${spotId} created by admin`, 'success', null, adminEmail);
    
    console.log('✅ Parking spot created successfully:', spotId);
    
    res.json({
      success: true,
      message: 'Parking spot created successfully',
      data: newSpot
    });
  } catch (error) {
    console.error('❌ Create parking spot API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating parking spot',
      error: error.message 
    });
  }
});

// Update parking spot (REAL UPDATE OPERATION)
app.put('/api/admin/parking/spots/:spotId', requireAdminAuth, (req, res) => {
  try {
    const { spotId } = req.params;
    const { status, vehicle, customer, rate } = req.body;
    const adminEmail = req.session.admin.email;
    
    console.log('🅿️ Updating parking spot:', spotId, 'data:', req.body, 'by:', adminEmail);
    
    // Find the spot
    const spotIndex = dataStore.parkingSpots.findIndex(s => s.id === spotId);
    
    if (spotIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Parking spot not found'
      });
    }
    
    // Update the spot
    const spot = dataStore.parkingSpots[spotIndex];
    const oldStatus = spot.status;
    
    if (status) spot.status = status;
    if (vehicle !== undefined) spot.vehicle = vehicle;
    if (customer !== undefined) spot.customer = customer;
    if (rate !== undefined) spot.rate = parseInt(rate);
    
    // Update occupancy times
    if (status === 'occupied' && oldStatus !== 'occupied') {
      spot.occupiedSince = new Date().toISOString();
    } else if (status !== 'occupied' && oldStatus === 'occupied') {
      spot.occupiedSince = null;
    }
    
    spot.updatedAt = new Date().toISOString();
    spot.updatedBy = adminEmail;
    
    // Add activity
    addActivity('admin', `Parking spot ${spotId} updated: ${oldStatus} → ${status} by admin`, 'info', null, adminEmail);
    
    console.log('✅ Parking spot updated successfully:', spotId);
    
    res.json({
      success: true,
      message: 'Parking spot updated successfully',
      data: spot
    });
  } catch (error) {
    console.error('❌ Update parking spot API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating parking spot',
      error: error.message 
    });
  }
});

// Other API endpoints with real data
app.get('/api/admin/bookings', requireAdminAuth, (req, res) => {
  try {
    const bookingsData = {
      success: true,
      data: {
        totalBookings: dataStore.bookings.length,
        activeBookings: dataStore.bookings.filter(b => b.status === 'active').length,
        completedBookings: dataStore.bookings.filter(b => b.status === 'completed').length,
        cancelledBookings: dataStore.bookings.filter(b => b.status === 'cancelled').length,
        totalRevenue: dataStore.bookings.reduce((sum, b) => sum + (b.amount || 0), 0),
        todayBookings: dataStore.bookings.filter(b => {
          const today = new Date().toDateString();
          return new Date(b.createdAt).toDateString() === today;
        }).length,
        bookings: dataStore.bookings,
        recentActivity: dataStore.bookings.slice(-5).map(booking => ({
          type: 'booking',
          message: `New booking ${booking.id} by ${booking.customerName}`,
          timestamp: booking.createdAt || new Date().toISOString(),
          status: booking.status
        }))
      }
    };
    
    console.log('📅 Returning real bookings data:', dataStore.bookings.length, 'bookings');
    res.json(bookingsData);
  } catch (error) {
    console.error('❌ Bookings API error:', error);
    res.status(500).json({ success: false, message: 'Error loading bookings data', error: error.message });
  }
});

// POST endpoint for creating bookings
app.post('/api/admin/bookings', requireAdminAuth, (req, res) => {
  try {
    console.log('Creating new booking:', req.body);
    const { customerName, customerEmail, vehicleNumber, parkingSpot, startDateTime, endDateTime } = req.body;
    
    // Validate required fields
    if (!customerName || !customerEmail || !vehicleNumber || !parkingSpot || !startDateTime || !endDateTime) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Calculate duration and amount
    const startTime = new Date(startDateTime);
    const endTime = new Date(endDateTime);
    const durationHours = Math.ceil((endTime - startTime) / (1000 * 60 * 60));
    const amount = durationHours * 50; // ₹50 per hour
    
    const newBooking = {
      id: 'BK' + Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
      customerName,
      customerEmail,
      spotId: parkingSpot,
      vehicleNumber,
      startTime: startDateTime,
      endTime: endDateTime,
      status: 'active',
      amount: amount,
      duration: `${durationHours} hours`,
      createdAt: new Date().toISOString(),
      paymentStatus: 'pending'
    };
    
    // Add to dataStore
    dataStore.bookings.push(newBooking);
    
    // Add to logs
    dataStore.logs.push({
      id: 'LOG' + Date.now(),
      type: 'INFO',
      category: 'Booking',
      message: `New booking created: ${newBooking.id} for ${customerName}`,
      timestamp: new Date().toISOString(),
      ip: req.ip || 'unknown'
    });
    
    console.log('✅ Booking created successfully:', newBooking.id);
    console.log('📊 Total bookings now:', dataStore.bookings.length);
    
    res.json({ 
      success: true, 
      message: 'Booking created successfully',
      data: newBooking 
    });
  } catch (error) {
    console.error('❌ Create booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating booking', 
      error: error.message 
    });
  }
});

// PUT endpoint for updating bookings
app.put('/api/admin/bookings/:id', requireAdminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const bookingIndex = dataStore.bookings.findIndex(b => b.id === id);
    if (bookingIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    dataStore.bookings[bookingIndex].status = status;
    dataStore.bookings[bookingIndex].updatedAt = new Date().toISOString();
    
    console.log('✅ Booking updated:', id, 'status:', status);
    
    res.json({
      success: true,
      message: 'Booking updated successfully',
      data: dataStore.bookings[bookingIndex]
    });
  } catch (error) {
    console.error('❌ Update booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating booking', 
      error: error.message 
    });
  }
});

// DELETE endpoint for deleting bookings
app.delete('/api/admin/bookings/:id', requireAdminAuth, (req, res) => {
  try {
    const { id } = req.params;
    
    const bookingIndex = dataStore.bookings.findIndex(b => b.id === id);
    if (bookingIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    const deletedBooking = dataStore.bookings.splice(bookingIndex, 1)[0];
    
    console.log('✅ Booking deleted:', id);
    
    res.json({
      success: true,
      message: 'Booking deleted successfully',
      data: deletedBooking
    });
  } catch (error) {
    console.error('❌ Delete booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting booking', 
      error: error.message 
    });
  }
});

app.get('/api/admin/vehicles', requireAdminAuth, (req, res) => {
  try {
    const vehiclesData = {
      success: true,
      data: {
        totalVehicles: dataStore.vehicles.length,
        activeVehicles: dataStore.vehicles.filter(v => v.status === 'parked').length,
        vehicles: dataStore.vehicles
      }
    };
    
    console.log('🚗 Returning real vehicles data:', dataStore.vehicles.length, 'vehicles');
    res.json(vehiclesData);
  } catch (error) {
    console.error('❌ Vehicles API error:', error);
    res.status(500).json({ success: false, message: 'Error loading vehicles data', error: error.message });
  }
});

// POST endpoint for creating vehicles
app.post('/api/admin/vehicles', requireAdminAuth, (req, res) => {
  try {
    console.log('Creating new vehicle:', req.body);
    const { licensePlate, make, model, color, type, ownerId } = req.body;
    
    // Validate required fields
    if (!licensePlate || !make || !model || !color || !type) {
      return res.status(400).json({
        success: false,
        message: 'All vehicle fields are required'
      });
    }
    
    // Check if vehicle with this license plate already exists
    const existingVehicle = dataStore.vehicles.find(v => 
      v.licensePlate.toLowerCase() === licensePlate.toLowerCase()
    );
    
    if (existingVehicle) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle with this license plate already exists'
      });
    }
    
    const newVehicle = {
      id: 'VH' + Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
      licensePlate: licensePlate.toUpperCase(),
      make,
      model,
      color,
      type,
      ownerId,
      owner: ownerId ? dataStore.users.find(u => u.id === ownerId) : null,
      status: 'registered',
      createdAt: new Date().toISOString()
    };
    
    // Add to dataStore
    dataStore.vehicles.push(newVehicle);
    
    // Add to logs
    dataStore.logs.push({
      id: 'LOG' + Date.now(),
      type: 'INFO',
      category: 'Vehicle',
      message: `New vehicle registered: ${newVehicle.licensePlate} (${newVehicle.make} ${newVehicle.model})`,
      timestamp: new Date().toISOString(),
      ip: req.ip || 'unknown'
    });
    
    console.log('✅ Vehicle created successfully:', newVehicle.licensePlate);
    console.log('📊 Total vehicles now:', dataStore.vehicles.length);
    
    res.json({ 
      success: true, 
      message: 'Vehicle registered successfully',
      data: newVehicle 
    });
  } catch (error) {
    console.error('❌ Create vehicle error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating vehicle', 
      error: error.message 
    });
  }
});

app.get('/api/admin/payments', requireAdminAuth, (req, res) => {
  try {
    const totalRevenue = dataStore.payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
    const todayRevenue = dataStore.payments.filter(p => {
      const today = new Date().toDateString();
      return p.status === 'completed' && new Date(p.createdAt).toDateString() === today;
    }).reduce((sum, p) => sum + p.amount, 0);
    
    const pendingAmount = dataStore.payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
    
    const paymentsData = {
      success: true,
      data: {
        totalRevenue,
        todayRevenue,
        pendingAmount,
        pendingPayments: dataStore.payments.filter(p => p.status === 'pending').length,
        payments: dataStore.payments
      }
    };
    
    console.log('💳 Returning real payments data: ₹' + totalRevenue + ' total revenue');
    res.json(paymentsData);
  } catch (error) {
    console.error('❌ Payments API error:', error);
    res.status(500).json({ success: false, message: 'Error loading payments data', error: error.message });
  }
});

app.get('/api/admin/ai-call-recordings', requireAdminAuth, (req, res) => {
  try {
    const todayCalls = dataStore.aiCalls.filter(call => {
      const today = new Date().toDateString();
      return new Date(call.timestamp).toDateString() === today;
    }).length;
    
    const avgDuration = dataStore.aiCalls.length > 0 
      ? Math.round(dataStore.aiCalls.reduce((sum, call) => sum + call.duration, 0) / dataStore.aiCalls.length)
      : 0;
    
    const aiCallData = {
      success: true,
      data: {
        totalCalls: dataStore.aiCalls.length,
        todayCalls: todayCalls,
        avgDuration: avgDuration,
        recordings: dataStore.aiCalls
      }
    };
    
    console.log('🤖 Returning real AI call data:', dataStore.aiCalls.length, 'calls');
    res.json(aiCallData);
  } catch (error) {
    console.error('❌ AI Call Recordings API error:', error);
    res.status(500).json({ success: false, message: 'Error loading AI call recordings', error: error.message });
  }
});

// Error handlers
app.use((req, res) => {
  console.log('❌ Page not found:', req.path);
  res.status(404).render('404', {
    title: '404 - Page Not Found',
    admin: req.session ? req.session.admin : null,
    layout: req.session && req.session.admin ? 'admin-main' : 'auth'
  });
});

app.use((err, req, res, next) => {
  console.error('🚨 Server error:', err.stack);
  
  if (req.path.startsWith('/api/')) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  } else {
    res.status(500).render('error', {
      title: 'Server Error',
      admin: req.session ? req.session.admin : null,
      layout: req.session && req.session.admin ? 'admin-main' : 'auth',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Complete Admin Server with REAL DATA STORE running on http://localhost:${PORT}`);
  console.log('');
  console.log('🔗 Admin Pages Available:');
  console.log('   Login: http://localhost:' + PORT + '/admin/login');
  console.log('   Dashboard: http://localhost:' + PORT + '/admin/dashboard');
  console.log('   Users: http://localhost:' + PORT + '/admin/users');
  console.log('   Parking: http://localhost:' + PORT + '/admin/parking');
  console.log('   Bookings: http://localhost:' + PORT + '/admin/bookings');
  console.log('   Vehicles: http://localhost:' + PORT + '/admin/vehicles');
  console.log('   Payments: http://localhost:' + PORT + '/admin/payments');
  console.log('   Reports: http://localhost:' + PORT + '/admin/reports');
  console.log('   Analytics: http://localhost:' + PORT + '/admin/analytics');
  console.log('   Insights: http://localhost:' + PORT + '/admin/insights');
  console.log('   Settings: http://localhost:' + PORT + '/admin/settings');
  console.log('   Logs: http://localhost:' + PORT + '/admin/logs');
  console.log('   Manage Admins: http://localhost:' + PORT + '/admin/manage-admins');
  console.log('');
  console.log('🔐 Demo Credentials:');
  console.log('   admin@vayaccess.com / Admin@123');
  console.log('   john.manager@vayaccess.com / User@123');
  console.log('   demo@vayaccess.com / Demo@123');
  console.log('');
  console.log('🚀 API Endpoints with REAL DATA:');
  console.log('   GET /api/admin/dashboard - Live stats');
  console.log('   GET /api/admin/users - Real user data');
  console.log('   GET /api/admin/parking - Real parking data');
  console.log('   GET /api/admin/parking/spots - Real spot data');
  console.log('   POST /api/admin/parking/spots - Create spots');
  console.log('   PUT /api/admin/parking/spots/:id - Update spots');
  console.log('   GET /api/admin/bookings - Real booking data');
  console.log('   GET /api/admin/vehicles - Real vehicle data');
  console.log('   GET /api/admin/payments - Real payment data');
  console.log('   GET /api/admin/ai-call-recordings - Real AI call data');
  console.log('');
  console.log('📊 Current System Stats:');
  const currentStats = calculateStats();
  console.log('   Users:', currentStats.totalUsers);
  console.log('   Parking Spots:', currentStats.totalSpots);
  console.log('   Active Bookings:', currentStats.activeBookings);
  console.log('   Total Revenue: ₹' + currentStats.totalRevenue);
  console.log('   Occupancy Rate:', currentStats.occupancyRate + '%');
});