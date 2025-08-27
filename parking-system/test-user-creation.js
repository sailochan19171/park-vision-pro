/**
 * Test User Creation API
 * Tests the user creation functionality to identify issues
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function testUserCreation() {
  try {
    console.log('🧪 Testing User Creation...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Test data
    const testUsers = [
      {
        name: 'Test Regular User',
        email: 'test.regular@example.com',
        phone: '+1234567890',
        role: 'user',
        password: 'testpass123',
        status: 'active'
      },
      {
        name: 'Test Premium User',
        email: 'test.premium@example.com',
        phone: '+1234567891',
        role: 'premium',
        password: 'testpass123',
        status: 'active'
      },
      {
        name: 'Test Admin User',
        email: 'test.admin@example.com',
        phone: '+1234567892',
        role: 'admin',
        password: 'testpass123',
        status: 'active'
      }
    ];
    
    // Clean up existing test users
    await User.deleteMany({ 
      email: { $in: testUsers.map(u => u.email) }
    });
    console.log('🧹 Cleaned up existing test users');
    
    // Test each user creation
    for (const userData of testUsers) {
      try {
        console.log(`\n🔄 Creating ${userData.role} user: ${userData.email}`);
        
        const newUser = new User({
          name: userData.name,
          email: userData.email.toLowerCase(),
          phone: userData.phone,
          role: userData.role,
          password: userData.password,
          status: userData.status,
          profile: {
            address: '',
            city: '',
            state: '',
            pincode: ''
          }
        });
        
        await newUser.save();
        console.log(`✅ Successfully created ${userData.role} user`);
        console.log(`   📧 Email: ${newUser.email}`);
        console.log(`   👤 Role: ${newUser.role}`);
        console.log(`   📊 Status: ${newUser.status}`);
        console.log(`   🆔 ID: ${newUser._id}`);
        
      } catch (error) {
        console.error(`❌ Failed to create ${userData.role} user:`, error.message);
        
        if (error.name === 'ValidationError') {
          console.error('   Validation errors:');
          Object.values(error.errors).forEach(err => {
            console.error(`   - ${err.path}: ${err.message}`);
          });
        }
      }
    }
    
    // Verify users were created
    console.log('\n📊 Verification:');
    const totalUsers = await User.countDocuments();
    const regularUsers = await User.countDocuments({ role: 'user' });
    const premiumUsers = await User.countDocuments({ role: 'premium' });
    const adminUsers = await User.countDocuments({ role: 'admin' });
    
    console.log(`   Total users in database: ${totalUsers}`);
    console.log(`   Regular users: ${regularUsers}`);
    console.log(`   Premium users: ${premiumUsers}`);
    console.log(`   Admin users: ${adminUsers}`);
    
    // Test the User model methods
    console.log('\n🔧 Testing User model methods:');
    const testUser = await User.findOne({ role: 'premium' });
    if (testUser) {
      console.log('✅ Premium user found');
      console.log('✅ toSafeObject method works:', !!testUser.toSafeObject);
      console.log('✅ comparePassword method works:', !!testUser.comparePassword);
    }
    
    console.log('\n✅ User Creation Test Complete!');
    console.log('==========================================');
    console.log('💡 If this test passes, the issue might be:');
    console.log('   1. Server authentication/session issues');
    console.log('   2. Frontend form validation problems');
    console.log('   3. Network/CORS issues');
    console.log('   4. Browser extension interference');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run test
testUserCreation();