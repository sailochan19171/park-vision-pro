// import React, { useState, useRef, useEffect } from 'react';
// import { Button } from './ui/button';
// import { Card, CardContent, CardHeader } from './ui/card';
// import { Input } from './ui/input';
// import { ScrollArea } from './ui/scroll-area';
// import { Badge } from './ui/badge';
// import { Avatar, AvatarFallback } from './ui/avatar';
// import { MessageCircle, Send, X, Bot, User, Minimize2 } from 'lucide-react';
// import Groq from 'groq-sdk';
// import { sendChatbotConversationSimple, type ChatbotConversation } from '../services/chatbotEmailService';

// interface Message {
//   id: string;
//   content: string;
//   role: 'user' | 'assistant';
//   timestamp: Date;
// }

// const Chatbot = () => {
//   const [isOpen, setIsOpen] = useState(false);
//   const [isMinimized, setIsMinimized] = useState(false);
//   const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
//   const [messages, setMessages] = useState<Message[]>([
//     {
//       id: '1',
//       content: "Welcome to VayAccess! Select a topic below or ask any question.",
//       role: 'assistant',
//       timestamp: new Date()
//     }
//   ]);
//   const [inputMessage, setInputMessage] = useState('');
//   const [isLoading, setIsLoading] = useState(false);
//   const messagesEndRef = useRef<HTMLDivElement>(null);

//   const scrollToBottom = () => {
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   };

//   useEffect(() => {
//     scrollToBottom();
//   }, [messages]);

//   // Test email function for debugging
//   const testEmailNow = async () => {
//     try {
//       console.log(' TESTING EMAIL SENDING...');
//       await sendConversationEmail('What are your barrier gate prices?', 'Our barrier gates range from $3,500-8,500 depending on features...');
//       console.log(' TEST COMPLETED - Check console for details and your email');
//     } catch (error) {
//       console.error(' TEST FAILED:', error);
//     }
//   };

//   // Helper function to send conversation email
//   const sendConversationEmail = async (userQuestion: string, botResponse: string) => {
//     try {
//       // Console logging for debugging
//       console.log(' Chatbot conversation:');
//       console.log(' User:', userQuestion);
//       console.log(' Bot:', botResponse);
//       console.log(' Time:', new Date().toLocaleString());
//       console.log(' Session:', sessionId);
      
//       const conversation: ChatbotConversation = {
//         userQuestion,
//         botResponse,
//         timestamp: new Date(),
//         sessionId
//       };
      
//       // Using Simple Email Service (Multiple backup options, No Branding) - ENABLED
//       await sendChatbotConversationSimple(conversation);
//       console.log(' Chatbot conversation sent to info@vayaccess.com');
      
//     } catch (error) {
//       console.error(' Failed to send chatbot conversation email:', error);
//       // Don't show error to user - email is background process
//     }
//   };

//   // VayAccess knowledge base
//   const knowledgeBase = `
//   VayAccess Smart Parking Solutions - Complete Product Information:

//   TURNSTILES & ACCESS CONTROL:
//   - Tripod Turnstiles: Professional grade access control
//   - Full Height Turnstiles: Maximum security solutions
//   - Optical Turnstiles: Modern contactless access
//   - Swing Gate Turnstiles: Elegant pedestrian control
//   - Drop Arm Barriers: Versatile access management

//   BARRIER GATES:
//   - Automatic Barrier Gates: Standard vehicle access control
//   - High-Speed Barrier Gates: Fast throughput solutions
//   - Heavy Duty Barriers: Industrial grade applications
//   - LED Light Barriers: Enhanced visibility systems

//   ACCESS CONTROL SYSTEMS:
//   - RFID Card Readers: Contactless card access
//   - Biometric Systems: Fingerprint and facial recognition
//   - Keypad Controllers: PIN-based access control
//   - Mobile Access Systems: Smartphone integration
//   - Multi-Door Controllers: Centralized access management

//   PARKING MANAGEMENT SOFTWARE:
//   - Basic Package: Essential parking management features
//   - Professional Package: Advanced analytics and reporting
//   - Enterprise Package: Full-scale parking operations
//   - Custom Solutions: Tailored to specific requirements

//   SERVICES:
//   - Installation: Professional setup and configuration
//   - Maintenance: Regular upkeep and support
//   - 24/7 Support: Round-the-clock technical assistance
//   - Training: Comprehensive user and admin training

//   REAL-TIME AVAILABILITY:
//   Currently monitoring 15,000+ parking spaces across 200+ locations:
//   - Downtown Business District: 450/500 spaces available
//   - Shopping Mall Complex: 780/1200 spaces available  
//   - Airport Terminal: 1200/1500 spaces available
//   - University Campus: 350/800 spaces available
//   - Residential Complex: 220/300 spaces available

//   ACCESS HOURS:
//   - Standard Access: 24/7 for authorized users
//   - Visitor Access: 6 AM - 10 PM daily
//   - Emergency Access: Always available
//   - Maintenance Window: 2 AM - 4 AM (reduced access)

//   FEATURES:
//   - Real-time space monitoring
//   - Mobile app integration
//   - License plate recognition
//   - Payment processing
//   - Reporting and analytics
//   - Integration with existing systems
//   - Cloud-based management
//   - IoT sensors and monitoring
//   `;

//   const handleSendMessage = async () => {
//     if (!inputMessage.trim()) return;

//     // Preserve the original user input before clearing it
//     const originalUserInput = inputMessage;

//     const userMessage: Message = {
//       id: Date.now().toString(),
//       content: originalUserInput,
//       role: 'user',
//       timestamp: new Date()
//     };

//     setMessages(prev => [...prev, userMessage]);
//     setInputMessage('');
//     setIsLoading(true);

//     try {
//       // Check if user is asking for pricing and redirect immediately
//       const lowerInput = originalUserInput.toLowerCase();
//       const pricingQuestions = [
//         'price', 'prices', 'pricing', 'priced', 'cost', 'costs', 'costing',
//         'rate', 'rates', 'fee', 'fees', 'charge', 'charges',
//         'expensive', 'cheap', 'budget', 'budgets', 'affordable',
//         'quote', 'quotes', 'quotation', 'estimate', 'estimates',
//         'payment', 'payments', 'money', 'amount', 'amounts',
//         'lakh', 'lakhs', 'thousand', 'crore', 'crores',
//         '₹', 'rupees', 'rupee', 'rs', 'inr',
//         'how much', 'what does it cost', 'what is the price',
//         'monthly', 'yearly', 'annual', 'per unit', 'per month',
//         'starting from', 'starts from', 'range from', 'ranges from',
//         'investment', 'spend', 'spending', 'financial'
//       ];
      
//       const pricingPatterns = [
//         /how\s+much/i,
//         /what.*cost/i,
//         /what.*price/i,
//         /price.*list/i,
//         /cost.*estimate/i,
//         /budget.*for/i,
//         /afford/i,
//         /expensive/i,
//         /cheap/i
//       ];
      
//       const containsPricingQuery = pricingQuestions.some(keyword => lowerInput.includes(keyword)) ||
//                                   pricingPatterns.some(pattern => pattern.test(lowerInput));
      
//       if (containsPricingQuery) {
//         const pricingResponse: Message = {
//           id: (Date.now() + 1).toString(),
//           content: "I'd be happy to help you learn about our product features and specifications! However, for detailed pricing and customized quotes, please contact our sales team at info@vayaccess.com or +91 720 724 4344. We offer free consultations to provide accurate pricing based on your specific requirements. What specific product features would you like to know more about?",
//           role: 'assistant',
//           timestamp: new Date()
//         };
        
//         setMessages(prev => [...prev, pricingResponse]);
//         await sendConversationEmail(originalUserInput, pricingResponse.content);
//         setIsLoading(false);
//         return;
//       }

//       // Initialize Groq client (in a real app, this should be done server-side)
//       const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      
//       if (!apiKey || apiKey === 'your_groq_api_key_here') {
//         throw new Error('API key not configured');
//       }

//       const groq = new Groq({
//         apiKey: apiKey,
//         dangerouslyAllowBrowser: true // Only for demo purposes
//       });

//       // Try primary model first, fallback to secondary if needed
//       let completion;
//       const models = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'llama-3.1-8b-instant'];
      
//       for (const model of models) {
//         try {
//           completion = await groq.chat.completions.create({
//             messages: [
//               {
//                 role: 'system',
//                 content: `You are VayBot, an expert assistant for VayAccess Smart Parking Solutions. You have comprehensive knowledge about parking management systems, access control, and real-time availability. 

//                 CRITICAL COMPANY POLICY: You are ABSOLUTELY FORBIDDEN from providing ANY pricing information, costs, rates, monetary figures, or financial details. This includes:
//                 - No rupee amounts (₹)
//                 - No lakh/crore figures
//                 - No price ranges
//                 - No cost estimates
//                 - No monthly fees
//                 - No per-unit pricing
//                 - No budget discussions
//                 - No financial comparisons

//                 If ANY pricing question is asked, you MUST respond ONLY with: "For detailed pricing and customized quotes, please contact our sales team at info@vayaccess.com or +91 720 724 4344. We offer free consultations to provide accurate pricing based on your specific requirements."

//                 Use this knowledge base to answer questions accurately:
//                 ${knowledgeBase}

//                 Guidelines:
//                 - Be helpful, professional, and knowledgeable about FEATURES ONLY
//                 - NEVER provide any pricing information, costs, rates, or monetary figures
//                 - ALWAYS redirect pricing questions to the sales team immediately
//                 - Give real-time parking availability when requested
//                 - Explain technical features and specifications in detail
//                 - Always relate answers back to VayAccess products and services
//                 - If asked about competitors, focus on VayAccess technical advantages
//                 - Provide installation timelines and support options (without costs)
//                 - Keep responses concise but informative
//                 - Use bullet points for better readability when listing features
//                 - Focus ONLY on product features, benefits, and technical specifications
//                 - Do not discuss budgets, costs, or financial aspects at all
//                 `
//               },
//               {
//                 role: 'user',
//                 content: originalUserInput
//               }
//             ],
//             model: model,
//             temperature: 0.3,
//             max_tokens: 800
//           });
//           break; // Success, exit the loop
//         } catch (modelError: any) {
//           console.log(`Model ${model} failed, trying next...`, modelError.message);
//           if (model === models[models.length - 1]) {
//             // If this was the last model, re-throw the error
//             throw modelError;
//           }
//         }
//       }

//       // Filter out any pricing information from the response
//       let responseContent = completion?.choices[0]?.message.content || "I apologize, but I'm having trouble responding right now. Please try again.";
      
//       // Comprehensive pricing detection and filtering
//       const pricingKeywords = [
//         '₹', 'rupees', 'rupee', 'rs', 'inr',
//         'lakhs', 'lakh', 'thousand', 'crore', 'crores',
//         'cost', 'costs', 'price', 'prices', 'pricing', 'priced',
//         'rate', 'rates', 'fee', 'fees', 'charge', 'charges',
//         'expensive', 'cheap', 'budget', 'budgets', 'affordable',
//         'quote', 'quotes', 'quotation', 'estimate', 'estimates',
//         'payment', 'payments', 'money', 'amount', 'amounts',
//         'monthly', 'yearly', 'annual', 'per unit', 'per month',
//         'starting from', 'starts from', 'range from', 'ranges from',
//         'investment', 'spend', 'spending', 'financial'
//       ];
      
//       const pricingPatterns = [
//         /\d+[\s]*[-–—]\s*\d+[\s]*lakhs?/i,
//         /₹[\s]*\d+/i,
//         /rs[\s]*\d+/i,
//         /\d+[\s]*thousand/i,
//         /\d+[\s]*lakhs?/i,
//         /\d+[\s]*crores?/i,
//         /\d+[\s]*per[\s]+unit/i,
//         /\d+[\s]*\/[\s]*month/i,
//         /\d+[\s]*\/[\s]*year/i,
//         /starting[\s]+from[\s]+\d+/i,
//         /starts[\s]+from[\s]+\d+/i,
//         /range[\s]+from[\s]+\d+/i,
//         /ranges[\s]+from[\s]+\d+/i,
//         /\d+[\s]*to[\s]*\d+[\s]*lakhs?/i,
//         /\d+[\s]*-[\s]*\d+[\s]*lakhs?/i,
//         /around[\s]+\d+/i,
//         /approximately[\s]+\d+/i,
//         /about[\s]+\d+/i
//       ];
      
//       // Check for pricing content
//       const containsPricingKeywords = pricingKeywords.some(keyword => 
//         responseContent.toLowerCase().includes(keyword.toLowerCase())
//       );
//       const containsPricingPatterns = pricingPatterns.some(pattern => 
//         pattern.test(responseContent)
//       );
      
//       // If ANY pricing content is detected, replace entire response
//       if (containsPricingKeywords || containsPricingPatterns) {
//         responseContent = "For detailed pricing and customized quotes, please contact our sales team at info@vayaccess.com or +91 720 724 4344. We offer free consultations to provide accurate pricing based on your specific requirements. What specific product features would you like to know more about?";
//       }

//       const assistantMessage: Message = {
//         id: (Date.now() + 1).toString(),
//         content: responseContent,
//         role: 'assistant',
//         timestamp: new Date()
//       };

//       setMessages(prev => [...prev, assistantMessage]);
      
//       // Send conversation to email after successful API response
//       await sendConversationEmail(originalUserInput, assistantMessage.content);
//     } catch (error) {
//       console.error('Error calling Groq API:', error);
      
//       // Fallback response based on keywords
//       let fallbackResponse = "I'm currently having connection issues, but I can still help! ";
      
//       const lowerInput = originalUserInput.toLowerCase();
      
//       if (lowerInput.includes('price') || lowerInput.includes('cost')) {
//         fallbackResponse += "For detailed pricing information, please contact our sales team who can provide customized quotes based on your specific requirements. You can reach us at info@vayaccess.com or +91 720 724 4344.";
//       } else if (lowerInput.includes('available') || lowerInput.includes('slots')) {
//         fallbackResponse += "We currently monitor 15,000+ spaces. Downtown: 450/500 available, Shopping Mall: 780/1200, Airport: 1200/1500. Which location interests you?";
//       } else if (lowerInput.includes('access') || lowerInput.includes('control')) {
//         fallbackResponse += "We offer RFID readers, biometric systems, keypad controllers, and mobile access systems. For specific pricing and features, please contact our sales team. What type of access control do you need?";
//       } else {
//         fallbackResponse += "I can help with product information, available parking slots, access control systems, and installation services. For pricing details, please contact our sales team. What would you like to know?";
//       }

//       const assistantMessage: Message = {
//         id: (Date.now() + 1).toString(),
//         content: fallbackResponse,
//         role: 'assistant',
//         timestamp: new Date()
//       };

//       setMessages(prev => [...prev, assistantMessage]);
      
//       // Send conversation to email after fallback response
//       await sendConversationEmail(originalUserInput, assistantMessage.content);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const quickQuestions = [
//     "Products",
//     "Services",
//     "Solutions",
//     "Access Control",
//     "Parking Management",
//     "Parking Guidance",
//     "Installation",
//     "Integrations"
//   ];

//   const handleQuickQuestion = (question: string) => {
//     setInputMessage(question);
//   };

//   if (!isOpen) {
//     return (
//       <div className="fixed bottom-6 right-6 z-50">
//         <Button
//           onClick={() => setIsOpen(true)}
//           className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all duration-300 group relative"
//           size="icon"
//           title="Open VayBot Assistant"
//         >
//           <MessageCircle className="h-6 w-6" />
//           <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
//             <div className="bg-white rounded-full p-1 shadow-md">
//               <MessageCircle className="h-3 w-3 text-blue-600" />
//             </div>
//           </div>
//         </Button>
//       </div>
//     );
//   }

//   return (
//     <Card className={`fixed bottom-6 right-6 w-96 shadow-2xl border-2 border-blue-200 z-50 transition-all duration-300 ${
//       isMinimized ? 'h-16' : 'h-[600px]'
//     }`}>
//       <CardHeader className={`bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 ${
//         isMinimized ? 'rounded-lg' : 'rounded-t-lg'
//       } relative`}>
//         <div className="flex items-center justify-between">
//           <div 
//             className={`flex items-center space-x-3 ${isMinimized ? 'cursor-pointer' : ''}`}
//             onClick={isMinimized ? () => setIsMinimized(false) : undefined}
//           >
//             <Avatar className="h-8 w-8 bg-white">
//               <AvatarFallback className="text-blue-600 font-bold">VB</AvatarFallback>
//             </Avatar>
//             <div>
//               <div className="flex items-center gap-2">
//                 <h3 className="font-semibold text-sm">
//                   VayBot Assistant
//                   {isMinimized && <span className="ml-2 text-xs opacity-75">(Click to expand)</span>}
//                 </h3>
//                 {!isMinimized && (
//                   <button
//                     onClick={() => setIsOpen(false)}
//                     className="text-xs text-white/80 hover:text-white underline hover:no-underline transition-all duration-200 ml-auto"
//                     title="Close chat"
//                   >
//                     close
//                   </button>
//                 )}
//               </div>
//               {!isMinimized && <p className="text-xs opacity-90">Smart Parking Solutions</p>}
//             </div>
//           </div>
//           <div className="flex space-x-2 items-center">
//             {!isMinimized && (
//               <Button
//                 variant="ghost"
//                 size="icon"
//                 onClick={() => setIsMinimized(true)}
//                 className="h-8 w-8 text-white hover:bg-white/20 transition-colors rounded-full flex-shrink-0"
//                 title="Minimize chat"
//               >
//                 <Minimize2 className="h-4 w-4" />
//               </Button>
//             )}
//             <Button
//               variant="ghost"
//               size="icon"
//               onClick={() => setIsOpen(false)}
//               className="h-10 w-10 bg-red-500/90 hover:bg-red-600 text-white transition-all duration-200 rounded-full border-2 border-white shadow-lg z-30 relative flex-shrink-0"
//               title="Close chat"
//             >
//               <X className="h-6 w-6 stroke-2" />
//             </Button>
//           </div>
//         </div>
        
//         {/* Additional prominent close button for better visibility */}
//         <Button
//           variant="ghost"
//           size="icon"
//           onClick={() => setIsOpen(false)}
//           className="absolute -top-4 -right-4 h-10 w-10 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-2xl border-3 border-white transition-all duration-200 z-50 hover:scale-110 cursor-pointer"
//           title="Close VayBot"
//         >
//           <X className="h-5 w-5 stroke-[3]" />
//         </Button>
//       </CardHeader>

//       {!isMinimized && (
//         <CardContent className="p-0 flex flex-col h-[532px]">
//           <ScrollArea className="flex-1 p-4">
//             <div className="space-y-4">
//               {messages.map((message) => (
//                 <div
//                   key={message.id}
//                   className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
//                 >
//                   <div className={`flex space-x-2 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
//                     <Avatar className="h-8 w-8 flex-shrink-0">
//                       <AvatarFallback className={message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200'}>
//                         {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
//                       </AvatarFallback>
//                     </Avatar>
//                     <div
//                       className={`rounded-lg p-3 ${
//                         message.role === 'user'
//                           ? 'bg-blue-600 text-white'
//                           : 'bg-gray-100 text-gray-900'
//                       }`}
//                     >
//                       <p className="text-sm whitespace-pre-wrap">{message.content}</p>
//                       <p className="text-xs opacity-70 mt-1">
//                         {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
//                       </p>
//                     </div>
//                   </div>
//                 </div>
//               ))}
              
//               {isLoading && (
//                 <div className="flex justify-start">
//                   <div className="flex space-x-2 max-w-[80%]">
//                     <Avatar className="h-8 w-8">
//                       <AvatarFallback className="bg-gray-200">
//                         <Bot className="h-4 w-4" />
//                       </AvatarFallback>
//                     </Avatar>
//                     <div className="bg-gray-100 rounded-lg p-3">
//                       <div className="flex space-x-1">
//                         <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
//                         <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
//                         <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               )}
              
//               <div ref={messagesEndRef} />
//             </div>
//           </ScrollArea>

//           {/* Quick Questions */}
//           <div className="p-3 border-t bg-gray-50">
//             <p className="text-xs text-gray-600 mb-2">Quick questions:</p>
//             <div className="flex flex-wrap gap-1">
//               {quickQuestions.map((question, index) => (
//                 <Badge
//                   key={index}
//                   variant="secondary"
//                   className="cursor-pointer hover:bg-blue-100 text-xs p-1"
//                   onClick={() => handleQuickQuestion(question)}
//                 >
//                   {question}
//                 </Badge>
//               ))}
//             </div>
//           </div>

//           {/* Input Area - Fixed for Mobile/Desktop */}
//           <div className="p-3 sm:p-4 border-t bg-white">
//             <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
//               <div className="flex-1 relative">
//                 <Input
//                   value={inputMessage}
//                   onChange={(e) => setInputMessage(e.target.value)}
//                   placeholder="Ask about products, prices, slots..."
//                   onKeyDown={(e) => {
//                     if (e.key === 'Enter' && !e.shiftKey) {
//                       e.preventDefault();
//                       handleSendMessage();
//                     }
//                   }}
//                   disabled={isLoading}
//                   className="flex-1 min-h-[44px] sm:min-h-[40px] text-base sm:text-sm pr-4 resize-none"
//                   style={{ 
//                     fontSize: '16px', // Prevents zoom on iOS
//                     lineHeight: '1.4',
//                     minHeight: '44px' // Better mobile touch target
//                   }}
//                 />
//               </div>
//               <Button
//                 onClick={handleSendMessage}
//                 disabled={isLoading || !inputMessage.trim()}
//                 className="bg-blue-600 hover:bg-blue-700 min-h-[44px] sm:min-h-[40px] px-4 sm:px-3 flex-shrink-0"
//               >
//                 <Send className="h-4 w-4 sm:h-4 sm:w-4" />
//                 <span className="ml-2 sm:hidden">Send</span>
//               </Button>
//             </div>
            
//             {/* Status indicator */}
//             <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
//               <div className="flex items-center gap-1">
//                 <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
//                 <span>AI Assistant Online</span>
//               </div>
//               <span className="hidden sm:inline">Press Enter to send</span>
//             </div>
//           </div>
//         </CardContent>
//       )}
//     </Card>
//   );
// };

// export default Chatbot;
