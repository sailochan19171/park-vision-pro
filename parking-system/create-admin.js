/**
 * Create Admin User Script
 * This script creates an admin user directly in the database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function createAdminUser() {
  try {
    console.log(' Creating Admin User...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(' Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      email: 'admin@vayaccess.com',
      role: 'admin' 
    });

    if (existingAdmin) {
      console.log('  Admin user already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.name}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log('\n Use these credentials to login:');
      console.log('   Email: admin@vayaccess.com');
      console.log('   Password: Admin@123');
      return;
    }

    // Create admin user
    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin@vayaccess.com',
      password: 'Admin@123',
      phone: '+91-9876543210',
      role: 'admin',
      status: 'active',
      profile: {
        address: 'VayAccess Headquarters',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001'
      }
    });

    await adminUser.save();

    console.log(' Admin user created successfully!');
    console.log('\n Admin Details:');
    console.log(`   Name: ${adminUser.name}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Phone: ${adminUser.phone}`);
    console.log(`   Role: ${adminUser.role}`);
    console.log(`   Status: ${adminUser.status}`);

    console.log('\n Login Credentials:');
    console.log('   Email: admin@vayaccess.com');
    console.log('   Password: Admin@123');

    console.log('\n Access Admin Dashboard:');
    console.log('   URL: http://localhost:8080/admin/login');

    // Create a second admin for testing
    const managerUser = new User({
      name: 'John Manager',
      email: 'john.manager@vayaccess.com',
      password: 'Manager@123',
      phone: '+91-9876543211',
      role: 'admin',
      status: 'active',
      profile: {
        address: 'VayAccess Branch Office',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001'
      }
    });

    await managerUser.save();

    console.log('\n Manager user created successfully!');
    console.log('\n Manager Details:');
    console.log(`   Name: ${managerUser.name}`);
    console.log(`   Email: ${managerUser.email}`);
    console.log(`   Role: ${managerUser.role}`);

    console.log('\n Manager Login Credentials:');
    console.log('   Email: john.manager@vayaccess.com');
    console.log('   Password: Manager@123');

    console.log('\n Admin setup completed successfully!');

  } catch (error) {
    console.error(' Error creating admin user:', error);
    if (error.code === 11000) {
      console.log(' Admin user might already exist. Try logging in with existing credentials.');
    }
  } finally {
    await mongoose.disconnect();
    console.log('\n Disconnected from MongoDB');
  }
}

// Run the script
createAdminUser();
