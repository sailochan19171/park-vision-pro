const twilio = require('twilio');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

// Initialize Twilio and OpenAI clients safely (don't crash if env vars are missing)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (e) {
    console.warn('Twilio init failed:', e.message);
  }
} else {
  console.warn('Twilio disabled: missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN');
}

let openai = null;
if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch (e) {
    console.warn('OpenAI init failed:', e.message);
  }
} else {
  console.warn('OpenAI disabled: missing OPENAI_API_KEY');
}

// Parking solutions knowledge base for the AI agent
const PARKING_SOLUTIONS_KNOWLEDGE = `
You are an AI assistant for VayAccess Parking Solutions, a leading provider of smart parking and access control systems in India.

COMPANY INFORMATION:
- Company: VayAccess Parking Solutions
- Location: Hyderabad, Telangana, India
- Phone: +91 720 724 4344
- Email: info@vayaccess.com
- Business Hours: Monday-Friday 9:00 AM - 6:00 PM IST

PRODUCTS & SOLUTIONS:
1. Hybrid ANPR/FASTAG System - Combined automatic number plate recognition with FASTAG integration
2. Ticketless Parking Management System - Modern solution with mobile app integration
3. Ticket Based Parking Management System - Traditional automated dispensing and validation
4. ANPR Based Vehicle Access Control - Advanced camera-based recognition systems
5. Parking Guidance System - Real-time space availability and directional indicators
6. Parking Information System - Digital displays showing availability and pricing
7. Pedestrian Access Control System - Turnstiles and biometric authentication
8. ANPR Camera System For Toll Applications - High-accuracy toll plaza systems

BARRIER GATES & TURNSTILES:
- Smart barrier gates for vehicle access
- Flap barrier turnstiles for pedestrian control
- Swing gates with biometric authentication
- Tripod turnstiles for high-security areas
- Heavy-duty barriers for industrial use

TECHNOLOGY FEATURES:
- RFID card readers and biometric terminals
- Mobile app integration for payments
- Cloud-based management platforms
- LED parking indicators and guidance
- IoT integration and real-time analytics
- QR code and mobile access control

PRICING & CONSULTATION:
- Free site assessment and consultation available
- Custom pricing based on project requirements
- Complete installation and maintenance services
- 24/7 technical support available
- Training provided for staff

CONVERSATION GUIDELINES:
1. Always be professional and helpful
2. Ask relevant questions to understand customer needs
3. Provide specific product recommendations based on requirements
4. Mention free consultation and site assessment
5. Collect basic contact information if customer is interested
6. For complex technical queries, offer to connect with technical specialists
7. Always end with next steps (quote, consultation, or callback)

CALL-TO-ACTIONS:
- Schedule free consultation
- Request detailed quote
- Arrange site visit
- Connect with technical specialist
- Send product brochures via email

Remember: You are representing a professional parking solutions company. Be knowledgeable, helpful, and always aim to understand the customer's specific parking challenges to provide the best solutions.
`;

class VoiceAIService {
  constructor() {
    this.activeCall = null;
    this.conversationHistory = [];
    this.callRecordings = new Map();
  }

  // Initialize a new call session and make actual phone call
  async initializeCall(customerPhone, customerName = null) {
    try {
      console.log(` Making AI call to ${customerPhone}`);
      
      // Create a unique call session ID
      const callSessionId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Initialize conversation with system prompt
      this.conversationHistory = [{
        role: "system",
        content: PARKING_SOLUTIONS_KNOWLEDGE
      }];

      // Add customer context if name is provided
      if (customerName) {
        this.conversationHistory.push({
          role: "system",
          content: `The customer's name is ${customerName}. Greet them by name and ask how you can help with their parking solution needs.`
        });
      }

      // Store call session details
      this.activeCall = {
        sessionId: callSessionId,
        customerPhone: customerPhone,
        customerName: customerName,
        startTime: new Date(),
        status: 'calling',
        conversationHistory: []
      };

      // MAKE ACTUAL PHONE CALL USING TWILIO
      console.log(` Making actual phone call to ${customerPhone}...`);
      
      const call = await twilioClient.calls.create({
        to: customerPhone,
        from: process.env.TWILIO_PHONE_NUMBER,
        url: `${process.env.NGROK_URL || 'https://vayaccess.com'}/api/ai-call/twiml/${callSessionId}`,
        statusCallback: `${process.env.NGROK_URL || 'https://vayaccess.com'}/api/ai-call/status/${callSessionId}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        machineDetection: 'Enable',
        machineDetectionTimeout: 5,
        record: true
      });

      console.log(` Twilio call initiated with SID: ${call.sid}`);
      
      // Update call with Twilio SID
      this.activeCall.twilioCallSid = call.sid;
      this.activeCall.status = 'calling';

      return {
        success: true,
        sessionId: callSessionId,
        twilioCallSid: call.sid,
        message: `AI agent is calling ${customerPhone}. Please answer your phone!`
      };

    } catch (error) {
      console.error(' Error initializing call:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate AI response to customer input
  async generateAIResponse(customerMessage, sessionId) {
    try {
      console.log(` Generating AI response for session ${sessionId}`);
      console.log(` Customer said: "${customerMessage}"`);

      // Add customer message to conversation history
      this.conversationHistory.push({
        role: "user",
        content: customerMessage
      });

      // Generate response using OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: this.conversationHistory,
        max_tokens: 200,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const aiResponse = completion.choices[0].message.content;
      
      // Add AI response to conversation history
      this.conversationHistory.push({
        role: "assistant", 
        content: aiResponse
      });

      // Store conversation in active call
      if (this.activeCall && this.activeCall.sessionId === sessionId) {
        this.activeCall.conversationHistory.push({
          timestamp: new Date(),
          speaker: 'customer',
          message: customerMessage
        });
        this.activeCall.conversationHistory.push({
          timestamp: new Date(),
          speaker: 'ai_agent',
          message: aiResponse
        });
      }

      console.log(` AI Response: "${aiResponse}"`);

      return {
        success: true,
        response: aiResponse,
        sessionId: sessionId
      };

    } catch (error) {
      console.error(' Error generating AI response:', error);
      return {
        success: false,
        error: error.message,
        response: "I apologize, but I'm having trouble processing that right now. Let me connect you with one of our technical specialists who can assist you better."
      };
    }
  }

  // Convert text to speech for AI responses
  async textToSpeech(text, sessionId) {
    try {
      console.log(` Converting text to speech for session ${sessionId}`);
      console.log(` Text to convert: "${text}"`);
      
      // Use OpenAI's TTS API
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy", // Professional, clear voice
        input: text,
        speed: 1.0
      });

      // Save audio file with timestamp
      const timestamp = Date.now();
      const audioFileName = `agent_voice_${sessionId}_${timestamp}.mp3`;
      const audioPath = path.join(__dirname, '../recordings/tts/', audioFileName);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(audioPath), { recursive: true });
      
      const buffer = Buffer.from(await mp3.arrayBuffer());
      await fs.writeFile(audioPath, buffer);

      console.log(` AI agent voice saved: ${audioPath}`);

      // Track AI agent audio in call session
      if (this.activeCall && this.activeCall.sessionId === sessionId) {
        if (!this.activeCall.agentAudioFiles) {
          this.activeCall.agentAudioFiles = [];
        }
        this.activeCall.agentAudioFiles.push({
          filename: audioFileName,
          path: audioPath,
          text: text,
          timestamp: new Date(timestamp).toISOString(),
          duration: Math.ceil(text.length / 10) // Estimate duration based on text length
        });
      }

      return {
        success: true,
        audioFile: audioFileName,
        audioPath: audioPath,
        message: 'AI agent voice generated and saved successfully'
      };

    } catch (error) {
      console.error(' Error in text-to-speech:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to generate AI agent voice'
      };
    }
  }

  // Convert speech to text for customer input  
  async speechToText(audioBuffer, sessionId) {
    try {
      console.log(` Converting speech to text for session ${sessionId}`);
      console.log(` Audio buffer size: ${audioBuffer.length} bytes`);
      
      // Save temporary audio file with proper format
      const tempAudioFile = path.join(__dirname, `../temp/stt_${sessionId}_${Date.now()}.webm`);
      await fs.mkdir(path.dirname(tempAudioFile), { recursive: true });
      await fs.writeFile(tempAudioFile, audioBuffer);

      console.log(` Audio saved to: ${tempAudioFile}`);

      try {
        // Use OpenAI's Whisper API for speech-to-text
        const fileStream = require('fs').createReadStream(tempAudioFile);
        
        const transcript = await openai.audio.transcriptions.create({
          file: fileStream,
          model: "whisper-1",
          language: "en", // Auto-detect or specify language
          response_format: "text"
        });

        console.log(` Transcription successful: "${transcript}"`);

        // Store the customer audio recording with timestamp
        const timestamp = Date.now();
        const customerFileName = `customer_${sessionId}_${timestamp}.webm`;
        const customerRecording = path.join(__dirname, `../recordings/customer_audio/${customerFileName}`);
        await fs.mkdir(path.dirname(customerRecording), { recursive: true });
        await fs.copyFile(tempAudioFile, customerRecording);

        console.log(` Customer audio saved: ${customerRecording}`);

        // Track customer audio in call session
        if (this.activeCall && this.activeCall.sessionId === sessionId) {
          if (!this.activeCall.customerAudioFiles) {
            this.activeCall.customerAudioFiles = [];
          }
          this.activeCall.customerAudioFiles.push({
            filename: customerFileName,
            path: customerRecording,
            transcription: transcript,
            timestamp: new Date(timestamp).toISOString(),
            format: 'webm'
          });
        }

        // Clean up temporary file
        await fs.unlink(tempAudioFile);

        return {
          success: true,
          transcription: transcript,
          audioRecording: customerRecording,
          message: 'Customer voice processed and saved successfully'
        };

      } catch (whisperError) {
        console.error(' Whisper API error:', whisperError);
        
        // Clean up temporary file
        try {
          await fs.unlink(tempAudioFile);
        } catch (unlinkError) {
          console.error(' Error cleaning up temp file:', unlinkError);
        }

        return {
          success: false,
          error: `Speech recognition failed: ${whisperError.message}`,
          transcription: "[Could not transcribe audio - please try typing your message]"
        };
      }

    } catch (error) {
      console.error(' Error in speech-to-text:', error);
      return {
        success: false,
        error: error.message,
        transcription: "[Could not transcribe audio - please try typing your message]"
      };
    }
  }

  // End call and save recording with conversation log
  async endCall(sessionId, callDuration) {
    try {
      console.log(` Ending call session ${sessionId}`);

      if (!this.activeCall || this.activeCall.sessionId !== sessionId) {
        throw new Error('No active call session found');
      }

      // Finalize call details
      const callData = {
        ...this.activeCall,
        endTime: new Date(),
        duration: callDuration,
        status: 'completed',
        summary: await this.generateCallSummary()
      };

      // Save call recording and conversation to database/file
      const callLogPath = path.join(__dirname, '../recordings/call_logs/', `call_log_${sessionId}.json`);
      await fs.mkdir(path.dirname(callLogPath), { recursive: true });
      await fs.writeFile(callLogPath, JSON.stringify(callData, null, 2));

      // Store in memory for quick admin access
      this.callRecordings.set(sessionId, callData);

      // Reset active call
      this.activeCall = null;
      this.conversationHistory = [];

      console.log(` Call ${sessionId} ended and saved successfully`);

      return {
        success: true,
        callData: callData,
        message: 'Call ended and recorded successfully'
      };

    } catch (error) {
      console.error(' Error ending call:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate call summary using AI
  async generateCallSummary() {
    try {
      if (!this.conversationHistory || this.conversationHistory.length === 0) {
        return "No conversation to summarize";
      }

      const summaryPrompt = {
        role: "user",
        content: `Please provide a concise summary of this customer call including:
        1. Customer's main parking requirements/challenges
        2. Solutions discussed
        3. Next steps or follow-up actions needed
        4. Customer interest level (High/Medium/Low)
        5. Recommended products/services mentioned
        
        Keep the summary professional and action-oriented for the admin dashboard.`
      };

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [...this.conversationHistory, summaryPrompt],
        max_tokens: 150,
        temperature: 0.3
      });

      return completion.choices[0].message.content;

    } catch (error) {
      console.error(' Error generating call summary:', error);
      return "Error generating summary - please review call transcript";
    }
  }

  // Get all call recordings for admin dashboard
  async getCallRecordings() {
    try {
      const recordingsDir = path.join(__dirname, '../recordings/call_logs/');
      
      try {
        const files = await fs.readdir(recordingsDir);
        const callLogs = [];

        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(recordingsDir, file);
            const data = await fs.readFile(filePath, 'utf8');
            callLogs.push(JSON.parse(data));
          }
        }

        // Sort by start time (newest first)
        callLogs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

        return {
          success: true,
          recordings: callLogs
        };

      } catch (dirError) {
        // Directory doesn't exist yet
        return {
          success: true,
          recordings: []
        };
      }

    } catch (error) {
      console.error(' Error fetching call recordings:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get specific call recording
  async getCallRecording(sessionId) {
    try {
      const callLogPath = path.join(__dirname, '../recordings/call_logs/', `call_log_${sessionId}.json`);
      const data = await fs.readFile(callLogPath, 'utf8');
      
      return {
        success: true,
        recording: JSON.parse(data)
      };

    } catch (error) {
      console.error(' Error fetching call recording:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Save call recording and generate summary (called when call ends)
  async saveCallRecording(sessionId, callStatus) {
    try {
      console.log(` Saving call recording for session ${sessionId} with status ${callStatus}`);
      
      if (!this.activeCall || this.activeCall.sessionId !== sessionId) {
        console.log(' No active call found for session:', sessionId);
        return { success: false, error: 'No active call found' };
      }
      
      // Generate conversation summary using AI
      let summary = '';
      if (this.conversationHistory.length > 1) {
        try {
          const summaryPrompt = [{
            role: "system",
            content: "Summarize this customer call conversation. Include: customer's main requirements, solutions discussed, next steps, and any contact information collected. Keep it concise and professional."
          }, ...this.conversationHistory];
          
          const summaryResponse = await openai.chat.completions.create({
            model: "gpt-4",
            messages: summaryPrompt,
            max_tokens: 200,
            temperature: 0.3
          });
          
          summary = summaryResponse.choices[0].message.content;
        } catch (error) {
          console.error(' Error generating call summary:', error);
          summary = 'Summary generation failed';
        }
      } else {
        summary = 'Call ended without conversation';
      }
      
      // Create call record
      const callRecord = {
        sessionId: sessionId,
        customerPhone: this.activeCall.customerPhone,
        customerName: this.activeCall.customerName || 'Unknown',
        startTime: this.activeCall.startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: Math.round((new Date() - this.activeCall.startTime) / 1000),
        status: callStatus,
        conversationHistory: this.conversationHistory.filter(msg => msg.role !== 'system'),
        summary: summary,
        twilioCallSid: this.activeCall.twilioCallSid || null
      };
      
      // Ensure recordings directory exists
      const recordingsDir = path.join(__dirname, '../recordings/call_logs/');
      await fs.mkdir(recordingsDir, { recursive: true });
      
      // Save to file
      const callLogPath = path.join(recordingsDir, `call_log_${sessionId}.json`);
      await fs.writeFile(callLogPath, JSON.stringify(callRecord, null, 2));
      console.log(` Call record saved: ${callLogPath}`);
      
      // Clear active call
      this.activeCall = null;
      this.conversationHistory = [];
      
      return { success: true, callRecord };
      
    } catch (error) {
      console.error(' Error saving call recording:', error);
      return { success: false, error: error.message };
    }
  }

  // Get current call status
  getCurrentCallStatus() {
    return {
      hasActiveCall: !!this.activeCall,
      activeCall: this.activeCall,
      conversationLength: this.conversationHistory.length
    };
  }
}

module.exports = new VoiceAIService();
