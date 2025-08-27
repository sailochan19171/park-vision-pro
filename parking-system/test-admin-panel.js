require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

async function testAdminPanel() {
  try {
    console.log('🧪 Testing Admin Panel Endpoints...');
    
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
    
    // Test all the endpoints that were failing
    const endpoints = [
      '/api/admin/users',
      '/api/admin/vehicles', 
      '/api/admin/parking',
      '/api/admin/parking/spots',
      '/api/admin/bookings',
      '/api/admin/payments'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
          headers: { 'Cookie': sessionCookie }
        });
        console.log(`✅ ${endpoint}: ${response.status} - ${response.data.success ? 'SUCCESS' : 'FAILED'}`);
        if (endpoint === '/api/admin/parking') {
          console.log(`   Data: ${JSON.stringify(response.data.data)}`);
        }
      } catch (error) {
        console.log(`❌ ${endpoint}: ${error.response?.status || 'ERROR'} - ${error.message}`);
      }
    }
    
    // Test page routes
    const pageRoutes = [
      '/admin/dashboard',
      '/admin/users',
      '/admin/vehicles',
      '/admin/parking',
      '/admin/bookings',
      '/admin/payments',
      '/admin/logs'
    ];
    
    console.log('\n📄 Testing Page Routes:');
    for (const route of pageRoutes) {
      try {
        const response = await axios.get(`${BASE_URL}${route}`, {
          headers: { 'Cookie': sessionCookie }
        });
        console.log(`✅ ${route}: ${response.status}`);
      } catch (error) {
        console.log(`❌ ${route}: ${error.response?.status || 'ERROR'}`);
      }
    }
    
    console.log('\n✅ Admin panel endpoint tests completed!');
    
  } catch (error) {
    console.error('\n❌ Admin Panel Test Error:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

testAdminPanel();