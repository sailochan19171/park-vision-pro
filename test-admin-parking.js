// Quick test for admin parking spot creation
const axios = require('axios');

async function testAdminParkingAPI() {
    console.log(' Testing Admin Parking API...\n');
    
    try {
        // Step 1: Login to get session
        console.log('1 Logging in as admin...');
        const loginResponse = await axios.post('http://localhost:8080/admin/login', {
            email: 'admin@vayaccess.com',
            password: 'Admin@123'
        }, {
            maxRedirects: 0,
            validateStatus: (status) => status < 400
        });
        
        console.log(' Login successful');
        
        // Get session cookie
        const sessionCookie = loginResponse.headers['set-cookie']?.[0];
        console.log(' Session cookie obtained');
        
        // Step 2: Test creating parking spot
        console.log('\n2 Testing parking spot creation...');
        
        const spotData = {
            level: 'Level 1',
            section: 'E',
            number: 1,
            rate: 35
        };
        
        console.log(' Sending data:', JSON.stringify(spotData, null, 2));
        
        const createResponse = await axios.post('http://localhost:8080/api/admin/parking/spots', spotData, {
            headers: {
                'Content-Type': 'application/json',
                'Cookie': sessionCookie
            }
        });
        
        console.log(' API Response:', JSON.stringify(createResponse.data, null, 2));
        
        if (createResponse.data.success) {
            console.log('\n SUCCESS: Parking spot created successfully!');
            console.log(' New Spot ID:', createResponse.data.data.id);
            console.log(' Location:', createResponse.data.data.level, createResponse.data.data.section);
            console.log(' Rate: ₹' + createResponse.data.data.rate);
        } else {
            console.log('\n ERROR: Failed to create parking spot');
            console.log(' Message:', createResponse.data.message);
        }
        
    } catch (error) {
        console.error('\n Test failed:', error.response?.data || error.message);
        
        if (error.response) {
            console.error(' Status:', error.response.status);
            console.error(' Data:', error.response.data);
        }
    }
}

testAdminParkingAPI();

