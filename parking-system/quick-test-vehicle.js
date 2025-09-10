const axios = require('axios');

async function testVehicleEndpoint() {
  try {
    // First register a user
    console.log('Registering user...');
    const userResponse = await axios.post('http://localhost:3001/api/auth/register', {
      name: 'Vehicle Test User',
      email: `vehicletest${Date.now()}@example.com`,
      password: 'Password123',
      phone: `${Date.now().toString().slice(-10)}`
    });
    
    const token = userResponse.data.tokens.accessToken;
    console.log(' User registered, token obtained');
    
    // Test vehicle registration
    console.log('Testing vehicle registration...');
    const vehicleResponse = await axios.post('http://localhost:3001/api/vehicle/register', {
      licensePlate: 'QUICK123',
      make: 'Honda',
      model: 'Civic',
      year: 2023,
      color: 'Red',
      type: 'car',
      fuelType: 'petrol'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(' Vehicle registration successful:', vehicleResponse.data);
    
  } catch (error) {
    console.error(' Error:', error.response?.data || error.message);
  }
}

testVehicleEndpoint();
