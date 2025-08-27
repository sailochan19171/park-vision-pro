const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function checkBalance() {
  try {
    const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    
    console.log('💰 Account Balance Information:');
    console.log(`📋 Account Type: ${account.type}`);
    console.log(`📋 Status: ${account.status}`);
    console.log(`💳 Balance: $${account.balance || '0.00'}`);
    
    // Check if account has any restrictions
    if (account.type === 'Trial') {
      console.log('\n  TRIAL ACCOUNT LIMITATIONS:');
      console.log('    Can only call verified numbers');
      console.log('    Geographic restrictions apply');
      console.log('    Some Indian carriers blocked');
      console.log('    Daily call limits');
      
      console.log('\n💡 SOLUTIONS:');
      console.log('     Add $10 credit (removes ALL restrictions)');
      console.log('     Use SMS instead of voice calls');
      console.log('     Test with different Indian number');
    }
    
  } catch (error) {
    console.error(' Error checking balance:', error.message);
  }
}

checkBalance();