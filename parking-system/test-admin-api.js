require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

async function testAdminAPI() {
  try {
    console.log(' Testing Admin API Endpoints...');
    
    // Test 1: Login first to get session
    console.log('\n1. Testing Admin Login...');
    const loginResponse = await axios.post(`${BASE_URL}/admin/login`, {
      email: 'john.manager@vayaccess.com',
      password: 'Manager@123'
    }, {
      withCredentials: true,
      maxRedirects: 0,
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Accept redirects
      }
    });
    
    console.log('Login Status:', loginResponse.status);
    console.log('Login Headers:', loginResponse.headers['set-cookie']);
    
    // Extract session cookie
    const cookies = loginResponse.headers['set-cookie'];
    const sessionCookie = cookies ? cookies.find(cookie => cookie.startsWith('connect.sid')) : null;
    
    if (!sessionCookie) {
      throw new Error('No session cookie received');
    }
    
    console.log(' Login successful, session cookie:', sessionCookie.split(';')[0]);
    
    // Test 2: Get Users API
    console.log('\n2. Testing Get Users API...');
    const usersResponse = await axios.get(`${BASE_URL}/api/admin/users`, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Users API Status:', usersResponse.status);
    console.log('Users API Response:', JSON.stringify(usersResponse.data, null, 2));
    
    // Test 3: Create User API
    console.log('\n3. Testing Create User API...');
    const newUser = {
      name: 'Test API User',
      email: `testapi${Date.now()}@example.com`,
      phone: '+1234567890',
      role: 'user',
      password: 'TestPass123',
      status: 'active'
    };
    
    const createUserResponse = await axios.post(`${BASE_URL}/api/admin/users`, newUser, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Create User Status:', createUserResponse.status);
    console.log('Create User Response:', JSON.stringify(createUserResponse.data, null, 2));
    
    // Test 4: Create Vehicle API
    console.log('\n4. Testing Create Vehicle API...');
    const newVehicle = {
      licensePlate: `TEST${Date.now()}`,
      make: 'Test Make',
      model: 'Test Model',
      year: 2023,
      color: 'Blue',
      type: 'car',
      fuelType: 'petrol',
      ownerEmail: newUser.email
    };
    
    const createVehicleResponse = await axios.post(`${BASE_URL}/admin/api/vehicles`, newVehicle, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Create Vehicle Status:', createVehicleResponse.status);
    console.log('Create Vehicle Response:', JSON.stringify(createVehicleResponse.data, null, 2));
    
    // Test 5: Create Parking Spot API
    console.log('\n5. Testing Create Parking Spot API...');
    const newSpot = {
      spotNumber: `TEST-${Date.now()}`,
      locationName: 'Test Location',
      locationAddress: 'Test Address',
      latitude: 17.4065,
      longitude: 78.4772,
      type: 'regular',
      hourlyRate: 50
    };
    
    const createSpotResponse = await axios.post(`${BASE_URL}/admin/api/parking-spots`, newSpot, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Create Parking Spot Status:', createSpotResponse.status);
    console.log('Create Parking Spot Response:', JSON.stringify(createSpotResponse.data, null, 2));
    
    console.log('\n All API tests completed successfully!');
    
  } catch (error) {
    console.error('\n API Test Error:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

testAdminAPI();
