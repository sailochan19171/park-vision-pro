/**
 * Test Script for Payment Method Fixes
 * Tests all payment method types and dashboard route
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const USER_DASHBOARD_URL = 'http://localhost:3002';

async function testPaymentMethodFixes() {
    console.log(' Testing Payment Method Fixes...\n');
    
    const tests = [
        {
            name: 'Add UPI Payment Method',
            method: 'POST',
            url: '/api/user/payments/add-method',
            data: {
                type: 'upi',
                upiId: '7337449871@fam',
                isDefault: false
            },
            expectedStatus: 200
        },
        {
            name: 'Add Card Payment Method',
            method: 'POST',
            url: '/api/user/payments/add-method',
            data: {
                type: 'card',
                cardNumber: '1234567890123456',
                expiryDate: '12/26',
                cvv: '123',
                holderName: 'John Doe',
                isDefault: true
            },
            expectedStatus: 200
        },
        {
            name: 'Add Wallet Payment Method',
            method: 'POST',
            url: '/api/user/payments/add-method',
            data: {
                type: 'wallet',
                walletProvider: 'paytm',
                walletId: '9876543210',
                isDefault: false
            },
            expectedStatus: 200
        },
        {
            name: 'Add UPI with Different Provider',
            method: 'POST',
            url: '/api/user/payments/add-method',
            data: {
                type: 'upi',
                upiId: 'user@phonepe',
                isDefault: false
            },
            expectedStatus: 200
        },
        {
            name: 'Add Google Pay Wallet',
            method: 'POST',
            url: '/api/user/payments/add-method',
            data: {
                type: 'wallet',
                walletProvider: 'googlepay',
                walletId: '9123456789',
                isDefault: false
            },
            expectedStatus: 200
        }
    ];
    
    let passed = 0;
    let failed = 0;
    
    console.log('Testing Payment Method Addition:\n');
    
    for (const test of tests) {
        try {
            console.log(`Testing: ${test.name}...`);
            
            const response = await axios.post(BASE_URL + test.url, test.data);
            
            if (response.status === test.expectedStatus && response.data.success) {
                console.log(` ${test.name} - PASSED`);
                console.log(`   Method ID: ${response.data.data.methodId}`);
                console.log(`   Type: ${response.data.data.type}`);
                
                // Log specific details based on type
                if (response.data.data.type === 'card') {
                    console.log(`   Last Four: ${response.data.data.lastFour}`);
                } else if (response.data.data.type === 'upi') {
                    console.log(`   UPI ID: ${response.data.data.upiId}`);
                } else if (response.data.data.type === 'wallet') {
                    console.log(`   Wallet: ${response.data.data.walletProvider} - ${response.data.data.walletId}`);
                }
                
                passed++;
            } else {
                console.log(` ${test.name} - FAILED (Status: ${response.status})`);
                failed++;
            }
        } catch (error) {
            console.log(` ${test.name} - FAILED (Error: ${error.response?.data?.message || error.message})`);
            failed++;
        }
        
        console.log(''); // Empty line for readability
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Test dashboard route
    console.log('Testing Dashboard Route:\n');
    
    try {
        console.log('Testing: Dashboard Route Access...');
        const response = await axios.get(USER_DASHBOARD_URL + '/dashboard', {
            maxRedirects: 0,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Accept redirects
            }
        });
        
        if (response.status === 302 || response.status === 200) {
            console.log(' Dashboard Route - PASSED (Redirect or Direct Access)');
            passed++;
        } else {
            console.log(` Dashboard Route - FAILED (Status: ${response.status})`);
            failed++;
        }
    } catch (error) {
        if (error.response && error.response.status === 302) {
            console.log(' Dashboard Route - PASSED (Redirect Working)');
            passed++;
        } else {
            console.log(` Dashboard Route - FAILED (Error: ${error.message})`);
            failed++;
        }
    }
    
    console.log('\n Test Results:');
    console.log(` Passed: ${passed}`);
    console.log(` Failed: ${failed}`);
    console.log(` Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
        console.log('\n All fixes working correctly!');
        console.log(' UPI payment methods can be added without errors');
        console.log(' Card payment methods work correctly');
        console.log(' Wallet payment methods work correctly');
        console.log(' Dashboard route is accessible');
        console.log(' No 400, 404, or 500 errors detected');
    } else {
        console.log('\n  Some tests failed. Please check the server logs.');
    }
}

// Test error handling
async function testErrorHandling() {
    console.log('\n Testing Error Handling:\n');
    
    const errorTests = [
        {
            name: 'Invalid Payment Type',
            data: { type: 'invalid', isDefault: false },
            expectedError: 'Invalid payment method type'
        },
        {
            name: 'Missing UPI ID',
            data: { type: 'upi', isDefault: false },
            expectedError: 'UPI ID is required'
        },
        {
            name: 'Missing Card Number',
            data: { type: 'card', isDefault: false },
            expectedError: 'Card number is required'
        },
        {
            name: 'Missing Wallet Details',
            data: { type: 'wallet', isDefault: false },
            expectedError: 'Wallet provider and ID are required'
        }
    ];
    
    for (const test of errorTests) {
        try {
            console.log(`Testing: ${test.name}...`);
            
            const response = await axios.post(BASE_URL + '/api/user/payments/add-method', test.data);
            console.log(` ${test.name} - Should have failed but didn't`);
        } catch (error) {
            if (error.response && error.response.status === 400 && 
                error.response.data.message.includes(test.expectedError.split(' ')[0])) {
                console.log(` ${test.name} - PASSED (Proper error handling)`);
            } else {
                console.log(` ${test.name} - FAILED (Wrong error: ${error.response?.data?.message || error.message})`);
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// Run all tests
async function runAllTests() {
    await testPaymentMethodFixes();
    await testErrorHandling();
}

runAllTests().catch(console.error);
