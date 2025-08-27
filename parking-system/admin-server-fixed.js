// Admin Dashboard Server - Fixed Version
// Port: 3001
// Serves admin dashboard with authentication

require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { engine } = require('express-handlebars');

const app = express();
const PORT = process.env.ADMIN_PORT || 3001;

console.log('Starting Admin Server on port:', PORT);

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
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));

// Authentication middleware
const requireAdminAuth = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  next();
};

// Root redirect
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

// Login processing - FIXED VERSION
app.post('/admin/login', (req, res) => {
  console.log('Admin login POST request received');
  console.log('Request body:', req.body);

  try {
    const { email, password, rememberMe } = req.body;
    
    if (!email || !password) {
      console.log('Missing email or password');
      return res.render('login', {
        title: 'Admin Login - VayAccess',
        layout: 'auth',
        error: 'Please provide both email and password.',
        email: email
      });
    }
    
    // Demo admin credentials
    const validCredentials = {
      'admin@vayaccess.com': 'Admin@123',
      'john.manager@vayaccess.com': 'User@123'
    };
    
    const normalizedEmail = email.toLowerCase().trim();
    
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
      
      console.log('Login successful for:', normalizedEmail);
      return res.redirect('/admin/dashboard');
    } else {
      console.log('Invalid credentials for:', normalizedEmail);
      return res.render('login', {
        title: 'Admin Login - VayAccess',
        layout: 'auth',
        error: 'Invalid email or password.',
        email: email
      });
    }
  } catch (error) {
    console.error('Admin login error:', error);
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

// Parking Management
app.get('/admin/parking', requireAdminAuth, (req, res) => {
  res.render('parking', {
    title: 'Parking Management - VayAccess Admin',
    admin: req.session.admin,
    activeTab: 'parking'
  });
});

// Logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// Error handling
app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`✅ Admin Server running on http://localhost:${PORT}`);
  console.log('🔗 Admin Login: http://localhost:' + PORT + '/admin/login');
  console.log('📊 Admin Dashboard: http://localhost:' + PORT + '/admin/dashboard');
});