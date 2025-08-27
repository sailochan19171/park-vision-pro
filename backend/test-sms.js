const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendSMSMessage() {
  try {
    console.log(' Testing SMS (works on trial accounts)...');
    
    const message = await client.messages.create({
      body: ` VayAccess AI Assistant: Hello! I'm ready to help with your parking solutions needs. 

 Our services:
- Smart barrier gates
- Parking management systems  
- Access control solutions
- ANPR systems

Reply with questions or call +91 720 724 4344 for consultation.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: '+917337449871'
    });

    console.log(' SMS sent successfully!');
    console.log(` Message SID: ${message.sid}`);
    console.log(' Check your phone for SMS!');
    
  } catch (error) {
    console.error(' SMS failed:', error.message);
  }
}

sendSMSMessage();