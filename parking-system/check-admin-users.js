require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkAdminUsers() {
  try {
    console.log(' Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(' Connected to MongoDB');

    // Find all admin users
    const admins = await User.find({ role: 'admin' }).select('name email createdAt');
    
    console.log('\n Admin Users Found:');
    console.log('=====================');
    
    if (admins.length === 0) {
      console.log(' No admin users found');
    } else {
      admins.forEach((admin, index) => {
        console.log(`${index + 1}. Name: ${admin.name}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Created: ${admin.createdAt}`);
        console.log('   ---');
      });
    }

    console.log('\n Login Credentials to try:');
    console.log('============================');
    console.log('URL: http://localhost:8080/admin/login');
    console.log('Email: admin@vayaccess.com');
    console.log('Password: Admin123 (or try: admin123, password, admin)');

    await mongoose.disconnect();
    console.log('\n Database disconnected');

  } catch (error) {
    console.error(' Error:', error);
    process.exit(1);
  }
}

checkAdminUsers();
