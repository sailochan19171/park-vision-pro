// Test complete registration and login flow
const axios = require('axios');

const BASE_URL = 'http://localhost:8081';

async function testRegistrationLogin() {
  try {
    console.log('🧪 Testing Registration and Login Flow...\n');

    // Test data
    const testUser = {
      name: 'Test User Registration',
      email: 'testuser@registration.com',
      password: 'testpass123',
      confirmPassword: 'testpass123',
      phone: '9876543210',
      adminKey: 'VAYACCESS_ADMIN_2024'
    };

    console.log('1️⃣ Testing Registration...');
    console.log(`📧 Email: ${testUser.email}`);
    console.log(`🔐 Password: ${testUser.password}`);

    // Step 1: Register
    try {
      const registerResponse = await axios.post(`${BASE_URL}/admin/register`, testUser, {
        maxRedirects: 0,
        validateStatus: function (status) {
          return status >= 200 && status < 400; // Accept redirects
        }
      });
      
      console.log('✅ Registration request sent');
      console.log(`📊 Status: ${registerResponse.status}`);
      
      if (registerResponse.status === 302) {
        const location = registerResponse.headers.location;
        console.log(`🔄 Redirected to: ${location}`);
        
        if (location.includes('success=')) {
          console.log('✅ Registration appears successful');
        } else if (location.includes('error=')) {
          const error = decodeURIComponent(location.split('error=')[1]);
          console.log(`❌ Registration error: ${error}`);
          return;
        }
      }
    } catch (regError) {
      if (regError.response && regError.response.status === 302) {
        const location = regError.response.headers.location;
        console.log(`🔄 Registration redirected to: ${location}`);
        
        if (location.includes('error=')) {
          const error = decodeURIComponent(location.split('error=')[1]);
          console.log(`❌ Registration failed: ${error}`);
          return;
        }
      } else {
        console.error('❌ Registration request failed:', regError.message);
        return;
      }
    }

    // Wait a moment for database to update
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n2️⃣ Testing Login with same credentials...');

    // Step 2: Login
    try {
      const loginResponse = await axios.post(`${BASE_URL}/admin/login`, {
        email: testUser.email,
        password: testUser.password
      }, {
        maxRedirects: 0,
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        }
      });

      console.log(`📊 Login Status: ${loginResponse.status}`);
      
      if (loginResponse.status === 302) {
        const location = loginResponse.headers.location;
        console.log(`🔄 Login redirected to: ${location}`);
        
        if (location.includes('/admin/dashboard')) {
          console.log('✅ LOGIN SUCCESSFUL! Redirected to dashboard');
        } else if (location.includes('error=')) {
          const error = decodeURIComponent(location.split('error=')[1]);
          console.log(`❌ Login failed: ${error}`);
        }
      }
    } catch (loginError) {
      if (loginError.response && loginError.response.status === 302) {
        const location = loginError.response.headers.location;
        console.log(`🔄 Login redirected to: ${location}`);
        
        if (location.includes('/admin/dashboard')) {
          console.log('✅ LOGIN SUCCESSFUL! Redirected to dashboard');
        } else if (location.includes('error=')) {
          const error = decodeURIComponent(location.split('error=')[1]);
          console.log(`❌ Login failed: ${error}`);
        }
      } else {
        console.error('❌ Login request failed:', loginError.message);
      }
    }

    // Step 3: Verify user was created in database
    console.log('\n3️⃣ Verifying database state...');
    
    // We'll need to check this via MongoDB directly
    const mongoose = require('mongoose');
    const User = require('./models/User');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    const createdUser = await User.findOne({ email: testUser.email }).select('+password');
    
    if (createdUser) {
      console.log('✅ User found in database');
      console.log(`👤 Name: ${createdUser.name}`);
      console.log(`📧 Email: ${createdUser.email}`);
      console.log(`🔒 Password hash exists: ${!!createdUser.password}`);
      
      // Test password comparison
      const passwordTest = await createdUser.comparePassword(testUser.password);
      console.log(`🔐 Password comparison test: ${passwordTest ? '✅ PASS' : '❌ FAIL'}`);
      
      if (!passwordTest) {
        console.log('🔍 This indicates the password was not saved correctly during registration');
      }
    } else {
      console.log('❌ User not found in database - registration failed');
    }
    
    // Cleanup
    await User.deleteOne({ email: testUser.email });
    console.log('🧹 Test user cleaned up');
    
    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

// Load environment variables
require('dotenv').config();

testRegistrationLogin();