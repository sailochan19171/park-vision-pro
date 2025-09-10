/**
 * Comprehensive Activity Logging Test
 * Tests all admin and user dashboard operations to ensure they're logged in MongoDB
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

// Import models
const ActivityLog = require('./models/ActivityLog');
const User = require('./models/User');
const Vehicle = require('./models/Vehicle');
const ParkingSpot = require('./models/ParkingSpot');

const ADMIN_BASE_URL = 'http://localhost:8081';
const USER_BASE_URL = 'http://localhost:3002';

let adminSessionCookie = '';
let userSessionCookie = '';
let testUserId = '';
let testVehicleId = '';
let testSpotId = '';

async function connectToMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(' Connected to MongoDB');
  } catch (error) {
    console.error(' MongoDB connection failed:', error);
    process.exit(1);
  }
}

async function clearPreviousLogs() {
  try {
    const result = await ActivityLog.deleteMany({
      timestamp: { $gte: new Date(Date.now() - 60000) } // Last minute
    });
    console.log(` Cleared ${result.deletedCount} previous test logs`);
  } catch (error) {
    console.error(' Error clearing logs:', error);
  }
}

async function loginAsAdmin() {
  try {
    console.log('\n Testing Admin Login...');
    
    const response = await axios.post(`${ADMIN_BASE_URL}/api/admin/login`, {
      email: 'admin@vayaccess.com',
      password: 'admin123'
    });
    
    if (response.data.success) {
      adminSessionCookie = response.headers['set-cookie']?.[0] || '';
      console.log(' Admin login successful');
      
      // Check if login was logged
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for logging
      const loginLog = await ActivityLog.findOne({
        action: 'ADMIN_LOGIN',
        timestamp: { $gte: new Date(Date.now() - 5000) }
      });
      
      if (loginLog) {
        console.log(' Admin login activity logged to MongoDB');
      } else {
        console.log(' Admin login activity NOT logged');
      }
    } else {
      throw new Error('Admin login failed');
    }
  } catch (error) {
    console.error(' Admin login error:', error.message);
  }
}

async function testAdminOperations() {
  console.log('\n Testing Admin Dashboard Operations...');
  
  const adminAxios = axios.create({
    baseURL: ADMIN_BASE_URL,
    headers: {
      'Cookie': adminSessionCookie
    }
  });
  
  const operations = [
    {
      name: 'View Dashboard Stats',
      method: 'GET',
      url: '/api/admin/stats',
      expectedAction: 'ADMIN_VIEW_DASHBOARD'
    },
    {
      name: 'View Users',
      method: 'GET',
      url: '/api/admin/users',
      expectedAction: 'ADMIN_VIEW_USERS'
    },
    {
      name: 'Create User',
      method: 'POST',
      url: '/api/admin/users',
      data: {
        name: 'Test User Activity',
        email: `testuser${Date.now()}@test.com`,
        phone: '9876543210',
        password: 'test123'
      },
      expectedAction: 'ADMIN_CREATE_USER'
    },
    {
      name: 'View Vehicles',
      method: 'GET',
      url: '/api/admin/vehicles',
      expectedAction: 'ADMIN_VIEW_VEHICLES'
    },
    {
      name: 'View Parking Spots',
      method: 'GET',
      url: '/api/admin/parking-spots',
      expectedAction: 'ADMIN_VIEW_PARKING_SPOTS'
    },
    {
      name: 'View Bookings',
      method: 'GET',
      url: '/api/admin/bookings',
      expectedAction: 'ADMIN_VIEW_BOOKINGS'
    },
    {
      name: 'View Payments',
      method: 'GET',
      url: '/api/admin/payments',
      expectedAction: 'ADMIN_VIEW_PAYMENTS'
    },
    {
      name: 'View Reports',
      method: 'GET',
      url: '/api/admin/reports',
      expectedAction: 'ADMIN_VIEW_REPORTS'
    },
    {
      name: 'View Settings',
      method: 'GET',
      url: '/api/admin/settings',
      expectedAction: 'ADMIN_VIEW_SETTINGS'
    }
  ];
  
  for (const operation of operations) {
    try {
      console.log(`\n Testing: ${operation.name}`);
      
      let response;
      if (operation.method === 'GET') {
        response = await adminAxios.get(operation.url);
      } else if (operation.method === 'POST') {
        response = await adminAxios.post(operation.url, operation.data);
      } else if (operation.method === 'PUT') {
        response = await adminAxios.put(operation.url, operation.data);
      }
      
      if (response.data.success !== false) {
        console.log(` ${operation.name} API call successful`);
        
        // Store IDs for later operations
        if (operation.name === 'Create User' && response.data.user) {
          testUserId = response.data.user._id || response.data.user.id;
        }
        
        // Wait and check if logged
        await new Promise(resolve => setTimeout(resolve, 1000));
        const activityLog = await ActivityLog.findOne({
          action: operation.expectedAction,
          timestamp: { $gte: new Date(Date.now() - 5000) }
        });
        
        if (activityLog) {
          console.log(` ${operation.name} activity logged to MongoDB`);
          console.log(`    Action: ${activityLog.action}, Status: ${activityLog.responseStatus}, Duration: ${activityLog.duration}ms`);
        } else {
          console.log(` ${operation.name} activity NOT logged`);
        }
      } else {
        console.log(` ${operation.name} API call failed:`, response.data.message);
      }
    } catch (error) {
      console.log(` ${operation.name} error:`, error.response?.data?.message || error.message);
    }
  }
}

async function registerTestUser() {
  try {
    console.log('\n Testing User Registration...');
    
    const userData = {
      name: 'Test User Activity',
      email: `testuser${Date.now()}@test.com`,
      phone: '9876543210',
      password: 'test123',
      confirmPassword: 'test123'
    };
    
    const response = await axios.post(`${USER_BASE_URL}/api/user/register`, userData);
    
    if (response.data.success) {
      console.log(' User registration successful');
      
      // Check if registration was logged
      await new Promise(resolve => setTimeout(resolve, 1000));
      const regLog = await ActivityLog.findOne({
        action: 'USER_REGISTER',
        timestamp: { $gte: new Date(Date.now() - 5000) }
      });
      
      if (regLog) {
        console.log(' User registration activity logged to MongoDB');
      } else {
        console.log(' User registration activity NOT logged');
      }
      
      return userData;
    } else {
      throw new Error('User registration failed');
    }
  } catch (error) {
    console.error(' User registration error:', error.response?.data?.message || error.message);
    return null;
  }
}

async function loginAsUser(userData) {
  try {
    console.log('\n Testing User Login...');
    
    const response = await axios.post(`${USER_BASE_URL}/api/user/login`, {
      email: userData.email,
      password: userData.password
    });
    
    if (response.data.success) {
      userSessionCookie = response.headers['set-cookie']?.[0] || '';
      console.log(' User login successful');
      
      // Check if login was logged
      await new Promise(resolve => setTimeout(resolve, 1000));
      const loginLog = await ActivityLog.findOne({
        action: 'USER_LOGIN',
        timestamp: { $gte: new Date(Date.now() - 5000) }
      });
      
      if (loginLog) {
        console.log(' User login activity logged to MongoDB');
      } else {
        console.log(' User login activity NOT logged');
      }
    } else {
      throw new Error('User login failed');
    }
  } catch (error) {
    console.error(' User login error:', error.response?.data?.message || error.message);
  }
}

async function testUserOperations() {
  console.log('\n Testing User Dashboard Operations...');
  
  const userAxios = axios.create({
    baseURL: USER_BASE_URL,
    headers: {
      'Cookie': userSessionCookie
    }
  });
  
  const operations = [
    {
      name: 'View Dashboard',
      method: 'GET',
      url: '/api/user/dashboard',
      expectedAction: 'USER_VIEW_DASHBOARD'
    },
    {
      name: 'View Profile',
      method: 'GET',
      url: '/api/user/profile',
      expectedAction: 'USER_VIEW_PROFILE'
    },
    {
      name: 'View Vehicles',
      method: 'GET',
      url: '/api/user/vehicles',
      expectedAction: 'USER_VIEW_VEHICLES'
    },
    {
      name: 'Add Vehicle',
      method: 'POST',
      url: '/api/user/vehicles',
      data: {
        licensePlate: `TEST${Date.now()}`,
        type: 'Car',
        model: 'Test Model',
        color: 'Blue'
      },
      expectedAction: 'USER_ADD_VEHICLE'
    },
    {
      name: 'View Bookings',
      method: 'GET',
      url: '/api/user/bookings',
      expectedAction: 'USER_VIEW_BOOKINGS'
    },
    {
      name: 'View Payments',
      method: 'GET',
      url: '/api/user/payments',
      expectedAction: 'USER_VIEW_PAYMENTS'
    },
    {
      name: 'View Notifications',
      method: 'GET',
      url: '/api/user/notifications',
      expectedAction: 'USER_VIEW_NOTIFICATIONS'
    }
  ];
  
  for (const operation of operations) {
    try {
      console.log(`\n Testing: ${operation.name}`);
      
      let response;
      if (operation.method === 'GET') {
        response = await userAxios.get(operation.url);
      } else if (operation.method === 'POST') {
        response = await userAxios.post(operation.url, operation.data);
      }
      
      if (response.data.success !== false) {
        console.log(` ${operation.name} API call successful`);
        
        // Wait and check if logged
        await new Promise(resolve => setTimeout(resolve, 1000));
        const activityLog = await ActivityLog.findOne({
          action: operation.expectedAction,
          timestamp: { $gte: new Date(Date.now() - 5000) }
        });
        
        if (activityLog) {
          console.log(` ${operation.name} activity logged to MongoDB`);
          console.log(`    Action: ${activityLog.action}, Status: ${activityLog.responseStatus}, Duration: ${activityLog.duration}ms`);
        } else {
          console.log(` ${operation.name} activity NOT logged`);
        }
      } else {
        console.log(` ${operation.name} API call failed:`, response.data.message);
      }
    } catch (error) {
      console.log(` ${operation.name} error:`, error.response?.data?.message || error.message);
    }
  }
}

async function generateActivityReport() {
  console.log('\n Generating Activity Report...');
  
  try {
    const totalLogs = await ActivityLog.countDocuments({
      timestamp: { $gte: new Date(Date.now() - 300000) } // Last 5 minutes
    });
    
    const adminLogs = await ActivityLog.countDocuments({
      userRole: 'admin',
      timestamp: { $gte: new Date(Date.now() - 300000) }
    });
    
    const userLogs = await ActivityLog.countDocuments({
      userRole: 'user',
      timestamp: { $gte: new Date(Date.now() - 300000) }
    });
    
    const successfulLogs = await ActivityLog.countDocuments({
      success: true,
      timestamp: { $gte: new Date(Date.now() - 300000) }
    });
    
    const failedLogs = await ActivityLog.countDocuments({
      success: false,
      timestamp: { $gte: new Date(Date.now() - 300000) }
    });
    
    console.log('\n ACTIVITY LOGGING REPORT:');
    console.log('================================');
    console.log(` Total Activities Logged: ${totalLogs}`);
    console.log(` Admin Activities: ${adminLogs}`);
    console.log(` User Activities: ${userLogs}`);
    console.log(` Successful Operations: ${successfulLogs}`);
    console.log(` Failed Operations: ${failedLogs}`);
    console.log(` Success Rate: ${totalLogs > 0 ? ((successfulLogs / totalLogs) * 100).toFixed(2) : 0}%`);
    
    // Show recent activities
    const recentActivities = await ActivityLog.find({
      timestamp: { $gte: new Date(Date.now() - 300000) }
    })
    .populate('userId', 'name email')
    .sort({ timestamp: -1 })
    .limit(10);
    
    console.log('\n Recent Activities:');
    console.log('====================');
    recentActivities.forEach((activity, index) => {
      console.log(`${index + 1}. ${activity.action} - ${activity.userRole} - ${activity.responseStatus} - ${activity.duration}ms`);
      console.log(`    User: ${activity.userEmail}`);
      console.log(`    Endpoint: ${activity.method} ${activity.endpoint}`);
      console.log(`    Time: ${activity.timestamp.toLocaleString()}`);
      console.log('');
    });
    
  } catch (error) {
    console.error(' Error generating report:', error);
  }
}

async function testActivityLogAPIs() {
  console.log('\n Testing Activity Log APIs...');
  
  const adminAxios = axios.create({
    baseURL: ADMIN_BASE_URL,
    headers: {
      'Cookie': adminSessionCookie
    }
  });
  
  try {
    // Test activity logs endpoint
    const logsResponse = await adminAxios.get('/api/admin/activity-logs?limit=10');
    if (logsResponse.data.success) {
      console.log(` Activity Logs API working - Found ${logsResponse.data.data.logs.length} logs`);
    }
    
    // Test activity stats endpoint
    const statsResponse = await adminAxios.get('/api/admin/activity-stats');
    if (statsResponse.data.success) {
      console.log(' Activity Stats API working');
      console.log(`    Total Activities: ${statsResponse.data.data.summary.totalActivities}`);
    }
    
    // Test export endpoint
    const exportResponse = await adminAxios.get('/api/admin/export-activity-logs?format=json&limit=5');
    if (exportResponse.data.success) {
      console.log(` Export Activity Logs API working - Exported ${exportResponse.data.data.length} records`);
    }
    
  } catch (error) {
    console.error(' Activity Log APIs error:', error.response?.data?.message || error.message);
  }
}

async function runTests() {
  console.log(' Starting Comprehensive Activity Logging Test');
  console.log('===============================================');
  
  await connectToMongoDB();
  await clearPreviousLogs();
  
  // Test Admin Operations
  await loginAsAdmin();
  await testAdminOperations();
  
  // Test User Operations
  const userData = await registerTestUser();
  if (userData) {
    await loginAsUser(userData);
    await testUserOperations();
  }
  
  // Test Activity Log APIs
  await testActivityLogAPIs();
  
  // Generate Report
  await generateActivityReport();
  
  console.log('\n Activity Logging Test Completed!');
  console.log('=====================================');
  console.log(' Check your MongoDB vay_parking_system database');
  console.log(' Collection: activitylogs');
  console.log(' All admin and user dashboard operations should be logged');
  
  await mongoose.disconnect();
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(' Unhandled rejection:', error);
  process.exit(1);
});

// Run tests
runTests().catch(console.error);
