/**
 * Test Server Connection and Authentication
 * Verifies the admin server is running and authentication works
 */

const axios = require('axios');

const ADMIN_BASE_URL = 'http://localhost:8081';

async function testServerConnection() {
  try {
    console.log('🧪 Testing Server Connection and Authentication...\n');
    
    // Test 1: Check if server is running
    console.log('Test 1: Checking if admin server is running...');
    try {
      const healthResponse = await axios.get(`${ADMIN_BASE_URL}/admin/login`);
      console.log('✅ Admin server is running (status:', healthResponse.status, ')');
    } catch (error) {
      console.error('❌ Admin server is not running or not accessible');
      console.error('Make sure to start the server with: node admin-server.js');
      return;
    }
    
    // Test 2: Test admin login
    console.log('\nTest 2: Testing admin login...');
    try {
      const loginResponse = await axios.post(`${ADMIN_BASE_URL}/api/admin/login`, {
        email: 'admin@vayaccess.com',
        password: 'admin123'
      });
      
      if (loginResponse.data.success) {
        console.log('✅ Admin login successful');
        const sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
        console.log('🍪 Session cookie received:', sessionCookie ? 'Yes' : 'No');
        
        // Test 3: Test authenticated request
        console.log('\nTest 3: Testing authenticated request...');
        try {
          const usersResponse = await axios.get(`${ADMIN_BASE_URL}/api/admin/users`, {
            headers: {
              'Cookie': sessionCookie
            }
          });
          
          console.log('✅ Authenticated request successful');
          console.log('📊 Users data received:', usersResponse.data.success ? 'Yes' : 'No');
          
          // Test 4: Test user creation with detailed logging
          console.log('\nTest 4: Testing user creation...');
          
          const testUserData = {
            name: 'Server Test Premium User',
            email: `servertest.premium.${Date.now()}@example.com`,
            phone: '+1234567890',
            role: 'premium',
            password: 'testpass123',
            status: 'active'
          };
          
          console.log('📤 Sending user creation request...');
          console.log('📋 User data:', testUserData);
          
          try {
            const createResponse = await axios.post(`${ADMIN_BASE_URL}/api/admin/users`, testUserData, {
              headers: {
                'Cookie': sessionCookie,
                'Content-Type': 'application/json'
              }
            });
            
            console.log('✅ User creation successful!');
            console.log('📥 Response:', createResponse.data);
            
          } catch (createError) {
            console.error('❌ User creation failed');
            console.error('Status:', createError.response?.status);
            console.error('Response:', createError.response?.data);
            console.error('Headers:', createError.response?.headers);
            
            if (createError.response?.status === 500) {
              console.error('\n🔍 500 Error Details:');
              console.error('This indicates a server-side error.');
              console.error('Check the admin server console for detailed error logs.');
            }
          }
          
        } catch (authError) {
          console.error('❌ Authenticated request failed:', authError.response?.data || authError.message);
        }
        
      } else {
        console.error('❌ Admin login failed:', loginResponse.data.message);
      }
      
    } catch (loginError) {
      console.error('❌ Login request failed:', loginError.response?.data || loginError.message);
    }
    
    console.log('\n📋 Test Summary:');
    console.log('================');
    console.log('1. Make sure admin server is running: node admin-server.js');
    console.log('2. Check server console for detailed error logs');
    console.log('3. Verify MongoDB connection is working');
    console.log('4. Check browser network tab for request details');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test
testServerConnection();