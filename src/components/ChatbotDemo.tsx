// import React from 'react';
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
// import { Badge } from './ui/badge';
// import { Bot, MessageCircle, Zap, Shield, Clock, Users } from 'lucide-react';

// const ChatbotDemo = () => {
//   const features = [
//     {
//       icon: <Bot className="h-6 w-6 text-blue-600" />,
//       title: "AI-Powered Responses",
//       description: "Intelligent answers using Groq's advanced language model"
//     },
//     {
//       icon: <MessageCircle className="h-6 w-6 text-green-600" />,
//       title: "Product Information",
//       description: "Complete details on turnstiles, barriers, and access control"
//     },
//     {
//       icon: <Zap className="h-6 w-6 text-yellow-600" />,
//       title: "Real-time Data",
//       description: "Live parking availability across 200+ locations"
//     },
//     {
//       icon: <Shield className="h-6 w-6 text-purple-600" />,
//       title: "Pricing Information",
//       description: "Instant quotes for all products and services"
//     },
//     {
//       icon: <Clock className="h-6 w-6 text-orange-600" />,
//       title: "24/7 Available",
//       description: "Always ready to help with your parking solutions"
//     },
//     {
//       icon: <Users className="h-6 w-6 text-indigo-600" />,
//       title: "Expert Knowledge",
//       description: "Trained on VayAccess complete product catalog"
//     }
//   ];

//   const sampleQuestions = [
//     "What's the price of tripod turnstiles?",
//     "How many parking slots are available at the mall?",
//     "Tell me about biometric access control",
//     "What installation services do you offer?",
//     "How does the mobile access system work?",
//     "What's included in the enterprise software package?"
//   ];

//   return (
//     <section id="chatbot-demo" className="py-16 bg-gradient-to-br from-gray-50 to-blue-50 scroll-mt-24">
//       <div className="container mx-auto px-4">
//         <div className="text-center mb-12">
//           <Badge className="mb-4 bg-blue-100 text-blue-800 px-3 py-1">
//             New Feature
//           </Badge>
//           <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
//             Meet VayBot - Your Smart Parking Assistant
//           </h2>
//           <p className="text-xl text-gray-600 max-w-3xl mx-auto">
//             Get instant answers about our products, pricing, and real-time parking availability. 
//             Powered by advanced AI to provide you with accurate, helpful information 24/7.
//           </p>
//         </div>

//         <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
//           {features.map((feature, index) => (
//             <Card key={index} className="hover:shadow-lg transition-shadow duration-300">
//               <CardHeader className="pb-3">
//                 <div className="flex items-center space-x-3">
//                   {feature.icon}
//                   <CardTitle className="text-lg">{feature.title}</CardTitle>
//                 </div>
//               </CardHeader>
//               <CardContent>
//                 <CardDescription className="text-sm text-gray-600">
//                   {feature.description}
//                 </CardDescription>
//               </CardContent>
//             </Card>
//           ))}
//         </div>

//         <div className="max-w-4xl mx-auto">
//           <Card className="bg-white/80 backdrop-blur-sm border-2 border-blue-200">
//             <CardHeader className="text-center">
//               <CardTitle className="text-2xl text-gray-900">Try These Sample Questions</CardTitle>
//               <CardDescription>
//                 Click the chat button in the bottom right to ask VayBot anything about our parking solutions
//               </CardDescription>
//             </CardHeader>
//             <CardContent>
//               <div className="grid md:grid-cols-2 gap-3">
//                 {sampleQuestions.map((question, index) => (
//                   <div
//                     key={index}
//                     className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 hover:shadow-md transition-shadow cursor-pointer"
//                   >
//                     <p className="text-sm text-gray-700 font-medium">"{question}"</p>
//                   </div>
//                 ))}
//               </div>
              
//               <div className="mt-8 p-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg text-white text-center">
//                 <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-90" />
//                 <h3 className="text-lg font-semibold mb-2">Ready to Get Started?</h3>
//                 <p className="text-blue-100">
//                   Look for the blue chat button in the bottom right corner of your screen. 
//                   VayBot is ready to help with all your parking solution needs!
//                 </p>
//               </div>
//             </CardContent>
//           </Card>
//         </div>
//       </div>
//     </section>
//   );
// };

// export default ChatbotDemo;