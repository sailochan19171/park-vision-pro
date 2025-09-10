require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function testMongoDBConnection() {
  try {
    console.log(' Connecting to MongoDB...');
    console.log('MongoDB URI:', process.env.MONGODB_URI);
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(' MongoDB connected successfully');
    
    // Test creating a user
    console.log(' Testing user creation...');
    
    const testUser = new User({
      name: 'Test User',
      email: 'test@example.com',
      password: 'TestPassword123',
      phone: '+1234567890'
    });
    
    const savedUser = await testUser.save();
    console.log(' User created successfully:', savedUser._id);
    
    // Test finding the user
    const foundUser = await User.findById(savedUser._id);
    console.log(' User found:', foundUser.name, foundUser.email);
    
    // Clean up - delete the test user
    await User.findByIdAndDelete(savedUser._id);
    console.log(' Test user deleted');
    
    // Test database stats
    const userCount = await User.countDocuments();
    console.log(' Total users in database:', userCount);
    
    await mongoose.disconnect();
    console.log(' MongoDB disconnected');
    
  } catch (error) {
    console.error(' Error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

testMongoDBConnection();
