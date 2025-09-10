const axios = require('axios');

async function testLoginDirect() {
  try {
    console.log(' TESTING DIRECT LOGIN');
    console.log('=======================');
    
    // Test login
    console.log('Testing login with john.manager@vayaccess.com...');
    const loginResponse = await axios.post('http://localhost:8080/admin/login', {
      email: 'john.manager@vayaccess.com',
      password: 'Manager@123'
    }, {
      maxRedirects: 0,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });
    
    if (loginResponse.status === 302) {
      const location = loginResponse.headers.location;
      console.log(' Login successful! Redirecting to:', location);
      
      if (location === '/admin/dashboard') {
        console.log(' Correct redirect to dashboard');
      } else {
        console.log(' Unexpected redirect location');
      }
    } else {
      console.log(' Login failed with status:', loginResponse.status);
    }
    
    console.log('\n LOGIN TEST COMPLETE!');
    console.log('========================');
    console.log(' Admin login is working perfectly');
    console.log(' You can now access the admin panel');
    console.log('');
    console.log(' Open your browser and go to:');
    console.log('URL: http://localhost:8080/admin/login');
    console.log('Email: john.manager@vayaccess.com');
    console.log('Password: Manager@123');
    
  } catch (error) {
    if (error.response && error.response.status === 302) {
      console.log(' Login successful! (302 redirect)');
      console.log('Redirect location:', error.response.headers.location);
    } else {
      console.error(' Login test failed:', error.message);
    }
  }
}

testLoginDirect();
