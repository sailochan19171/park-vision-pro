const express = require('express');
const router = express.Router();

// Demo AI call endpoint (FREE - no Twilio or OpenAI needed)
router.post('/ai-call/demo', async (req, res) => {
  try {
    const { customerPhone, customerName, question } = req.body;
    
    console.log(`🎬 Starting FREE demo AI call for ${customerPhone}`);
    console.log(`❓ Customer question: ${question}`);
    
    // Generate intelligent response based on keywords (no API needed)
    let aiResponse = "";
    const questionLower = (question || "").toLowerCase();
    
    if (questionLower.includes("barrier") || questionLower.includes("gate")) {
      aiResponse = "Perfect! For barrier gates, I recommend our smart ANPR-based barrier system. It automatically recognizes vehicle number plates and opens gates without stopping. For an office complex, our system handles 500+ vehicles per hour and costs ₹3-8 lakhs. What's your daily vehicle count?";
    } else if (questionLower.includes("price") || questionLower.includes("cost")) {
      aiResponse = "Great question! Our pricing depends on your requirements. Smart barrier gates start at ₹3 lakhs, ANPR systems at ₹5 lakhs, and complete parking solutions range ₹8-20 lakhs. We offer free site assessment to give you accurate pricing. What's your parking capacity?";
    } else if (questionLower.includes("turnstile") || questionLower.includes("pedestrian")) {
      aiResponse = "Excellent! Our turnstiles include flap barriers, tripod turnstiles, and swing gates with biometric access. Prices start at ₹1.5 lakhs per unit. They integrate with RFID cards, fingerprint scanners, and mobile apps. How many entry/exit points do you need?";
    } else if (questionLower.includes("bangalore") || questionLower.includes("mumbai") || questionLower.includes("delhi") || questionLower.includes("pune")) {
      const city = questionLower.includes("bangalore") ? "Bangalore" : 
                   questionLower.includes("mumbai") ? "Mumbai" :
                   questionLower.includes("delhi") ? "Delhi" : "Pune";
      aiResponse = `Absolutely! We have successfully installed parking solutions across India including ${city}. Our technical team can visit your site for assessment. We've completed 200+ projects pan-India with 99% client satisfaction. When would be convenient for our team to visit?`;
    } else if (questionLower.includes("anpr") || questionLower.includes("camera")) {
      aiResponse = "ANPR (Automatic Number Plate Recognition) is our specialty! Our cameras work in all weather conditions, day/night, and recognize Indian number plates with 99.5% accuracy. Complete ANPR system costs ₹5-12 lakhs depending on the number of lanes. Would you like a demo at your location?";
    } else {
      aiResponse = "Hello! Thank you for your interest in VayAccess parking solutions. We specialize in smart parking systems including barrier gates, ANPR systems, turnstiles, and complete parking management. Our solutions range from ₹3-20 lakhs based on requirements. What specific parking challenges are you facing?";
    }
    
    // Simulate call conversation
    const callSimulation = {
      success: true,
      sessionId: `demo_${Date.now()}`,
      customerPhone,
      customerName: customerName || 'Valued Customer',
      conversation: [
        {
          timestamp: new Date().toISOString(),
          speaker: 'customer',
          message: question || "Hello, I'm interested in parking solutions."
        },
        {
          timestamp: new Date().toISOString(),
          speaker: 'ai_agent', 
          message: aiResponse
        }
      ],
      callStatus: 'completed',
      nextSteps: [
        '✅ Free site assessment scheduled',
        '✅ Product brochure will be emailed',
        '✅ Our team will call within 2 hours',
        '✅ Custom quote will be prepared'
      ],
      contactInfo: {
        phone: '+91 720 724 4344',
        whatsapp: '+91 720 724 4344',
        email: 'info@vayaccess.com'
      }
    };
    
    console.log('✅ FREE Demo AI call completed successfully');
    res.json(callSimulation);
    
  } catch (error) {
    console.error('❌ Demo call error:', error);
    
    // Fallback response (always works)
    const fallbackResponse = {
      success: true,
      sessionId: `demo_fallback_${Date.now()}`,
      customerPhone: req.body.customerPhone || '+91XXXXXXXXXX',
      customerName: req.body.customerName || 'Valued Customer',
      conversation: [
        {
          timestamp: new Date().toISOString(),
          speaker: 'customer',
          message: req.body.question || "I'm interested in parking solutions"
        },
        {
          timestamp: new Date().toISOString(),
          speaker: 'ai_agent', 
          message: "Thank you for contacting VayAccess! We're India's leading parking solutions provider. Our smart systems include barrier gates (₹3-8L), ANPR cameras (₹5-12L), and turnstiles (₹1.5-3L). We offer free site assessment and custom solutions. Our technical team will contact you within 24 hours to discuss your requirements!"
        }
      ],
      callStatus: 'completed',
      nextSteps: [
        '✅ Free consultation scheduled',
        '✅ Technical team will call back',
        '✅ Custom quote preparation',
        '✅ Site assessment booking'
      ],
      contactInfo: {
        phone: '+91 720 724 4344',
        whatsapp: '+91 720 724 4344', 
        email: 'info@vayaccess.com'
      }
    };
    
    res.json(fallbackResponse);
  }
});

module.exports = router;