const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Admin Server with Real Data...');
console.log('==========================================');

// Start the admin server with real data
const adminServer = spawn('node', ['admin-server-real-data.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});

adminServer.on('error', (error) => {
  console.error('❌ Failed to start admin server:', error);
});

adminServer.on('close', (code) => {
  console.log(`Admin server process exited with code ${code}`);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down admin server...');
  adminServer.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down admin server...');
  adminServer.kill('SIGTERM');
  process.exit(0);
});