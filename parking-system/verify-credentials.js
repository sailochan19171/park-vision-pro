require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function verifyCredentials() {
  try {
    console.log(' VERIFYING ADMIN CREDENTIALS');
    console.log('===============================');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(' Connected to MongoDB');
    
    // Test both admin accounts
    const testCredentials = [
      { email: 'john.manager@vayaccess.com', password: 'Manager@123' },
      { email: 'sarah.admin@vayaccess.com', password: 'Admin@123' }
    ];
    
    for (const cred of testCredentials) {
      console.log(`\n Testing: ${cred.email}`);
      
      const admin = await User.findOne({ 
        email: cred.email.toLowerCase(), 
        role: 'admin' 
      }).select('+password');
      
      if (admin) {
        console.log(`    Admin found: ${admin.name}`);
        console.log(`    Email: ${admin.email}`);
        console.log(`    Password hash exists: ${!!admin.password}`);
        console.log(`    Hash length: ${admin.password ? admin.password.length : 0}`);
        
        try {
          const isValid = await admin.comparePassword(cred.password);
          console.log(`    Password test: ${isValid ? ' VALID' : ' INVALID'}`);
        } catch (error) {
          console.log(`    Password test:  ERROR - ${error.message}`);
        }
      } else {
        console.log(`    Admin not found`);
      }
    }
    
    console.log('\n CORRECT LOGIN CREDENTIALS:');
    console.log('==============================');
    console.log('URL: http://localhost:8080/admin/login');
    console.log('');
    console.log('Option 1:');
    console.log(' Email: john.manager@vayaccess.com');
    console.log(' Password: Manager@123');
    console.log('');
    console.log('Option 2:');
    console.log(' Email: sarah.admin@vayaccess.com');
    console.log(' Password: Admin@123');
    
    console.log('\n  IMPORTANT NOTES:');
    console.log('====================');
    console.log('• Make sure to use the EXACT email addresses above');
    console.log('• Passwords are case-sensitive');
    console.log('• Clear browser cache if you have login issues');
    console.log('• The email "admin@vayaccess.com" does NOT exist');
    
    await mongoose.disconnect();
    console.log('\n Verification completed');
    
  } catch (error) {
    console.error(' Verification failed:', error);
    process.exit(1);
  }
}

verifyCredentials();
