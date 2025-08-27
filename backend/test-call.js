const twilio = require('twilio');
require('dotenv').config();

// Initialize Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function makeTestCall() {
  try {
    console.log(' Testing direct Twilio call...');
    console.log(`From: ${process.env.TWILIO_PHONE_NUMBER}`);
    console.log(`To: +917337449871`);
    
    const call = await client.calls.create({
      to: '+917337449871',
      from: process.env.TWILIO_PHONE_NUMBER,
      url: 'http://demo.twilio.com/docs/voice.xml', // Simple test message
      statusCallback: `${process.env.NGROK_URL}/api/ai-call/status/test`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    console.log(' Call initiated successfully!');
    console.log(` Call SID: ${call.sid}`);
    console.log(` Status: ${call.status}`);
    console.log(' Your phone should ring now!');
    
  } catch (error) {
    console.error(' Call failed:', error.message);
    console.error('Error code:', error.code);
  }
}

makeTestCall();