/**
 * Debug User Creation Issue
 * Step-by-step debugging to identify the exact problem
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function debugUserCreation() {
  try {
    console.log('🔍 Debugging User Creation Issue...\n');
    
    // Step 1: Test MongoDB connection
    console.log('Step 1: Testing MongoDB connection...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
    console.log('Connection state:', mongoose.connection.readyState);
    
    // Step 2: Test bcryptjs import
    console.log('\nStep 2: Testing bcryptjs...');
    try {
      const bcrypt = require('bcryptjs');
      console.log('✅ bcryptjs imported successfully');
      
      const testHash = await bcrypt.hash('testpassword', 12);
      console.log('✅ bcryptjs hash function works');
      console.log('Test hash length:', testHash.length);
    } catch (bcryptError) {
      console.error('❌ bcryptjs error:', bcryptError);
    }
    
    // Step 3: Test User model import
    console.log('\nStep 3: Testing User model import...');
    try {
      const User = require('./models/User');
      console.log('✅ User model imported successfully');
      console.log('User model schema paths:', Object.keys(User.schema.paths));
    } catch (modelError) {
      console.error('❌ User model import error:', modelError);
      return;
    }
    
    // Step 4: Test User model schema validation
    console.log('\nStep 4: Testing User model validation...');
    const User = require('./models/User');
    
    const testUserData = {
      name: 'Debug Test User',
      email: 'debug.test@example.com',
      phone: '+1234567890',
      role: 'premium',
      password: 'testpass123',
      status: 'active'
    };
    
    try {
      // Clean up any existing test user
      await User.deleteOne({ email: testUserData.email });
      
      console.log('Creating user with data:', testUserData);
      
      const newUser = new User(testUserData);
      console.log('✅ User instance created');
      
      // Test validation without saving
      const validationError = newUser.validateSync();
      if (validationError) {
        console.error('❌ Validation error:', validationError.errors);
        return;
      }
      console.log('✅ User validation passed');
      
      // Test saving
      console.log('Attempting to save user...');
      await newUser.save();
      console.log('✅ User saved successfully');
      console.log('Saved user ID:', newUser._id);
      console.log('Saved user role:', newUser.role);
      
    } catch (saveError) {
      console.error('❌ User save error:', saveError);
      console.error('Error name:', saveError.name);
      console.error('Error message:', saveError.message);
      
      if (saveError.errors) {
        console.error('Validation errors:');
        Object.keys(saveError.errors).forEach(key => {
          console.error(`  ${key}: ${saveError.errors[key].message}`);
        });
      }
    }
    
    // Step 5: Test with minimal data
    console.log('\nStep 5: Testing with minimal required data...');
    try {
      const minimalUserData = {
        name: 'Minimal Test User',
        email: 'minimal.test@example.com',
        phone: '+9876543210',
        password: 'minimalpass123'
      };
      
      await User.deleteOne({ email: minimalUserData.email });
      
      const minimalUser = new User(minimalUserData);
      await minimalUser.save();
      console.log('✅ Minimal user created successfully');
      console.log('Default role:', minimalUser.role);
      console.log('Default status:', minimalUser.status);
      
    } catch (minimalError) {
      console.error('❌ Minimal user creation error:', minimalError);
    }
    
    // Step 6: Test password hashing specifically
    console.log('\nStep 6: Testing password hashing...');
    try {
      const testUser = new User({
        name: 'Hash Test User',
        email: 'hash.test@example.com',
        phone: '+1111111111',
        password: 'hashtest123'
      });
      
      await User.deleteOne({ email: 'hash.test@example.com' });
      
      console.log('Password before save:', testUser.password);
      await testUser.save();
      console.log('Password after save (should be hashed):', testUser.password.substring(0, 20) + '...');
      console.log('✅ Password hashing works');
      
    } catch (hashError) {
      console.error('❌ Password hashing error:', hashError);
    }
    
    console.log('\n✅ Debug Complete!');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run debug
debugUserCreation();