// Email Backend Test Script
// Run with: node test-email.js

require('dotenv').config();
const nodemailer = require('nodemailer');

console.log(' Testing VayAccess Email Backend...\n');

// Test SMTP connection
async function testSMTPConnection() {
  try {
    console.log(' Testing SMTP connection...');
    console.log(`Host: ${process.env.SMTP_HOST}`);
    console.log(`Port: ${process.env.SMTP_PORT}`);
    console.log(`User: ${process.env.SMTP_USER}`);
    console.log(`Password: ${process.env.SMTP_PASS ? '***hidden***' : 'NOT SET'}\n`);
    
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    
    const result = await transporter.verify();
    console.log(' SMTP connection successful!');
    return true;
  } catch (error) {
    console.error(' SMTP connection failed:', error.message);
    return false;
  }
}

// Test sending a real email
async function testEmailSending() {
  try {
    console.log('\n Testing email sending...');
    
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    
    const testEmail = {
      from: `"VayAccess Test" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER, // Send to self for testing
      subject: ' VayAccess Email Backend Test - ' + new Date().toLocaleString(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;"> Email Backend Test</h1>
            <p style="margin: 10px 0 0 0;">VayAccess Email Service</p>
          </div>
          
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <h2 style="color: #2563eb;"> Email Service Working!</h2>
            <p>This test email confirms that your VayAccess email backend is properly configured and working.</p>
            
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #2563eb; margin: 0 0 10px 0;">Test Details:</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Timestamp:</strong> ${new Date().toLocaleString()}</li>
                <li><strong>SMTP Host:</strong> ${process.env.SMTP_HOST}</li>
                <li><strong>From Address:</strong> ${process.env.SMTP_USER}</li>
                <li><strong>Status:</strong> Successfully Delivered</li>
              </ul>
            </div>
            
            <p style="color: #059669; font-weight: bold;">🎉 Your contact form emails will now work perfectly!</p>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; color: #6b7280; font-size: 14px;">
              <p>VayAccess Email Backend Test | ${new Date().toLocaleString()}</p>
            </div>
          </div>
        </div>
      `,
      text: `
VayAccess Email Backend Test

 Email Service Working!

This test email confirms that your VayAccess email backend is properly configured and working.

Test Details:
- Timestamp: ${new Date().toLocaleString()}
- SMTP Host: ${process.env.SMTP_HOST}
- From Address: ${process.env.SMTP_USER}
- Status: Successfully Delivered

 Your contact form emails will now work perfectly!

VayAccess Email Backend Test | ${new Date().toLocaleString()}
      `
    };
    
    const result = await transporter.sendMail(testEmail);
    console.log(' Test email sent successfully!');
    console.log(' Check your inbox at:', process.env.SMTP_USER);
    console.log(' Message ID:', result.messageId);
    return true;
  } catch (error) {
    console.error(' Email sending failed:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log(' Starting VayAccess Email Backend Tests...\n');
  
  // Check environment variables
  const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error(' Missing environment variables:', missingVars.join(', '));
    console.error(' Please check your .env file\n');
    process.exit(1);
  }
  
  // Test SMTP connection
  const connectionTest = await testSMTPConnection();
  
  if (!connectionTest) {
    console.error('\n SMTP connection failed. Please check your credentials.');
    process.exit(1);
  }
  
  // Test email sending
  const emailTest = await testEmailSending();
  
  if (!emailTest) {
    console.error('\n Email sending failed. Please check your configuration.');
    process.exit(1);
  }
  
  console.log('\n All tests passed! Your email backend is ready to handle contact form submissions.');
  console.log('\n Next Steps:');
  console.log('1. Start the backend server: npm run dev');
  console.log('2. Start your frontend application');
  console.log('3. Test the contact form on your website');
  console.log('\n Live email automation is now active!');
}

// Run the tests
runTests().catch(error => {
  console.error('\n Test script error:', error);
  process.exit(1);
});