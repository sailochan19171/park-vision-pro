// Test Firebase Admin initialization from backend directory
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

async function testFirebase() {
  try {
    const serviceAccount = require('./service-account.json');
    console.log(' Service account loaded');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'vayaccess-59fdd',
      });
      console.log(' Firebase Admin initialized successfully');
    }

    const databaseId = process.env.FIRESTORE_DB_ID || '(default)';
    const db = getFirestore(admin.app(), databaseId);
    console.log(' Firestore connected to database:', databaseId);

    // Test a simple query
    const testQuery = await db.collection('subscribers').limit(1).get();
    console.log(` Found ${testQuery.size} subscribers`);

    // List all subscribers
    const subscribers = await db.collection('subscribers').get();
    console.log(`\n Total subscribers: ${subscribers.size}`);
    subscribers.forEach(doc => {
      const data = doc.data();
      console.log(`   - ${data.email} (${data.source || 'unknown'})`);
    });

  } catch (error) {
    console.error(' Firebase Admin initialization failed:', error.message);
    console.error('Error details:', error);
  }
}

testFirebase();

