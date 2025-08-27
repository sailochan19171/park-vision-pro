require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function createAdminUser() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      email: 'admin@vayaccess.com', 
      role: 'admin' 
    });

    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      console.log('   Email: admin@vayaccess.com');
      console.log('   Password: Admin123');
      await mongoose.disconnect();
      return;
    }

    // Create admin user
    const admin = new User({
      name: 'VayAccess Admin',
      email: 'admin@vayaccess.com',
      password: 'Admin123',
      phone: '9999999999',
      role: 'admin',
      status: 'active'
    });

    await admin.save();
    console.log('✅ Admin user created successfully!');
    console.log('   Email: admin@vayaccess.com');
    console.log('   Password: Admin123');
    console.log('   Login at: http://localhost:8080/admin/login');

    await mongoose.disconnect();
    console.log('✅ Database disconnected');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();