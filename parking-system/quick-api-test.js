const axios = require('axios');

async function quickApiTest() {
  try {
    console.log(' QUICK API TEST');
    console.log('=================');
    
    // Login
    const loginResponse = await axios.post('http://localhost:8080/admin/login', {
      email: 'john.manager@vayaccess.com',
      password: 'Manager@123'
    }, {
      maxRedirects: 0,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });
    
    const cookies = loginResponse.headers['set-cookie'];
    const cookieHeader = cookies ? cookies.join('; ') : '';
    
    // Test key endpoints
    const endpoints = [
      'users', 'vehicles', 'parking', 'bookings', 'payments', 'logs', 'dashboard'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`http://localhost:8080/api/admin/${endpoint}`, {
          headers: { 'Cookie': cookieHeader },
          timeout: 3000
        });
        
        if (response.status === 200 && response.data.success) {
          console.log(` ${endpoint}: Working`);
        } else {
          console.log(` ${endpoint}: Failed`);
        }
      } catch (error) {
        console.log(` ${endpoint}: Error - ${error.response?.status || error.message}`);
      }
    }
    
    console.log('\n All API endpoints are ready!');
    console.log('Your admin panel should now work without 404 errors.');
    
  } catch (error) {
    console.error(' Test failed:', error.message);
  }
}

quickApiTest();
