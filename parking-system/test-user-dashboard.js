/**
 * Test User Dashboard API
 * This script tests the user login and dashboard functionality
 */

const axios = require('axios');

async function testUserDashboard() {
  try {
    console.log('🧪 Testing User Dashboard API...\n');

    // Create axios instance with cookie jar
    const client = axios.create({
      baseURL: 'http://localhost:3002',
      withCredentials: true,
      timeout: 10000
    });

    // Test 1: Login
    console.log('1️⃣ Testing user login...');
    const loginResponse = await client.post('/user/login', {
      email: 'alice@example.com',
      password: 'User@123',
      rememberMe: false
    }, {
      maxRedirects: 0,
      validateStatus: (status) => status < 400
    });

    if (loginResponse.status === 302) {
      console.log('✅ Login successful - redirected to dashboard');
      
      // Extract cookies from login response
      const cookies = loginResponse.headers['set-cookie'];
      if (cookies) {
        client.defaults.headers.Cookie = cookies.join('; ');
      }
    } else {
      console.log('❌ Login failed');
      return;
    }

    // Test 2: Dashboard API
    console.log('\n2️⃣ Testing dashboard API...');
    const dashboardResponse = await client.get('/api/user/dashboard');
    
    if (dashboardResponse.status === 200) {
      const data = dashboardResponse.data;
      console.log('✅ Dashboard API successful');
      console.log('📊 Dashboard Data:');
      console.log(`   - Success: ${data.success}`);
      if (data.success) {
        console.log(`   - Total Vehicles: ${data.data.stats.totalVehicles}`);
        console.log(`   - Active Bookings: ${data.data.stats.activeBookings}`);
        console.log(`   - Total Bookings: ${data.data.stats.totalBookings}`);
        console.log(`   - Total Spent: ₹${data.data.stats.totalSpent}`);
        console.log(`   - Recent Bookings: ${data.data.recentBookings.length}`);
        console.log(`   - User Vehicles: ${data.data.userVehicles.length}`);
        console.log(`   - Recent Payments: ${data.data.recentPayments.length}`);
      }
    } else {
      console.log('❌ Dashboard API failed');
    }

    // Test 3: Vehicles API
    console.log('\n3️⃣ Testing vehicles API...');
    const vehiclesResponse = await client.get('/api/user/vehicles');
    
    if (vehiclesResponse.status === 200) {
      const vehiclesData = vehiclesResponse.data;
      console.log('✅ Vehicles API successful');
      console.log(`   - Vehicles found: ${vehiclesData.data.length}`);
      vehiclesData.data.forEach((vehicle, index) => {
        console.log(`   - Vehicle ${index + 1}: ${vehicle.licensePlate} (${vehicle.type} - ${vehicle.model})`);
      });
    } else {
      console.log('❌ Vehicles API failed');
    }

    // Test 4: Bookings API
    console.log('\n4️⃣ Testing bookings API...');
    const bookingsResponse = await client.get('/api/user/bookings');
    
    if (bookingsResponse.status === 200) {
      const bookingsData = bookingsResponse.data;
      console.log('✅ Bookings API successful');
      console.log(`   - Bookings found: ${bookingsData.data.bookings.length}`);
      bookingsData.data.bookings.forEach((booking, index) => {
        console.log(`   - Booking ${index + 1}: ${booking.parkingSpot?.spotNumber} - ₹${booking.totalAmount} (${booking.status})`);
      });
    } else {
      console.log('❌ Bookings API failed');
    }

    // Test 5: Payments API
    console.log('\n5️⃣ Testing payments API...');
    const paymentsResponse = await client.get('/api/user/payments');
    
    if (paymentsResponse.status === 200) {
      const paymentsData = paymentsResponse.data;
      console.log('✅ Payments API successful');
      console.log(`   - Payments found: ${paymentsData.data.payments.length}`);
      paymentsData.data.payments.forEach((payment, index) => {
        console.log(`   - Payment ${index + 1}: ₹${payment.amount} via ${payment.method} (${payment.status})`);
      });
    } else {
      console.log('❌ Payments API failed');
    }

    // Test 6: Dashboard Page
    console.log('\n6️⃣ Testing dashboard page...');
    const dashboardPageResponse = await client.get('/user/dashboard');
    
    if (dashboardPageResponse.status === 200) {
      console.log('✅ Dashboard page loads successfully');
      console.log(`   - Page size: ${dashboardPageResponse.data.length} characters`);
    } else {
      console.log('❌ Dashboard page failed to load');
    }

    console.log('\n🎉 All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data).substring(0, 200)}...`);
    }
  }
}

// Install axios if not present
const { execSync } = require('child_process');
try {
  require('axios');
} catch (e) {
  console.log('📦 Installing axios...');
  execSync('npm install axios', { stdio: 'inherit' });
}

// Run the test
testUserDashboard();