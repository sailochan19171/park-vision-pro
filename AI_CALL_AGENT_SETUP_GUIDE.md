# 🤖 AI Call Agent Setup Guide

## Overview
This guide will help you set up the complete AI Call Agent system for your VayAccess parking solutions website. The system includes:

- **Real-time AI Voice Agent** - Customers can talk to an AI expert about parking solutions
- **Conversation Recording** - All calls are recorded and transcribed
- **Admin Dashboard** - View, manage, and analyze all call recordings
- **Multi-modal Support** - Both voice and text-based conversations

## 🛠️ Prerequisites

### Required Services & API Keys

1. **OpenAI API** (for AI conversations and voice processing)
   - Visit: https://platform.openai.com/api-keys
   - Create an API key with access to GPT-4 and Whisper/TTS models
   - Cost: ~$0.01-0.03 per minute of conversation

2. **Twilio Account** (optional - for advanced phone integration)
   - Visit: https://www.twilio.com/console
   - Get Account SID, Auth Token, and Phone Number
   - Cost: ~$1/month for phone number + usage fees

### System Requirements
- Node.js 16+ 
- npm or yarn
- Modern browser with microphone permissions
- HTTPS for production (required for microphone access)

## 📦 Installation Steps

### Step 1: Install Backend Dependencies
```bash
cd backend
npm install
```

### Step 2: Install Frontend Dependencies  
```bash
# From root directory
npm install
```

### Step 3: Environment Configuration

Create or update your `backend/.env` file with these new variables:

```bash
# Existing email configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=info@vayaccess.com
SMTP_PASS=your_app_specific_password

# AI Call Agent Configuration (REQUIRED)
OPENAI_API_KEY=sk-proj-your_openai_api_key_here
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# Server Configuration
PORT=3001
NODE_ENV=development
```

### Step 4: Frontend Environment Configuration

Create or update your `frontend/.env.local` file:

```bash
VITE_API_BASE_URL=http://localhost:3001
```

For production, update to your actual backend URL:
```bash
VITE_API_BASE_URL=https://your-backend-domain.com
```

## 🚀 Running the System

### Development Mode

1. **Start the Backend Server:**
```bash
cd backend
npm run dev
```
You should see:
```
🚀 VayAccess AI Call Service running on port 3001
📧 SMTP configured for: info@vayaccess.com
🤖 AI Call Agent service initialized
🔌 Socket.IO server ready for real-time communication
```

2. **Start the Frontend:**
```bash
# From root directory
npm run dev
```

3. **Test the System:**
   - Open http://localhost:5173
   - Navigate to Contact section
   - Click "🤖 Talk to AI Expert - Instant Answers!"
   - Test both voice and text modes

### Production Deployment

1. **Build the Frontend:**
```bash
npm run build
```

2. **Deploy Backend to your server with PM2:**
```bash
cd backend
npm install -g pm2
pm2 start server.js --name "vayaccess-ai-call"
pm2 startup
pm2 save
```

## 🎯 Features & Usage

### Customer Features

1. **AI Call Modal**
   - Click "Talk to AI Expert" in Contact section
   - Enter phone number and name (optional)
   - Choose Voice or Text mode
   - Real-time conversation with AI about parking solutions

2. **Voice Mode**
   - Click microphone to start recording
   - Speak your question
   - AI responds with voice and text
   - Automatic speech-to-text and text-to-speech

3. **Text Mode**
   - Type questions directly
   - Instant AI responses
   - Full conversation history

### Admin Features (Dashboard)

1. **Real-time Monitoring**
   - Live notifications of new calls
   - Real-time conversation updates
   - Call completion alerts

2. **Call Recordings Management**
   - View all call recordings with full transcripts
   - Search by phone number, name, or session ID
   - Filter by call status
   - Download recordings as JSON

3. **Analytics & Statistics**
   - Total calls count
   - Today's calls
   - Average call duration
   - Weekly call trends

## 📊 Admin Dashboard Access

### Method 1: Add to Existing Admin Route
If you have an admin section, add the dashboard component:

```tsx
import AdminCallDashboard from '../components/AdminCallDashboard';

// In your admin routes
<Route path="/admin/calls" element={<AdminCallDashboard />} />
```

### Method 2: Create New Admin Page
Create `src/pages/AdminCalls.tsx`:

```tsx
import AdminCallDashboard from '../components/AdminCallDashboard';

const AdminCallsPage = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <AdminCallDashboard />
      </div>
    </div>
  );
};

export default AdminCallsPage;
```

Access the dashboard at: `http://localhost:5173/admin/calls`

## 🔧 Configuration & Customization

### AI Agent Knowledge Base
Edit `backend/services/voiceAIService.js` to customize the AI agent's knowledge:

```javascript
const PARKING_SOLUTIONS_KNOWLEDGE = `
// Add your custom company information, products, and responses here
`;
```

### Voice Settings
Customize voice parameters in the TTS section:

```javascript
const mp3 = await openai.audio.speech.create({
  model: "tts-1",
  voice: "alloy", // Options: alloy, echo, fable, onyx, nova, shimmer
  input: text,
  speed: 1.0 // 0.25 to 4.0
});
```

### Call Recording Storage
By default, recordings are stored in `backend/recordings/`. For production:

1. **Database Storage** - Integrate with your existing database
2. **Cloud Storage** - Use AWS S3, Google Cloud Storage, etc.
3. **Encrypted Storage** - Add encryption for sensitive data

## 🛡️ Security Considerations

### API Key Security
- Never commit API keys to version control
- Use environment variables for all sensitive data
- Rotate API keys regularly

### Access Control
- Add authentication middleware to admin endpoints
- Implement role-based access control
- Secure Socket.IO connections with authentication

### Data Privacy
- Encrypt call recordings at rest
- Implement data retention policies
- Add GDPR compliance features if needed

## 📱 Mobile & Browser Compatibility

### Supported Browsers
- Chrome 66+
- Firefox 55+
- Safari 11+
- Edge 79+

### Mobile Support
- iOS Safari (requires HTTPS)
- Android Chrome
- Responsive design for all screen sizes

## 🐛 Troubleshooting

### Common Issues

1. **Microphone Not Working**
   - Ensure HTTPS in production
   - Check browser permissions
   - Test microphone access

2. **OpenAI API Errors**
   - Verify API key is correct
   - Check account billing status
   - Ensure models are available

3. **Socket.IO Connection Issues**
   - Check CORS settings
   - Verify backend is running
   - Check firewall settings

4. **Voice Recording Failed**
   - Test MediaRecorder API support
   - Check audio codecs
   - Verify file upload limits

### Debug Mode
Enable debug logging by setting:
```bash
NODE_ENV=development
DEBUG=true
```

## 💰 Cost Estimation

### OpenAI API Usage
- **GPT-4 conversations:** ~$0.01-0.03 per minute
- **Whisper transcription:** ~$0.006 per minute
- **TTS generation:** ~$0.015 per minute

### Typical Usage (100 calls/month, 5 min average)
- Total cost: ~$15-25/month
- Per call cost: ~$0.15-0.25

### Optimization Tips
- Use GPT-3.5-turbo for cost savings (50% less)
- Implement conversation length limits
- Cache frequently asked questions

## 📈 Performance Optimization

### Backend Optimization
- Use Redis for session storage
- Implement database connection pooling
- Add response caching for common queries

### Frontend Optimization
- Lazy load AI Call Modal
- Implement audio compression
- Add loading states for better UX

### Database Optimization
- Index frequently queried fields
- Implement database cleanup jobs
- Archive old call recordings

## 🔄 Updates & Maintenance

### Regular Updates
1. Update OpenAI API models periodically
2. Review and update AI knowledge base
3. Monitor call quality and user feedback
4. Clean up old recordings per retention policy

### Monitoring
1. Set up error logging (Sentry, LogRocket)
2. Monitor API usage and costs
3. Track call completion rates
4. Analyze user satisfaction

## 📞 Support & Next Steps

### Immediate Next Steps
1. Test the system thoroughly in development
2. Set up production environment variables
3. Deploy to production with HTTPS
4. Train your team on the admin dashboard
5. Monitor the first few calls closely

### Future Enhancements
1. **Multi-language Support** - Add Hindi/regional languages
2. **Advanced Analytics** - Customer sentiment analysis
3. **CRM Integration** - Sync with existing customer database
4. **Callback Scheduling** - Allow customers to schedule human calls
5. **Lead Scoring** - AI-powered lead qualification

---

## 🎉 Congratulations!

You now have a fully functional AI Call Agent system that will:
- ✅ Provide 24/7 customer support
- ✅ Generate qualified leads automatically  
- ✅ Record all interactions for quality assurance
- ✅ Scale your customer support without hiring
- ✅ Provide instant answers about your parking solutions

Your customers can now get immediate expert advice about parking solutions, and you'll have complete visibility into all conversations through the admin dashboard.

**Ready to revolutionize your customer experience with AI!** 🚀