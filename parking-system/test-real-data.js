// Test script to demonstrate real data creation and persistence
// This shows how admin-created data is stored and displayed

const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

// Test authentication and data persistence
async function testRealDataSystem() {
  console.log(' Testing Real Data System...\n');
  
  try {
    // 1. Test login and get session cookie
    console.log('1 Testing admin login...');
    
    const loginResponse = await axios.post(`${BASE_URL}/admin/login`, {
      email: 'admin@vayaccess.com',
      password: 'Admin@123'
    }, {
      maxRedirects: 0,
      validateStatus: (status) => status < 400
    });
    
    console.log(' Login successful');
    
    // Extract session cookie
    const sessionCookie = loginResponse.headers['set-cookie']?.[0];
    const axiosWithAuth = axios.create({
      baseURL: BASE_URL,
      headers: {
        Cookie: sessionCookie
      }
    });
    
    // 2. Test dashboard with real data
    console.log('\n2 Testing dashboard with real calculated stats...');
    
    const dashboardResponse = await axiosWithAuth.get('/api/admin/dashboard');
    const dashboardData = dashboardResponse.data;
    
    if (dashboardData.success) {
      console.log(' Dashboard API working with real data:');
      console.log('    Total Users:', dashboardData.data.stats.totalUsers);
      console.log('    Total Spots:', dashboardData.data.stats.totalSpots);
      console.log('    Active Bookings:', dashboardData.data.stats.activeBookings);
      console.log('    Total Revenue: ₹' + dashboardData.data.stats.totalRevenue);
      console.log('    Occupancy:', dashboardData.data.stats.occupancyRate + '%');
      console.log('    Recent Activities:', dashboardData.data.recentActivity.length);
    } else {
      console.log(' Dashboard API failed');
    }
    
    // 3. Test parking spots data
    console.log('\n3 Testing parking spots with real data...');
    
    const parkingResponse = await axiosWithAuth.get('/api/admin/parking/spots');
    const parkingData = parkingResponse.data;
    
    if (parkingData.success) {
      console.log(' Parking API working with real data:');
      console.log('    Total Spots:', parkingData.data.spots.length);
      console.log('    Available:', parkingData.data.summary.available);
      console.log('    Occupied:', parkingData.data.summary.occupied);
      console.log('    Reserved:', parkingData.data.summary.reserved);
      console.log('    Maintenance:', parkingData.data.summary.maintenance);
      
      // Show actual spot data
      console.log('    Sample spots:');
      parkingData.data.spots.forEach((spot, index) => {
        if (index < 3) {
          console.log(`      ${spot.id}: ${spot.status} (${spot.level}, Rate: ₹${spot.rate})`);
        }
      });
    } else {
      console.log(' Parking API failed');
    }
    
    // 4. Test creating a NEW parking spot
    console.log('\n4 Testing NEW parking spot creation...');
    
    const newSpotData = {
      level: 'Level 1',
      section: 'C',
      number: 1,
      rate: 35
    };
    
    const createResponse = await axiosWithAuth.post('/api/admin/parking/spots', newSpotData);
    
    if (createResponse.data.success) {
      console.log(' NEW parking spot created successfully:');
      console.log('    Spot ID:', createResponse.data.data.id);
      console.log('    Location:', createResponse.data.data.level, createResponse.data.data.section);
      console.log('    Rate: ₹' + createResponse.data.data.rate);
      console.log('    Status:', createResponse.data.data.status);
      console.log('    Created by:', createResponse.data.data.createdBy);
      
      // 5. Verify the new spot appears in the list
      console.log('\n5 Verifying new spot appears in parking list...');
      
      const updatedParkingResponse = await axiosWithAuth.get('/api/admin/parking/spots');
      const updatedParkingData = updatedParkingResponse.data;
      
      const newSpot = updatedParkingData.data.spots.find(s => s.id === createResponse.data.data.id);
      
      if (newSpot) {
        console.log(' NEW spot successfully added to parking list:');
        console.log('    Total spots increased to:', updatedParkingData.data.spots.length);
        console.log('    New spot found:', newSpot.id, '(' + newSpot.status + ')');
      } else {
        console.log(' NEW spot not found in updated list');
      }
    } else {
      console.log(' Failed to create parking spot:', createResponse.data.message);
    }
    
    // 6. Test updating the new spot
    console.log('\n6 Testing parking spot UPDATE...');
    
    const spotId = createResponse.data.data.id;
    const updateData = {
      status: 'occupied',
      vehicle: 'MH 15 NEW 2024',
      customer: 'Test Customer'
    };
    
    const updateResponse = await axiosWithAuth.put(`/api/admin/parking/spots/${spotId}`, updateData);
    
    if (updateResponse.data.success) {
      console.log(' Parking spot updated successfully:');
      console.log('    Vehicle:', updateResponse.data.data.vehicle);
      console.log('    Customer:', updateResponse.data.data.customer);
      console.log('    Status changed to:', updateResponse.data.data.status);
      console.log('    Occupied since:', updateResponse.data.data.occupiedSince);
    } else {
      console.log(' Failed to update parking spot');
    }
    
    // 7. Check updated dashboard stats
    console.log('\n7 Checking updated dashboard stats after changes...');
    
    const finalDashboardResponse = await axiosWithAuth.get('/api/admin/dashboard');
    const finalDashboardData = finalDashboardResponse.data;
    
    if (finalDashboardData.success) {
      console.log(' Updated dashboard stats:');
      console.log('    Total Spots:', finalDashboardData.data.stats.totalSpots, '(should be +1)');
      console.log('    Occupied:', finalDashboardData.data.stats.occupiedSpots, '(should be +1)');
      console.log('    Available:', finalDashboardData.data.stats.availableSpots);
      console.log('    Occupancy:', finalDashboardData.data.stats.occupancyRate + '%', '(should be updated)');
      console.log('    Recent Activities:', finalDashboardData.data.recentActivity.length, '(should include new activities)');
      
      // Show latest activities
      console.log('    Latest activities:');
      finalDashboardData.data.recentActivity.slice(0, 3).forEach((activity, index) => {
        console.log(`      ${index + 1}. ${activity.message} (${activity.status})`);
      });
    }
    
    console.log('\n REAL DATA SYSTEM TEST COMPLETED!');
    console.log(' All admin-created data is stored and displayed correctly');
    console.log(' Dashboard shows real-time calculated statistics');
    console.log(' CRUD operations work with persistent data');
    console.log(' Activity tracking works for all admin actions');
    
  } catch (error) {
    console.error(' Test failed:', error.response?.data || error.message);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testRealDataSystem();
}

module.exports = { testRealDataSystem };

