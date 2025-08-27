// Test Firebase Admin initialization
const admin = require('firebase-admin');

try {
  const serviceAccount = require('./backend/service-account.json');
  
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    console.log('ℹ️ Firebase Admin already initialized');
  }
  
  const db = admin.firestore();
  console.log('✅ Firestore connected successfully');
  
  // Test a simple query
  const testQuery = await db.collection('subscribers').limit(1).get();
  console.log(`✅ Found ${testQuery.size} subscribers in Firestore`);
  
} catch (error) {
  console.error('❌ Firebase Admin initialization failed:', error.message);
  console.error('Error details:', error);
}
