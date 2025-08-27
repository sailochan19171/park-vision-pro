require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

// Models
const User = require('./models/User');
const Vehicle = require('./models/Vehicle');
const ParkingSpot = require('./models/ParkingSpot');
const VehicleLog = require('./models/VehicleLog');

const API_BASE = 'http://localhost:3001';

let authToken = '';
let adminToken = '';
let testUserId = '';
let testVehicleId = '';
let testSpotId = '';

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}

async function testUserRegistration() {
  console.log('\n🧪 Testing User Registration...');
  
  try {
    const response = await axios.post(`${API_BASE}/api/auth/register`, {
      name: 'Test User Complete',
      email: `testcomplete${Date.now()}@example.com`,
      password: 'Password123',
      phone: `${Date.now().toString().slice(-10)}`
    });
    
    console.log('✅ User registration successful');
    authToken = response.data.tokens.accessToken;
    testUserId = response.data.user._id;
    
    // Verify in database
    const userInDB = await User.findById(testUserId);
    if (userInDB) {
      console.log('✅ User found in MongoDB:', userInDB.name);
    } else {
      console.log('❌ User NOT found in MongoDB');
    }
    
  } catch (error) {
    console.error('❌ User registration failed:', error.response?.data || error.message);
  }
}

async function testUserLogin() {
  console.log('\n🧪 Testing User Login...');
  
  try {
    // Use the email from registration
    const testUser = await User.findById(testUserId);
    const response = await axios.post(`${API_BASE}/api/auth/login`, {
      email: testUser.email,
      password: 'Password123'
    });
    
    console.log('✅ User login successful');
    authToken = response.data.tokens.accessToken;
    
  } catch (error) {
    console.error('❌ User login failed:', error.response?.data || error.message);
  }
}

async function testAdminLogin() {
  console.log('\n🧪 Testing Admin Login...');
  
  try {
    // First create an admin user if not exists
    const adminEmail = `admin${Date.now()}@test.com`;
    let admin = new User({
      name: 'Test Admin',
      email: adminEmail,
      password: 'AdminPass123',
      phone: `${Date.now().toString().slice(-10)}`,
      role: 'admin'
    });
    await admin.save();
    console.log('✅ Admin user created');
    
    const response = await axios.post(`${API_BASE}/api/admin/login`, {
      email: adminEmail,
      password: 'AdminPass123'
    });
    
    console.log('✅ Admin login successful');
    adminToken = response.data.token;
    
  } catch (error) {
    console.error('❌ Admin login failed:', error.response?.data || error.message);
  }
}

async function testVehicleRegistration() {
  console.log('\n🧪 Testing Vehicle Registration...');
  
  if (!authToken) {
    console.log('❌ No auth token available');
    return;
  }
  
  try {
    const response = await axios.post(`${API_BASE}/api/vehicle/register`, {
      licensePlate: `TEST${Date.now().toString().slice(-6)}`,
      make: 'Toyota',
      model: 'Camry',
      year: 2022,
      color: 'Blue',
      type: 'car',
      fuelType: 'petrol'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    console.log('✅ Vehicle registration successful');
    testVehicleId = response.data.data._id;
    
    // Verify in database
    const vehicleInDB = await Vehicle.findById(testVehicleId);
    if (vehicleInDB) {
      console.log('✅ Vehicle found in MongoDB:', vehicleInDB.licensePlate);
    } else {
      console.log('❌ Vehicle NOT found in MongoDB');
    }
    
  } catch (error) {
    console.error('❌ Vehicle registration failed:', error.response?.data || error.message);
  }
}

async function testParkingSpotCreation() {
  console.log('\n🧪 Testing Parking Spot Creation...');
  
  if (!adminToken) {
    console.log('❌ No admin token available');
    return;
  }
  
  try {
    const response = await axios.post(`${API_BASE}/api/parking/spots`, {
      spotNumber: `TEST-${Date.now().toString().slice(-6)}`,
      location: {
        name: 'Test Parking Lot',
        address: '123 Test Street, Test City',
        coordinates: {
          latitude: 12.9716,
          longitude: 77.5946
        },
        floor: 'G',
        section: 'A'
      },
      type: 'regular',
      dimensions: {
        length: 5.0,
        width: 2.5,
        height: 2.0
      },
      pricing: {
        hourlyRate: 50,
        dailyRate: 400,
        monthlyRate: 10000
      }
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    console.log('✅ Parking spot creation successful');
    testSpotId = response.data.data._id;
    
    // Verify in database
    const spotInDB = await ParkingSpot.findById(testSpotId);
    if (spotInDB) {
      console.log('✅ Parking spot found in MongoDB:', spotInDB.spotNumber);
    } else {
      console.log('❌ Parking spot NOT found in MongoDB');
    }
    
  } catch (error) {
    console.error('❌ Parking spot creation failed:', error.response?.data || error.message);
  }
}

async function testVehicleEntry() {
  console.log('\n🧪 Testing Vehicle Entry Log...');
  
  if (!authToken || !testSpotId || !testVehicleId) {
    console.log('❌ Missing auth token, spot ID, or vehicle ID');
    return;
  }
  
  try {
    // Get the vehicle details
    const vehicle = await Vehicle.findById(testVehicleId);
    
    const response = await axios.post(`${API_BASE}/api/vehicle/entry`, {
      licensePlate: vehicle.licensePlate,
      spotId: testSpotId,
      detectionMethod: 'manual',
      operatorId: testUserId
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    console.log('✅ Vehicle entry log successful');
    
    // Verify in database
    const logInDB = await VehicleLog.findOne({ 
      vehicle: testVehicleId,
      logType: 'entry'
    });
    if (logInDB) {
      console.log('✅ Vehicle entry log found in MongoDB');
    } else {
      console.log('❌ Vehicle entry log NOT found in MongoDB');
    }
    
  } catch (error) {
    console.error('❌ Vehicle entry log failed:', error.response?.data || error.message);
  }
}

async function testAdminDashboard() {
  console.log('\n🧪 Testing Admin Dashboard Stats...');
  
  if (!adminToken) {
    console.log('❌ No admin token available');
    return;
  }
  
  try {
    const response = await axios.get(`${API_BASE}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    console.log('✅ Admin dashboard stats successful');
    console.log('📊 Dashboard Data:', {
      totalSpots: response.data.data.totalSpots,
      totalUsers: response.data.data.totalUsers,
      occupancyRate: response.data.data.occupancyRate
    });
    
  } catch (error) {
    console.error('❌ Admin dashboard failed:', error.response?.data || error.message);
  }
}

async function testDatabaseCounts() {
  console.log('\n📊 Database Statistics:');
  
  try {
    const userCount = await User.countDocuments();
    const vehicleCount = await Vehicle.countDocuments();
    const spotCount = await ParkingSpot.countDocuments();
    const logCount = await VehicleLog.countDocuments();
    
    console.log(`   Users: ${userCount}`);
    console.log(`   Vehicles: ${vehicleCount}`);
    console.log(`   Parking Spots: ${spotCount}`);
    console.log(`   Vehicle Logs: ${logCount}`);
    
    // Show recent entries
    console.log('\n📋 Recent Entries:');
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(3).select('name email createdAt');
    recentUsers.forEach((user, i) => {
      console.log(`   ${i + 1}. User: ${user.name} (${user.email}) - ${user.createdAt}`);
    });
    
    const recentVehicles = await Vehicle.find().sort({ createdAt: -1 }).limit(3).select('licensePlate make model createdAt');
    recentVehicles.forEach((vehicle, i) => {
      console.log(`   ${i + 1}. Vehicle: ${vehicle.licensePlate} ${vehicle.make} ${vehicle.model} - ${vehicle.createdAt}`);
    });
    
  } catch (error) {
    console.error('❌ Error fetching database stats:', error);
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    if (testUserId) {
      await User.findByIdAndDelete(testUserId);
      console.log('✅ Test user deleted');
    }
    
    if (testVehicleId) {
      await Vehicle.findByIdAndDelete(testVehicleId);
      console.log('✅ Test vehicle deleted');
    }
    
    if (testSpotId) {
      await ParkingSpot.findByIdAndDelete(testSpotId);
      console.log('✅ Test parking spot deleted');
    }
    
    // Delete test vehicle logs
    await VehicleLog.deleteMany({ 'vehicleDetails.licensePlate': 'TEST123' });
    console.log('✅ Test vehicle logs deleted');
    
    // Delete admin user
    await User.findOneAndDelete({ email: 'admin@test.com' });
    console.log('✅ Test admin deleted');
    
  } catch (error) {
    console.error('❌ Cleanup error:', error);
  }
}

async function runAllTests() {
  console.log('🚀 Starting comprehensive POST endpoint tests...\n');
  
  await connectDB();
  
  // Test all endpoints
  await testUserRegistration();
  await testUserLogin();
  await testAdminLogin();
  await testVehicleRegistration();
  await testParkingSpotCreation();
  await testVehicleEntry();
  await testAdminDashboard();
  
  // Show database state
  await testDatabaseCounts();
  
  // Cleanup
  await cleanup();
  
  await mongoose.disconnect();
  console.log('\n✅ All tests completed and database disconnected');
}

// Run tests
runAllTests().catch(console.error);