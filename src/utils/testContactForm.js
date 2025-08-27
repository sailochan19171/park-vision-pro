// Test Contact Form Email System
// Run this in browser console to test the automated email functionality

async function testContactFormEmailSystem() {
  console.log('🧪 Testing Contact Form Email System...');
  
  try {
    // Import the email service (only works if running in the app context)
    const { submitContactForm } = await import('../services/realEmailService.ts');
    
    const testData = {
      name: 'Test User',
      email: 'test@example.com', // Replace with your test email
      message: 'This is a test message to verify the automated email system is working correctly. Please ignore this test submission.'
    };
    
    console.log('📝 Submitting test contact form...', testData);
    
    const result = await submitContactForm(testData);
    
    if (result.success) {
      console.log('✅ Test PASSED! Email system working correctly');
      console.log('📧 Check your inbox for:');
      console.log('   1. Notification email to info@vayaccess.com');
      console.log('   2. Auto-reply email to', testData.email);
    } else {
      console.log('❌ Test FAILED:', result.message);
    }
    
  } catch (error) {
    console.error('❌ Test ERROR:', error);
    console.log('💡 Make sure you\'re running this in the browser console while on the website');
  }
}

// Test individual components
async function testEmailNotification() {
  try {
    const { sendContactNotificationEmail } = await import('../services/realEmailService.ts');
    
    const testData = {
      name: 'Test User',
      email: 'test@example.com',
      message: 'Test notification email'
    };
    
    const result = await sendContactNotificationEmail(testData);
    console.log(result ? '✅ Notification email sent' : '❌ Notification email failed');
    
  } catch (error) {
    console.error('❌ Notification test error:', error);
  }
}

async function testAutoReply() {
  try {
    const { sendContactAutoReply } = await import('../services/realEmailService.ts');
    
    const testData = {
      name: 'Test User',
      email: 'test@example.com',
      message: 'Test auto-reply email'
    };
    
    const result = await sendContactAutoReply(testData);
    console.log(result ? '✅ Auto-reply email sent' : '❌ Auto-reply email failed');
    
  } catch (error) {
    console.error('❌ Auto-reply test error:', error);
  }
}

// Instructions for manual testing
console.log(`
🧪 CONTACT FORM EMAIL TESTING

To test the automated email system:

1. FULL TEST:
   testContactFormEmailSystem()

2. TEST NOTIFICATION ONLY:
   testEmailNotification()

3. TEST AUTO-REPLY ONLY:
   testAutoReply()

4. MANUAL TEST:
   - Visit the contact form on the website
   - Fill out with your real email address
   - Submit the form
   - Check both info@vayaccess.com and your email for messages

📧 Expected Results:
✅ Notification email to info@vayaccess.com
✅ Auto-reply confirmation to your email
✅ Success toast notification on website
✅ Form resets after submission

⚠️ Note: Make sure EmailJS service is configured correctly
`);

// Make functions available globally for testing
window.testContactFormEmailSystem = testContactFormEmailSystem;
window.testEmailNotification = testEmailNotification;
window.testAutoReply = testAutoReply;