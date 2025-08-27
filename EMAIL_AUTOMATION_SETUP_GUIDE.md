# 🚀 Live Email Automation Setup Guide - VayAccess

## Overview
This guide will help you set up a **live, real-time email automation system** that:
- ✅ Sends actual user-entered data from contact forms to info@vayaccess.com
- ✅ Automatically sends professional confirmation emails back to users
- ✅ Provides real-time email delivery without fixed content
- ✅ Replaces EmailJS with a robust backend solution

## 📁 Files Created
```
backend/
├── server.js              # Main email server
├── package.json           # Dependencies
├── .env.example          # Environment configuration template
└── .env                  # Your actual configuration (create this)

src/services/
└── backendEmailService.ts # Frontend API client
```

## 🔧 Setup Steps

### Step 1: Install Backend Dependencies
```powershell
# Navigate to backend folder
Set-Location "c:\Users\Home\park-vision-pro\backend"

# Install Node.js packages
npm install
```

### Step 2: Configure Email Settings
Create `.env` file in the backend folder with your email configuration:

#### Option A: Gmail/Google Workspace (Recommended)
```env
PORT=3001
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=info@vayaccess.com
SMTP_PASS=your_app_specific_password_here
FROM_EMAIL=info@vayaccess.com
FROM_NAME="VayAccess Support Team"
NODE_ENV=production
CORS_ORIGINS=http://localhost:5173,https://vayaccess.com
```

**To get Gmail App Password:**
1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Security → 2-Step Verification → App passwords
3. Generate password for "Mail"
4. Use this password in SMTP_PASS

#### Option B: Outlook/Hotmail
```env
PORT=3001
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=info@vayaccess.com
SMTP_PASS=your_password_here
FROM_EMAIL=info@vayaccess.com
FROM_NAME="VayAccess Support Team"
NODE_ENV=production
```

### Step 3: Start the Email Backend
```powershell
# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start
```

You should see:
```
🚀 VayAccess Email Service running on port 3001
📧 SMTP configured for: info@vayaccess.com
🌐 Accepting requests from frontend...
✅ Email server is ready to send messages
```

### Step 4: Update Frontend Environment
Create or update `.env` in your main project folder:
```env
VITE_API_URL=http://localhost:3001/api
```

For production:
```env
VITE_API_URL=https://your-backend-domain.com/api
```

### Step 5: Test Email System
```powershell
# Test backend connection
curl http://localhost:3001/api/health

# Test email sending
curl -X POST http://localhost:3001/api/test-email
```

## 🎯 How It Works

### 1. User Submits Contact Form
- User enters: Name, Email, Project Details
- Frontend validates and sends to backend API

### 2. Automated Email Processing
**Email to info@vayaccess.com:**
```
🔔 New Contact Form Submission from John Smith

👤 Customer Information:
Name: John Smith  
Email: john@example.com
Submitted: Dec 26, 2024, 2:30 PM IST

💬 Project Details:
"I need parking barriers for 50-car facility. 
Budget is $10,000. When can you visit?"

⏰ Response Required:
Please respond within 2 hours during business hours
```

**Auto-confirmation to User:**
```
✅ Message Received Successfully
Dear John Smith,

Thank you for contacting VayAccess regarding your 
parking solution requirements.

📝 Your Message Summary:
"I need parking barriers for 50-car facility..."

⏰ What Happens Next?
• Quick Response: Our specialists respond within 2 hours
• Detailed Analysis: Custom recommendations
• Complete Solution: Pricing and timelines

📞 Need Immediate Assistance?
Phone: +91 720 724 4344
```

### 3. Live Data Processing
- ✅ Real user name appears in emails
- ✅ Real user email for replies
- ✅ Actual project details included
- ✅ Real-time timestamps
- ✅ Professional formatting

## 🌐 Production Deployment

### Option A: Heroku (Recommended)
```powershell
# Install Heroku CLI
# Create new app
heroku create vayaccess-email-backend

# Set environment variables
heroku config:set SMTP_HOST=smtp.gmail.com
heroku config:set SMTP_PORT=587
heroku config:set SMTP_USER=info@vayaccess.com
heroku config:set SMTP_PASS=your_app_password
heroku config:set FROM_EMAIL=info@vayaccess.com

# Deploy
git add .
git commit -m "Email backend deployment"
git push heroku main
```

### Option B: DigitalOcean/VPS
```bash
# Server setup
sudo apt update
sudo apt install nodejs npm nginx

# Clone and setup
git clone your-repo
cd backend
npm install
npm install -g pm2

# Start with PM2
pm2 start server.js --name "vayaccess-email"
pm2 startup
pm2 save
```

## 🔐 Email Service Alternatives

### 1. SendGrid (Most Reliable)
```bash
npm install @sendgrid/mail
```

```javascript
// In server.js, replace nodemailer with:
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
  to: 'info@vayaccess.com',
  from: 'info@vayaccess.com',
  subject: 'New Contact Form',
  html: emailContent
};

await sgMail.send(msg);
```

### 2. Mailgun
```bash
npm install mailgun-js
```

### 3. AWS SES
```bash
npm install aws-sdk
```

## 🧪 Testing Checklist

### Backend Tests
- [ ] Server starts successfully
- [ ] Health check responds: `GET /api/health`
- [ ] Test email works: `POST /api/test-email`
- [ ] SMTP connection established

### Frontend Tests
- [ ] Form validation works
- [ ] Success message appears
- [ ] Error handling works
- [ ] Form clears after submission

### Email Tests
- [ ] Email arrives at info@vayaccess.com
- [ ] User receives confirmation
- [ ] Real data appears (not fixed content)
- [ ] Professional formatting
- [ ] Reply-to works correctly

## 📧 Email Content Features

### Admin Notification Email
- 🎨 Professional HTML design
- 👤 Complete customer information
- 💬 Full project details
- ⏰ Response time reminders
- 📱 Direct reply button
- 🕐 IST timestamps

### Customer Confirmation
- ✅ Branded confirmation message
- 📝 Message summary
- ⏰ Timeline expectations
- 📞 Immediate contact options
- 🌐 Website links
- 📍 Business information

## 🚨 Troubleshooting

### Common Issues
1. **"SMTP Error"** → Check email credentials in .env
2. **"Backend not responding"** → Ensure server is running on port 3001
3. **"CORS Error"** → Add your frontend URL to CORS_ORIGINS
4. **"App Password Required"** → Gmail needs app-specific password

### Debug Commands
```powershell
# Check if backend is running
curl http://localhost:3001/api/health

# View backend logs
npm run dev  # Shows detailed logs

# Test SMTP connection
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: 'info@vayaccess.com', pass: 'your_password' }
});
transporter.verify().then(console.log).catch(console.error);
"
```

## 🎯 Success Verification

When working correctly, you should see:
1. ✅ Backend server running without errors
2. ✅ Real emails arriving at info@vayaccess.com with actual form data
3. ✅ Users receiving professional confirmation emails
4. ✅ No more "fixed content" - all data is live and dynamic
5. ✅ Reply functionality working from info@vayaccess.com

## 📞 Support

If you need help setting this up:
- 📧 Contact: info@vayaccess.com
- 📱 Phone: +91 720 724 4344
- 💬 WhatsApp: +91 720 724 4344

---

**🎉 You now have a professional, live email automation system that processes real user data and provides automated responses!**