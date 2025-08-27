/**
 * Script to create default admin users
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/parking_system';

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  permissions: [String],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

async function createAdminUsers() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if any admin users exist
    const adminCount = await User.countDocuments({ role: 'admin' });
    console.log(`📊 Found ${adminCount} existing admin users`);

    if (adminCount === 0) {
      console.log('🔧 Creating default admin users...');
      
      // Create Super Admin
      const superAdminPassword = await bcrypt.hash('Admin@123', 10);
      const superAdmin = new User({
        name: 'Super Admin',
        email: 'admin@vayaccess.com',
        phone: '+1234567890',
        password: superAdminPassword,
        role: 'admin',
        permissions: ['all'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await superAdmin.save();
      console.log('✅ Super Admin created: admin@vayaccess.com / Admin@123');
      
      // Create Manager
      const managerPassword = await bcrypt.hash('User@123', 10);
      const manager = new User({
        name: 'John Manager',
        email: 'john.manager@vayaccess.com',
        phone: '+1234567891',
        password: managerPassword,
        role: 'admin',
        permissions: ['dashboard', 'bookings', 'payments', 'reports'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await manager.save();
      console.log('✅ Manager created: john.manager@vayaccess.com / User@123');
      
      // Create Test Admin for development
      const testAdminPassword = await bcrypt.hash('test123', 10);
      const testAdmin = new User({
        name: 'Test Admin',
        email: 'admin@test.com',
        phone: '+1234567892',
        password: testAdminPassword,
        role: 'admin',
        permissions: ['all'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await testAdmin.save();
      console.log('✅ Test Admin created: admin@test.com / test123');
      
      console.log('🎉 Default admin users created successfully!');
    } else {
      console.log('ℹ️  Admin users already exist. Listing existing admins:');
      const admins = await User.find({ role: 'admin' }, 'name email isActive');
      admins.forEach(admin => {
        console.log(`   - ${admin.name} (${admin.email}) - ${admin.isActive ? 'Active' : 'Inactive'}`);
      });
    }

    // Verify admin users can be found
    console.log('\n🔍 Verifying admin users...');
    const testAdmin = await User.findOne({ email: 'admin@vayaccess.com' });
    if (testAdmin) {
      console.log('✅ Super Admin found in database');
      const passwordMatch = await bcrypt.compare('Admin@123', testAdmin.password);
      console.log(`✅ Password verification: ${passwordMatch ? 'PASSED' : 'FAILED'}`);
    } else {
      console.log('❌ Super Admin not found in database');
    }

    const testManager = await User.findOne({ email: 'john.manager@vayaccess.com' });
    if (testManager) {
      console.log('✅ Manager found in database');
      const passwordMatch = await bcrypt.compare('User@123', testManager.password);
      console.log(`✅ Password verification: ${passwordMatch ? 'PASSED' : 'FAILED'}`);
    } else {
      console.log('❌ Manager not found in database');
    }

  } catch (error) {
    console.error('❌ Error creating admin users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createAdminUsers();