/**
 * Simple Activity Logging Verification Script
 * Checks if activity logging is properly set up in MongoDB
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ActivityLog = require('./models/ActivityLog');

async function verifyActivityLogging() {
  try {
    console.log('🔍 Verifying Activity Logging Setup...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check if ActivityLog collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    const activityLogCollection = collections.find(col => col.name === 'activitylogs');
    
    if (activityLogCollection) {
      console.log('✅ ActivityLog collection exists in MongoDB');
    } else {
      console.log('❌ ActivityLog collection not found');
    }
    
    // Check if there are any activity logs
    const totalLogs = await ActivityLog.countDocuments();
    console.log(`📊 Total activity logs in database: ${totalLogs}`);
    
    if (totalLogs > 0) {
      // Show recent logs
      const recentLogs = await ActivityLog.find()
        .sort({ timestamp: -1 })
        .limit(5)
        .select('timestamp userEmail userRole action method endpoint responseStatus success');
      
      console.log('\n🕒 Recent Activity Logs:');
      console.log('========================');
      recentLogs.forEach((log, index) => {
        const status = log.success ? '✅' : '❌';
        console.log(`${index + 1}. ${status} ${log.action} - ${log.userRole} - ${log.method} ${log.endpoint}`);
        console.log(`   📧 User: ${log.userEmail}`);
        console.log(`   ⏰ Time: ${log.timestamp.toLocaleString()}`);
        console.log(`   📊 Status: ${log.responseStatus}\n`);
      });
      
      // Show statistics
      const adminLogs = await ActivityLog.countDocuments({ userRole: 'admin' });
      const userLogs = await ActivityLog.countDocuments({ userRole: 'user' });
      const successfulLogs = await ActivityLog.countDocuments({ success: true });
      const failedLogs = await ActivityLog.countDocuments({ success: false });
      
      console.log('📈 Activity Statistics:');
      console.log('=======================');
      console.log(`👨‍💼 Admin Activities: ${adminLogs}`);
      console.log(`👤 User Activities: ${userLogs}`);
      console.log(`✅ Successful Operations: ${successfulLogs}`);
      console.log(`❌ Failed Operations: ${failedLogs}`);
      console.log(`📈 Success Rate: ${totalLogs > 0 ? ((successfulLogs / totalLogs) * 100).toFixed(2) : 0}%`);
      
    } else {
      console.log('\n💡 No activity logs found yet. This is normal if:');
      console.log('   - Servers haven\'t been started');
      console.log('   - No admin/user operations have been performed');
      console.log('   - Activity logging was just implemented');
    }
    
    // Check indexes
    const indexes = await ActivityLog.collection.getIndexes();
    console.log(`\n🔍 Database indexes: ${Object.keys(indexes).length} indexes found`);
    
    console.log('\n✅ Activity Logging Verification Complete!');
    console.log('==========================================');
    console.log('🚀 To start logging activities:');
    console.log('   1. Start admin server: node admin-server.js');
    console.log('   2. Start user server: node user-server.js');
    console.log('   3. Perform any admin/user operations');
    console.log('   4. Check MongoDB: db.activitylogs.find().sort({timestamp: -1})');
    console.log('   5. View in dashboard: http://localhost:8081/admin/activity-logs');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

// Run verification
verifyActivityLogging();