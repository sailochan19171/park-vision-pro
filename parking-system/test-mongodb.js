// Minimal MongoDB connection test
const mongoose = require('mongoose');
require('dotenv').config();

console.log(' Testing MongoDB connection...');
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');

async function testConnection() {
  try {
    console.log(' Connecting to MongoDB...');
    
    // Set a timeout
    const timeoutId = setTimeout(() => {
      console.log(' Connection timeout after 10 seconds');
      process.exit(1);
    }, 10000);
    
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // 5 second timeout
    });
    
    clearTimeout(timeoutId);
    console.log(' MongoDB connected successfully');
    
    // Test a simple query
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(` Found ${collections.length} collections`);
    
    await mongoose.disconnect();
    console.log(' Disconnected from MongoDB');
    
  } catch (error) {
    console.error(' MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
