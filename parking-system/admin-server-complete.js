// Complete Admin Dashboard Server
// Port: 8080
// Serves admin dashboard with authentication and API endpoints

require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { engine } = require('express-handlebars');

const app = express();
const PORT = process.env.ADMIN_PORT || 8080;

console.log('🚀 Starting Complete Admin Server on port:', PORT);

// ===== IN-MEMORY DATA STORE =====
// This will hold all the actual data created by admins
const dataStore = {
  users: [
    {
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+91 98765 43210',
      joinDate: '2024-01-15',
      status: 'active',
      totalBookings: 45,
      lastActive: new Date(Date.now() - 300000).toISOString()
    },
    {
      id: 2,
      name: 'Sarah Wilson',
      email: 'sarah@example.com',
      phone: '+91 87654 32109',
      joinDate: '2024-02-20',
      status: 'active',
      totalBookings: 23,
      lastActive: new Date(Date.now() - 600000).toISOString()
    },
    {
      id: 3,
      name: 'Mike Johnson',
      email: 'mike@example.com',
      phone: '+91 76543 21098',
      joinDate: '2024-03-10',
      status: 'active',
      totalBookings: 12,
      lastActive: new Date(Date.now() - 1200000).toISOString()
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
      createdAt: '2024-01-01T00:00:00.000Z'
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
      createdAt: '2024-01-01T00:00:00.000Z'
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
      createdAt: '2024-01-01T00:00:00.000Z'
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
      createdAt: '2024-01-01T00:00:00.000Z'
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
      createdAt: '2024-01-01T00:00:00.000Z'
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
      amount: 250,
      status: 'active',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 7200000).toISOString(),
      createdAt: new Date().toISOString()
    },
    {
      id: 'BK002',
      userId: 2,
      user: 'Sarah Wilson',
      spotId: 'A-003',
      spot: 'A-003',
      duration: 4,
      amount: 400,
      status: 'completed',
      startTime: new Date(Date.now() - 14400000).toISOString(),
      endTime: new Date().toISOString(),
      createdAt: new Date(Date.now() - 14400000).toISOString()
    },
    {
      id: 'BK003',
      userId: 3,
      user: 'Mike Johnson',
      spotId: 'B-001',
      spot: 'B-001',
      duration: 3,
      amount: 150,
      status: 'pending',
      startTime: new Date(Date.now() + 3600000).toISOString(),
      endTime: new Date(Date.now() + 14400000).toISOString(),
      createdAt: new Date(Date.now() - 1800000).toISOString()
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
      createdAt: '2024-01-15T00:00:00.000Z'
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
      createdAt: '2024-02-10T00:00:00.000Z'
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
      createdAt: '2024-03-10T00:00:00.000Z'
    }
  ],
  payments: [
    {
      id: 'PAY001',
      userId: 1,
      user: 'John Doe',
      amount: 250,
      method: 'UPI',
      status: 'completed',
      bookingId: 'BK001',
      timestamp: new Date().toISOString(),
      transactionId: 'TXN123456789',
      createdAt: new Date().toISOString()
    },
    {
      id: 'PAY002',
      userId: 2,
      user: 'Sarah Wilson',
      amount: 400,
      method: 'Card',
      status: 'completed',
      bookingId: 'BK002',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      transactionId: 'TXN987654321',
      createdAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'PAY003',
      userId: 3,
      user: 'Mike Johnson',
      amount: 150,
      method: 'UPI',
      status: 'pending',
      bookingId: 'BK003',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      transactionId: null,
      createdAt: new Date(Date.now() - 7200000).toISOString()
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
      createdAt: new Date(Date.now() - 1800000).toISOString()
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
      createdAt: new Date(Date.now() - 3600000).toISOString()
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
      createdAt: new Date().toISOString()
    },
    {
      id: 'ACT002',
      type: 'payment',
      message: 'Payment of ₹250 received from Sarah Wilson',
      status: 'success',
      time: new Date(Date.now() - 1800000).toISOString(),
      userId: 2,
      createdAt: new Date(Date.now() - 1800000).toISOString()
    },
    {
      id: 'ACT003',
      type: 'system',
      message: 'Parking spot A-002 status changed to available',
      status: 'info',
      time: new Date(Date.now() - 3600000).toISOString(),
      userId: null,
      createdAt: new Date(Date.now() - 3600000).toISOString()
    }
  ],
  settings: {
    general: {
      siteName: 'VayAccess Parking System',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      language: 'en',
      maintenanceMode: false
    },
    parking: {
      defaultRate: 25,
      maxBookingDuration: 480,
      advanceBookingDays: 30,
      autoReleaseTime: 15,
      enableQrCode: true,
      enableLpr: true
    },
    payment: {
      acceptCash: true,
      acceptUpi: true,
      acceptCard: true,
      taxRate: 18,
      lateFee: 50,
      processingFee: 10
    },
    notifications: {
      emailNotifications: true,
      smsNotifications: true,
      pushNotifications: true,
      adminAlerts: true
    },
    security: {
      sessionTimeout: 60,
      maxLoginAttempts: 3,
      passwordExpiry: 90,
      twoFactorAuth: false
    },
    lastUpdated: new Date().toISOString()
  }
};

// Helper functions for data management
function generateId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function addActivity(type, message, status = 'info', userId = null) {
  const activity = {
    id: generateId('ACT'),
    type,
    message,
    status,
    time: new Date().toISOString(),
    userId,
    createdAt: new Date().toISOString()
  };
  
  dataStore.recentActivity.unshift(activity);
  
  // Keep only last 50 activities
  if (dataStore.recentActivity.length > 50) {
    dataStore.recentActivity = dataStore.recentActivity.slice(0, 50);
  }
  
  console.log('📝 New activity added:', activity.message);
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

console.log('✅ Data store initialized with', Object.keys(dataStore).length, 'data collections');

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
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));

// Authentication middleware
const requireAdminAuth = (req, res, next) => {
  if (req.session && req.session.admin) {
    return next();
  } else {
    console.log('❌ Unauthorized access attempt to:', req.path);
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    return res.redirect('/admin/login');
  }
};

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/admin/login');
});

app.get('/admin', (req, res) => {
  res.redirect('/admin/login');
});

// Admin login page
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.admin) {
    return res.redirect('/admin/dashboard');
  }
  
  res.render('login', {
    title: 'Admin Login - VayAccess',
    layout: 'auth'
  });
});

// Admin login POST
app.post('/admin/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    
    console.log('🔐 Login attempt for:', email);
    
    // Hardcoded admin credentials for demo
    const validCredentials = {
      'admin@vayaccess.com': 'Admin@123',
      'john.manager@vayaccess.com': 'User@123',
      'demo@vayaccess.com': 'Demo@123'
    };
    
    const normalizedEmail = email.toLowerCase().trim();
    
    if (validCredentials[normalizedEmail] && validCredentials[normalizedEmail] === password) {
      // Create admin session
      req.session.admin = {
        email: normalizedEmail,
        name: normalizedEmail === 'admin@vayaccess.com' ? 'Super Admin' : 
              normalizedEmail === 'john.manager@vayaccess.com' ? 'John Manager' : 'Demo User',
        role: normalizedEmail === 'admin@vayaccess.com' ? 'super_admin' : 'manager',
        loginTime: new Date().toISOString()
      };
      
      if (rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      }
      
      console.log('✅ Login successful for:', normalizedEmail);
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
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
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

// Users Management
app.get('/admin/users', requireAdminAuth, (req, res) => {
  res.render('users', {
    title: 'User Management - VayAccess',
    admin: req.session.admin,
    activeTab: 'users'
  });
});

// Parking Management
app.get('/admin/parking', requireAdminAuth, (req, res) => {
  res.render('parking', {
    title: 'Parking Management - VayAccess',
    admin: req.session.admin,
    activeTab: 'parking'
  });
});

// Bookings Management
app.get('/admin/bookings', requireAdminAuth, (req, res) => {
  res.render('bookings', {
    title: 'Booking Management - VayAccess',
    admin: req.session.admin,
    activeTab: 'bookings'
  });
});

// Vehicles Management
app.get('/admin/vehicles', requireAdminAuth, (req, res) => {
  res.render('vehicles', {
    title: 'Vehicle Management - VayAccess',
    admin: req.session.admin,
    activeTab: 'vehicles'
  });
});

// Payments Management
app.get('/admin/payments', requireAdminAuth, (req, res) => {
  res.render('payments', {
    title: 'Payment Management - VayAccess',
    admin: req.session.admin,
    activeTab: 'payments'
  });
});

// Reports
app.get('/admin/reports', requireAdminAuth, (req, res) => {
  res.render('reports', {
    title: 'Reports - VayAccess',
    admin: req.session.admin,
    activeTab: 'reports'
  });
});

// Analytics
app.get('/admin/analytics', requireAdminAuth, (req, res) => {
  res.render('analytics', {
    title: 'Analytics - VayAccess',
    admin: req.session.admin,
    activeTab: 'analytics'
  });
});

// Insights
app.get('/admin/insights', requireAdminAuth, (req, res) => {
  res.render('insights', {
    title: 'Insights - VayAccess',
    admin: req.session.admin,
    activeTab: 'insights'
  });
});

// Settings
app.get('/admin/settings', requireAdminAuth, (req, res) => {
  res.render('settings', {
    title: 'Settings - VayAccess',
    admin: req.session.admin,
    activeTab: 'settings'
  });
});

// Logs
app.get('/admin/logs', requireAdminAuth, (req, res) => {
  res.render('logs', {
    title: 'System Logs - VayAccess',
    admin: req.session.admin,
    activeTab: 'logs'
  });
});

// Manage Admins
app.get('/admin/manage-admins', requireAdminAuth, (req, res) => {
  res.render('manage-admins', {
    title: 'Manage Admins - VayAccess',
    admin: req.session.admin,
    activeTab: 'manage-admins'
  });
});

// ===== API ENDPOINTS =====

// Dashboard API endpoint (This was missing!)
app.get('/api/admin/dashboard', requireAdminAuth, (req, res) => {
  try {
    console.log('📊 Dashboard API called by:', req.session.admin.email);
    
    // Real dashboard data from data store
    const stats = calculateStats();
    
    const dashboardData = {
      success: true,
      data: {
        stats: stats,
        recentActivity: dataStore.recentActivity.slice(0, 10), // Last 10 activities
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
          level3: { total: 0, occupied: 0, available: 0 } // No Level 3 spots yet
        }
      }
    };
    
    console.log('📊 Returning real dashboard stats:', stats);
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

// AI Call Recordings API endpoint (This was missing!)
app.get('/api/admin/ai-call-recordings', requireAdminAuth, (req, res) => {
  try {
    console.log('🤖 AI Call Recordings API called by:', req.session.admin.email);
    
    // Sample AI call recordings data
    const aiCallData = {
      success: true,
      data: {
        totalCalls: 156,
        todayCalls: 12,
        avgDuration: 245, // seconds
        recordings: [
          {
            id: 'call_001',
            customerPhone: '+91 98765 43210',
            customerName: 'Rahul Sharma',
            duration: 180,
            timestamp: new Date().toISOString(),
            status: 'completed',
            inquiry: 'Barrier gate pricing inquiry',
            outcome: 'Quote sent',
            aiConfidence: 0.92
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
            aiConfidence: 0.89
          },
          {
            id: 'call_003',
            customerPhone: '+91 76543 21098',
            customerName: 'Amit Kumar',
            duration: 156,
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            status: 'completed',
            inquiry: 'Turnstile maintenance',
            outcome: 'Service booked',
            aiConfidence: 0.94
          }
        ]
      }
    };
    
    res.json(aiCallData);
  } catch (error) {
    console.error('🚨 AI Call Recordings API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading AI call recordings',
      error: error.message 
    });
  }
});

// Additional API endpoints
app.get('/api/admin/users', requireAdminAuth, (req, res) => {
  try {
    const usersData = {
      success: true,
      data: {
        totalUsers: 1247,
        users: [
          {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+91 98765 43210',
            joinDate: '2024-01-15',
            status: 'active',
            totalBookings: 45,
            lastActive: new Date(Date.now() - 300000).toISOString()
          },
          {
            id: 2,
            name: 'Sarah Wilson',
            email: 'sarah@example.com',
            phone: '+91 87654 32109',
            joinDate: '2024-02-20',
            status: 'active',
            totalBookings: 23,
            lastActive: new Date(Date.now() - 600000).toISOString()
          }
        ]
      }
    };
    
    res.json(usersData);
  } catch (error) {
    console.error('Users API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading users data',
      error: error.message 
    });
  }
});

app.get('/api/admin/bookings', requireAdminAuth, (req, res) => {
  try {
    const bookingsData = {
      success: true,
      data: {
        totalBookings: 3456,
        todayBookings: 89,
        bookings: [
          {
            id: 'BK001',
            user: 'John Doe',
            spot: 'A-45',
            duration: '2 hours',
            amount: 250,
            status: 'active',
            startTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 7200000).toISOString()
          },
          {
            id: 'BK002',
            user: 'Sarah Wilson',
            spot: 'B-23',
            duration: '4 hours',
            amount: 400,
            status: 'completed',
            startTime: new Date(Date.now() - 14400000).toISOString(),
            endTime: new Date().toISOString()
          }
        ]
      }
    };
    
    res.json(bookingsData);
  } catch (error) {
    console.error('Bookings API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading bookings data',
      error: error.message 
    });
  }
});

// Parking spots API
app.get('/api/admin/parking', requireAdminAuth, (req, res) => {
  try {
    const parkingData = {
      success: true,
      data: {
        totalSpots: 500,
        availableSpots: 234,
        occupiedSpots: 186,
        reservedSpots: 80,
        spots: [
          {
            id: 'A-001',
            level: 'Level 1',
            section: 'A',
            number: 1,
            status: 'occupied',
            vehicle: 'MH 12 AB 1234',
            occupiedSince: new Date(Date.now() - 3600000).toISOString(),
            rate: 25
          },
          {
            id: 'A-002',
            level: 'Level 1',
            section: 'A',
            number: 2,
            status: 'available',
            vehicle: null,
            occupiedSince: null,
            rate: 25
          },
          {
            id: 'B-001',
            level: 'Level 2',
            section: 'B',
            number: 1,
            status: 'reserved',
            vehicle: 'MH 12 CD 5678',
            occupiedSince: new Date(Date.now() + 1800000).toISOString(),
            rate: 30
          }
        ]
      }
    };
    
    res.json(parkingData);
  } catch (error) {
    console.error('Parking API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading parking data',
      error: error.message 
    });
  }
});

// Vehicles API
app.get('/api/admin/vehicles', requireAdminAuth, (req, res) => {
  try {
    const vehiclesData = {
      success: true,
      data: {
        totalVehicles: 1623,
        activeVehicles: 186,
        vehicles: [
          {
            id: 'V001',
            plateNumber: 'MH 12 AB 1234',
            owner: 'John Doe',
            model: 'Honda City',
            color: 'White',
            status: 'parked',
            spotId: 'A-001',
            registeredDate: '2024-01-15',
            lastSeen: new Date(Date.now() - 3600000).toISOString()
          },
          {
            id: 'V002',
            plateNumber: 'MH 12 CD 5678',
            owner: 'Sarah Wilson',
            model: 'Maruti Swift',
            color: 'Red',
            status: 'registered',
            spotId: null,
            registeredDate: '2024-02-10',
            lastSeen: new Date(Date.now() - 86400000).toISOString()
          }
        ]
      }
    };
    
    res.json(vehiclesData);
  } catch (error) {
    console.error('Vehicles API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading vehicles data',
      error: error.message 
    });
  }
});

// Payments API
app.get('/api/admin/payments', requireAdminAuth, (req, res) => {
  try {
    const paymentsData = {
      success: true,
      data: {
        totalRevenue: 2847650.50,
        todayRevenue: 12450.25,
        pendingPayments: 5,
        payments: [
          {
            id: 'PAY001',
            user: 'John Doe',
            amount: 250,
            method: 'UPI',
            status: 'completed',
            bookingId: 'BK001',
            timestamp: new Date().toISOString(),
            transactionId: 'TXN123456789'
          },
          {
            id: 'PAY002',
            user: 'Sarah Wilson',
            amount: 400,
            method: 'Card',
            status: 'completed',
            bookingId: 'BK002',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            transactionId: 'TXN987654321'
          },
          {
            id: 'PAY003',
            user: 'Mike Johnson',
            amount: 150,
            method: 'UPI',
            status: 'pending',
            bookingId: 'BK003',
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            transactionId: null
          }
        ]
      }
    };
    
    res.json(paymentsData);
  } catch (error) {
    console.error('Payments API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading payments data',
      error: error.message 
    });
  }
});

// Reports API
app.get('/api/admin/reports', requireAdminAuth, (req, res) => {
  try {
    const reportsData = {
      success: true,
      data: {
        dailyReport: {
          date: new Date().toDateString(),
          totalBookings: 89,
          revenue: 12450.25,
          occupancy: 78,
          newUsers: 15
        },
        weeklyReport: {
          week: 'Week 32, 2024',
          totalBookings: 567,
          revenue: 89250.50,
          avgOccupancy: 82,
          newUsers: 89
        },
        monthlyReport: {
          month: 'August 2024',
          totalBookings: 2456,
          revenue: 456780.75,
          avgOccupancy: 79,
          newUsers: 234
        }
      }
    };
    
    res.json(reportsData);
  } catch (error) {
    console.error('Reports API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading reports data',
      error: error.message 
    });
  }
});

// Analytics API
app.get('/api/admin/analytics', requireAdminAuth, (req, res) => {
  try {
    const analyticsData = {
      success: true,
      data: {
        userGrowth: {
          thisMonth: 234,
          lastMonth: 189,
          growthRate: 23.8
        },
        revenueAnalytics: {
          thisMonth: 456780.75,
          lastMonth: 398245.50,
          growthRate: 14.7
        },
        peakHours: [
          { hour: '09:00', occupancy: 95 },
          { hour: '18:00', occupancy: 92 },
          { hour: '12:00', occupancy: 88 }
        ],
        popularSpots: [
          { section: 'Level 1 - Section A', bookings: 1234 },
          { section: 'Level 2 - Section B', bookings: 987 },
          { section: 'Level 1 - Section B', bookings: 856 }
        ]
      }
    };
    
    res.json(analyticsData);
  } catch (error) {
    console.error('Analytics API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading analytics data',
      error: error.message 
    });
  }
});

// System logs API
app.get('/api/admin/logs', requireAdminAuth, (req, res) => {
  try {
    const logsData = {
      success: true,
      data: {
        totalLogs: 15847,
        errorLogs: 12,
        warningLogs: 89,
        logs: [
          {
            id: 'LOG001',
            level: 'INFO',
            message: 'User login successful: john@example.com',
            timestamp: new Date().toISOString(),
            source: 'AUTH_SERVICE'
          },
          {
            id: 'LOG002',
            level: 'WARNING',
            message: 'High occupancy rate detected: 95%',
            timestamp: new Date(Date.now() - 300000).toISOString(),
            source: 'PARKING_SERVICE'
          },
          {
            id: 'LOG003',
            level: 'ERROR',
            message: 'Payment gateway timeout',
            timestamp: new Date(Date.now() - 600000).toISOString(),
            source: 'PAYMENT_SERVICE'
          }
        ]
      }
    };
    
    res.json(logsData);
  } catch (error) {
    console.error('Logs API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading logs data',
      error: error.message 
    });
  }
});

// Parking spots specific API (missing endpoint)
app.get('/api/admin/parking/spots', requireAdminAuth, (req, res) => {
  try {
    const spotsData = {
      success: true,
      data: {
        spots: [
          {
            id: 'A-001',
            level: 'Level 1',
            section: 'A',
            number: 1,
            status: 'occupied',
            vehicle: 'MH 12 AB 1234',
            occupiedSince: new Date(Date.now() - 3600000).toISOString(),
            rate: 25,
            customer: 'John Doe'
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
            customer: null
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
            customer: 'Sarah Wilson'
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
            customer: 'Mike Johnson'
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
            customer: null
          }
        ],
        summary: {
          total: 500,
          available: 234,
          occupied: 186,
          reserved: 65,
          maintenance: 15
        }
      }
    };
    
    res.json(spotsData);
  } catch (error) {
    console.error('Parking spots API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading parking spots data',
      error: error.message 
    });
  }
});

// Single parking spot API
app.get('/api/admin/parking/spots/:spotId', requireAdminAuth, (req, res) => {
  try {
    const { spotId } = req.params;
    
    const spotData = {
      success: true,
      data: {
        id: spotId,
        level: 'Level 1',
        section: spotId.charAt(0),
        number: parseInt(spotId.split('-')[1]),
        status: 'occupied',
        vehicle: 'MH 12 AB 1234',
        occupiedSince: new Date(Date.now() - 3600000).toISOString(),
        rate: 25,
        customer: 'John Doe',
        history: [
          {
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            action: 'occupied',
            vehicle: 'MH 12 AB 1234',
            customer: 'John Doe'
          },
          {
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            action: 'vacated',
            vehicle: 'MH 10 XY 7890',
            customer: 'Previous User'
          }
        ]
      }
    };
    
    res.json(spotData);
  } catch (error) {
    console.error('Single parking spot API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading parking spot data',
      error: error.message 
    });
  }
});

// Create parking spot
app.post('/api/admin/parking/spots', requireAdminAuth, (req, res) => {
  try {
    const { level, section, number, rate } = req.body;
    
    const newSpot = {
      id: `${section}-${String(number).padStart(3, '0')}`,
      level,
      section,
      number,
      status: 'available',
      vehicle: null,
      occupiedSince: null,
      rate: rate || 25,
      customer: null
    };
    
    res.json({
      success: true,
      message: 'Parking spot created successfully',
      data: newSpot
    });
  } catch (error) {
    console.error('Create parking spot API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating parking spot',
      error: error.message 
    });
  }
});

// Update parking spot
app.put('/api/admin/parking/spots/:spotId', requireAdminAuth, (req, res) => {
  try {
    const { spotId } = req.params;
    const { status, vehicle, customer, rate } = req.body;
    
    const updatedSpot = {
      id: spotId,
      status: status || 'available',
      vehicle: vehicle || null,
      customer: customer || null,
      rate: rate || 25,
      updatedAt: new Date().toISOString()
    };
    
    res.json({
      success: true,
      message: 'Parking spot updated successfully',
      data: updatedSpot
    });
  } catch (error) {
    console.error('Update parking spot API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating parking spot',
      error: error.message 
    });
  }
});

// Insights API (missing endpoint)
app.get('/api/admin/insights', requireAdminAuth, (req, res) => {
  try {
    const insightsData = {
      success: true,
      data: {
        keyInsights: [
          {
            title: 'Peak Usage Hours',
            description: 'Highest occupancy between 9 AM - 11 AM and 6 PM - 8 PM',
            impact: 'high',
            recommendation: 'Consider dynamic pricing during peak hours'
          },
          {
            title: 'Revenue Optimization',
            description: 'Level 2 parking generates 23% more revenue per spot',
            impact: 'medium',
            recommendation: 'Promote Level 2 parking with better signage'
          },
          {
            title: 'Customer Retention',
            description: '78% of users book the same parking section repeatedly',
            impact: 'high',
            recommendation: 'Implement section-based loyalty programs'
          }
        ],
        metrics: {
          avgOccupancyRate: 78,
          peakOccupancyRate: 95,
          avgSessionDuration: 145, // minutes
          customerSatisfaction: 4.2,
          revenueGrowth: 12.5
        },
        trends: {
          dailyPatterns: [
            { hour: '06:00', occupancy: 15 },
            { hour: '07:00', occupancy: 35 },
            { hour: '08:00', occupancy: 65 },
            { hour: '09:00', occupancy: 85 },
            { hour: '10:00', occupancy: 92 },
            { hour: '11:00', occupancy: 88 },
            { hour: '12:00', occupancy: 75 },
            { hour: '13:00', occupancy: 70 },
            { hour: '14:00', occupancy: 68 },
            { hour: '15:00', occupancy: 72 },
            { hour: '16:00', occupancy: 78 },
            { hour: '17:00', occupancy: 85 },
            { hour: '18:00', occupancy: 90 },
            { hour: '19:00', occupancy: 82 },
            { hour: '20:00', occupancy: 65 },
            { hour: '21:00', occupancy: 45 },
            { hour: '22:00', occupancy: 25 }
          ]
        }
      }
    };
    
    res.json(insightsData);
  } catch (error) {
    console.error('Insights API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading insights data',
      error: error.message 
    });
  }
});

// Settings API (missing endpoint)
app.get('/api/admin/settings', requireAdminAuth, (req, res) => {
  try {
    const settingsData = {
      success: true,
      data: {
        general: {
          siteName: 'VayAccess Parking System',
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          language: 'en',
          maintenanceMode: false
        },
        parking: {
          defaultRate: 25,
          maxBookingDuration: 480, // minutes
          advanceBookingDays: 30,
          autoReleaseTime: 15, // minutes after booking expires
          enableQrCode: true,
          enableLpr: true
        },
        payment: {
          acceptCash: true,
          acceptUpi: true,
          acceptCard: true,
          taxRate: 18, // GST %
          lateFee: 50,
          processingFee: 10
        },
        notifications: {
          emailNotifications: true,
          smsNotifications: true,
          pushNotifications: true,
          adminAlerts: true
        },
        security: {
          sessionTimeout: 60, // minutes
          maxLoginAttempts: 3,
          passwordExpiry: 90, // days
          twoFactorAuth: false
        }
      }
    };
    
    res.json(settingsData);
  } catch (error) {
    console.error('Settings API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading settings data',
      error: error.message 
    });
  }
});

// Update settings
app.put('/api/admin/settings', requireAdminAuth, (req, res) => {
  try {
    const updatedSettings = req.body;
    
    // In a real app, you'd save these to database
    console.log('Settings updated:', updatedSettings);
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: updatedSettings
    });
  } catch (error) {
    console.error('Update settings API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating settings',
      error: error.message 
    });
  }
});

// Handle favicon.ico
app.get('/favicon.ico', (req, res) => {
  res.status(204).send();
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  console.log('❌ API endpoint not found:', req.path);
  res.status(404).json({ 
    success: false, 
    message: 'API endpoint not found',
    path: req.path 
  });
});

// 404 handler for regular routes
app.use((req, res) => {
  console.log('❌ Page not found:', req.path);
  res.status(404).render('404', {
    title: '404 - Page Not Found',
    admin: req.session ? req.session.admin : null,
    layout: req.session && req.session.admin ? 'admin-main' : 'auth'
  });
});

// Error handler
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

app.listen(PORT, () => {
  console.log(`✅ Complete Admin Server running on http://localhost:${PORT}`);
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
  console.log('🚀 API Endpoints Available:');
  console.log('   GET /api/admin/dashboard');
  console.log('   GET /api/admin/ai-call-recordings');
  console.log('   GET /api/admin/users');
  console.log('   GET /api/admin/bookings');
  console.log('   GET /api/admin/parking');
  console.log('   GET /api/admin/parking/spots');
  console.log('   GET /api/admin/parking/spots/:spotId');
  console.log('   POST /api/admin/parking/spots');
  console.log('   PUT /api/admin/parking/spots/:spotId');
  console.log('   GET /api/admin/vehicles');
  console.log('   GET /api/admin/payments');
  console.log('   GET /api/admin/reports');
  console.log('   GET /api/admin/analytics');
  console.log('   GET /api/admin/insights');
  console.log('   GET /api/admin/settings');
  console.log('   PUT /api/admin/settings');
  console.log('   GET /api/admin/logs');
});