const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function simulateAICall() {
  console.log('SIMULATING AI CALL CONVERSATION');
  console.log('[PHONE RINGS] - Customer +917337449871 answers...\n');
  
  // Simulate the conversation that would happen
  const conversations = [
    {
      speaker: 'AI Agent',
      message: 'Hello! This is the AI assistant from VayAccess Parking Solutions. Thank you for your interest in our smart parking systems. How can I help you today?'
    },
    {
      speaker: 'Customer',
      message: 'Hi, I need information about parking barrier gates for my office complex.'
    },
    {
      speaker: 'AI Agent', 
      message: 'Perfect! We specialize in smart barrier gates. For an office complex, I recommend our ANPR-based barrier system with automatic number plate recognition. It can handle 500+ vehicles per hour. What\'s the size of your parking area?'
    },
    {
      speaker: 'Customer',
      message: 'We have about 200 parking spots and expect around 300 vehicles daily.'
    },
    {
      speaker: 'AI Agent',
      message: 'Excellent! For 200 spots with 300 daily vehicles, our recommended solution includes: 2 entry barriers with ANPR cameras, 2 exit barriers, parking guidance LEDs, and mobile app integration. The system costs approximately ₹8-12 lakhs. Would you like to schedule a free site assessment?'
    },
    {
      speaker: 'Customer',
      message: 'Yes, that sounds good. When can someone visit?'
    },
    {
      speaker: 'AI Agent',
      message: 'I can schedule a visit for you! Our technical team is available Monday to Friday, 9 AM to 6 PM. I\'ll have our sales representative contact you within 24 hours to arrange the visit. Is +917337449871 the best number to reach you?'
    }
  ];

  // Simulate real-time conversation
  for (const conv of conversations) {
    console.log(` ${conv.speaker}: ${conv.message}\n`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
  }
  
  console.log('Call completed successfully!');
  console.log('Lead captured: +917337449871');
  console.log(' Follow-up email will be sent');
  console.log(' Site visit to be scheduled');
}

simulateAICall();