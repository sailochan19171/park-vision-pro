require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

async function testFixedEndpoints() {
  try {
    console.log('🧪 Testing Fixed Admin Endpoints...');
    
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
    
    console.log('✅ Login successful');
    
    // Test 1: Create Vehicle with correct fields
    console.log('\n1. Testing Fixed Vehicle Creation...');
    
    // First get a user ID
    const usersResponse = await axios.get(`${BASE_URL}/api/admin/users`, {
      headers: { 'Cookie': sessionCookie }
    });
    
    const users = usersResponse.data.users;
    const testUser = users.find(u => u.role === 'user') || users[0];
    
    const vehicleData = {
      licensePlate: `FIXED${Date.now()}`,
      make: 'Toyota',
      model: 'Camry',
      color: 'Blue',
      type: 'car',
      ownerId: testUser.id
    };
    
    const vehicleResponse = await axios.post(`${BASE_URL}/api/admin/vehicles`, vehicleData, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Vehicle Creation Status:', vehicleResponse.status);
    console.log('Vehicle Response:', vehicleResponse.data);
    
    // Test 2: Create Parking Spot with correct fields
    console.log('\n2. Testing Fixed Parking Spot Creation...');
    
    const spotData = {
      spotNumber: `FIXED-${Date.now()}`,
      location: 'Test Level - Section A',
      type: 'standard',
      hourlyRate: 30
    };
    
    const spotResponse = await axios.post(`${BASE_URL}/api/admin/parking/spots`, spotData, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Parking Spot Creation Status:', spotResponse.status);
    console.log('Parking Spot Response:', spotResponse.data);
    
    // Test 3: Get Vehicles to verify data structure
    console.log('\n3. Testing Get Vehicles API...');
    
    const getVehiclesResponse = await axios.get(`${BASE_URL}/api/admin/vehicles`, {
      headers: { 'Cookie': sessionCookie }
    });
    
    console.log('Get Vehicles Status:', getVehiclesResponse.status);
    console.log('Vehicles Count:', getVehiclesResponse.data.vehicles?.length || 0);
    console.log('Sample Vehicle:', getVehiclesResponse.data.vehicles?.[0] || 'No vehicles');
    
    console.log('\n✅ All fixed endpoint tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Fixed Endpoint Test Error:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

testFixedEndpoints();