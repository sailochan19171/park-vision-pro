require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function fixAdminPasswords() {
  try {
    console.log(' FIXING ADMIN USER PASSWORDS');
    console.log('===============================');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(' Connected to MongoDB');
    
    // Define admin users with their correct passwords
    const adminCredentials = [
      {
        email: 'john.manager@vayaccess.com',
        name: 'John Manager',
        password: 'Manager@123'
      },
      {
        email: 'sarah.admin@vayaccess.com',
        name: 'Sarah Admin',
        password: 'Admin@123'
      }
    ];
    
    console.log('\n Updating admin passwords...');
    
    for (const adminData of adminCredentials) {
      try {
        // Find the admin user
        let admin = await User.findOne({ 
          email: adminData.email.toLowerCase(), 
          role: 'admin' 
        });
        
        if (admin) {
          console.log(`\n Updating existing admin: ${admin.name}`);
          
          // Hash the password manually
          const salt = await bcrypt.genSalt(12);
          const hashedPassword = await bcrypt.hash(adminData.password, salt);
          
          // Update the password directly
          await User.updateOne(
            { _id: admin._id },
            { $set: { password: hashedPassword } }
          );
          
          console.log(` Password updated for: ${admin.name}`);
          
          // Test the password
          const updatedAdmin = await User.findById(admin._id);
          const isValid = await bcrypt.compare(adminData.password, updatedAdmin.password);
          console.log(`   Password test: ${isValid ? ' VALID' : ' INVALID'}`);
          
        } else {
          console.log(`\n Creating new admin: ${adminData.name}`);
          
          // Create new admin user
          const newAdmin = new User({
            name: adminData.name,
            email: adminData.email.toLowerCase(),
            password: adminData.password, // This will be hashed by the pre-save middleware
            role: 'admin',
            status: 'active',
            phone: '9999999999',
            profile: {
              firstName: adminData.name.split(' ')[0],
              lastName: adminData.name.split(' ')[1] || '',
              dateOfBirth: new Date('1990-01-01'),
              gender: 'other'
            }
          });
          
          await newAdmin.save();
          console.log(` Created new admin: ${newAdmin.name}`);
          
          // Test the password
          const isValid = await newAdmin.comparePassword(adminData.password);
          console.log(`   Password test: ${isValid ? ' VALID' : ' INVALID'}`);
        }
        
      } catch (error) {
        console.error(` Error processing ${adminData.email}:`, error.message);
      }
    }
    
    // Clean up test admin users
    console.log('\n Cleaning up test admin users...');
    const testAdmins = await User.find({ 
      email: { $regex: /admin\d+@test\.com/ },
      role: 'admin'
    });
    
    for (const testAdmin of testAdmins) {
      await User.deleteOne({ _id: testAdmin._id });
      console.log(` Deleted test admin: ${testAdmin.email}`);
    }
    
    // Final verification
    console.log('\n FINAL VERIFICATION:');
    console.log('======================');
    
    const finalAdmins = await User.find({ role: 'admin' }).select('name email password');
    
    for (const admin of finalAdmins) {
      console.log(`\n ${admin.name} (${admin.email})`);
      console.log(`   Password hash: ${admin.password ? ' EXISTS' : ' MISSING'}`);
      console.log(`   Hash length: ${admin.password ? admin.password.length : 0}`);
    }
    
    console.log('\n ADMIN PASSWORDS FIXED!');
    console.log('=========================');
    console.log('You can now login with:');
    console.log('');
    console.log('URL: http://localhost:8080/admin/login');
    console.log('');
    console.log('Option 1:');
    console.log('Email: john.manager@vayaccess.com');
    console.log('Password: Manager@123');
    console.log('');
    console.log('Option 2:');
    console.log('Email: sarah.admin@vayaccess.com');
    console.log('Password: Admin@123');
    
    await mongoose.disconnect();
    console.log('\n Password fix completed');
    
  } catch (error) {
    console.error(' Fix failed:', error);
    process.exit(1);
  }
}

fixAdminPasswords();
