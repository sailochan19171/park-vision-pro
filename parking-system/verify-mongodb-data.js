require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function verifyMongoDBData() {
  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB Atlas');
    
    // Check if the test user we just created exists
    const testUser = await User.findOne({ email: 'testapi@example.com' });
    
    if (testUser) {
      console.log('✅ Test user found in MongoDB Atlas:');
      console.log('   ID:', testUser._id);
      console.log('   Name:', testUser.name);
      console.log('   Email:', testUser.email);
      console.log('   Phone:', testUser.phone);
      console.log('   Created:', testUser.createdAt);
      console.log('   Updated:', testUser.updatedAt);
    } else {
      console.log('❌ Test user NOT found in MongoDB Atlas');
    }
    
    // Get total user count
    const totalUsers = await User.countDocuments();
    console.log('📊 Total users in database:', totalUsers);
    
    // Get recent users (last 5)
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email createdAt');
    
    console.log('📋 Recent users:');
    recentUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.name} (${user.email}) - ${user.createdAt}`);
    });
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyMongoDBData();