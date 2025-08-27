const axios = require('axios');

async function testUsersEndpoint() {
  try {
    console.log('🧪 Testing Users Endpoint...');
    
    // Login first
    const loginResponse = await axios.post('http://localhost:8080/admin/login', {
      email: 'admin@vayaccess.com',
      password: 'Admin@123'
    }, {
      maxRedirects: 0,
      validateStatus: function (status) {
        return status < 400;
      }
    });
    
    const cookies = loginResponse.headers['set-cookie'];
    const sessionCookie = cookies ? cookies[0].split(';')[0] : '';
    
    console.log('✅ Login successful');
    
    // Test users page
    const usersPageResponse = await axios.get('http://localhost:8080/admin/users', {
      headers: { 'Cookie': sessionCookie }
    });
    
    console.log('✅ Users page status:', usersPageResponse.status);
    
    // Test users API
    const usersApiResponse = await axios.get('http://localhost:8080/api/admin/users', {
      headers: { 'Cookie': sessionCookie }
    });
    
    console.log('✅ Users API status:', usersApiResponse.status);
    console.log('📊 Users data:', usersApiResponse.data.success ? 'Success' : 'Failed');
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Error status:', error.response.status);
      console.log('📝 Error data:', error.response.data);
    } else {
      console.error('❌ Network error:', error.message);
    }
  }
}

testUsersEndpoint();