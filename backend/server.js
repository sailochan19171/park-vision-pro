require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const voiceAIService = require('./services/voiceAIService');
const asteriskService = require('./services/asteriskService');

// MongoDB Atlas (replaces Firestore for subscribers/tokens)
const { MongoClient } = require('mongodb');
let mongoClient = null;
let mongoDb = null;
(async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'vayaccess';
  if (!uri) {
    console.warn('MongoDB not initialized: missing MONGODB_URI. Newsletter persistence will be disabled.');
    return;
  }

  // Attempt robust connection strategy for Windows/OpenSSL TLS issues
  async function tryConnect(optionsLabel, options) {
    try {
      mongoClient = new MongoClient(uri, options);
      await mongoClient.connect();
      mongoDb = mongoClient.db(dbName);
      console.log(`Connected to MongoDB Atlas database: ${dbName} (${optionsLabel})`);
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn(`MongoDB connect failed [${optionsLabel}]:`, msg);
      return false;
    }
  }

  const baseOptions = {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
    tls: true,
  };

  const insecureEnv = process.env.MONGODB_TLS_INSECURE === 'true';

  // 1) If insecure explicitly requested via env, use it directly
  if (insecureEnv) {
    const ok = await tryConnect('tls+insecure (env)', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
    if (!ok) {
      console.warn('MongoDB initialization failed under insecure mode. Newsletter persistence will be disabled.');
    } else {
      // Ensure indexes for deduplication and idempotency
      try {
        await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
        await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
        await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
        console.log('MongoDB indexes ensured');
      } catch (idxErr) {
        console.warn('MongoDB index ensure failed:', idxErr.message);
      }
    }
    return;
  }

  // 2) Try strict TLS first
  let connected = await tryConnect('tls strict', { ...baseOptions });

  // 3) If fails, try strict TLS forcing IPv4 (DNS/IPv6 issues)
  if (!connected) {
    connected = await tryConnect('tls strict + IPv4', { ...baseOptions, family: 4 });
  }

  // 4) If still fails with SSL-related error, try insecure TLS as fallback
  if (!connected) {
    connected = await tryConnect('tls+insecure fallback', {
      ...baseOptions,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      family: 4,
    });
  }

  if (!connected) {
    console.warn('MongoDB initialization failed after all attempts. Newsletter persistence will be disabled.');
    return;
  }

  // Ensure indexes for deduplication and idempotency
  try {
    await mongoDb.collection('subscribers').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('pushTokens').createIndex({ token: 1 }, { unique: true });
    await mongoDb.collection('announcements_sent').createIndex({ version: 1 }, { unique: true });
    console.log('MongoDB indexes ensured');
  } catch (idxErr) {
    console.warn('MongoDB index ensure failed:', idxErr.message);
  }
})();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize Socket.IO for real-time call communication
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
    credentials: true
  }
});

// Configure multer for audio file uploads
const upload = multer({
  dest: 'temp/', // temporary directory for uploaded audio files
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000', 'https://vayaccess.com', 'https://vayaccess-59fdd.web.app'],
  credentials: true
}));
app.use(express.json());

// Demo routes (FREE - no Twilio needed)
const demoRoutes = require('./routes/demo');
app.use('/api', demoRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', mongo: !!mongoDb });
});

// Connect to Asterisk AMI on server start (optional via ENABLE_AMI)
if (process.env.ENABLE_AMI === 'true') {
  asteriskService.connect().catch(err => {
    console.error(' Failed to connect to Asterisk AMI:', err);
  });
} else {
  console.log(' Skipping AMI connection (ENABLE_AMI not set to true)');
}

// API endpoint to initiate call via Asterisk AMI
app.post('/api/call', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    if (!asteriskService.isAlive()) {
      await asteriskService.connect();
    }

    const result = await asteriskService.originateCall(number);

    if (result.success) {
      // Emit call status to frontend clients
      io.emit('call-status-changed', {
        sessionId: result.sessionId,
        phoneNumber: number,
        status: 'initiated',
        timestamp: new Date()
      });
    }

    res.json(result);
  } catch (error) {
    console.error(' Error originating call:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

// Listen for call-originated event from asteriskService and broadcast
asteriskService.on('call-originated', (data) => {
  io.emit('call-status-changed', {
    sessionId: data.sessionId,
    phoneNumber: data.customerPhone,
    status: 'ringing',
    timestamp: new Date()
  });
});

// Socket.IO connection handling for real-time call features
io.on('connection', (socket) => {
  console.log(` Client connected: ${socket.id}`);

  socket.on('join-call-room', (sessionId) => {
    socket.join(`call-${sessionId}`);
    console.log(` Client joined call room: call-${sessionId}`);
  });

  socket.on('call-status-update', (data) => {
    io.to(`call-${data.sessionId}`).emit('call-status-changed', data);
  });

  socket.on('disconnect', () => {
    console.log(` Client disconnected: ${socket.id}`);
  });
});

// Email configuration using SMTP (Gmail/Outlook/Custom SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false otherwise
  auth: {
    user: process.env.SMTP_USER, // info@vayaccess.com
    pass: process.env.SMTP_PASS  // App-specific password
  }
});

// Verify email configuration
transporter.verify((error, success) => {
  if (error) {
    console.error(' Email configuration error:', error);
  } else {
    console.log(' Email server is ready to send messages');
  }
});

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }
    
    console.log(' Processing contact form submission:', { name, email, message });
    
    // 1. Send notification to info@vayaccess.com
    const adminNotificationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: 'info@vayaccess.com',
      replyTo: email, // Allows replying directly to the customer
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <!-- Header-style summary block to mirror desired format -->
          <div style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 6px 0; font-weight: 700; color: #111827;">Thank you for contacting VayAccess - Response within 2 hours</p>
            <p style="margin: 0 0 6px 0; color: #374151;">VayAccess Support Team &lt;info@vayaccess.com&gt;</p>
            <p style="margin: 0 0 6px 0; color: #6b7280;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            <p style="margin: 0; color: #6b7280;">to ${name}</p>
          </div>

          <div style="background: white; padding: 24px;">
            <h1 style="margin: 0 0 10px 0; font-size: 22px; color: #059669;">Message Received Successfully</h1>
            <p style="margin: 6px 0 20px 0; color: #6b7280;">Thank you for contacting VayAccess</p>

            <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">Dear <strong>${name}</strong>,</p>
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>

            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
              <h3 style="color: #2563eb; margin: 0 0 10px 0; font-size: 16px;">Your Message Summary</h3>
              <div style="background: white; padding: 12px; border-radius: 6px; color: #6b7280; font-style: italic;">
                "${message}"
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #059669; margin: 0 0 10px 0; font-size: 18px;">What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>

            <div style="background: #fff7ed; border: 1px solid #fb923c; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h3 style="color: #c2410c; margin: 0 0 10px 0; font-size: 16px;">Need Immediate Assistance?</h3>
              <p style="margin: 0; color: #92400e;"><a href="tel:+917207244344" style="color: #2563eb; text-decoration: none;">+91 720 724 4344</a> • <a href="https://wa.me/917207244344" style="color: #10b981; text-decoration: none;">WhatsApp</a> • <a href="mailto:info@vayaccess.com" style="color: #6b7280; text-decoration: none;">Email</a></p>
            </div>

            <div style="margin: 20px 0; text-align: center;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Visit Our Website</a>
            </div>

            <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; color: #6b7280; font-size: 14px;">
              <p style="margin: 0 0 6px 0;"><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 12px 0 0 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 12px;">
                This is an automated confirmation. Please save this email for your records.
              </p>

              <p style="text-align:center; color:#6b7280; font-size: 13px; margin-top: 16px;">
                <strong>Customer Details:</strong> ${name} • <a href="mailto:${email}" style="color:#2563eb; text-decoration:none;">${email}</a>
              </p>
            </div>
          </div>
        </div>
      `,
      text: `Thank you for contacting VayAccess - Response within 2 hours
VayAccess Support Team <info@vayaccess.com>
${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
to ${name}

Message Received Successfully
Thank you for contacting VayAccess

Dear ${name},
Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.

Your Message Summary
"${message}"

What Happens Next?
Quick Response: Our technical specialists will respond within 2 hours during business hours
Detailed Analysis: We'll review your requirements and provide customized recommendations
Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

Need Immediate Assistance?
+91 720 724 4344  WhatsApp  Email

Visit Our Website
Business Hours: Monday - Friday: 9:00 AM - 6:00 PM IST

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Customer Details: ${name} • ${email}

This is an automated confirmation. Please save this email for your records.`
    };
    
    // 2. Send auto-confirmation to customer
    const customerConfirmationEmail = {
      from: `"VayAccess Support Team" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thank you for contacting VayAccess - Response within 2 hours',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;"> Message Received Successfully</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for contacting VayAccess</p>
          </div>
          
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; color: #374151; margin-bottom: 25px;">Dear <strong>${name}</strong>,</p>
            
            <p style="color: #374151; line-height: 1.6; margin-bottom: 20px;">
              Thank you for contacting VayAccess regarding your parking solution requirements. We have successfully received your inquiry.
            </p>
            
            <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 15px 0; font-size: 16px;">📝 Your Message Summary</h3>
              <div style="background: white; padding: 15px; border-radius: 6px;">
                <p style="margin: 0; color: #6b7280; font-style: italic;">"${message.length > 200 ? message.substring(0, 200) + '...' : message}"</p>
              </div>
            </div>
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 25px; margin: 25px 0;">
              <h3 style="color: #059669; margin: 0 0 15px 0; font-size: 18px;">⏰ What Happens Next?</h3>
              <ul style="color: #065f46; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li><strong>Quick Response:</strong> Our technical specialists will respond within 2 hours during business hours</li>
                <li><strong>Detailed Analysis:</strong> We'll review your requirements and provide customized recommendations</li>
                <li><strong>Complete Solution:</strong> You'll receive pricing estimates, product suggestions, and implementation timelines</li>
              </ul>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="color: #d97706; margin: 0 0 10px 0; font-size: 16px;"> Need Immediate Assistance?</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <a href="tel:+917207244344" style="background: #2563eb; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;">📱 +91 720 724 4344</a>
                <a href="https://wa.me/917207244344" style="background: #10b981; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;">💬 WhatsApp</a>
                <a href="mailto:info@vayaccess.com" style="background: #6b7280; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;">✉️ Email</a>
              </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://vayaccess.com" style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                🌐 Visit Our Website
              </a>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 14px;">
              <p><strong>Business Hours:</strong> Monday - Friday: 9:00 AM - 6:00 PM IST</p>
              <p style="margin: 15px 0;">
                <strong>VayAccess Parking Solutions</strong><br>
                Plot No. 26, Road No.1, West Gandhi Nagar<br>
                Rampally X Road, Nagaram, Keesara (M)<br>
                Hyderabad - 500083, TS, India
              </p>
              <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
                This is an automated confirmation. Please save this email for your records.
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
Dear ${name},

Thank you for contacting VayAccess regarding your parking solution requirements.

YOUR MESSAGE:
"${message}"

WHAT HAPPENS NEXT:
• Quick Response: Our technical specialists will respond within 2 hours during business hours
• Detailed Analysis: We'll review your requirements and provide customized recommendations  
• Complete Solution: You'll receive pricing estimates, product suggestions, and implementation timelines

NEED IMMEDIATE ASSISTANCE?
Phone: +91 70137 99462
WhatsApp: +91 70137 99462
Email: info@vayaccess.com

BUSINESS HOURS:
Monday - Friday: 9:00 AM - 6:00 PM IST

Best regards,
VayAccess Support Team

VayAccess Parking Solutions
Plot No. 26, Road No.1, West Gandhi Nagar
Rampally X Road, Nagaram, Keesara (M)
Hyderabad - 500083, TS, India

Website: https://vayaccess.com
      `
    };
    
    // Send both emails
    console.log(' Sending admin notification...');
    await transporter.sendMail(adminNotificationEmail);
    console.log(' Admin notification sent successfully');
    
    console.log(' Sending customer confirmation...');
    await transporter.sendMail(customerConfirmationEmail);
    console.log(' Customer confirmation sent successfully');
    
    res.json({
      success: true,
      message: 'Thank you for your inquiry! We have received your message and sent a confirmation to your email. Our team will respond within 2 hours during business hours.'
    });
    
  } catch (error) {
    console.error(' Contact form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.'
    });
  }
});

// =============================================================================
// AI CALL AGENT API ENDPOINTS
// =============================================================================

// Initialize AI call session
app.post('/api/ai-call/initialize', async (req, res) => {
  try {
    const { customerPhone, customerName } = req.body;
    
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Customer phone number is required'
      });
    }
    
    console.log(` Initializing AI call for ${customerPhone}`);
    const result = await voiceAIService.initializeCall(customerPhone, customerName);
    
    if (result.success) {
      // Notify admin dashboard of new call
      io.emit('new-call-initialized', {
        sessionId: result.sessionId,
        customerPhone,
        customerName,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error initializing AI call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize AI call session'
    });
  }
});

// Process voice input and get AI response
app.post('/api/ai-call/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Message and session ID are required'
      });
    }
    
    console.log(` Processing chat for session ${sessionId}: "${message}"`);
    const result = await voiceAIService.generateAIResponse(message, sessionId);
    
    // Broadcast conversation update to admin dashboard
    io.emit('call-conversation-update', {
      sessionId,
      customerMessage: message,
      aiResponse: result.response,
      timestamp: new Date()
    });
    
    res.json(result);
  } catch (error) {
    console.error(' Error processing AI chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process conversation'
    });
  }
});

// Convert speech to text
app.post('/api/ai-call/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!req.file || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Audio file and session ID are required'
      });
    }
    
    console.log(` Processing speech-to-text for session ${sessionId}`);
    const audioBuffer = require('fs').readFileSync(req.file.path);
    const result = await voiceAIService.speechToText(audioBuffer, sessionId);
    
    // Clean up uploaded file
    require('fs').unlinkSync(req.file.path);
    
    res.json(result);
  } catch (error) {
    console.error(' Error in speech-to-text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process speech'
    });
  }
});

// Convert text to speech
app.post('/api/ai-call/text-to-speech', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Text and session ID are required'
      });
    }
    
    console.log(` Converting text to speech for session ${sessionId}`);
    const result = await voiceAIService.textToSpeech(text, sessionId);
    
    if (result.success) {
      // Send audio file path for client to download
      res.json({
        ...result,
        audioUrl: `/api/ai-call/audio/${result.audioFile}`
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error(' Error in text-to-speech:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate speech'
    });
  }
});

// Serve generated audio files
app.get('/api/ai-call/audio/:filename', (req, res) => {
  try {
    const audioPath = require('path').join(__dirname, 'recordings/tts/', req.params.filename);
    res.sendFile(audioPath);
  } catch (error) {
    console.error(' Error serving audio file:', error);
    res.status(404).json({ success: false, message: 'Audio file not found' });
  }
});

// =============================================================================
// TWILIO VOICE CALL WEBHOOKS (For Real Phone Calls)
// =============================================================================

// Initial TwiML when call is answered
app.post('/api/ai-call/twiml/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(` Call answered for session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Welcome message
    const welcomeMessage = `Hello! This is the AI assistant from VayAccess Parking Solutions. Thank you for your interest in our smart parking systems. How can I help you with your parking solution needs today?`;
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, welcomeMessage);
    
    // Gather customer's voice input
    const gather = twiml.gather({
      speechTimeout: 3,
      speechModel: 'experimental_conversations',
      enhanced: true,
      input: 'speech',
      action: `/api/ai-call/voice-response/${sessionId}`,
      method: 'POST'
    });
    
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please tell me about your parking requirements.');
    
    // If no input, try again
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I did not hear anything. Please speak clearly about your parking needs.');
    
    twiml.redirect(`/api/ai-call/twiml/${sessionId}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error generating TwiML:', error);
    res.status(500).send('Error processing call');
  }
});

// Handle customer voice input and AI response
app.post('/api/ai-call/voice-response/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const customerSpeech = req.body.SpeechResult || '';
    const callSid = req.body.CallSid;
    
    console.log(` Customer said: "${customerSpeech}" in session ${sessionId}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    if (!customerSpeech) {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I could not understand what you said. Let me connect you with our human specialist.');
      
      twiml.say({
        voice: 'alice', 
        language: 'en-US'
      }, 'Please call us directly at +91 720 724 4344 for immediate assistance. Thank you!');
      
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }
    
    // Generate AI response using the voice service
    const aiResponse = await voiceAIService.generateAIResponse(customerSpeech, sessionId);
    
    if (aiResponse.success) {
      // Broadcast conversation update to frontend
      io.emit('call-conversation-update', {
        sessionId,
        customerMessage: customerSpeech,
        aiResponse: aiResponse.response,
        timestamp: new Date()
      });
      
      // Say AI response
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, aiResponse.response);
      
      // Continue conversation - check if call should end
      if (aiResponse.response.toLowerCase().includes('goodbye') || 
          aiResponse.response.toLowerCase().includes('thank you for calling') ||
          aiResponse.response.toLowerCase().includes('have a great day')) {
        twiml.hangup();
      } else {
        // Continue gathering input
        const gather = twiml.gather({
          speechTimeout: 4,
          speechModel: 'experimental_conversations',
          enhanced: true,
          input: 'speech',
          action: `/api/ai-call/voice-response/${sessionId}`,
          method: 'POST'
        });
        
        gather.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Is there anything else I can help you with regarding parking solutions?');
        
        // Timeout fallback
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Thank you for calling VayAccess. Have a great day!');
        twiml.hangup();
      }
    } else {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I apologize, but I am having technical difficulties. Please call our office at +91 720 724 4344 for immediate assistance. Thank you!');
      twiml.hangup();
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error(' Error processing voice response:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am experiencing technical difficulties. Please call +91 720 724 4344 for support. Goodbye!');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle call status updates from Twilio
app.post('/api/ai-call/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const callStatus = req.body.CallStatus;
    const callSid = req.body.CallSid;
    
    console.log(` Call status update for session ${sessionId}: ${callStatus}`);
    
    // Broadcast status update to frontend
    io.emit('call-status-changed', {
      sessionId,
      callSid,
      status: callStatus,
      timestamp: new Date()
    });
    
    // Handle call completion
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      console.log(` Call ${callSid} ended with status: ${callStatus}`);
      
      // Save call recording and summary
      try {
        await voiceAIService.saveCallRecording(sessionId, callStatus);
      } catch (error) {
        console.error(' Error saving call recording:', error);
      }
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error(' Error handling call status:', error);
    res.status(500).send('Error processing status update');
  }
});

// End call session
app.post('/api/ai-call/end', async (req, res) => {
  try {
    const { sessionId, callDuration } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    console.log(` Ending call session ${sessionId}`);
    const result = await voiceAIService.endCall(sessionId, callDuration);
    
    if (result.success) {
      // Notify admin dashboard of call completion
      io.emit('call-ended', {
        sessionId,
        callData: result.callData,
        timestamp: new Date()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error(' Error ending call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end call session'
    });
  }
});

// Get current call status
app.get('/api/ai-call/status', async (req, res) => {
  try {
    const status = voiceAIService.getCurrentCallStatus();
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error(' Error getting call status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call status'
    });
  }
});

// =============================================================================
// ADMIN DASHBOARD API ENDPOINTS
// =============================================================================

// Get all call recordings (Admin only)
app.get('/api/admin/call-recordings', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    console.log(' Admin fetching call recordings');
    const result = await voiceAIService.getCallRecordings();
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recordings'
    });
  }
});

// Get specific call recording (Admin only)
app.get('/api/admin/call-recording/:sessionId', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const { sessionId } = req.params;
    console.log(` Admin fetching call recording for session ${sessionId}`);
    
    const result = await voiceAIService.getCallRecording(sessionId);
    res.json(result);
  } catch (error) {
    console.error(' Error fetching call recording:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call recording'
    });
  }
});

// Admin dashboard statistics
app.get('/api/admin/call-statistics', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    const stats = {
      totalCalls: recordings.recordings.length,
      todayCalls: recordings.recordings.filter(call => {
        const today = new Date().toDateString();
        return new Date(call.startTime).toDateString() === today;
      }).length,
      averageDuration: recordings.recordings.reduce((acc, call) => acc + (call.duration || 0), 0) / recordings.recordings.length || 0,
      callsThisWeek: recordings.recordings.filter(call => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(call.startTime) >= weekAgo;
      }).length
    };

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error(' Error generating call statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate statistics'
    });
  }
});

// Send AI call recordings to parking system admin dashboard
app.post('/api/admin/sync-call-recordings', async (req, res) => {
  try {
    console.log(' Syncing AI call recordings with parking system admin dashboard...');
    
    const recordings = await voiceAIService.getCallRecordings();
    
    if (!recordings.success) {
      return res.status(500).json(recordings);
    }

    // Send recordings to parking system admin dashboard
    const parkingSystemUrl = 'http://localhost:8080';
    
    try {
      const axios = require('axios');
      
      const syncResponse = await axios.post(`${parkingSystemUrl}/api/admin/ai-call-recordings`, {
        recordings: recordings.recordings,
        source: 'vayaccess-ai-agent',
        syncTime: new Date().toISOString()
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(' Successfully synced AI call recordings to parking system');
      
      res.json({
        success: true,
        message: 'AI call recordings synced successfully',
        recordingsSynced: recordings.recordings.length,
        parkingSystemResponse: syncResponse.data
      });

    } catch (syncError) {
      console.log('⚠️ Parking system not available for sync, continuing with local storage');
      
      res.json({
        success: true,
        message: 'Recordings available locally, parking system sync will retry automatically',
        recordingsSynced: recordings.recordings.length,
        localRecordings: recordings.recordings
      });
    }

  } catch (error) {
    console.error(' Error syncing call recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync call recordings'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test email endpoint (for development)
app.post('/api/test-email', async (req, res) => {
  try {
    const testEmail = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: 'VayAccess Email Service Test',
      html: '<h1>Email service is working!</h1><p>This is a test email from your VayAccess backend.</p>'
    };
    
    await transporter.sendMail(testEmail);
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Newsletter subscription endpoint (sends admin notification + welcome email)
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email, source = 'footer' } = req.body || {};

    // Basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // 1) Notify admin
    const adminEmail = {
      from: `"VayAccess Newsletter" <${process.env.SMTP_USER}>`,
      to: 'info@vayaccess.com',
      subject: 'New Newsletter Subscription',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="margin:0 0 10px 0;">New Newsletter Subscription</h2>
          <p style="margin:0 0 6px 0; color:#374151;">A new user has subscribed to the newsletter.</p>
          <div style="margin:16px 0; padding:12px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px;">
            <p style="margin:6px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin:6px 0;"><strong>Source:</strong> ${source}</p>
            <p style="margin:6px 0;"><strong>Time:</strong> ${nowIST}</p>
          </div>
          <p style="font-size:12px; color:#9ca3af;">This is an automated notification.</p>
        </div>
      `
    };

    // 2) Welcome email to subscriber
    const welcomeEmail = {
      from: `"VayAccess Team" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Welcome to VayAccess Newsletter! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #2563eb, #3b82f6); color: white; padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 22px;">Welcome to VayAccess Newsletter</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">Thanks for subscribing!</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color:#374151;">You'll now receive:</p>
            <ul style="color:#374151; line-height:1.8;">
              <li>Latest parking technology insights</li>
              <li>Product updates and announcements</li>
              <li>Industry best practices</li>
              <li>Exclusive offers</li>
            </ul>
            <p style="margin-top: 16px; color:#6b7280;">Visit our website: <a href="https://vayaccess.com" style="color:#2563eb; text-decoration:none;">vayaccess.com</a></p>
            <p style="margin-top: 16px; color:#9ca3af; font-size:12px;">You can unsubscribe anytime by replying to this email.</p>
          </div>
        </div>
      `
    };

    await Promise.all([
      transporter.sendMail(adminEmail),
      transporter.sendMail(welcomeEmail)
    ]);

    // 3) Persist subscriber to MongoDB (server-side) if available
    try {
      if (mongoDb) {
        const normalizedEmail = String(email).trim().toLowerCase();
        await mongoDb.collection('subscribers').updateOne(
          { email: normalizedEmail },
          {
            $set: { email: normalizedEmail, source, active: true, updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
        );
      } else {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
      }
    } catch (persistErr) {
      console.warn('Failed to persist subscriber to MongoDB (continuing):', persistErr);
    }

    // Success
    return res.json({ success: true, message: 'Subscribed successfully. Emails sent.' });
  } catch (error) {
    console.error('Newsletter subscribe failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to subscribe' });
  }
});

// Simple secured endpoint to send an update email to a recipient
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: to, subject, and html or text' });
    }

    const mail = {
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    };

    await transporter.sendMail(mail);
    return res.json({ success: true, message: 'Email sent.' });
  } catch (error) {
    console.error('Send update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// Broadcast to all subscribers (MongoDB)
app.post('/api/newsletter/broadcast', async (req, res) => {
  try {
    // security
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) {
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    const { subject, html, text, dryRun = false, onlyActive = true } = req.body || {};
    if (!subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: subject and html or text' });
    }

    // fetch subscribers from MongoDB
    const filter = onlyActive ? { active: { $ne: false } } : {};
    const subsCursor = mongoDb.collection('subscribers').find(filter, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray())
      .map(d => d.email)
      .filter(e => /.+@.+\..+/.test(e));

    if (emails.length === 0) {
      return res.json({ success: true, message: 'No subscribers to send', count: 0, emails: [] });
    }

    if (dryRun) {
      return res.json({ success: true, message: 'Dry run: would send to these emails', count: emails.length, emails });
    }

    // send in sequence (simple). For large lists, batch/queue.
    let ok = 0, fail = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject,
          html: html || undefined,
          text: text || undefined,
        });
        ok++;
      } catch (e) {
        fail++;
      }
    }

    return res.json({ success: true, message: 'Broadcast completed', sent: ok, failed: fail, count: emails.length });
  } catch (error) {
    console.error('Broadcast failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to broadcast' });
  }
});

// Push token registration (MongoDB) — dev-safe fallback
app.post('/api/push/register', async (req, res) => {
  try {
    const { token, email } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'Missing token' });

    // If MongoDB is unavailable and dev fallback enabled, no-op to avoid UX break
    if (!mongoDb) {
      if (process.env.ALLOW_DEV_NO_DB === 'true') {
        console.warn('Skipping MongoDB persistence: mongoDb not initialized');
        return res.json({ success: true, message: 'Token accepted (no DB in dev)' });
      }
      return res.status(500).json({ success: false, message: 'MongoDB not initialized' });
    }

    await mongoDb.collection('pushTokens').updateOne(
      { token },
      {
        $set: {
          token,
          email: email || null,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Token registered' });
  } catch (e) {
    console.error('Register push token failed:', e);
    return res.status(500).json({ success: false, message: 'Failed to register token' });
  }
});

// --- Helpers for FCM HTTP v1 (web push) ---
const { google } = require('googleapis');
const fetch = require('node-fetch');
let FB_PROJECT_ID = process.env.FB_PROJECT_ID;
try {
  if (!FB_PROJECT_ID) {
    const svc = require('./service-account.json');
    FB_PROJECT_ID = svc.project_id;
  }
} catch (_) {}

async function getFcmAccessToken() {
  const key = require('./service-account.json');
  const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

async function sendFcmMessage(token, title, body, link) {
  if (!FB_PROJECT_ID) throw new Error('Missing FB_PROJECT_ID or service-account project_id');
  const accessToken = await getFcmAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${FB_PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token,
      notification: { title, body },
      webpush: {
        fcm_options: { link: link || '/' },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM error: ${txt}`);
  }
  return res.json();
}

// Publish update: save to MongoDB and auto-send email + push
app.post('/api/updates/publish', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { title, body, link = '/', previewOnly = false } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'Missing title or body' });

    // Save announcement to MongoDB
    const insertRes = await mongoDb.collection('announcements').insertOne({
      title,
      body,
      link,
      createdAt: new Date(),
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    if (previewOnly) {
      return res.json({ success: true, message: 'Preview only', id: insertRes.insertedId, emailsCount: emails.length, tokensCount: tokens.length });
    }

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    return res.json({ success: true, id: insertRes.insertedId, emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Publish update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to publish update' });
  }
});

// Auto-publish endpoint: idempotent broadcast by version (no separate admin UI needed)
app.post('/api/updates/auto-publish', async (req, res) => {
    console.log('Received auto-publish request:', req.body); // Log the request body
  try {
    // Optional security with token
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { version, title, body, link = '/' } = req.body || {};
    if (!version || !title || !body) return res.status(400).json({ success: false, message: 'Missing version, title or body' });

    const versionId = String(version).trim();

    // Skip if already sent for this version
    const already = await mongoDb.collection('announcements_sent').findOne({ version: versionId });
    if (already) {
      return res.json({ success: true, message: 'Already sent for this version' });
    }

    // Save announcement entry (optional)
    const annInsert = await mongoDb.collection('announcements').insertOne({
      version: versionId,
      title,
      body,
      link,
      createdAt: new Date(),
      auto: true,
    });

    // Collect subscribers
    const subsCursor = mongoDb.collection('subscribers').find({ active: { $ne: false } }, { projection: { email: 1 } });
    const emails = (await subsCursor.toArray()).map(d => d.email);

    // Collect push tokens (optional)
    const tokensCursor = mongoDb.collection('pushTokens').find({ active: { $ne: false } }, { projection: { token: 1 } });
    const tokens = (await tokensCursor.toArray()).map(d => d.token);

    // Email broadcast
    let sent = 0, failed = 0;
    for (const to of emails) {
      try {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><h2 style="margin:0 0 12px 0;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p><p style="margin-top:16px;"><a href="${link}" style="color:#2563eb;text-decoration:none;">View update</a></p></div>`,
          text: `${title}\n\n${body}\n\nLink: ${link}`,
        });
        sent++;
      } catch (_) { failed++; }
    }

    // Push notifications
    let pushOk = 0, pushFail = 0;
    for (const t of tokens) {
      try {
        await sendFcmMessage(t, title, body, link);
        pushOk++;
      } catch (_) { pushFail++; }
    }

    // Mark version as sent
    await mongoDb.collection('announcements_sent').updateOne(
      { version: versionId },
      {
        $set: {
          version: versionId,
          title,
          body,
          link,
          sentAt: new Date(),
          announcementId: annInsert.insertedId,
        }
      },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Auto-publish sent', emails: { sent, failed, total: emails.length }, push: { sent: pushOk, failed: pushFail, total: tokens.length } });
  } catch (error) {
    console.error('Auto-publish failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to auto-publish' });
  }
});

// Newsletter: subscribe (MongoDB) + optional welcome email
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    if (!mongoDb) return res.status(500).json({ success: false, message: 'MongoDB not initialized' });

    const { email, source = 'website' } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const normalized = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) return res.status(400).json({ success: false, message: 'Invalid email address' });

    const now = new Date();
    await mongoDb.collection('subscribers').updateOne(
      { email: normalized },
      {
        $setOnInsert: { createdAt: now },
        $set: { email: normalized, source, active: true, updatedAt: now },
      },
      { upsert: true }
    );

    // Optional: send a welcome email (skip silently if SMTP missing)
    try {
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        await transporter.sendMail({
          from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
          to: normalized,
          subject: 'Welcome to VayAccess Newsletter',
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                   <h2 style="margin:0 0 12px 0;">Welcome to VayAccess Newsletter</h2>
                   <p style="color:#374151;line-height:1.6;">You will receive product news, articles, and live updates.</p>
                   <p style="margin-top:16px;"><a href="https://vayaccess.com" style="color:#2563eb;text-decoration:none;">Visit website</a></p>
                 </div>`,
          text: 'Welcome to VayAccess Newsletter\nYou will receive product news, articles, and live updates.'
        });
      }
    } catch (e) {
      // Do not fail subscription if email sending fails
      console.warn('Welcome email failed:', e?.message || e);
    }

    return res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Subscribe failed:', error);
    return res.status(500).json({ success: false, message: 'Subscription failed' });
  }
});



// Admin: send a single update email (manual)
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (process.env.NEWSLETTER_ADMIN_TOKEN && adminToken !== process.env.NEWSLETTER_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { to, subject, html, text } = req.body || {};
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ success: false, message: 'Missing to/subject/body' });
    }

    await transporter.sendMail({
      from: `"VayAccess Updates" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    return res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    console.error('Manual send failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

server.listen(PORT, () => {
  console.log(` VayAccess AI Call Service running on port ${PORT}`);
  console.log(` SMTP configured for: ${process.env.SMTP_USER}`);
  console.log(` AI Call Agent service initialized`);
  console.log(` Socket.IO server ready for real-time communication`);
  console.log(` Accepting requests from frontend...`);
});