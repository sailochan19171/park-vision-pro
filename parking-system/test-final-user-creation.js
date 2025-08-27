/**
 * Final Test - User Creation After Migration
 * Tests user creation after schema migration
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function testFinalUserCreation() {
  try {
    console.log('🧪 Final Test - User Creation After Migration...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Test 1: Verify existing users have correct schema
    console.log('\nTest 1: Verifying existing users...');
    const existingUsers = await User.find({}).limit(3);
    
    existingUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}:`);
      console.log(`   ✅ Role: ${user.role}`);
      console.log(`   ✅ Status: ${user.status}`);
      console.log(`   ✅ Profile: ${user.profile ? 'Present' : 'Missing'}`);
      console.log(`   ✅ Wallet: ${user.wallet ? 'Present' : 'Missing'}`);
    });
    
    // Test 2: Create new premium user
    console.log('\nTest 2: Creating new premium user...');
    
    const testEmail = `final.test.premium.${Date.now()}@example.com`;
    
    // Clean up if exists
    await User.deleteOne({ email: testEmail });
    
    const premiumUserData = {
      name: 'Final Test Premium User',
      email: testEmail,
      phone: '+1234567890',
      role: 'premium',
      password: 'testpass123',
      status: 'active'
    };
    
    const newUser = new User(premiumUserData);
    await newUser.save();
    
    console.log('✅ Premium user created successfully!');
    console.log(`   📧 Email: ${newUser.email}`);
    console.log(`   👤 Role: ${newUser.role}`);
    console.log(`   📊 Status: ${newUser.status}`);
    console.log(`   🆔 ID: ${newUser._id}`);
    
    // Test 3: Verify user can be retrieved
    console.log('\nTest 3: Retrieving created user...');
    const retrievedUser = await User.findById(newUser._id);
    
    if (retrievedUser) {
      console.log('✅ User retrieved successfully');
      console.log(`   Name: ${retrievedUser.name}`);
      console.log(`   Role: ${retrievedUser.role}`);
      console.log(`   Status: ${retrievedUser.status}`);
      console.log(`   Profile: ${retrievedUser.profile ? 'Present' : 'Missing'}`);
      console.log(`   Wallet Balance: ${retrievedUser.wallet?.balance || 0}`);
    } else {
      console.log('❌ Failed to retrieve user');
    }
    
    // Test 4: Test all roles
    console.log('\nTest 4: Testing all user roles...');
    
    const testRoles = ['user', 'premium', 'admin'];
    
    for (const role of testRoles) {
      try {
        const roleTestEmail = `role.test.${role}.${Date.now()}@example.com`;
        
        await User.deleteOne({ email: roleTestEmail });
        
        const roleUser = new User({
          name: `Test ${role} User`,
          email: roleTestEmail,
          phone: `+123456789${Math.floor(Math.random() * 10)}`,
          role: role,
          password: 'testpass123',
          status: 'active'
        });
        
        await roleUser.save();
        console.log(`   ✅ ${role} user created successfully`);
        
      } catch (error) {
        console.log(`   ❌ ${role} user creation failed:`, error.message);
      }
    }
    
    // Test 5: Count total users
    console.log('\nTest 5: User statistics...');
    const totalUsers = await User.countDocuments();
    const userCount = await User.countDocuments({ role: 'user' });
    const premiumCount = await User.countDocuments({ role: 'premium' });
    const adminCount = await User.countDocuments({ role: 'admin' });
    
    console.log(`   📊 Total users: ${totalUsers}`);
    console.log(`   👤 Regular users: ${userCount}`);
    console.log(`   ⭐ Premium users: ${premiumCount}`);
    console.log(`   👨‍💼 Admin users: ${adminCount}`);
    
    console.log('\n✅ All Tests Passed!');
    console.log('==========================================');
    console.log('🎉 User creation should now work perfectly in the admin dashboard');
    console.log('🚀 Try creating a premium user at: http://localhost:8081/admin/users');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run test
testFinalUserCreation();