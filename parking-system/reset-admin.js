// Reset or find admin account
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function resetAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(' MongoDB connected');

    // List all admin users
    const admins = await User.find({ role: 'admin' }).select('name email createdAt');
    console.log('\n Current Admin Users:');
    admins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.name} (${admin.email}) - Created: ${admin.createdAt.toLocaleDateString()}`);
    });

    rl.question('\n Enter the email of the admin you want to reset password for: ', async (email) => {
      try {
        const admin = await User.findOne({ email: email.toLowerCase(), role: 'admin' });
        
        if (!admin) {
          console.log(' Admin not found with email:', email);
          rl.close();
          await mongoose.disconnect();
          return;
        }

        rl.question(' Enter new password: ', async (newPassword) => {
          try {
            admin.password = newPassword;
            await admin.save();
            
            console.log(' Password updated successfully!');
            console.log(' You can now login with:');
            console.log(`   Email: ${admin.email}`);
            console.log(`   Password: ${newPassword}`);
            
            // Test the new password
            const testAdmin = await User.findOne({ email: admin.email }).select('+password');
            const isValid = await testAdmin.comparePassword(newPassword);
            console.log(` Password test: ${isValid ? ' SUCCESS' : ' FAILED'}`);
            
          } catch (error) {
            console.error(' Error updating password:', error);
          } finally {
            rl.close();
            await mongoose.disconnect();
          }
        });
      } catch (error) {
        console.error(' Error finding admin:', error);
        rl.close();
        await mongoose.disconnect();
      }
    });
    
  } catch (error) {
    console.error(' Connection error:', error);
    rl.close();
  }
}

resetAdmin();
