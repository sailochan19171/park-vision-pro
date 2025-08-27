// Test script for auto-publish functionality
const http = require('http');

const testData = {
  version: "test-1.0",
  title: "Test Article Update",
  body: "This is a test article update to verify email delivery to subscribers",
  link: "/blog/test-article"
};

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/updates/auto-publish',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-token': process.env.NEWSLETTER_ADMIN_TOKEN || 'your-admin-token-here'
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
