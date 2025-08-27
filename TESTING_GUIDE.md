# 🧪 AI Call Agent Testing Guide

## Complete Testing Checklist

### 1. Backend Setup Test
```bash
cd backend
npm run dev
```

Expected output:
```
🚀 VayAccess AI Call Service running on port 3001
📧 SMTP configured for: info@vayaccess.com
🤖 AI Call Agent service initialized
🔌 Socket.IO server ready for real-time communication
```

### 2. Frontend Setup Test
```bash
npm run dev
```

Should start the development server on http://localhost:5173

### 3. API Keys Configuration Test

Before testing, ensure your `backend/.env` file has:
```bash
# Required for AI functionality
OPENAI_API_KEY=sk-proj-your_actual_openai_api_key
SMTP_USER=info@vayaccess.com
SMTP_PASS=your_app_specific_password

# Optional but recommended
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

### 4. Component Integration Tests

#### Test 1: AI Call Modal Appearance
1. Open http://localhost:5173
2. Navigate to Contact section
3. Look for "🤖 Talk to AI Expert - Instant Answers!" button
4. Click the button
5. ✅ Modal should open with phone number input

#### Test 2: Text-Based Conversation
1. In the AI Call Modal, enter a phone number (any format)
2. Enter your name (optional)
3. Click "Start AI Call Session"
4. Switch to "Text" mode
5. Type: "Tell me about your parking solutions"
6. ✅ Should get AI response about VayAccess parking solutions

#### Test 3: Voice Recording (requires HTTPS in production)
1. After starting a call session
2. Switch to "Voice" mode
3. Click the microphone button
4. Allow microphone permissions
5. Speak: "What barrier gates do you have?"
6. Click red button to stop recording
7. ✅ Should process speech and respond with voice + text

#### Test 4: Admin Dashboard Access
1. Go to http://localhost:5173/admin/calls
2. Enter password: `vayaccess2024`
3. ✅ Should show admin dashboard with call statistics
4. ✅ Should show real-time call recordings

### 5. API Endpoint Tests

Test these endpoints directly:

#### Health Check
```bash
curl http://localhost:3001/api/health
```
Expected: `{"status":"OK","timestamp":"..."}`

#### Initialize Call (requires phone number)
```bash
curl -X POST http://localhost:3001/api/ai-call/initialize \
  -H "Content-Type: application/json" \
  -d '{"customerPhone":"+91-9876543210","customerName":"Test User"}'
```

#### Send Message (requires active session)
```bash
curl -X POST http://localhost:3001/api/ai-call/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What parking solutions do you offer?","sessionId":"call_123_abc"}'
```

#### Get Call Recordings (Admin)
```bash
curl http://localhost:3001/api/admin/call-recordings
```

### 6. Real-Time Features Test

#### Socket.IO Connection Test
1. Open browser developer tools → Network tab
2. Start a call session
3. Look for WebSocket connection to `localhost:3001`
4. ✅ Should show successful WebSocket connection

#### Live Admin Updates Test
1. Open admin dashboard in one browser tab
2. Start a call session in another tab
3. ✅ Admin dashboard should show real-time notification of new call
4. Send messages in the call
5. ✅ Admin should see conversation updates in real-time

### 7. Error Handling Tests

#### Test Invalid API Key
1. Set invalid OpenAI API key in backend/.env
2. Try to start a conversation
3. ✅ Should show error message gracefully

#### Test Network Disconnection
1. Start a call session
2. Stop the backend server
3. Try to send a message
4. ✅ Should show connection error, not crash

#### Test Microphone Permissions Denied
1. Start voice mode
2. Deny microphone permissions
3. ✅ Should show helpful error message

### 8. Production Readiness Tests

#### HTTPS Test (for voice features)
1. Deploy to production with HTTPS
2. Test voice recording functionality
3. ✅ Voice should work properly with HTTPS

#### Database Persistence Test
1. Make several test calls
2. Restart the backend server
3. Check admin dashboard
4. ✅ All previous calls should still be visible

#### Performance Test
1. Make 10+ concurrent call sessions
2. Monitor server memory/CPU usage
3. ✅ Should handle multiple users without crashes

### 9. Security Tests

#### Admin Authentication Test
1. Try to access `/admin/calls` without authentication
2. ✅ Should require password
3. Try wrong password
4. ✅ Should reject access
5. Use correct password
6. ✅ Should grant access

#### API Rate Limiting Test
1. Send 100+ API requests rapidly
2. ✅ Server should handle gracefully without crashing

### 10. User Experience Tests

#### Mobile Responsiveness Test
1. Open the site on mobile device
2. Test AI call modal
3. ✅ Should work well on mobile screens

#### Accessibility Test
1. Use keyboard navigation only
2. Test with screen reader
3. ✅ Should be accessible to users with disabilities

## Common Issues & Solutions

### Issue: "Module not found" errors
**Solution:** Run `npm install` in both root and backend directories

### Issue: "OpenAI API key not found"
**Solution:** Check `backend/.env` file has correct `OPENAI_API_KEY`

### Issue: "Microphone not working"
**Solution:** Ensure HTTPS in production, check browser permissions

### Issue: "Socket.IO connection failed"
**Solution:** Check CORS settings, ensure backend is running

### Issue: "Admin dashboard empty"
**Solution:** Make at least one test call first

### Issue: "Voice recording not processing"
**Solution:** Check OpenAI API key, verify Whisper API access

## Success Criteria

✅ All API endpoints respond correctly
✅ AI conversations work in both text and voice modes
✅ Real-time updates work between customer and admin
✅ Call recordings are saved and visible in admin dashboard
✅ Voice recording and playback work properly
✅ Admin authentication works
✅ Mobile responsive design
✅ Error handling is graceful
✅ Performance is acceptable under load

## Final Verification

After all tests pass:
1. Make a complete call session (start → conversation → end)
2. Check that it appears in admin dashboard
3. Verify conversation transcript is accurate
4. Test voice features if possible
5. Confirm real-time admin notifications work

**Your AI Call Agent system is fully functional when all tests pass! 🎉**

---

## Quick Demo Script

For demonstrating to stakeholders:

1. **Show the customer experience:**
   - Open website → Contact section
   - Click "Talk to AI Expert" 
   - Have conversation about parking needs
   - Show both text and voice modes

2. **Show the admin experience:**
   - Open admin dashboard
   - Show real-time call monitoring
   - Review call recordings and transcripts
   - Demonstrate search and filtering

3. **Highlight key benefits:**
   - 24/7 availability
   - Instant expert responses
   - Complete conversation recording
   - Real-time admin visibility
   - Professional customer experience