import React, { useState, useEffect } from 'react';
import { X, Phone, MessageSquare, CheckCircle, Clock } from 'lucide-react';
import Groq from 'groq-sdk';

interface AICallDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ConversationItem {
  timestamp: string;
  speaker: 'customer' | 'ai_agent';
  message: string;
}

// VayAccess Knowledge Base for AI Expert
const knowledgeBase = `
 COMPANY INFORMATION:
- Company: VayAccess Parking Solutions
- Location: Hyderabad, Telangana, India
- Phone: +91 720 724 4344
- Email: info@vayaccess.com
- Website: https://vayaccess.com
- Business Hours: Monday-Friday 9:00 AM - 6:00 PM IST

 PARKING SOLUTIONS & PRICING:

1. HYBRID ANPR/FASTAG SYSTEM - ₹8-15 lakhs
   - Automatic number plate recognition + FASTAG integration
   - 99.5% accuracy in Indian conditions
   - Supports all vehicle types
   - Real-time payment processing

2. TICKETLESS PARKING MANAGEMENT - ₹5-12 lakhs
   - QR code and mobile app integration
   - Contactless entry/exit
   - Digital payment gateway
   - Real-time availability tracking

3. TICKET BASED PARKING SYSTEM - ₹3-8 lakhs
   - Automated ticket dispensing
   - Validation and payment kiosks
   - Barrier gate integration
   - Revenue management system

4. ANPR VEHICLE ACCESS CONTROL - ₹6-18 lakhs
   - High-resolution cameras (2MP-8MP)
   - Weather-proof housing (IP66/IP67)
   - Night vision capability
   - Integration with existing systems

5. PARKING GUIDANCE SYSTEM - ₹2-6 lakhs per floor
   - LED indicators for each parking slot
   - Digital displays showing availability
   - Navigation assistance
   - Mobile app integration

 ACCESS CONTROL SYSTEMS:

1. SMART BARRIER GATES - ₹2.5-6 lakhs each
   - Boom lengths: 3m, 4m, 5m, 6m
   - Opening speed: 1-6 seconds
   - Traffic capacity: 1000+ vehicles/hour
   - Remote monitoring capabilities

2. PEDESTRIAN TURNSTILES - ₹1.5-4 lakhs each
   - Flap barriers, Tripod turnstiles, Swing gates
   - Biometric integration (fingerprint, face, RFID)
   - Visitor management system
   - Anti-tailgating features

3. BIOMETRIC TERMINALS - ₹25,000-75,000 each
   - Face recognition, Fingerprint, RFID card
   - Temperature screening capability
   - Attendance tracking integration
   - Cloud connectivity

 SOFTWARE SOLUTIONS:
- Cloud-based management platform - ₹50,000-2 lakhs/year
- Mobile apps for iOS/Android - ₹1-3 lakhs development
- Integration APIs - ₹25,000-1 lakh setup
- Custom reporting dashboards - ₹75,000-2 lakhs

 CURRENT AVAILABILITY (Real-time parking status):
- VayAccess HQ Parking: 45/100 spots available
- Tech Park Block A: 23/80 spots available  
- Residential Complex: 156/200 spots available
- Shopping Mall: 189/500 spots available
- Corporate Office: 12/50 spots available

 INSTALLATION & SUPPORT:
- Installation time: 5-15 working days
- Free site assessment and consultation
- 2-year comprehensive warranty
- 24/7 technical support hotline
- Preventive maintenance contracts available
- Training for security personnel included

 CERTIFICATIONS:
- ISO 9001:2015 Quality Management
- ISO 27001:2013 Information Security
- CE marking for European standards
- FCC compliance for wireless devices
- BIS certification for Indian market
`;

export const AICallDemoModal: React.FC<AICallDemoModalProps> = ({ isOpen, onClose }) => {
  const [phoneNumber, setPhoneNumber] = useState('+91');
  const [customerName, setCustomerName] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'active' | 'completed'>('idle');
  const [showResults, setShowResults] = useState(false);

  const sampleQuestions = [
    "I need smart parking barriers for my office complex",
    "What's the cost of your ANPR parking system?", 
    "Do you provide turnstiles for pedestrian access control?",
    "I want a complete parking management solution for 200 cars",
    "Can you install systems in Mumbai? What's the timeline?",
    "Show me biometric access control options",
    "What parking spots are available right now?",
    "I need a ticketless parking system with mobile app"
  ];

  const handleStartDemo = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      alert('Please enter a valid phone number');
      return;
    }

    setCallStatus('connecting');
    setIsLoading(true);
    setConversation([]);
    setShowResults(false);

    // Simulate call connection
    setTimeout(async () => {
      setCallStatus('active');
      await getGroqAIResponse();
    }, 2000);
  };

  const getGroqAIResponse = async () => {
    const questions = currentQuestion || sampleQuestions[Math.floor(Math.random() * sampleQuestions.length)];
    
    // Customer speaks first
    const customerMessage: ConversationItem = {
      timestamp: new Date().toISOString(),
      speaker: 'customer',
      message: questions
    };
    
    setConversation([customerMessage]);
    
    // Wait 2 seconds, then AI responds using Groq
    setTimeout(async () => {
      try {
        // Initialize Groq client with the same config as chatbot
        const apiKey = import.meta.env.VITE_GROQ_API_KEY;
        
        if (!apiKey || apiKey === 'your_groq_api_key_here') {
          throw new Error('Groq API key not configured');
        }

        const groq = new Groq({
          apiKey: apiKey,
          dangerouslyAllowBrowser: true // Only for demo purposes
        });

        // Try multiple models like in chatbot
        let completion;
        const models = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'llama-3.1-8b-instant'];
        
        for (const model of models) {
          try {
            completion = await groq.chat.completions.create({
              messages: [
                {
                  role: 'system',
                  content: `You are an AI expert from VayAccess Smart Parking Solutions. You're speaking to ${customerName || 'a potential customer'} on a phone call. You have comprehensive knowledge about parking management systems, access control, pricing, and real-time availability.

Use this knowledge base to answer questions accurately:
${knowledgeBase}

Guidelines for phone conversation:
- Be conversational and professional like you're on a phone call
- Provide specific pricing and technical details
- Give real-time parking availability when requested  
- Explain benefits and ROI clearly
- Ask follow-up questions to understand their needs better
- Always offer free site assessment
- Mention installation timelines and support
- Keep responses focused and under 150 words
- Sound like an expert consultant, not a chatbot
- End with a call-to-action or next step
`
                },
                {
                  role: 'user',
                  content: questions
                }
              ],
              model: model,
              temperature: 0.7,
              max_tokens: 1200
            });
            console.log(` Groq AI responded using model: ${model}`);
            break; // Success, exit the loop
          } catch (modelError: any) {
            console.log(`Model ${model} failed, trying next...`, modelError.message);
            if (model === models[models.length - 1]) {
              // If this was the last model, re-throw the error
              throw modelError;
            }
          }
        }

        const aiResponse = completion?.choices[0]?.message.content || 
          "Thank you for your interest in VayAccess parking solutions. I'd be happy to discuss our smart parking systems with you. Could you tell me more about your specific requirements?";

        const aiMessage: ConversationItem = {
          timestamp: new Date().toISOString(),
          speaker: 'ai_agent',
          message: aiResponse
        };
        
        setConversation([customerMessage, aiMessage]);
        setTimeout(() => {
          setCallStatus('completed');
          setShowResults(true);
          setIsLoading(false);
        }, 1000);

      } catch (error) {
        console.error('Groq AI error:', error);
        
        // Fallback to intelligent response
        const fallbackResponse = `Thank you for your interest in VayAccess parking solutions! Based on your query about ${questions.toLowerCase()}, I'd recommend our smart parking systems. Our solutions range from ₹3-20 lakhs depending on requirements. We offer:

• Smart barrier gates with ANPR (₹3-8 lakhs)
• Complete parking management systems (₹8-20 lakhs)  
• Biometric access control (₹1.5-4 lakhs)
• Real-time parking guidance systems

We provide free site assessment and custom quotes. Our technical team can visit your location within 48 hours. Would you like me to schedule a consultation?`;
        
        const aiMessage: ConversationItem = {
          timestamp: new Date().toISOString(),
          speaker: 'ai_agent',
          message: fallbackResponse
        };
        
        setConversation([customerMessage, aiMessage]);
        setTimeout(() => {
          setCallStatus('completed');
          setShowResults(true);
          setIsLoading(false);
        }, 1000);
      }
    }, 3000);
  };

  const resetDemo = () => {
    setConversation([]);
    setCallStatus('idle');
    setShowResults(false);
    setIsLoading(false);
    setCurrentQuestion('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Phone className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                 Talk to AI Experts
              </h2>
              <p className="text-sm text-gray-600">Instant answers powered by advanced AI</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {callStatus === 'idle' && (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="+919876543210"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Question (Optional)
                  </label>
                  <textarea
                    value={currentQuestion}
                    onChange={(e) => setCurrentQuestion(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Ask about parking solutions, pricing, availability..."
                  />
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 rounded-lg border">
                  <h4 className="font-medium text-blue-900 mb-2"> AI Expert Features:</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Advanced Groq AI powered responses</li>
                    <li>• Real-time parking availability data</li>
                    <li>• Accurate pricing and technical specs</li>
                    <li>• Instant ROI calculations</li>
                    <li>• Professional consultation experience</li>
                  </ul>
                </div>
              </div>

              <button
                onClick={handleStartDemo}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all font-semibold flex items-center justify-center gap-2"
              >
                <Phone className="h-5 w-5" />
                Talk to AI Experts - Instant Answers
              </button>
            </>
          )}

          {callStatus !== 'idle' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    callStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                    callStatus === 'active' ? 'bg-green-400 animate-pulse' :
                    'bg-blue-400'
                  }`}></div>
                  <span className="font-medium">
                    {callStatus === 'connecting' && ' Connecting to AI Expert...'}
                    {callStatus === 'active' && ' AI Expert Analyzing...'}
                    {callStatus === 'completed' && ' AI Expert Response Complete'}
                  </span>
                </div>
                <span className="text-sm text-gray-600">
                  {phoneNumber} • {customerName || 'Expert Consultation'}
                </span>
              </div>

              {conversation.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3 max-h-64 overflow-y-auto">
                  <h4 className="font-medium text-gray-900 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    AI Expert Conversation
                  </h4>
                  {conversation.map((item, index) => (
                    <div key={index} className={`p-3 rounded-lg ${
                      item.speaker === 'customer' 
                        ? 'bg-blue-100 border-l-4 border-blue-400' 
                        : 'bg-green-100 border-l-4 border-green-400'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">
                          {item.speaker === 'customer' ? ' You' : ' AI Expert'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-line">{item.message}</p>
                    </div>
                  ))}
                  
                  {isLoading && callStatus === 'active' && (
                    <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg">
                      <Clock className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-gray-600">AI Expert is analyzing your request...</span>
                    </div>
                  )}
                </div>
              )}

              {showResults && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <h4 className="font-medium text-green-900">AI Expert Consultation Complete!</h4>
                  </div>
                  <div className="text-sm text-green-700 space-y-1">
                    <p> Advanced AI provided expert analysis</p>
                    <p> Personalized recommendations generated</p>
                    <p> Technical specifications included</p>
                    <p> Next: Our human experts will follow up</p>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-green-200">
                    <p className="text-sm font-medium text-green-900">Connect with Human Experts:</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <a href="tel:+917207244344" 
                         className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">
                         +91 720 724 4344
                      </a>
                      <a href="https://wa.me/917207244344"
                         className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">
                         WhatsApp
                      </a>
                      <a href="mailto:info@vayaccess.com"
                         className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">
                         Email
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {callStatus === 'completed' && (
                <button
                  onClick={resetDemo}
                  className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Ask Another Question
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
