import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { X, Phone, Send, Bot, User, PhoneCall } from 'lucide-react';
import Groq from 'groq-sdk';

interface AIExpertModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SelectableOption {
  id: string;
  label: string;
  action: 'message' | 'link' | 'phone' | 'email';
  value: string;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  options?: SelectableOption[];
}

const AIExpertModal: React.FC<AIExpertModalProps> = ({ isOpen, onClose }) => {
  const [sessionId] = useState(() => `call_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hello! I'm your AI parking expert from VayAccess. I can help with products, services, solutions, access control systems, technical specifications, installation, and integrations. Choose a topic below to start or ask any question.",
      role: 'assistant',
      timestamp: new Date(),
      options: [
        { id: 'quote', label: '📝 Get a Quote', action: 'message', value: 'I need a quote' },
        { id: 'products', label: '📦 Products', action: 'message', value: 'Show me your products' },
        { id: 'services', label: '🛠️ Services', action: 'message', value: 'What services do you offer?' },
        { id: 'locations', label: '📍 Locations', action: 'message', value: 'Where do you operate?' }
      ]
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [callStatus, setCallStatus] = useState<'connecting' | 'active' | 'completed'>('active');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Knowledge base without pricing information
  const knowledgeBase = `
  VayAccess Smart Parking Solutions - Product Information:

  TURNSTILES & ACCESS CONTROL:
  - Tripod Turnstiles: Compact design for pedestrian access control
  - Full Height Turnstiles: Maximum security for restricted areas
  - Optical Turnstiles: Modern glass design with infrared sensors
  - Swing Gate Turnstiles: Wide passage for wheelchair accessibility
  - Drop Arm Barriers: Flexible barrier system for controlled access

  BARRIER GATES:
  - Automatic Barrier Gates: Standard vehicle access control
  - High-Speed Barrier Gates: Fast operation for high-traffic areas
  - Heavy Duty Barriers: Reinforced construction for maximum security
  - LED Light Barriers: Enhanced visibility with integrated lighting

  ACCESS CONTROL SYSTEMS:
  - RFID Card Readers: Contactless card-based access
  - Biometric Systems: Fingerprint and facial recognition technology
  - Keypad Controllers: PIN-based access control
  - Mobile Access Systems: Smartphone-based entry solutions
  - Multi-Door Controllers: Centralized control for multiple access points

  PARKING MANAGEMENT SOFTWARE:
  - Basic Package: Essential features for small facilities
  - Professional Package: Advanced features for medium facilities
  - Enterprise Package: Full-featured solution for large operations
  - Custom Solutions: Tailored systems for specific requirements

  SERVICES:
  - Installation: Professional setup and configuration
  - Maintenance: Regular servicing and support
  - 24/7 Support: Round-the-clock technical assistance
  - Training: Comprehensive user and administrator training

  PRICING POLICY:
  Product prices and installation costs are not fixed and vary based on:
  - Project requirements and specifications
  - Site conditions and complexity
  - Quantity and customization needs
  - Installation requirements
  - Maintenance and support packages
  
  For accurate pricing, please contact our sales team for a customized quote.

  REAL-TIME AVAILABILITY:
  Currently monitoring 15,000+ parking spaces across 200+ locations:
  - Downtown Business District: 450/500 spaces available
  - Shopping Mall Complex: 780/1200 spaces available  
  - Airport Terminal: 1200/1500 spaces available
  - University Campus: 350/800 spaces available
  - Residential Complex: 220/300 spaces available

  ACCESS HOURS:
  - Standard Access: 24/7 for authorized users
  - Visitor Access: 6 AM - 10 PM daily
  - Emergency Access: Always available
  - Maintenance Window: 2 AM - 4 AM (reduced access)

  FEATURES:
  - Real-time space monitoring
  - Mobile app integration
  - License plate recognition
  - Payment processing
  - Reporting and analytics
  - Integration with existing systems
  - Cloud-based management
  - IoT sensors and monitoring

  COMPANY INFO:
  - Phone: +91 720 724 4344
  - Email: info@vayaccess.com
  - Location: Hyderabad, India
  - Website: https://vayaccess.com
  `;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const originalUserInput = inputMessage;
    const userMessage: Message = {
      id: Date.now().toString(),
      content: originalUserInput,
      role: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Intent handling before calling AI: locations and pricing
      const lowerInput = originalUserInput.toLowerCase();

      // 1) Locations intent (avoid pricing false positives like 'operate' containing 'rate')
      const locationIntent = /(where\s+do\s+you\s+(operate|provide)|where.*(operate|located|locations)|service\s+locations?|locations?\s+(do\s+you\s+serve|you\s+serve))/i;
      if (locationIntent.test(lowerInput)) {
        const locationsResponse: Message = {
          id: (Date.now() + 1).toString(),
          content: "We provide installation and services at the following types of locations:\n\n1. Gated Communities\n2. Shopping Malls\n3. Airports\n4. Corporate Offices\n5. Hospitals\n6. Educational Institutions\n7. Hotels\n8. Government Buildings\n9. Industrial Facilities\n\nNote: We currently don't serve very remote locations.",
          role: 'assistant',
          timestamp: new Date(),
          options: [
            { id: 'products', label: '📦 View Products', action: 'message', value: 'Show me your products' },
            { id: 'contact-phone', label: '📞 Call Sales', action: 'phone', value: '+91 720 724 4344' },
            { id: 'contact-email', label: '✉️ Email Sales', action: 'email', value: 'info@vayaccess.com' }
          ]
        };
        setMessages(prev => [...prev, locationsResponse]);
        setIsLoading(false);
        return;
      }

      // 2) Pricing intent with safe word-boundary matching
      const pricingWordPatterns = [
        /\bprice(s|d)?\b/i,
        /\bpricing\b/i,
        /\bcost(s|ing)?\b/i,
        /\brate(s)?\b/i,
        /\bfee(s)?\b/i,
        /\bcharge(s)?\b/i,
        /\bbudget(s)?\b/i,
        /\bquote(s|ation)?\b/i,
        /\bestimate(s)?\b/i,
        /\bpayment(s)?\b/i,
        /\bamount(s)?\b/i,
        /\bmonthly\b|\byearly\b|\bannual\b/i,
        /\bper\s+(unit|month|year)\b/i,
        /\b(lakh|lakhs|thousand|crore|crores)\b/i,
        /₹|\brupees?\b|\brs\b|\binr\b/i,
        /how\s+much/i,
        /what.*(cost|price)/i,
        /(starting|starts|range|ranges)\s+from/i,
        /\binvest(ment|ing)?\b|\bspend(ing)?\b|\bfinancial\b/i,
      ];

      const containsPricingQuery = pricingWordPatterns.some(p => p.test(lowerInput));

      if (containsPricingQuery) {
        const pricingResponse: Message = {
          id: (Date.now() + 1).toString(),
          content: "I understand you're interested in pricing information. Our product prices and installation costs are not fixed as they vary significantly based on project requirements, site conditions, quantity needed, and customization requirements.\n\nFor accurate pricing and a customized quote, please contact our sales team:\n📞 Phone: +91 720 724 4344\n✉️ Email: info@vayaccess.com\n\nWe offer free site assessments and consultations to provide you with the most accurate pricing for your specific needs. What other technical specifications or product features would you like to know about?",
          role: 'assistant',
          timestamp: new Date(),
          options: [
            { id: 'contact-phone', label: '📞 Call Sales', action: 'phone', value: '+91 720 724 4344' },
            { id: 'contact-email', label: '✉️ Email Sales', action: 'email', value: 'info@vayaccess.com' },
            { id: 'locations', label: '📍 Service Locations', action: 'message', value: 'Where do you operate?' },
            { id: 'products', label: '📦 View Products', action: 'message', value: 'Show me your products' }
          ]
        };
        
        setMessages(prev => [...prev, pricingResponse]);
        setIsLoading(false);
        return;
      }

      // Use same Groq implementation as chatbot
      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      
      if (!apiKey || apiKey === 'your_groq_api_key_here') {
        throw new Error('API key not configured');
      }

      const groq = new Groq({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true // Only for demo purposes
      });

      // Try primary model first, fallback to secondary if needed
      let completion;
      const models = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'llama-3.1-8b-instant'];
      
      for (const model of models) {
        try {
          completion = await groq.chat.completions.create({
            messages: [
              {
                role: 'system',
                content: `You are an AI Expert Agent for VayAccess Smart Parking Solutions providing phone consultation. You have comprehensive knowledge about parking management systems, access control, and technical specifications. 

Use this knowledge base to answer questions accurately:
${knowledgeBase}

IMPORTANT PRICING POLICY:
- NEVER provide specific prices, costs, or pricing ranges
- When asked about pricing, always redirect to sales team
- Explain that prices are not fixed and vary based on requirements
- Offer to connect them with sales team for customized quotes

Guidelines for AI Expert consultation:
- Act like you're providing professional phone consultation
- Be helpful, professional, and knowledgeable like a senior technical consultant
- For pricing questions, redirect to sales team (info@vayaccess.com or +91 720 724 4344)
- Explain technical features in an understandable way
- Always relate answers back to VayAccess products and services
- If asked about competitors, focus on VayAccess advantages
- Provide installation timelines and support options (without costs)
- Keep responses conversational but informative
- Use bullet points for better readability when listing features
- End responses with follow-up questions or next steps
- Mention free site assessment and consultation when relevant
- Always emphasize that pricing varies based on project requirements
`
              },
              {
                role: 'user',
                content: originalUserInput
              }
            ],
            model: model,
            temperature: 0.7,
            max_tokens: 1000
          });
          console.log(`✅ AI Expert responded using Groq model: ${model}`);
          break; // Success, exit the loop
        } catch (modelError: any) {
          console.log(`Model ${model} failed, trying next...`, modelError.message);
          if (model === models[models.length - 1]) {
            // If this was the last model, re-throw the error
            throw modelError;
          }
        }
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: completion?.choices[0]?.message.content || "I apologize, but I'm having trouble responding right now. Please try again or contact our team directly at +91 720 724 4344.",
        role: 'assistant',
        timestamp: new Date(),
        options: [
          { id: 'view-products', label: '📦 View Products', action: 'message', value: 'Show me your products' },
          { id: 'service-locations', label: '📍 Service Locations', action: 'message', value: 'Where do you operate?' },
          { id: 'call-sales', label: '📞 Call Sales', action: 'phone', value: '+91 720 724 4344' },
          { id: 'email-sales', label: '✉️ Email Sales', action: 'email', value: 'info@vayaccess.com' }
        ]
      };

      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('AI Expert error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm experiencing technical difficulties. Please contact our human experts directly at +91 720 724 4344 or email info@vayaccess.com for immediate assistance with your parking solution needs.",
        role: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl h-[90vh] max-h-[700px] bg-white rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white bg-opacity-20 rounded-lg">
              <PhoneCall className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">🤖 AI Expert Consultation</h2>
              <div className="flex items-center gap-2 text-sm opacity-90">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Live AI Expert - Session: {sessionId.slice(-8)}</span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start gap-3 ${
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  }`}
                >
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback className={
                      message.role === 'user' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gradient-to-r from-green-500 to-blue-500 text-white'
                    }>
                      {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`max-w-[75%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="text-xs opacity-70 mb-1">
                      {message.role === 'user' ? 'You' : '🤖 AI Expert'} • {message.timestamp.toLocaleTimeString()}
                    </div>
                    <div className="whitespace-pre-line text-sm leading-relaxed">
                      {message.content}
                    </div>
                    {message.options && message.options.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.options.map((opt) => (
                          <Button
                            key={opt.id}
                            size="sm"
                            variant={message.role === 'assistant' ? 'secondary' : 'outline'}
                            onClick={() => {
                              if (opt.action === 'message') {
                                setInputMessage(opt.value);
                                handleSendMessage();
                              } else if (opt.action === 'phone') {
                                window.location.href = `tel:${opt.value}`;
                              } else if (opt.action === 'email') {
                                window.location.href = `mailto:${opt.value}`;
                              } else if (opt.action === 'link') {
                                window.open(opt.value, '_blank');
                              }
                            }}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-start gap-3">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback className="bg-gradient-to-r from-green-500 to-blue-500 text-white">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-gray-100 rounded-lg p-3">
                    <div className="text-xs opacity-70 mb-1">🤖 AI Expert • Analyzing...</div>
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Input Area - Fixed at bottom */}
        <div className="border-t bg-white p-4 flex-shrink-0 rounded-b-lg">
          <div className="flex items-center gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask about products, services, integrations, installation... (Pricing via sales only)"
              className="flex-1 min-h-[44px]"
              disabled={isLoading}
              style={{ fontSize: '16px' }}
            />
            <Button 
              onClick={handleSendMessage}
              disabled={isLoading || !inputMessage.trim()}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-h-[44px] px-4"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>AI Expert Online • Powered by Groq</span>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              <span>📱 +91 720 724 4344</span>
              <span>✉️ info@vayaccess.com</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIExpertModal;