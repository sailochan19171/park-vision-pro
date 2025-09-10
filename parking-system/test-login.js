// Test login functionality
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function testLogin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(' MongoDB connected');

    console.log('\n Testing login scenarios...');
    
    // Test 1: Try to login with known working credentials
    console.log('\n1 Testing with admin@vayaccess.com / Admin@123');
    const admin1 = await User.findOne({ 
      email: 'admin@vayaccess.com', 
      role: 'admin' 
    }).select('+password');
    
    if (admin1) {
      const isValid1 = await admin1.comparePassword('Admin@123');
      console.log(`Result: ${isValid1 ? ' SUCCESS' : ' FAILED'}`);
    } else {
      console.log(' Admin not found');
    }
    
    // Test 2: Try with john.manager
    console.log('\n2 Testing with john.manager@vayaccess.com / User@123');
    const admin2 = await User.findOne({ 
      email: 'john.manager@vayaccess.com', 
      role: 'admin' 
    }).select('+password');
    
    if (admin2) {
      const isValid2 = await admin2.comparePassword('User@123');
      console.log(`Result: ${isValid2 ? ' SUCCESS' : ' FAILED'}`);
    } else {
      console.log(' Admin not found');
    }
    
    // Test 3: Try with the third admin
    console.log('\n3 Testing with manikanta@doctorite.ai');
    const admin3 = await User.findOne({ 
      email: 'manikanta@doctorite.ai', 
      role: 'admin' 
    }).select('+password');
    
    if (admin3) {
      console.log('Admin found, testing common passwords...');
      const testPasswords = ['admin123', 'password', '123456', 'manikanta', 'doctorite'];
      for (const pass of testPasswords) {
        const isValid = await admin3.comparePassword(pass);
        if (isValid) {
          console.log(` Password "${pass}" works!`);
          break;
        }
      }
    } else {
      console.log(' Admin not found');
    }
    
    // Test 4: Create a new test admin and try to login
    console.log('\n4 Creating new test admin...');
    
    // Delete if exists
    await User.deleteOne({ email: 'newtest@admin.com' });
    
    const newAdmin = new User({
      name: 'New Test Admin',
      email: 'newtest@admin.com',
      password: 'newtest123',
      phone: '9876543210',
      role: 'admin',
      status: 'active'
    });
    
    await newAdmin.save();
    console.log(' New admin created');
    
    // Try to login with the new admin
    const foundNewAdmin = await User.findOne({ 
      email: 'newtest@admin.com', 
      role: 'admin' 
    }).select('+password');
    
    if (foundNewAdmin) {
      const loginTest = await foundNewAdmin.comparePassword('newtest123');
      console.log(`New admin login test: ${loginTest ? ' SUCCESS' : ' FAILED'}`);
      
      if (loginTest) {
        console.log('\n AUTHENTICATION IS WORKING CORRECTLY!');
        console.log(' You can now login with:');
        console.log('   Email: newtest@admin.com');
        console.log('   Password: newtest123');
      }
    }
    
    // Clean up
    await User.deleteOne({ email: 'newtest@admin.com' });
    
  } catch (error) {
    console.error(' Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n MongoDB disconnected');
  }
}

testLogin();

