// Simple test script for newsletter functionality using CommonJS and HTTP
const http = require('http');

const testData = {
  email: 'test@example.com',
  source: 'test'
};

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/newsletter/subscribe',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = http.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(JSON.stringify(testData));
req.end();
