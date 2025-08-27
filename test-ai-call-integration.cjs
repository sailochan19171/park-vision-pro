// Test AI Call Recording Integration
// This script sends sample AI call data to the parking system admin dashboard

const axios = require('axios');

// Sample AI Call Recording Data
const sampleCallRecordings = [
  {
    sessionId: 'ai_call_123456789',
    customerName: 'John Smith',
    customerPhone: '+91 9876543210',
    startTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    endTime: new Date(Date.now() - 3300000).toISOString(), // 55 minutes ago
    duration: 300, // 5 minutes
    status: 'completed',
    conversationHistory: [
      {
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        speaker: 'customer',
        message: 'Hi, I need information about parking solutions for my office building.'
      },
      {
        timestamp: new Date(Date.now() - 3590000).toISOString(),
        speaker: 'ai_agent',
        message: 'Hello John! I\'m here to help you with parking solutions. Can you tell me more about your office building? How many parking spaces do you need?'
      },
      {
        timestamp: new Date(Date.now() - 3580000).toISOString(),
        speaker: 'customer',
        message: 'We have a 10-story building with about 200 employees. We need barrier gates and a parking management system.'
      },
      {
        timestamp: new Date(Date.now() - 3570000).toISOString(),
        speaker: 'ai_agent',
        message: 'Perfect! For a building your size, I recommend our VayAccess Smart Parking System with automated barrier gates, RFID access control, and real-time occupancy monitoring. This would handle 200+ vehicles efficiently.'
      },
      {
        timestamp: new Date(Date.now() - 3560000).toISOString(),
        speaker: 'customer',
        message: 'That sounds great! What about the cost and installation time?'
      },
      {
        timestamp: new Date(Date.now() - 3550000).toISOString(),
        speaker: 'ai_agent',
        message: 'Our enterprise parking solutions typically range from ₹15-25 lakhs depending on features. Installation usually takes 2-3 weeks. I\'ll connect you with our sales team for a detailed quote. Can I schedule a site visit?'
      },
      {
        timestamp: new Date(Date.now() - 3540000).toISOString(),
        speaker: 'customer',
        message: 'Yes please! Schedule it for next week if possible.'
      },
      {
        timestamp: new Date(Date.now() - 3530000).toISOString(),
        speaker: 'ai_agent',
        message: 'Excellent! I\'ve noted your requirements. Our sales team will contact you within 2 hours to schedule the site visit. Thank you for choosing VayAccess!'
      }
    ],
    summary: 'Customer John Smith inquired about parking solutions for 200-employee office building. Interested in barrier gates, RFID access control, and parking management system. High interest level. Site visit requested for next week. Enterprise solution valued at ₹15-25 lakhs.',
    customerAudioFiles: [
      {
        filename: 'customer_123456789_1704723600000.webm',
        path: '/recordings/customer_audio/customer_123456789_1704723600000.webm',
        transcription: 'Hi, I need information about parking solutions for my office building.',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        format: 'webm'
      }
    ],
    agentAudioFiles: [
      {
        filename: 'agent_voice_123456789_1704723610000.mp3',
        path: '/recordings/tts/agent_voice_123456789_1704723610000.mp3',
        text: 'Hello John! I\'m here to help you with parking solutions. Can you tell me more about your office building?',
        timestamp: new Date(Date.now() - 3590000).toISOString(),
        duration: 6
      }
    ]
  },
  {
    sessionId: 'ai_call_987654321',
    customerName: 'Priya Sharma',
    customerPhone: '+91 8765432109',
    startTime: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    endTime: new Date(Date.now() - 7000000).toISOString(),
    duration: 200, // 3.3 minutes
    status: 'completed',
    conversationHistory: [
      {
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        speaker: 'customer',
        message: 'I need turnstiles for our residential complex entrance.'
      },
      {
        timestamp: new Date(Date.now() - 7190000).toISOString(),
        speaker: 'ai_agent',
        message: 'Hello Priya! I can help you with turnstile solutions. What type of residential complex is this and approximately how many residents do you have?'
      },
      {
        timestamp: new Date(Date.now() - 7180000).toISOString(),
        speaker: 'customer',
        message: 'It\'s a gated community with 150 apartments. We need secure entry and exit points.'
      },
      {
        timestamp: new Date(Date.now() - 7170000).toISOString(),
        speaker: 'ai_agent',
        message: 'Perfect! For residential complexes, I recommend our flap barrier turnstiles with RFID card access. They provide secure access while being user-friendly for residents. Would you like information about pricing?'
      }
    ],
    summary: 'Residential complex inquiry from Priya Sharma. 150 apartments, needs secure turnstiles with RFID access. Medium interest level. Requires follow-up with pricing details.',
    customerAudioFiles: [],
    agentAudioFiles: []
  },
  {
    sessionId: 'ai_call_456789123',
    customerName: 'Raj Patel',
    customerPhone: '+91 7654321098',
    startTime: new Date().toISOString(), // Current time
    endTime: null,
    duration: 0,
    status: 'active',
    conversationHistory: [
      {
        timestamp: new Date().toISOString(),
        speaker: 'customer',
        message: 'Hello, I\'m looking for barrier gate systems for my warehouse.'
      },
      {
        timestamp: new Date(Date.now() + 10000).toISOString(),
        speaker: 'ai_agent',
        message: 'Hi Raj! I\'d be happy to help with barrier gate systems for your warehouse. Can you tell me more about the size and type of vehicles that will be using this entrance?'
      }
    ],
    summary: 'Ongoing call - warehouse barrier gate inquiry.',
    customerAudioFiles: [],
    agentAudioFiles: []
  }
];

async function testAICallIntegration() {
  try {
    console.log('🧪 Testing AI Call Recording Integration...');
    console.log(`📞 Sending ${sampleCallRecordings.length} sample call recordings to parking system...`);

    // Send sample data to parking system admin dashboard
    const response = await axios.post('http://localhost:8080/api/admin/ai-call-recordings', {
      recordings: sampleCallRecordings,
      source: 'vayaccess-ai-agent-test',
      syncTime: new Date().toISOString()
    });

    console.log('✅ Integration test successful!');
    console.log('📊 Response:', response.data);
    console.log('\n🎯 Now check the admin dashboard:');
    console.log('🔗 http://localhost:8080/admin/dashboard');
    console.log('\n📋 Login credentials:');
    console.log('👤 Username: admin');
    console.log('🔑 Password: admin123');
    console.log('\n🎉 You should see:');
    console.log('   • 3 AI call recordings in the dashboard');
    console.log('   • Call analytics (total, today, duration, status)');
    console.log('   • Detailed conversation transcripts');
    console.log('   • Customer and agent audio file tracking');
    console.log('   • Export functionality for call transcripts');

  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    
    if (error.response) {
      console.error('📝 Server Response:', error.response.data);
    }
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure parking system server is running on port 8080');
    console.log('2. Check that the admin dashboard API endpoints are working');
    console.log('3. Verify the admin server logs for any errors');
  }
}

// Run the test
testAICallIntegration();