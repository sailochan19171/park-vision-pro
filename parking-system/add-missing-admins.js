/**
 * Script to add missing admin users
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

async function addMissingAdmins() {
  try {
    console.log(' Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log(' Connected to MongoDB');

    // Create Super Admin if not exists
    let superAdmin = await User.findOne({ email: 'admin@vayaccess.com' });
    if (!superAdmin) {
      console.log(' Creating Super Admin...');
      const superAdminPassword = await bcrypt.hash('Admin@123', 10);
      superAdmin = new User({
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
      console.log(' Super Admin created: admin@vayaccess.com / Admin@123');
    } else {
      console.log('ℹ  Super Admin already exists');
    }
    
    // Create Manager if not exists
    let manager = await User.findOne({ email: 'john.manager@vayaccess.com' });
    if (!manager) {
      console.log(' Creating Manager...');
      const managerPassword = await bcrypt.hash('User@123', 10);
      manager = new User({
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
      console.log(' Manager created: john.manager@vayaccess.com / User@123');
    } else {
      console.log('ℹ  Manager already exists');
    }

    // List all admin users
    console.log('\n All admin users:');
    const admins = await User.find({ role: 'admin' }, 'name email isActive');
    admins.forEach(admin => {
      console.log(`   - ${admin.name} (${admin.email}) - ${admin.isActive ? 'Active' : 'Inactive'}`);
    });

    // Test login for each admin
    console.log('\n Testing admin logins...');
    
    const testCases = [
      { email: 'admin@vayaccess.com', password: 'Admin@123', name: 'Super Admin' },
      { email: 'john.manager@vayaccess.com', password: 'User@123', name: 'Manager' },
      { email: 'admin@test.com', password: 'test123', name: 'Test Admin' }
    ];

    for (const testCase of testCases) {
      const user = await User.findOne({ email: testCase.email });
      if (user) {
        const passwordMatch = await bcrypt.compare(testCase.password, user.password);
        console.log(`${passwordMatch ? '' : ''} ${testCase.name}: ${testCase.email} / ${testCase.password} - ${passwordMatch ? 'VALID' : 'INVALID'}`);
      } else {
        console.log(` ${testCase.name}: User not found`);
      }
    }

  } catch (error) {
    console.error(' Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n Disconnected from MongoDB');
  }
}

// Run the script
addMissingAdmins();
