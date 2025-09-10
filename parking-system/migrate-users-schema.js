/**
 * User Schema Migration Script
 * Migrates old user records to match the new User model schema
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function migrateUserSchema() {
  try {
    console.log(' Starting User Schema Migration...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(' Connected to MongoDB');
    
    // Get the users collection directly
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Find all users that need migration
    const oldUsers = await usersCollection.find({
      $or: [
        { role: { $exists: false } },
        { status: { $exists: false } },
        { profile: { $exists: false } },
        { wallet: { $exists: false } },
        { preferences: { $exists: false } }
      ]
    }).toArray();
    
    console.log(` Found ${oldUsers.length} users that need migration`);
    
    if (oldUsers.length === 0) {
      console.log(' All users are already up to date!');
      return;
    }
    
    // Migrate each user
    let migratedCount = 0;
    
    for (const user of oldUsers) {
      try {
        console.log(`\n Migrating user: ${user.email}`);
        
        const updateData = {};
        
        // 1. Add role field if missing
        if (!user.role) {
          // Determine role based on email or set default
          if (user.email && (user.email.includes('admin') || user.email.includes('manager'))) {
            updateData.role = 'admin';
          } else {
            updateData.role = 'user';
          }
          console.log(`    Adding role: ${updateData.role}`);
        }
        
        // 2. Add status field if missing (convert from isActive)
        if (!user.status) {
          if (user.isActive === false) {
            updateData.status = 'inactive';
          } else {
            updateData.status = 'active';
          }
          console.log(`    Adding status: ${updateData.status}`);
        }
        
        // 3. Add profile object if missing
        if (!user.profile) {
          updateData.profile = {
            avatar: '',
            address: '',
            city: '',
            state: '',
            pincode: ''
          };
          console.log('    Adding profile object');
        }
        
        // 4. Add vehicles array if missing
        if (!user.vehicles) {
          updateData.vehicles = [];
          console.log('    Adding vehicles array');
        }
        
        // 5. Add bookings array if missing
        if (!user.bookings) {
          updateData.bookings = [];
          console.log('    Adding bookings array');
        }
        
        // 6. Add wallet object if missing
        if (!user.wallet) {
          updateData.wallet = {
            balance: 0,
            transactions: []
          };
          console.log('    Adding wallet object');
        }
        
        // 7. Add preferences object if missing
        if (!user.preferences) {
          updateData.preferences = {
            notifications: {
              email: true,
              sms: false,
              push: true
            },
            language: 'en',
            theme: 'light'
          };
          console.log('    Adding preferences object');
        }
        
        // 8. Add refreshTokens array if missing
        if (!user.refreshTokens) {
          updateData.refreshTokens = [];
          console.log('    Adding refreshTokens array');
        }
        
        // 9. Remove isActive field if it exists
        const unsetData = {};
        if (user.isActive !== undefined) {
          unsetData.isActive = '';
          console.log('    Removing isActive field');
        }
        
        // Apply the migration
        const updateQuery = { _id: user._id };
        const updateOperation = {};
        
        if (Object.keys(updateData).length > 0) {
          updateOperation.$set = updateData;
        }
        
        if (Object.keys(unsetData).length > 0) {
          updateOperation.$unset = unsetData;
        }
        
        if (Object.keys(updateOperation).length > 0) {
          await usersCollection.updateOne(updateQuery, updateOperation);
          console.log('    Migration completed');
          migratedCount++;
        } else {
          console.log('    No changes needed');
        }
        
      } catch (error) {
        console.error(`    Failed to migrate user ${user.email}:`, error.message);
      }
    }
    
    console.log(`\n Migration Summary:`);
    console.log(`   Total users found: ${oldUsers.length}`);
    console.log(`   Successfully migrated: ${migratedCount}`);
    console.log(`   Failed: ${oldUsers.length - migratedCount}`);
    
    // Verify migration
    console.log('\n Verifying migration...');
    const verifyUsers = await usersCollection.find({}).limit(3).toArray();
    
    console.log('\n Sample migrated users:');
    verifyUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.email}:`);
      console.log(`   Role: ${user.role || 'MISSING'}`);
      console.log(`   Status: ${user.status || 'MISSING'}`);
      console.log(`   Profile: ${user.profile ? 'Present' : 'MISSING'}`);
      console.log(`   Wallet: ${user.wallet ? 'Present' : 'MISSING'}`);
      console.log(`   Preferences: ${user.preferences ? 'Present' : 'MISSING'}`);
      console.log(`   isActive: ${user.isActive !== undefined ? 'STILL EXISTS (BAD)' : 'Removed (GOOD)'}`);
    });
    
    console.log('\n User Schema Migration Complete!');
    console.log('==========================================');
    console.log(' All users should now be compatible with the new User model');
    console.log(' Try creating a new user in the admin dashboard now');
    
  } catch (error) {
    console.error(' Migration failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run migration
migrateUserSchema();
