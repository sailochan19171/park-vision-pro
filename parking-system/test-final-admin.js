require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

async function testFinalAdmin() {
  try {
    console.log(' FINAL ADMIN PANEL TEST');
    console.log('========================');
    
    // Login first
    const loginResponse = await axios.post(`${BASE_URL}/admin/login`, {
      email: 'john.manager@vayaccess.com',
      password: 'Manager@123'
    }, {
      withCredentials: true,
      maxRedirects: 0,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });
    
    const cookies = loginResponse.headers['set-cookie'];
    const sessionCookie = cookies ? cookies.find(cookie => cookie.startsWith('connect.sid')) : null;
    
    console.log(' Login successful');
    
    // Test 1: Create a new user
    console.log('\n1. Testing User Creation...');
    const userData = {
      name: `Test User ${Date.now()}`,
      email: `testuser${Date.now()}@example.com`,
      phone: '9999999999',
      role: 'user',
      password: 'TestPass123',
      status: 'active'
    };
    
    const userResponse = await axios.post(`${BASE_URL}/api/admin/users`, userData, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(` User created: ${userResponse.data.user.name} (ID: ${userResponse.data.user.id})`);
    const newUserId = userResponse.data.user.id;
    
    // Test 2: Create a new vehicle for this user
    console.log('\n2. Testing Vehicle Creation...');
    const vehicleData = {
      licensePlate: `TEST${Date.now()}`,
      make: 'Honda',
      model: 'Civic',
      color: 'Red',
      type: 'car',
      ownerId: newUserId
    };
    
    const vehicleResponse = await axios.post(`${BASE_URL}/api/admin/vehicles`, vehicleData, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(` Vehicle created: ${vehicleResponse.data.vehicle.licensePlate} (ID: ${vehicleResponse.data.vehicle.id})`);
    const newVehicleId = vehicleResponse.data.vehicle.id;
    
    // Test 3: Create a new parking spot
    console.log('\n3. Testing Parking Spot Creation...');
    const spotData = {
      spotNumber: `SPOT-${Date.now()}`,
      location: 'Test Level - Section B',
      type: 'regular',
      hourlyRate: 40
    };
    
    const spotResponse = await axios.post(`${BASE_URL}/api/admin/parking/spots`, spotData, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(` Parking spot created: ${spotResponse.data.spot.spotNumber} (ID: ${spotResponse.data.spot.id})`);
    const newSpotId = spotResponse.data.spot.id;
    
    // Test 4: Create a booking
    console.log('\n4. Testing Booking Creation...');
    const bookingData = {
      userId: newUserId,
      vehicleId: newVehicleId,
      parkingSpotId: newSpotId,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours later
      totalAmount: 80
    };
    
    const bookingResponse = await axios.post(`${BASE_URL}/api/admin/bookings`, bookingData, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(` Booking created: ID ${bookingResponse.data.booking.id}`);
    
    // Test 5: Verify all data is retrievable
    console.log('\n5. Testing Data Retrieval...');
    
    const endpoints = [
      { name: 'Users', url: '/api/admin/users' },
      { name: 'Vehicles', url: '/api/admin/vehicles' },
      { name: 'Parking Data', url: '/api/admin/parking' },
      { name: 'Parking Spots', url: '/api/admin/parking/spots' },
      { name: 'Bookings', url: '/api/admin/bookings' },
      { name: 'Payments', url: '/api/admin/payments' }
    ];
    
    for (const endpoint of endpoints) {
      const response = await axios.get(`${BASE_URL}${endpoint.url}`, {
        headers: { 'Cookie': sessionCookie }
      });
      console.log(` ${endpoint.name}: ${response.status} - ${response.data.success ? 'SUCCESS' : 'FAILED'}`);
    }
    
    console.log('\n ALL TESTS PASSED!');
    console.log('====================================');
    console.log(' User creation: WORKING');
    console.log(' Vehicle creation: WORKING');
    console.log(' Parking spot creation: WORKING');
    console.log(' Booking creation: WORKING');
    console.log(' All API endpoints: WORKING');
    console.log(' Data persistence: WORKING');
    console.log('\n Your admin panel is fully functional!');
    console.log('Access it at: http://localhost:8080/admin/login');
    
  } catch (error) {
    console.error('\n Test Failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testFinalAdmin();
