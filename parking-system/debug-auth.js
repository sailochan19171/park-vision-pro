// Debug authentication issue
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function debugAuth() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(' MongoDB connected');

    // Find all admin users
    const admins = await User.find({ role: 'admin' }).select('+password');
    console.log('\n Found admin users:');
    
    for (const admin of admins) {
      console.log(`\n Admin: ${admin.name}`);
      console.log(` Email: ${admin.email}`);
      console.log(` Password hash exists: ${!!admin.password}`);
      console.log(` Password hash length: ${admin.password ? admin.password.length : 0}`);
      console.log(` Created: ${admin.createdAt}`);
      
      // Test password comparison with a common password
      if (admin.password) {
        try {
          const testPasswords = ['admin123', 'password', '123456', 'admin', 'test123'];
          for (const testPass of testPasswords) {
            const isValid = await admin.comparePassword(testPass);
            if (isValid) {
              console.log(` Password "${testPass}" works for ${admin.email}`);
            }
          }
        } catch (error) {
          console.log(` Error testing passwords: ${error.message}`);
        }
      }
    }

    // Test creating a new admin user
    console.log('\n Testing new admin creation...');
    
    // Delete test user if exists
    await User.deleteOne({ email: 'test@admin.com' });
    
    const testAdmin = new User({
      name: 'Test Admin',
      email: 'test@admin.com',
      password: 'test123',
      phone: '1234567890',
      role: 'admin',
      status: 'active'
    });
    
    await testAdmin.save();
    console.log(' Test admin created');
    
    // Try to find and authenticate the test admin
    const foundTestAdmin = await User.findOne({ 
      email: 'test@admin.com', 
      role: 'admin' 
    }).select('+password');
    
    if (foundTestAdmin) {
      console.log(' Test admin found');
      const isValidPassword = await foundTestAdmin.comparePassword('test123');
      console.log(` Password validation result: ${isValidPassword}`);
      
      if (isValidPassword) {
        console.log(' Authentication test PASSED');
      } else {
        console.log(' Authentication test FAILED');
      }
    }
    
    // Clean up
    await User.deleteOne({ email: 'test@admin.com' });
    console.log(' Test admin cleaned up');
    
  } catch (error) {
    console.error(' Debug error:', error);
  } finally {
    await mongoose.disconnect();
    console.log(' MongoDB disconnected');
  }
}

debugAuth();
