/**
 * Test All User Routes
 * This script tests all the user routes to ensure they're working
 */

const axios = require('axios');

async function testAllRoutes() {
  try {
    console.log('🧪 Testing All User Routes...\n');

    // Create axios instance with cookie jar
    const client = axios.create({
      baseURL: 'http://localhost:3002',
      withCredentials: true,
      timeout: 10000
    });

    // Login first
    console.log('🔐 Logging in...');
    const loginResponse = await client.post('/user/login', {
      email: 'alice@example.com',
      password: 'User@123',
      rememberMe: false
    }, {
      maxRedirects: 0,
      validateStatus: (status) => status < 400
    });

    if (loginResponse.status === 302) {
      console.log('✅ Login successful\n');
      
      // Extract cookies from login response
      const cookies = loginResponse.headers['set-cookie'];
      if (cookies) {
        client.defaults.headers.Cookie = cookies.join('; ');
      }
    } else {
      console.log('❌ Login failed');
      return;
    }

    // Test routes that were causing 404 errors
    const routesToTest = [
      '/find-parking',
      '/user/bookings',
      '/bookings',
      '/vehicles',
      '/user/vehicles',
      '/payments',
      '/user/payments',
      '/profile',
      '/user/profile',
      '/settings',
      '/notifications',
      '/vehicles/add'
    ];

    console.log('🌐 Testing Routes:');
    for (const route of routesToTest) {
      try {
        const response = await client.get(route);
        if (response.status === 200) {
          console.log(`✅ ${route} - OK (${response.data.length} chars)`);
        } else {
          console.log(`⚠️  ${route} - Status: ${response.status}`);
        }
      } catch (error) {
        if (error.response) {
          console.log(`❌ ${route} - Error: ${error.response.status} ${error.response.statusText}`);
        } else {
          console.log(`❌ ${route} - Network Error: ${error.message}`);
        }
      }
    }

    console.log('\n🔗 Testing API Endpoints:');
    const apiEndpoints = [
      '/api/user/dashboard',
      '/api/user/vehicles',
      '/api/user/bookings',
      '/api/user/payments',
      '/api/user/parking-spots'
    ];

    for (const endpoint of apiEndpoints) {
      try {
        const response = await client.get(endpoint);
        if (response.status === 200 && response.data.success) {
          console.log(`✅ ${endpoint} - OK`);
        } else {
          console.log(`⚠️  ${endpoint} - Status: ${response.status}`);
        }
      } catch (error) {
        if (error.response) {
          console.log(`❌ ${endpoint} - Error: ${error.response.status}`);
        } else {
          console.log(`❌ ${endpoint} - Network Error: ${error.message}`);
        }
      }
    }

    console.log('\n🎉 Route testing completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testAllRoutes();