/**
 * Test User Creation API Endpoint
 * Tests the actual API endpoint that the frontend calls
 */

require('dotenv').config();
const axios = require('axios');

const ADMIN_BASE_URL = 'http://localhost:8081';

async function testUserCreationAPI() {
  try {
    console.log(' Testing User Creation API Endpoint...\n');
    
    // Step 1: Login as admin
    console.log(' Step 1: Admin Login...');
    const loginResponse = await axios.post(`${ADMIN_BASE_URL}/api/admin/login`, {
      email: 'admin@vayaccess.com',
      password: 'admin123'
    });
    
    if (!loginResponse.data.success) {
      throw new Error('Admin login failed: ' + loginResponse.data.message);
    }
    
    const sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
    console.log(' Admin login successful');
    console.log(' Session cookie:', sessionCookie.substring(0, 50) + '...');
    
    // Step 2: Test user creation
    console.log('\n Step 2: Creating Premium User...');
    
    const userData = {
      name: 'API Test Premium User',
      email: `apitest.premium.${Date.now()}@example.com`,
      phone: '+1234567899',
      role: 'premium',
      password: 'testpass123',
      status: 'active'
    };
    
    console.log(' Sending user data:', userData);
    
    const createResponse = await axios.post(`${ADMIN_BASE_URL}/api/admin/users`, userData, {
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(' Response status:', createResponse.status);
    console.log(' Response data:', createResponse.data);
    
    if (createResponse.data.success) {
      console.log(' User created successfully via API!');
      console.log(' Created user:', createResponse.data.user);
    } else {
      console.log(' User creation failed:', createResponse.data.message);
    }
    
    // Step 3: Test with different roles
    console.log('\n Step 3: Testing Different Roles...');
    
    const testRoles = ['user', 'premium', 'admin'];
    
    for (const role of testRoles) {
      try {
        console.log(`\n Testing ${role} role...`);
        
        const roleUserData = {
          name: `API Test ${role} User`,
          email: `apitest.${role}.${Date.now()}@example.com`,
          phone: `+123456789${Math.floor(Math.random() * 10)}`,
          role: role,
          password: 'testpass123',
          status: 'active'
        };
        
        const roleResponse = await axios.post(`${ADMIN_BASE_URL}/api/admin/users`, roleUserData, {
          headers: {
            'Cookie': sessionCookie,
            'Content-Type': 'application/json'
          }
        });
        
        if (roleResponse.data.success) {
          console.log(` ${role} user created successfully`);
        } else {
          console.log(` ${role} user creation failed:`, roleResponse.data.message);
        }
        
      } catch (error) {
        console.log(` ${role} user creation error:`, error.response?.data?.message || error.message);
      }
    }
    
    // Step 4: Test validation errors
    console.log('\n Step 4: Testing Validation...');
    
    const invalidUserData = {
      name: '',
      email: 'invalid-email',
      phone: '',
      role: 'invalid-role',
      password: '123',
      status: 'invalid-status'
    };
    
    try {
      const validationResponse = await axios.post(`${ADMIN_BASE_URL}/api/admin/users`, invalidUserData, {
        headers: {
          'Cookie': sessionCookie,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(' Validation test response:', validationResponse.data);
      
    } catch (error) {
      console.log(' Validation errors caught correctly:', error.response?.data?.message || error.message);
    }
    
    console.log('\n API Test Complete!');
    console.log('==========================================');
    
  } catch (error) {
    console.error(' API Test failed:', error.response?.data || error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
  }
}

// Run test
testUserCreationAPI();
