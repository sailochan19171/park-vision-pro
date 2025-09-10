/**
 * Comprehensive Payment System Test
 * Tests all payment-related endpoints and functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testPaymentEndpoints() {
    console.log(' Testing Payment System Functionality...\n');
    
    const tests = [
        {
            name: 'Payment History',
            method: 'GET',
            url: '/api/user/payments/history',
            expectedStatus: 200
        },
        {
            name: 'Admin Payments Overview',
            method: 'GET',
            url: '/api/admin/payments',
            expectedStatus: 200
        },
        {
            name: 'Load Transactions with Pagination',
            method: 'GET',
            url: '/api/user/payments/transactions?page=1&limit=5',
            expectedStatus: 200
        },
        {
            name: 'Filter Transactions by Status',
            method: 'GET',
            url: '/api/user/payments/transactions?status=completed&page=1&limit=5',
            expectedStatus: 200
        },
        {
            name: 'Search Transactions',
            method: 'GET',
            url: '/api/user/payments/transactions?search=TXN001&page=1&limit=5',
            expectedStatus: 200
        },
        {
            name: 'Process New Payment',
            method: 'POST',
            url: '/api/user/payments/process',
            data: {
                bookingId: 'BK001',
                amount: 150,
                method: 'upi',
                description: 'Test parking payment'
            },
            expectedStatus: 200
        },
        {
            name: 'Add Payment Method',
            method: 'POST',
            url: '/api/user/payments/add-method',
            data: {
                type: 'card',
                cardNumber: '1234567890123456',
                expiryDate: '12/26',
                cvv: '123',
                holderName: 'John Doe'
            },
            expectedStatus: 200
        },
        {
            name: 'Retry Failed Payment',
            method: 'POST',
            url: '/api/user/payments/TXN001/retry',
            data: {
                method: 'upi',
                amount: 150
            },
            expectedStatus: 200
        },
        {
            name: 'View Transaction Details',
            method: 'GET',
            url: '/api/user/payments/transaction/TXN001',
            expectedStatus: 200
        },
        {
            name: 'Download Payment Statement',
            method: 'GET',
            url: '/api/user/payments/statement?startDate=2024-01-01&endDate=2024-12-31',
            expectedStatus: 200
        },
        {
            name: 'Download Receipt',
            method: 'GET',
            url: '/api/payments/receipt/TXN001',
            expectedStatus: 200
        },
        {
            name: 'Admin Approve Payment',
            method: 'PUT',
            url: '/api/admin/payments/PAY001/approve',
            data: {},
            expectedStatus: 200
        },
        {
            name: 'Admin Process Refund',
            method: 'PUT',
            url: '/api/admin/payments/PAY001/refund',
            data: {
                reason: 'Customer request',
                amount: 150
            },
            expectedStatus: 200
        },
        {
            name: 'Admin Bulk Approve',
            method: 'POST',
            url: '/api/admin/payments/bulk-approve',
            data: {
                paymentIds: ['PAY001', 'PAY002', 'PAY003']
            },
            expectedStatus: 200
        },
        {
            name: 'Admin Export Payments',
            method: 'GET',
            url: '/api/admin/payments/export?startDate=2024-01-01&endDate=2024-12-31&format=csv',
            expectedStatus: 200
        }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            console.log(`Testing: ${test.name}...`);
            
            let response;
            if (test.method === 'GET') {
                response = await axios.get(BASE_URL + test.url);
            } else if (test.method === 'POST') {
                response = await axios.post(BASE_URL + test.url, test.data || {});
            } else if (test.method === 'PUT') {
                response = await axios.put(BASE_URL + test.url, test.data || {});
            }
            
            if (response.status === test.expectedStatus && response.data.success) {
                console.log(` ${test.name} - PASSED`);
                passed++;
            } else {
                console.log(` ${test.name} - FAILED (Status: ${response.status})`);
                failed++;
            }
        } catch (error) {
            console.log(` ${test.name} - FAILED (Error: ${error.message})`);
            failed++;
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n Test Results:`);
    console.log(` Passed: ${passed}`);
    console.log(` Failed: ${failed}`);
    console.log(` Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
        console.log(`\n All payment functionality tests passed!`);
        console.log(` Your payment system is fully functional!`);
    } else {
        console.log(`\n  Some tests failed. Please check the server logs.`);
    }
}

// Run the tests
testPaymentEndpoints().catch(console.error);
