// Test existing admin passwords
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function testExistingAdmins() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(' MongoDB connected');

    // Find all admin users
    const admins = await User.find({ role: 'admin' }).select('+password');
    console.log('\n Testing existing admin passwords...');
    
    // Common passwords to test
    const commonPasswords = [
      'Admin@123',
      'User@123', 
      'admin123',
      'password',
      '123456',
      'admin',
      'test123',
      'vayaccess',
      'VayAccess@123',
      'manager123'
    ];
    
    for (const admin of admins) {
      console.log(`\n Testing ${admin.name} (${admin.email}):`);
      
      for (const testPass of commonPasswords) {
        try {
          const isValid = await admin.comparePassword(testPass);
          if (isValid) {
            console.log(` Password "${testPass}" works for ${admin.email}`);
            break;
          }
        } catch (error) {
          console.log(` Error testing password "${testPass}": ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error(' Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n MongoDB disconnected');
  }
}

testExistingAdmins();
