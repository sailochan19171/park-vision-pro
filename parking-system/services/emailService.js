// Optional nodemailer import - system will work without email functionality
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (error) {
  console.log('ℹ️  Nodemailer not installed - email functionality disabled');
  nodemailer = null;
}
const fs = require('fs');
const path = require('path');

/**
 * Email Service Configuration
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = new Map();
    this.initialize();
  }

  /**
   * Initialize email service
   */
  initialize() {
    try {
      if (!nodemailer) {
        console.log('📧 Email service disabled - nodemailer not available');
        this.isConfigured = false;
        return;
      }
      
      // Create transporter
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false, // Use TLS
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Load email templates
      this.loadTemplates();

      console.log('✅ Email service initialized successfully');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error);
    }
  }

  /**
   * Load email templates
   */
  loadTemplates() {
    const templatesDir = path.join(__dirname, '../templates/emails');
    
    // Create templates directory if it doesn't exist
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
      this.createDefaultTemplates(templatesDir);
    }

    // Load existing templates
    try {
      const templateFiles = fs.readdirSync(templatesDir);
      templateFiles.forEach(file => {
        if (file.endsWith('.html')) {
          const templateName = file.replace('.html', '');
          const templatePath = path.join(templatesDir, file);
          const templateContent = fs.readFileSync(templatePath, 'utf8');
          this.templates.set(templateName, templateContent);
        }
      });
    } catch (error) {
      console.error('Error loading email templates:', error);
    }
  }

  /**
   * Create default email templates
   */
  createDefaultTemplates(templatesDir) {
    const templates = {
      welcome: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome to VayAccess</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        .btn { display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to VayAccess</h1>
        </div>
        <div class="content">
            <h2>Hello {{name}}!</h2>
            <p>Welcome to VayAccess - Your Smart Parking Solution. We're excited to have you on board!</p>
            <p>Your account has been created successfully. You can now:</p>
            <ul>
                <li>Find and book parking spots</li>
                <li>Manage your vehicles</li>
                <li>Track your parking history</li>
                <li>Make payments seamlessly</li>
            </ul>
            <p>Get started by downloading our mobile app or visiting our website.</p>
            <a href="{{appUrl}}" class="btn">Get Started</a>
        </div>
        <div class="footer">
            <p>&copy; 2024 VayAccess Solutions. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`,

      booking_confirmation: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Booking Confirmation</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10b981; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .booking-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Booking Confirmed</h1>
        </div>
        <div class="content">
            <h2>Hello {{name}}!</h2>
            <p>Your parking booking has been confirmed successfully.</p>
            <div class="booking-details">
                <h3>Booking Details:</h3>
                <p><strong>Booking ID:</strong> {{bookingId}}</p>
                <p><strong>Parking Spot:</strong> {{spotNumber}}</p>
                <p><strong>Location:</strong> {{location}}</p>
                <p><strong>Date & Time:</strong> {{startTime}} - {{endTime}}</p>
                <p><strong>Vehicle:</strong> {{vehiclePlate}}</p>
                <p><strong>Amount:</strong> ₹{{amount}}</p>
            </div>
            <p>Please arrive on time and have your booking confirmation ready.</p>
            <p><strong>QR Code:</strong> Use this code for quick entry</p>
            <p>{{qrCode}}</p>
        </div>
        <div class="footer">
            <p>Need help? Contact us at support@vayaccess.com</p>
        </div>
    </div>
</body>
</html>`,

      payment_receipt: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Payment Receipt</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #059669; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .receipt-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .total { font-size: 18px; font-weight: bold; color: #059669; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Payment Receipt</h1>
        </div>
        <div class="content">
            <h2>Thank you for your payment!</h2>
            <div class="receipt-details">
                <h3>Payment Details:</h3>
                <p><strong>Transaction ID:</strong> {{transactionId}}</p>
                <p><strong>Booking ID:</strong> {{bookingId}}</p>
                <p><strong>Amount Paid:</strong> <span class="total">₹{{amount}}</span></p>
                <p><strong>Payment Method:</strong> {{paymentMethod}}</p>
                <p><strong>Date:</strong> {{paymentDate}}</p>
                <p><strong>Status:</strong> Completed</p>
            </div>
            <p>Your payment has been processed successfully. You will receive your parking access details shortly.</p>
        </div>
        <div class="footer">
            <p>Keep this receipt for your records</p>
        </div>
    </div>
</body>
</html>`
    };

    // Write template files
    Object.entries(templates).forEach(([name, content]) => {
      fs.writeFileSync(path.join(templatesDir, `${name}.html`), content);
    });
  }

  /**
   * Send email
   */
  async sendEmail({ to, subject, template, data, from, attachments }) {
    try {
      if (!this.transporter) {
        throw new Error('Email service not configured');
      }

      let html = '';
      
      if (template) {
        // Use template
        const templateContent = this.templates.get(template);
        if (!templateContent) {
          throw new Error(`Email template '${template}' not found`);
        }
        
        html = this.renderTemplate(templateContent, data || {});
      }

      const mailOptions = {
        from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
        attachments
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Email sent to ${to}: ${subject}`);
      return {
        success: true,
        messageId: result.messageId,
        response: result.response
      };

    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Render email template with data
   */
  renderTemplate(template, data) {
    let rendered = template;
    
    // Replace placeholders with actual data
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, data[key] || '');
    });

    // Add default values
    const defaults = {
      appUrl: process.env.APP_URL || 'http://localhost:3002',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@vayaccess.com',
      companyName: 'VayAccess Solutions',
      currentYear: new Date().getFullYear()
    };

    Object.keys(defaults).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, defaults[key]);
    });

    return rendered;
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(emails) {
    const results = [];
    const batchSize = 10;

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchPromises = batch.map(email => this.sendEmail(email));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Add delay between batches to avoid rate limiting
        if (i + batchSize < emails.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error('Bulk email batch failed:', error);
        results.push(...batch.map(() => ({ 
          success: false, 
          error: 'Batch processing failed' 
        })));
      }
    }

    return results;
  }

  /**
   * Test email configuration
   */
  async testConnection() {
    try {
      if (!this.transporter) {
        throw new Error('Email service not configured');
      }

      await this.transporter.verify();
      console.log('✅ Email service connection test successful');
      return { success: true };
    } catch (error) {
      console.error('❌ Email service connection test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

// Helper functions
const sendWelcomeEmail = (to, name) => {
  return emailService.sendEmail({
    to,
    subject: 'Welcome to VayAccess - Smart Parking Solutions',
    template: 'welcome',
    data: { name }
  });
};

const sendBookingConfirmation = (to, bookingData) => {
  return emailService.sendEmail({
    to,
    subject: `Booking Confirmed - ${bookingData.bookingId}`,
    template: 'booking_confirmation',
    data: bookingData
  });
};

const sendPaymentReceipt = (to, paymentData) => {
  return emailService.sendEmail({
    to,
    subject: `Payment Receipt - ${paymentData.transactionId}`,
    template: 'payment_receipt',
    data: paymentData
  });
};

const sendPasswordReset = (to, resetData) => {
  return emailService.sendEmail({
    to,
    subject: 'Password Reset Request - VayAccess',
    template: 'password_reset',
    data: resetData
  });
};

const sendBookingReminder = (to, reminderData) => {
  return emailService.sendEmail({
    to,
    subject: 'Parking Booking Reminder',
    template: 'booking_reminder',
    data: reminderData
  });
};

module.exports = {
  emailService,
  sendEmail: emailService.sendEmail.bind(emailService),
  sendWelcomeEmail,
  sendBookingConfirmation,
  sendPaymentReceipt,
  sendPasswordReset,
  sendBookingReminder,
  testEmailConnection: emailService.testConnection.bind(emailService)
};