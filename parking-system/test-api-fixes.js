// Test script to verify all API fixes
const http = require('http');

const BASE_URL = 'http://localhost:8080';

async function testAPIFixes() {
    console.log('🧪 Testing API fixes...\n');
    
    try {
        // Test 1: Test login to get session
        console.log('1. Testing test login...');
        const loginResponse = await fetch(`${BASE_URL}/api/test/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (loginResponse.ok) {
            console.log('✅ Test login works');
            
            // Extract session cookie
            const cookies = loginResponse.headers.get('set-cookie');
            const sessionCookie = cookies ? cookies.split(';')[0] : '';
            
            // Test 2: Test users API with session
            console.log('2. Testing users API...');
            const usersResponse = await fetch(`${BASE_URL}/api/admin/users`, {
                headers: { 
                    'Cookie': sessionCookie,
                    'Content-Type': 'application/json'
                }
            });
            
            if (usersResponse.ok) {
                const usersData = await usersResponse.json();
                console.log(`✅ Users API works - Found ${usersData.users ? usersData.users.length : 0} users`);
            } else {
                console.log(`❌ Users API failed: ${usersResponse.status}`);
            }
            
            // Test 3: Test vehicles API
            console.log('3. Testing vehicles API...');
            const vehiclesResponse = await fetch(`${BASE_URL}/api/admin/vehicles`, {
                headers: { 
                    'Cookie': sessionCookie,
                    'Content-Type': 'application/json'
                }
            });
            
            if (vehiclesResponse.ok) {
                const vehiclesData = await vehiclesResponse.json();
                console.log(`✅ Vehicles API works - Found ${vehiclesData.vehicles ? vehiclesData.vehicles.length : 0} vehicles`);
            } else {
                console.log(`❌ Vehicles API failed: ${vehiclesResponse.status}`);
            }
            
            // Test 4: Test bookings API
            console.log('4. Testing bookings API...');
            const bookingsResponse = await fetch(`${BASE_URL}/api/admin/bookings`, {
                headers: { 
                    'Cookie': sessionCookie,
                    'Content-Type': 'application/json'
                }
            });
            
            if (bookingsResponse.ok) {
                const bookingsData = await bookingsResponse.json();
                console.log(`✅ Bookings API works - Found ${bookingsData.bookings ? bookingsData.bookings.length : 0} bookings`);
                if (bookingsData.hourlyData) {
                    console.log('✅ Hourly data for charts is present');
                }
            } else {
                console.log(`❌ Bookings API failed: ${bookingsResponse.status}`);
            }
            
            // Test 5: Test payments API
            console.log('5. Testing payments API...');
            const paymentsResponse = await fetch(`${BASE_URL}/api/admin/payments`, {
                headers: { 
                    'Cookie': sessionCookie,
                    'Content-Type': 'application/json'
                }
            });
            
            if (paymentsResponse.ok) {
                const paymentsData = await paymentsResponse.json();
                console.log(`✅ Payments API works - Found ${paymentsData.payments ? paymentsData.payments.length : 0} payments`);
                if (paymentsData.methods) {
                    console.log(`✅ Payment methods data present: UPI ${paymentsData.methods.upi}%, Card ${paymentsData.methods.card}%`);
                }
            } else {
                console.log(`❌ Payments API failed: ${paymentsResponse.status}`);
            }
            
            // Test 6: Test user creation
            console.log('6. Testing user creation...');
            const createUserResponse = await fetch(`${BASE_URL}/api/admin/users`, {
                method: 'POST',
                headers: { 
                    'Cookie': sessionCookie,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'Test User',
                    email: 'testuser@example.com',
                    phone: '9999999999',
                    role: 'user',
                    password: 'testpass123'
                })
            });
            
            if (createUserResponse.ok) {
                const userData = await createUserResponse.json();
                console.log('✅ User creation works');
                
                // Test vehicle creation for this user
                console.log('7. Testing vehicle creation...');
                const createVehicleResponse = await fetch(`${BASE_URL}/api/admin/vehicles`, {
                    method: 'POST',
                    headers: { 
                        'Cookie': sessionCookie,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        licensePlate: 'TEST-123',
                        make: 'Toyota',
                        model: 'Camry',
                        color: 'Blue',
                        type: 'car',
                        ownerId: userData.user.id
                    })
                });
                
                if (createVehicleResponse.ok) {
                    console.log('✅ Vehicle creation works');
                } else {
                    console.log(`❌ Vehicle creation failed: ${createVehicleResponse.status}`);
                }
                
            } else {
                console.log(`❌ User creation failed: ${createUserResponse.status}`);
                const errorData = await createUserResponse.json().catch(() => null);
                if (errorData) {
                    console.log(`Error: ${errorData.message}`);
                }
            }
            
        } else {
            console.log('❌ Test login failed');
        }
        
    } catch (error) {
        console.error('🚨 Test failed:', error.message);
    }
    
    console.log('\n🏁 API tests completed!');
}

// Wait for server to start, then run tests
setTimeout(testAPIFixes, 3000);