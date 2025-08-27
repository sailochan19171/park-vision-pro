const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendWhatsAppMessage() {
  try {
    console.log(' Testing WhatsApp Sandbox (FREE alternative)...');
    
    const message = await client.messages.create({
      body: ' Hello from VayAccess AI! This is a test message. Your parking solutions consultation is available. Would you like to start?',
      from: 'whatsapp:+14155238886', // Twilio Sandbox number
      to: 'whatsapp:+917337449871'
    });

    console.log(' WhatsApp message sent successfully!');
    console.log(` Message SID: ${message.sid}`);
    console.log(' Check your WhatsApp for the message!');
    
  } catch (error) {
    console.error(' WhatsApp failed:', error.message);
    console.log(' You might need to activate WhatsApp Sandbox first');
    console.log(' Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn');
  }
}

sendWhatsAppMessage();