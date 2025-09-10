// Simple Firebase test
console.log('Testing Firebase connection...');

try {
  const admin = require('firebase-admin');
  console.log(' Firebase Admin module loaded');
  
  try {
    const serviceAccount = require('./backend/service-account.json');
    console.log(' Service account loaded');
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log(' Firebase Admin initialized successfully');
    }
    
    const db = admin.firestore();
    console.log(' Firestore connected');
    
    // Test a simple query
    db.collection('subscribers').limit(1).get()
      .then(snapshot => {
        console.log(` Found ${snapshot.size} subscribers`);
      })
      .catch(error => {
        console.error(' Firestore query failed:', error.message);
      });
      
  } catch (error) {
    console.error(' Service account error:', error.message);
  }
  
} catch (error) {
  console.error(' Firebase Admin module not found:', error.message);
}

