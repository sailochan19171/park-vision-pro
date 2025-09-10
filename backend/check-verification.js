const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function checkAccountAndNumbers() {
  try {
    console.log(' Checking Twilio account and verified numbers...');
    console.log('Account SID:', process.env.TWILIO_ACCOUNT_SID);
    
    // Check account status
    const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    console.log(' Account Status:', account.status);
    console.log(' Account Type:', account.type);
    
    // Get all verified numbers
    console.log('\n Checking verified numbers...');
    const outgoingCallerIds = await client.outgoingCallerIds.list();
    
    console.log(' Total verified numbers:', outgoingCallerIds.length);
    
    outgoingCallerIds.forEach((callerId) => {
      console.log(` Number: ${callerId.phoneNumber}`);
      console.log(`   Status: ${callerId.friendlyName}`);
      console.log(`   Date Created: ${callerId.dateCreated}`);
      console.log('---');
    });
    
    // Check if the specific number exists
    const targetNumber = '+917337449871';
    const foundNumber = outgoingCallerIds.find(id => id.phoneNumber === targetNumber);
    
    if (foundNumber) {
      console.log(` Number ${targetNumber} is in verified list!`);
    } else {
      console.log(` Number ${targetNumber} is NOT in verified list!`);
    }
    
  } catch (error) {
    console.error(' Error checking account:', error.message);
  }
}

checkAccountAndNumbers();
