import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { MessageCircle, Send, X, Bot, User, Minimize2, MapPin, Phone, Mail, ExternalLink } from 'lucide-react';
// Product images for cards
import barrierGateImg from '../assets/barrier-gate-10.jpg';
import tripodImg from '../assets/vay-tripod-turnstile-standard.jpg';
import flapBarrierImg from '../assets/vay-flap-barrier-slim.jpg';
import ticketlessImg from '../assets/parking-system-architecture.jpg';
import guidanceImg from '../assets/parking-guidance-23.jpg';
import rfidImg from '../assets/rfid-card-reader.jpg';
import biometricImg from '../assets/facial-recognition-terminal.jpg';
import mobileAccessImg from '../assets/mobile-access-control.jpg';
import { useNavigate } from 'react-router-dom';
import { sendChatbotConversationSimple, type ChatbotConversation } from '../services/chatbotEmailService';
import Groq from 'groq-sdk';

// Single source of truth from site footer
const COMPANY = {
  addressLines: [
    'Plot No. 26, Road No.1, West Gandhi Nagar, Rampally X Road, Nagaram, Keesara (M),',
    'Hyderabad - 500083, TS, India',
  ],
  phone: '+91 915 470 3116',
  email: 'info@vayaccess.com',
};

interface SelectableOption {
  id: string;
  label: string;
  action: 'message' | 'link' | 'phone' | 'email' | 'navigate';
  value: string;
}

interface ProductCard {
  id: string;
  title: string;
  image: string;
  action: 'message' | 'navigate';
  value: string;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  options?: SelectableOption[];
  cards?: ProductCard[];
}

interface Product {
  name: string;
  description: string;
  features: string[];
  applications: string[];
  route: string;
  image: string;
}

interface ProductCategory {
  name: string;
  products: Product[];
}

const EnhancedChatbot = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [conversationState, setConversationState] = useState<'initial' | 'products_shown' | 'locations_shown' | 'ending'>('initial');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hello! I'm VayBot, your parking solutions assistant. I can help you with information about our products and service locations. How can I assist you today?",
      role: 'assistant',
      timestamp: new Date(),
      options: [
        { id: 'products', label: ' View All Products', action: 'message', value: 'How many products do you have?' },
        { id: 'locations', label: ' Service Locations', action: 'message', value: 'How many locations do you serve?' },
        { id: 'call-sales', label: ' Call Sales', action: 'phone', value: COMPANY.phone },
        { id: 'email-sales', label: ' Email Sales', action: 'email', value: COMPANY.email }
      ]
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Purchase/contact flow state
  const [pendingProduct, setPendingProduct] = useState<string | null>(null);
  const [awaitingBuyConfirm, setAwaitingBuyConfirm] = useState(false);
  const [awaitingContact, setAwaitingContact] = useState(false);
  const [collectedName, setCollectedName] = useState<string | null>(null);
  const [collectedEmail, setCollectedEmail] = useState<string | null>(null);
  const [collectedPhone, setCollectedPhone] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Product categories with detailed information (no pricing)
  const productCategories: ProductCategory[] = [
    {
      name: 'Barrier Gates',
      products: [
        {
          name: 'Smart Barrier Gate System',
          description: 'Advanced automatic barrier gates with LED indicators and anti-crash mechanism',
          features: ['LED Status Indicators', 'Anti-crash Mechanism', 'Remote Monitoring', 'Weather Resistant'],
          applications: ['Corporate Offices', 'Shopping Malls', 'Residential Complexes', 'Parking Lots'],
          route: '/products/barrier-gates',
          image: barrierGateImg
        },
        {
          name: 'Heavy Duty Barriers',
          description: 'Industrial-grade barrier gates for high-traffic areas',
          features: ['High Traffic Volume', 'Industrial Grade', '24/7 Operation', 'Reinforced Construction'],
          applications: ['Airports', 'Industrial Facilities', 'Government Buildings', 'Toll Plazas'],
          route: '/products/barrier-gates',
          image: barrierGateImg
        }
      ]
    },
    {
      name: 'Pedestrian Gates',
      products: [
        {
          name: 'Tripod Turnstiles',
          description: 'Compact and reliable pedestrian access control systems',
          features: ['Biometric Integration', 'Card Reader Support', 'Compact Design', 'Bidirectional Access'],
          applications: ['Office Buildings', 'Metro Stations', 'Educational Institutions', 'Gyms'],
          route: '/products/pedestrian-gates',
          image: tripodImg
        },
        {
          name: 'Flap Barrier Turnstiles',
          description: 'Elegant and fast-passage pedestrian gates',
          features: ['Elegant Design', 'Fast Passage', 'LED Indicators', 'Anti-tailgating'],
          applications: ['Corporate Lobbies', 'Hotels', 'Hospitals', 'Shopping Centers'],
          route: '/products/pedestrian-gates',
          image: flapBarrierImg
        }
      ]
    },
    {
      name: 'Parking Management',
      products: [
        {
          name: 'Parking Guidance System',
          description: 'Modern parking management with mobile app integration',
          features: ['Mobile App Integration', 'Real-time Monitoring', 'Digital Payments', 'License Plate Recognition'],
          applications: ['Smart Cities', 'Commercial Complexes', 'Airports', 'Hospitals'],
          route: '/products/parking-management',
          image: ticketlessImg
        },
        {
          name: 'Ticketless Parking System',
          description: 'Intelligent parking space detection and guidance',
          features: ['Space Detection', 'LED Indicators', 'Analytics Dashboard', 'Real-time Updates'],
          applications: ['Multi-level Parking', 'Shopping Malls', 'Airports', 'Office Complexes'],
          route: '/products/parking-guidance',
          image: guidanceImg
        }
      ]
    },
    {
      name: 'Access Control',
      products: [
        {
          name: 'RFID Card Readers',
          description: 'Secure and reliable card-based access control',
          features: ['Long Range Reading', 'Multiple Card Types', 'Secure Encryption', 'Weather Resistant'],
          applications: ['Office Buildings', 'Residential Societies', 'Educational Institutions', 'Healthcare Facilities'],
          route: '/products/access-control/rfid-system',
          image: rfidImg
        },
        {
          name: 'Biometric Systems',
          description: 'Advanced biometric authentication systems',
          features: ['Fingerprint Recognition', 'Face Detection', 'Anti-spoofing', 'Multi-modal Authentication'],
          applications: ['High Security Areas', 'Government Buildings', 'Banks', 'Data Centers'],
          route: '/products/access-control/biometric-system',
          image: biometricImg
        },
        {
          name: 'Mobile Access Control',
          description: 'Smartphone-based access control solutions',
          features: ['Smartphone Integration', 'QR Code Support', 'Remote Management', 'Cloud-based'],
          applications: ['Modern Offices', 'Co-working Spaces', 'Residential Communities', 'Event Venues'],
          route: '/products/access-control/mobile-system',
          image: mobileAccessImg
        }
      ]
    }
  ];

  const serviceLocations = [
    { type: 'Gated Communities', description: 'Residential complexes and housing societies', available: true },
    { type: 'Shopping Malls', description: 'Retail and commercial complexes', available: true },
    { type: 'Airports', description: 'Airport parking and access control', available: true },
    { type: 'Corporate Offices', description: 'Office buildings and business parks', available: true },
    { type: 'Hospitals', description: 'Healthcare facilities and medical centers', available: true },
    { type: 'Educational Institutions', description: 'Schools, colleges, and universities', available: true },
    { type: 'Hotels', description: 'Hospitality and resort facilities', available: true },
    { type: 'Government Buildings', description: 'Public sector and administrative buildings', available: true },
    { type: 'Industrial Facilities', description: 'Manufacturing and warehouse complexes', available: true },
    { type: 'Remote Areas', description: 'Rural or very remote locations', available: false }
  ];

  // Helper function to send conversation email
  const sendConversationEmail = async (userQuestion: string, botResponse: string) => {
    try {
      const conversation: ChatbotConversation = {
        userQuestion,
        botResponse,
        timestamp: new Date(),
        sessionId
      };
      
      await sendChatbotConversationSimple(conversation);
      console.log(' Chatbot conversation sent to info@vayaccess.com');
      
    } catch (error) {
      console.error(' Failed to send chatbot conversation email:', error);
    }
  };

  const generateAllProductsResponse = () => {
    // Show product cards first so user sees images immediately
    const totalProducts = productCategories.reduce((total, category) => total + category.products.length, 0);
    setConversationState('products_shown');

    return {
      content: `Here are our products (${totalProducts} total). Tap any to learn more:`,
      options: productCategories
        .map(category => ({
          id: category.name.toLowerCase().replace(' ', '-'),
          label: ` ${category.name}`,
          action: 'message' as const,
          value: `Tell me about ${category.name}`
        }))
        .concat([
          { id: 'solutions', label: ' Solutions', action: 'message', value: 'Show me solutions' },
          { id: 'services', label: ' Services', action: 'navigate', value: '/services' },
          { id: 'contact', label: ' Contact', action: 'navigate', value: '/#contact' }
        ]),
      cards: productCategories.flatMap(cat => cat.products.map(p => ({
        id: p.name.toLowerCase().replace(/\s+/g, '-'),
        title: p.name,
        image: p.image,
        action: 'message' as const,
        value: `Tell me about ${p.name}`,
      })))
    };
  };

  const generateCategoryProductsResponse = (categoryName: string) => {
    const category = productCategories.find(cat => 
      cat.name.toLowerCase().includes(categoryName.toLowerCase()) ||
      categoryName.toLowerCase().includes(cat.name.toLowerCase())
    );

    if (!category) {
      return {
        content: "I couldn't find that product category. Please select from our available categories.",
        options: productCategories.map(cat => ({
          id: cat.name.toLowerCase().replace(' ', '-'),
          label: ` ${cat.name}`,
          action: 'message' as const,
          value: `Tell me about ${cat.name}`
        }))
      };
    }

    let response = `Here are our ${category.name} products:\n\n`;
    
    category.products.forEach((product, index) => {
      response += `${index + 1}. **${product.name}**\n`;
      response += `   ${product.description}\n\n`;
    });

    return {
      content: response,
      options: category.products
        .map(product => ({
          id: product.name.toLowerCase().replace(/\s+/g, '-'),
          label: ` ${product.name}`,
          action: 'message' as const,
          value: `Tell me about ${product.name}`
        }))
        .concat([
          { id: 'solutions', label: ' Solutions', action: 'navigate', value: '/solutions' },
          { id: 'services', label: ' Services', action: 'navigate', value: '/services' },
          { id: 'contact', label: ' Contact', action: 'navigate', value: '/#contact' }
        ]),
      // Show product cards with images for this category
      cards: category.products.map(p => ({
        id: p.name.toLowerCase().replace(/\s+/g, '-'),
        title: p.name,
        image: p.image,
        action: 'message' as const,
        value: `Tell me about ${p.name}`,
      }))
    };
  };

  const generateProductDetailsResponse = (productName: string) => {
    let foundProduct: Product | null = null;
    let foundCategory: ProductCategory | null = null;

    for (const category of productCategories) {
      const product = category.products.find(p => 
        p.name.toLowerCase().includes(productName.toLowerCase()) ||
        productName.toLowerCase().includes(p.name.toLowerCase())
      );
      if (product) {
        foundProduct = product;
        foundCategory = category;
        break;
      }
    }

    if (!foundProduct || !foundCategory) {
      return generateAllProductsResponse();
    }

    let response = `**${foundProduct.name}**\n\n`;
    response += `${foundProduct.description}\n\n`;
    response += `**Key Features:**\n`;
    foundProduct.features.forEach(feature => {
      response += `• ${feature}\n`;
    });
    response += `\n**Applications:**\n`;
    foundProduct.applications.forEach(app => {
      response += `• ${app}\n`;
    });

    // After details, ask to buy
    response += `\nAre you willing to buy this product?`;

    // Prepare state-driving follow-up handled in handleSendMessage
    setPendingProduct(foundProduct.name);
    setAwaitingBuyConfirm(true);

    return {
      content: response,
      options: [
        { id: 'buy-yes', label: ' Yes', action: 'message', value: 'Yes, I want to buy' },
        { id: 'buy-no', label: ' No', action: 'message', value: 'No, not now' },
        { id: 'view-details', label: ' View Full Details', action: 'navigate', value: foundProduct.route },
        { id: 'other-products', label: ' Other Products', action: 'message', value: 'How many products do you have?' },
      ],
      cards: [
        {
          id: foundProduct.name.toLowerCase().replace(/\s+/g, '-'),
          title: foundProduct.name,
          image: foundProduct.image,
          action: 'navigate' as const,
          value: foundProduct.route,
        }
      ]
    };
  };

  const generateLocationsResponse = () => {
    let response = "We provide installation and services at the following types of locations:\n\n";
    
    const availableLocations = serviceLocations.filter(loc => loc.available);
    const unavailableLocations = serviceLocations.filter(loc => !loc.available);
    
    availableLocations.forEach((location, index) => {
      response += `${index + 1}. **${location.type}**\n`;
      response += `   ${location.description}\n\n`;
    });

    if (unavailableLocations.length > 0) {
      response += "**Locations we don't serve:**\n";
      unavailableLocations.forEach(location => {
        response += `• ${location.type} - ${location.description}\n`;
      });
      response += "\nSorry, we don't provide installation services to very remote areas.\n";
    }

    setConversationState('locations_shown');

    return {
      content: response,
      options: [
        { id: 'end-conversation', label: ' Thank You', action: 'message', value: 'Thank you for the information' }
      ]
    };
  };

  const generateEndConversationResponse = () => {
    setConversationState('ending');
    
    return {
      content: "Thank you for your interest in VayAccess parking solutions! Our representative will contact you soon to discuss your requirements in detail.\n\nHave a great day! ",
      options: [
        { id: 'restart', label: ' Start New Chat', action: 'message', value: 'Hello' }
      ]
    };
  };

  const handleOptionClick = (option: SelectableOption) => {
    switch (option.action) {
      case 'message':
        setInputMessage(option.value);
        handleSendMessage(option.value);
        break;
      case 'phone': {
        // Sanitize phone number and trigger dial reliably
        const tel = (option.value || '').toString().replace(/\s+/g, '');
        window.location.href = `tel:${tel}`;
        break;
      }
      case 'email':
        window.location.href = `mailto:${option.value}`;
        break;
      case 'link':
        window.open(option.value, '_blank');
        break;
      case 'navigate':
        navigate(option.value);
        break;
    }
  };

  const generateSmartResponse = (userInput: string) => {
    const lowerInput = userInput.toLowerCase();

    // 0) Small-talk / identity handlers — answer warmly without falling through to the
    //    generic "I can help with Products…" path. These prevent the LLM from being
    //    asked the question with a parking-only system prompt that would refuse to engage.
    if (/^(hi|hello|hey|hola|namaste|greetings)\b/i.test(lowerInput) || /^good\s+(morning|afternoon|evening)\b/i.test(lowerInput)) {
      return {
        content: "Hi there! I'm VayBot, your assistant for VayAccess Smart Parking Solutions. How can I help you today?",
        options: [
          { id: 'products', label: ' View Products', action: 'message' as const, value: 'How many products do you have?' },
          { id: 'solutions', label: ' Solutions', action: 'navigate' as const, value: '/solutions' },
          { id: 'locations', label: ' Where are you located?', action: 'message' as const, value: 'Where are you located?' },
        ],
      };
    }
    if (/\b(who\s+are\s+you|what'?s?\s+your\s+name|introduce\s+yourself|tell\s+me\s+about\s+yourself|what\s+do\s+you\s+do)\b/i.test(lowerInput)) {
      return {
        content: "I'm VayBot — the digital assistant for VayAccess, a smart parking and access control company based in Hyderabad, India. I can help you explore our products, solutions, and services, or connect you with our team. What would you like to know?",
        options: [
          { id: 'products', label: ' View Products', action: 'message' as const, value: 'How many products do you have?' },
          { id: 'solutions', label: ' Solutions', action: 'navigate' as const, value: '/solutions' },
          { id: 'call', label: ' Call Sales', action: 'phone' as const, value: COMPANY.phone },
        ],
      };
    }
    if (/\b(where|were|wher)\s+(are\s+you|is\s+(the\s+)?company)\s+from\b/i.test(lowerInput) ||
        /\b(where|were|wher).*\b(based|country|city|located)\b/i.test(lowerInput) ||
        /\bwhich\s+(country|city|state)\b/i.test(lowerInput)) {
      return {
        content: `VayAccess is based in Hyderabad, India. Our corporate office and factory are located in Telangana. Here's our full address:\n\n${COMPANY.addressLines.join("\n")}\n\nPhone: ${COMPANY.phone}\nEmail: ${COMPANY.email}`,
        options: [
          { id: 'open-map', label: ' View on Maps', action: 'link' as const, value: 'https://maps.google.com/?q=VayAccess Hyderabad 500083' },
          { id: 'call', label: ' Call Us', action: 'phone' as const, value: COMPANY.phone },
        ],
      };
    }
    if (/\b(how\s+old)\b/i.test(lowerInput) ||
        /\bwhat(\s+is|'?s)?\s+your\s+age\b/i.test(lowerInput) ||
        /\byour\s+age\b/i.test(lowerInput) ||
        /\b(how\s+long\s+have\s+you\s+been|since\s+when|when\s+(was\s+the\s+company\s+)?(founded|started|established))\b/i.test(lowerInput)) {
      return {
        content: "I'm a digital assistant — so I don't really have an age! VayAccess is a growing smart parking and access control company. For details about our history and experience, feel free to reach out to our team.",
        options: [
          { id: 'call', label: ' Call Sales', action: 'phone' as const, value: COMPANY.phone },
          { id: 'email', label: ' Email Us', action: 'email' as const, value: COMPANY.email },
        ],
      };
    }
    if (/\b(how\s+are\s+you|how.?s?\s+it\s+going|what.?s?\s+up)\b/i.test(lowerInput)) {
      return {
        content: "I'm doing great, thanks for asking! Ready to help you find the right parking or access-control solution. What would you like to explore?",
        options: [
          { id: 'products', label: ' View Products', action: 'message' as const, value: 'How many products do you have?' },
          { id: 'solutions', label: ' Solutions', action: 'navigate' as const, value: '/solutions' },
        ],
      };
    }
    if (/^(thanks|thank\s+you|thx|ty|much\s+appreciated|appreciate\s+(it|that))\b/i.test(lowerInput)) {
      return {
        content: "You're welcome! Let me know if there's anything else I can help you with.",
      };
    }
    if (/^(bye|goodbye|cya|see\s+you|good\s+night)\b/i.test(lowerInput)) {
      return {
        content: "Goodbye! Feel free to reach out anytime. Have a great day! ",
      };
    }

    // 1) Locations intent (handle first to avoid pricing false positives like 'operate' containing 'rate')
    const locationIntent = /(where\s+do\s+you\s+(operate|provide)|where.*(operate|located|locations)|service\s+locations?|locations?\s+(do\s+you\s+serve|you\s+serve))/i;
    if (locationIntent.test(lowerInput) || /\bwhere\b.*\b(factory|office|hq|head\s*office|address|located)\b/i.test(lowerInput)) {
      // Live footer-based address response
      const addr = COMPANY.addressLines.join("\n");
      return {
        content: `Our address:\n${addr}\n\nPhone: ${COMPANY.phone}\nEmail: ${COMPANY.email}`,
        options: [
          { id: 'open-map', label: ' View on Maps', action: 'link', value: 'https://maps.google.com/?q=VayAccess Hyderabad 500083' },
          { id: 'call', label: ' Call Sales', action: 'phone', value: COMPANY.phone },
          { id: 'email', label: ' Email', action: 'email', value: COMPANY.email },
        ],
      };
    }

    // 2) Pricing queries - redirect to contact (with safe word boundaries)
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

    if (pricingWordPatterns.some(p => p.test(lowerInput))) {
      return {
        content: "For pricing information and customized quotes, please contact our sales team directly. They'll provide you with detailed pricing based on your specific requirements and project scope.\n\nWould you like me to help you get in touch with them?",
        options: [
          { id: 'contact-sales', label: ' Call Sales Team', action: 'phone', value: COMPANY.phone.replace(/\s+/g, '') },
          { id: 'email-sales', label: ' Email Sales Team', action: 'email', value: COMPANY.email },
          { id: 'locations', label: ' Service Locations', action: 'message', value: 'Where do you operate?' },
          { id: 'products', label: ' View Products Instead', action: 'message', value: 'How many products do you have?' }
        ]
      };
    }

    // 3) Multi-intent and plural queries  show selectable options for disambiguation
    const categoryHits: SelectableOption[] = [];
    if (/(barrier|gate)s?/i.test(lowerInput)) {
      categoryHits.push({ id: 'barrier-gates', label: ' Barrier Gates', action: 'message', value: 'Tell me about Barrier Gates' });
    }
    if (/(turnstiles?|pedestrian|flap)/i.test(lowerInput)) {
      categoryHits.push({ id: 'pedestrian-gates', label: ' Pedestrian Gates', action: 'message', value: 'Tell me about Pedestrian Gates' });
    }
    if (/(parking\s*management|ticketless|guidance)/i.test(lowerInput)) {
      categoryHits.push({ id: 'parking-management', label: ' Parking Management', action: 'message', value: 'Tell me about Parking Management' });
    }
    if (/(access\s*control|rfid|biometric|mobile\s*access)/i.test(lowerInput)) {
      categoryHits.push({ id: 'access-control', label: ' Access Control', action: 'message', value: 'Tell me about Access Control' });
    }
    const pluralHint = /\b(many|multiple|several|all|list|kinds|types|options|products|solutions)\b/i.test(lowerInput);
    if (categoryHits.length >= 2 || pluralHint) {
      const defaultOptions: SelectableOption[] = [
        { id: 'opt-products', label: ' Products', action: 'message', value: 'How many products do you have?' },
        { id: 'opt-solutions', label: ' Solutions', action: 'message', value: 'Show me solutions' },
        { id: 'opt-access', label: ' Access Control', action: 'message', value: 'Tell me about Access Control' },
        { id: 'opt-barrier', label: ' Barrier Gates', action: 'message', value: 'Tell me about Barrier Gates' },
      ];
      return {
        content: 'I found multiple topics in your question. Please choose one:',
        options: (categoryHits.length ? categoryHits : defaultOptions)
      };
    }

    // Reset conversation if user says hello after ending
    if (conversationState === 'ending' && (lowerInput.includes('hello') || lowerInput.includes('hi'))) {
      setConversationState('initial');
      return {
        content: "Hello! I'm VayBot, your parking solutions assistant. I can help you with information about our products and service locations. How can I assist you today?",
        options: [
          { id: 'products', label: ' View All Products', action: 'message', value: 'How many products do you have?' },
          { id: 'locations', label: ' Service Locations', action: 'message', value: 'How many locations do you serve?' }
        ]
      };
    }

    // Handle thank you and end conversation
    if (lowerInput.includes('thank you') || lowerInput.includes('thanks')) {
      return generateEndConversationResponse();
    }

    // Handle product count queries
    if (
      lowerInput.includes('how many products') ||
      lowerInput.includes('all products') ||
      lowerInput.includes('show me products') ||
      lowerInput.includes('show all products') ||
      /\b(view|list|show)\b.*\bproducts\b/i.test(lowerInput)
    ) {
      return generateAllProductsResponse();
    }

    // Handle location count queries
    if (
      lowerInput.includes('how many locations') ||
      lowerInput.includes('locations do you serve') ||
      lowerInput.includes('where do you provide')
    ) {
      return generateLocationsResponse();
    }

    // Handle specific product category queries
    if (lowerInput.includes('barrier') || lowerInput.includes('gate')) {
      return generateCategoryProductsResponse('Barrier Gates');
    }
    if (lowerInput.includes('pedestrian') || lowerInput.includes('turnstile')) {
      return generateCategoryProductsResponse('Pedestrian Gates');
    }
    if (lowerInput.includes('parking management') || lowerInput.includes('parking system')) {
      return generateCategoryProductsResponse('Parking Management');
    }

    // Solutions intent (show a curated set of solution cards) 
    if (lowerInput.includes('solution') || lowerInput.includes('solutions')) {
      const response = {
        content: 'Here are some of our key solutions. Tap any to learn more:',
        options: [
          { id: 'products', label: ' View All Products', action: 'message' as const, value: 'How many products do you have?' },
          { id: 'services', label: ' Services', action: 'navigate' as const, value: '/services' },
          { id: 'contact', label: ' Contact', action: 'navigate' as const, value: '/#contact' }
        ],
        cards: [
          { id: 'ticketless', title: 'Parking Guidance System', image: ticketlessImg, action: 'message' as const, value: 'Tell me about Parking Guidance System' },
          { id: 'guidance', title: 'Ticketless Parking System', image: guidanceImg, action: 'message' as const, value: 'Tell me about Ticketless Parking System' },
          { id: 'barrier', title: 'Smart Barrier Gate System', image: barrierGateImg, action: 'message' as const, value: 'Tell me about Smart Barrier Gate System' },
          { id: 'turnstiles', title: 'Flap Barrier Turnstiles', image: flapBarrierImg, action: 'message' as const, value: 'Tell me about Flap Barrier Turnstiles' },
        ]
      };
      return response;
    }
    if (lowerInput.includes('access control') || lowerInput.includes('rfid') || lowerInput.includes('biometric') || lowerInput.includes('mobile access')) {
      return generateCategoryProductsResponse('Access Control');
    }

    // Handle specific product queries
    if (lowerInput.includes('smart barrier') || lowerInput.includes('barrier gate system')) {
      return generateProductDetailsResponse('Smart Barrier Gate System');
    }
    if (lowerInput.includes('heavy duty') || lowerInput.includes('heavy duty barriers')) {
      return generateProductDetailsResponse('Heavy Duty Barriers');
    }
    if (lowerInput.includes('tripod turnstiles') || lowerInput.includes('tripod')) {
      return generateProductDetailsResponse('Tripod Turnstiles');
    }
    if (lowerInput.includes('flap barrier') || lowerInput.includes('flap turnstiles')) {
      return generateProductDetailsResponse('Flap Barrier Turnstiles');
    }
    if (lowerInput.includes('ticketless parking') || lowerInput.includes('ticketless system')) {
      return generateProductDetailsResponse('Parking Guidance System');
    }
    if (lowerInput.includes('parking guidance') || lowerInput.includes('guidance system')) {
      return generateProductDetailsResponse('Ticketless Parking System');
    }
    if (lowerInput.includes('rfid card') || lowerInput.includes('card readers')) {
      return generateProductDetailsResponse('RFID Card Readers');
    }
    if (lowerInput.includes('biometric systems') || lowerInput.includes('biometric')) {
      return generateProductDetailsResponse('Biometric Systems');
    }
    if (lowerInput.includes('mobile access') || lowerInput.includes('mobile control')) {
      return generateProductDetailsResponse('Mobile Access Control');
    }

    // Handle general category mentions
    if (lowerInput.includes('tell me about')) {
      const categoryMatch = productCategories.find(cat => 
        lowerInput.includes(cat.name.toLowerCase())
      );
      if (categoryMatch) {
        return generateCategoryProductsResponse(categoryMatch.name);
      }
    }

    // Default response based on conversation state
    if (conversationState === 'initial') {
      return {
        content: "I can help with Products, Solutions, Services, or Office location. What would you like to explore?",
        options: [
          { id: 'products', label: ' Products', action: 'message', value: 'How many products do you have?' },
          { id: 'solutions', label: ' Solutions', action: 'navigate', value: '/solutions' },
          { id: 'services', label: ' Services', action: 'navigate', value: '/services' },
          { id: 'office', label: ' Office Location', action: 'message', value: 'Where is your office located?' },
        ]
      };
    } else if (conversationState === 'products_shown') {
      return {
        content: "Want to navigate to Solutions, Services, or Contact?",
        options: [
          { id: 'solutions', label: ' Solutions', action: 'navigate', value: '/solutions' },
          { id: 'services', label: ' Services', action: 'navigate', value: '/services' },
          { id: 'contact', label: ' Contact', action: 'navigate', value: '/#contact' }
        ]
      };
    } else if (conversationState === 'locations_shown') {
      return generateEndConversationResponse();
    }

    return {
      content: "I can help with Products, Solutions, Services, or Office location. What would you like to explore?",
      options: [
        { id: 'products', label: ' Products', action: 'message', value: 'How many products do you have?' },
        { id: 'solutions', label: ' Solutions', action: 'navigate', value: '/solutions' },
        { id: 'services', label: ' Services', action: 'navigate', value: '/services' },
        { id: 'office', label: ' Office Location', action: 'message', value: 'Where is your office located?' },
      ]
    };
  };

  // Ensure image cards appear for AI responses too
  const getCardsForQuery = (q: string): ProductCard[] | undefined => {
    const lower = q.toLowerCase();
    // Show all products
    if (/(all|show|view|list).*products/.test(lower) || lower.includes('how many products')) {
      return productCategories.flatMap(cat => cat.products.map(p => ({
        id: p.name.toLowerCase().replace(/\s+/g, '-'),
        title: p.name,
        image: p.image,
        action: 'message' as const,
        value: `Tell me about ${p.name}`,
      })));
    }
    // Category-specific
    const addCategory = (name: string) => {
      const cat = productCategories.find(c => c.name.toLowerCase() === name.toLowerCase());
      return cat ? cat.products.map(p => ({
        id: p.name.toLowerCase().replace(/\s+/g, '-'),
        title: p.name,
        image: p.image,
        action: 'message' as const,
        value: `Tell me about ${p.name}`,
      })) : [];
    };
    if (lower.includes('barrier') || lower.includes('gate')) return addCategory('Barrier Gates');
    if (lower.includes('turnstile') || lower.includes('pedestrian') || lower.includes('flap')) return addCategory('Pedestrian Gates');
    if (lower.includes('parking management') || lower.includes('ticketless') || lower.includes('guidance')) return addCategory('Parking Management');
    if (lower.includes('access control') || lower.includes('rfid') || lower.includes('biometric') || lower.includes('mobile access')) return addCategory('Access Control');
    // Specific product
    for (const cat of productCategories) {
      const product = cat.products.find(p => lower.includes(p.name.toLowerCase()));
      if (product) {
        return [{
          id: product.name.toLowerCase().replace(/\s+/g, '-'),
          title: product.name,
          image: product.image,
          action: 'message' as const,
          value: `Tell me about ${product.name}`,
        }];
      }
    }
    return undefined;
  };
  
  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || inputMessage;
    if (!textToSend.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: textToSend,
      role: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const lower = textToSend.toLowerCase();

      // If awaiting contact, capture name, email and phone
      if (awaitingContact) {
        const emailMatch = textToSend.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        const phoneMatch = textToSend.match(/\+?\d[\d\s\-()]{6,}/);

        if (emailMatch) setCollectedEmail(emailMatch[0]);
        if (phoneMatch) setCollectedPhone(phoneMatch[0].replace(/\s+/g, ''));

        // Try to extract a name if provided like "Name: John Doe" or plain words
        const nameMatch = textToSend.match(/name\s*[:\-]\s*([a-zA-Z][a-zA-Z\s]{1,})/i) || textToSend.match(/^[A-Za-z][A-Za-z\s]{1,}$/);
        if (!collectedName && nameMatch) {
          const nm = Array.isArray(nameMatch) ? (nameMatch[1] || nameMatch[0]) : (nameMatch as unknown as string);
          setCollectedName(nm.trim());
        }

        const hasName = Boolean(collectedName || (Array.isArray(nameMatch) ? (nameMatch[1] || nameMatch[0]) : nameMatch));
        const missing: string[] = [];
        if (!hasName) missing.push('name');
        if (!emailMatch) missing.push('email');
        if (!phoneMatch) missing.push('phone number');

        if (missing.length > 0) {
          const needMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `Thanks! I still need your ${missing.join(' and ')}. You can paste all together, e.g.: Name: John Doe, john@company.com, +91 98765 43210`,
            role: 'assistant',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, needMsg]);
          setIsLoading(false);
          return;
        }

        const nameVal = collectedName || (Array.isArray(nameMatch) ? (nameMatch[1] || nameMatch[0]) : (nameMatch as unknown as string)) || 'there';
        const ok: Message = {
          id: (Date.now() + 2).toString(),
          content: `Thanks ${nameVal.toString().trim()}! We received your details. Email: ${emailMatch![0]}, Phone: ${phoneMatch![0]}. Our representative will contact you shortly regarding ${pendingProduct ?? 'your selected product'}.`,
          role: 'assistant',
          timestamp: new Date(),
        };
        setAwaitingContact(false);
        setPendingProduct(null);
        setMessages(prev => [...prev, ok]);
        setIsLoading(false);
        setConversationState('ending');
        return;
      }

      // If awaiting buy confirm
      if (awaitingBuyConfirm && (/^\s*yes\b/i.test(textToSend) || /\b(i\s+want\s+to\s+buy|buy\s+now|interested\s+to\s+buy)\b/i.test(lower))) {
        const askContacts: Message = {
          id: (Date.now() + 1).toString(),
          content: `Great! You're interested in ${pendingProduct ?? 'this product'}. Please provide your Name, Email, and Phone number.`,
          role: 'assistant',
          timestamp: new Date(),
        };
        setAwaitingBuyConfirm(false);
        setAwaitingContact(true);
        setMessages(prev => [...prev, askContacts]);
        setIsLoading(false);
        return;
      }
      if (awaitingBuyConfirm && (/^\s*no\b/i.test(textToSend) || /not now/i.test(lower))) {
        const noMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: 'Thanks for your time and interest in VayAccess. If you need anything later, feel free to ask or explore more products.',
          role: 'assistant',
          timestamp: new Date(),
        };
        setAwaitingBuyConfirm(false);
        setPendingProduct(null);
        setMessages(prev => [...prev, noMsg]);
        setIsLoading(false);
        return;
      }

      // Generate rule-based smart response first
      const smartResponse = generateSmartResponse(textToSend);

      if (smartResponse && smartResponse.content) {
        // Decide if we should upgrade to AI (ChatGPT-like) instead of a generic rule response.
        // Any of these phrases indicate the rule engine didn't actually understand the user
        // and is falling back to a generic menu prompt — that's our cue to hand off to the LLM.
        const genericHints = [
          'I can help with Products, Solutions, Services, or Office location',
          'I can help you with information about our products and service locations',
          'Want to navigate to Solutions, Services, or Contact',
          'Would you like to know about our service locations',
          "I couldn't find that product category",
        ];
        const isGeneric = genericHints.some(h => smartResponse.content.includes(h));
        const isPricingLike = /\b(price|pricing|cost|quote|quotation|estimate|fee|charge|budget|amount|rate|payment|₹|rupee|rs|inr)\b/i.test(textToSend);

        if (!isPricingLike && isGeneric) {
          // Upgrade to AI response for richer, more accurate content
          const apiKey = import.meta.env.VITE_GROQ_API_KEY;
          if (!apiKey || apiKey === 'your_groq_api_key_here') {
            // If no key, fallback to current smart response
            const assistantMessage: Message = {
              id: (Date.now() + 1).toString(),
              content: smartResponse.content,
              role: 'assistant',
              timestamp: new Date(),
              options: smartResponse.options,
              // Prefer dynamic cards for the query; fallback to smartResponse cards
              cards: getCardsForQuery(textToSend) ?? smartResponse.cards,
            };
            setMessages(prev => [...prev, assistantMessage]);
            await sendConversationEmail(textToSend, assistantMessage.content);
          } else {
            const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });
            const completion = await groq.chat.completions.create({
              messages: [
                { role: 'system', content: `You are VayBot, the friendly digital assistant for VayAccess Smart Parking Solutions — a parking and access-control company based in Hyderabad, India.

Behavior:
- For business questions, answer accurately about parking products, access control, integrations, services, and locations.
- For small talk, greetings, or questions about yourself, the company, where it's from, etc., respond warmly and briefly as the company's helpful assistant — don't refuse or deflect.
- For unrelated general-knowledge questions (math, world facts, etc.), answer briefly and then gently steer back to how you can help with their parking needs.
- Never quote prices or costs. If asked, say: "For detailed pricing and customized quotes, please contact our sales team at info@vayaccess.com or +91 720 724 4344."

Style: concise (2–4 sentences), warm, professional. Use bullet points for lists.` },
                { role: 'user', content: textToSend }
              ],
              model: 'llama-3.3-70b-versatile',
              temperature: 0.4,
              max_tokens: 600,
            });
            const responseText = completion?.choices[0]?.message?.content || smartResponse.content;
            const assistantMessage: Message = {
              id: (Date.now() + 1).toString(),
              content: responseText,
              role: 'assistant',
              timestamp: new Date(),
              options: [
                { id: 'products', label: ' View All Products', action: 'message', value: 'How many products do you have?' },
                { id: 'locations', label: ' Service Locations', action: 'message', value: 'How many locations do you serve?' },
                { id: 'call', label: ' Call Sales', action: 'phone', value: COMPANY.phone },
                { id: 'email', label: ' Email Sales', action: 'email', value: COMPANY.email },
              ],
              cards: getCardsForQuery(textToSend)
            };
            setMessages(prev => [...prev, assistantMessage]);
            await sendConversationEmail(textToSend, assistantMessage.content);
          }
        } else {
          // Keep rule-based response
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: smartResponse.content,
            role: 'assistant',
            timestamp: new Date(),
            options: smartResponse.options,
            cards: getCardsForQuery(textToSend) ?? smartResponse.cards,
          };
          setMessages(prev => [...prev, assistantMessage]);
          await sendConversationEmail(textToSend, assistantMessage.content);
        }
      } else {
        // Fallback: call Groq for a ChatGPT-like answer focused on VayAccess features only
        const apiKey = import.meta.env.VITE_GROQ_API_KEY;
        if (!apiKey || apiKey === 'your_groq_api_key_here') {
          throw new Error('API key not configured');
        }
        const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });
        const completion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: `You are VayBot, an assistant for VayAccess Smart Parking Solutions. Answer accurately about parking products, access control, integrations, and services. Do not provide any pricing or costs. If asked about pricing, say: "For detailed pricing and customized quotes, please contact our sales team at info@vayaccess.com or +91 720 724 4344." Keep answers concise and helpful, and prefer bullet points for lists.` },
            { role: 'user', content: textToSend }
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.4,
          max_tokens: 600,
        });
        const responseText = completion?.choices[0]?.message?.content || 'I can help with product and services information. What would you like to know?';
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: responseText,
          role: 'assistant',
          timestamp: new Date(),
          options: [
            { id: 'products', label: ' View All Products', action: 'message', value: 'How many products do you have?' },
            { id: 'locations', label: ' Service Locations', action: 'message', value: 'How many locations do you serve?' },
            { id: 'call', label: ' Call Sales', action: 'phone', value: COMPANY.phone },
            { id: 'email', label: ' Email Sales', action: 'email', value: COMPANY.email },
          ],
          cards: getCardsForQuery(textToSend)
        };
        setMessages(prev => [...prev, assistantMessage]);
        await sendConversationEmail(textToSend, assistantMessage.content);
      }
    } catch (error) {
      console.error('Error generating response:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm having trouble responding right now. Please try again or use the quick options below.",
        role: 'assistant',
        timestamp: new Date(),
        options: [
          { id: 'retry', label: ' Try Again', action: 'message', value: textToSend },
          { id: 'call', label: ' Call Sales', action: 'phone', value: COMPANY.phone },
          { id: 'email', label: ' Email Sales', action: 'email', value: COMPANY.email },
        ]
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickQuestions = [
    "Show all products",
    "Show me solutions",
    "Tell me about Barrier Gates",
    "Tell me about Access Control",
    "Where do you operate?",
    "RFID Card Readers",
  ];

  const hasUserInteracted = messages.some((m) => m.role === 'user');

  const handleQuickQuestion = (question: string) => {
    handleSendMessage(question);
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all duration-300 group relative"
          size="icon"
          title="Open VayBot Assistant"
        >
          <MessageCircle className="h-6 w-6" />
          <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-white rounded-full p-1 shadow-md">
              <MessageCircle className="h-3 w-3 text-blue-600" />
            </div>
          </div>
        </Button>
      </div>
    );
  }

  return (
    <Card
      className={`fixed bottom-6 right-6 w-[calc(100vw-2rem)] sm:w-96 max-w-[400px] shadow-2xl border-2 border-blue-200 z-50 transition-all duration-300 ${
        isMinimized ? 'h-16' : 'h-[600px] max-h-[calc(100vh-4rem)]'
      }`}
      style={{ overscrollBehavior: 'contain' }}
    >
      <CardHeader className={`bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 ${
        isMinimized ? 'rounded-lg' : 'rounded-t-lg'
      } relative`}>
        <div className="flex items-center justify-between">
          <div 
            className={`flex items-center space-x-3 ${isMinimized ? 'cursor-pointer' : ''}`}
            onClick={isMinimized ? () => setIsMinimized(false) : undefined}
          >
            <Avatar className="h-8 w-8 bg-white">
              <AvatarFallback className="text-blue-600 font-bold">VB</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">
                  VayBot Assistant
                  {isMinimized && <span className="ml-2 text-xs opacity-75">(Click to expand)</span>}
                </h3>
              </div>
              {!isMinimized && <p className="text-xs opacity-90">Smart Parking Solutions</p>}
            </div>
          </div>
          <div className="flex space-x-2 items-center">
            {!isMinimized && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMinimized(true)}
                className="h-8 w-8 text-white hover:bg-white/20 transition-colors rounded-full flex-shrink-0"
                title="Minimize chat"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-10 w-10 bg-red-500/90 hover:bg-red-600 text-white transition-all duration-200 rounded-full border-2 border-white shadow-lg z-30 relative flex-shrink-0"
              title="Close chat"
            >
              <X className="h-6 w-6 stroke-2" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {!isMinimized && (
        <CardContent className="p-0 flex flex-col h-[532px]">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id}>
                  <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex space-x-2 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className={message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200'}>
                          {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`rounded-lg p-3 ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Selectable Options */}
                  {message.options && message.role === 'assistant' && (
                    <div className="mt-3 ml-10 flex flex-wrap gap-2">
                      {message.options.map((option) => (
                        <Button
                          key={option.id}
                          variant="outline"
                          size="sm"
                          onClick={() => handleOptionClick(option)}
                          className="text-xs h-8 px-3 bg-white hover:bg-blue-50 border-blue-200 hover:border-blue-300 text-blue-700 hover:text-blue-800"
                        >
                          {option.label}
                          {option.action === 'phone' && <Phone className="ml-1 h-3 w-3" />}
                          {option.action === 'email' && <Mail className="ml-1 h-3 w-3" />}
                          {option.action === 'link' && <ExternalLink className="ml-1 h-3 w-3" />}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Product Cards Grid */}
                  {message.cards && message.role === 'assistant' && (
                    <div className="mt-3 ml-10 grid grid-cols-2 gap-3">
                      {message.cards.map(card => (
                        <div
                          key={card.id}
                          className="bg-white rounded-lg shadow border hover:shadow-md transition cursor-pointer overflow-hidden"
                          onClick={() => handleOptionClick({ id: card.id, label: card.title, action: card.action, value: card.value })}
                          title={card.title}
                        >
                          <div className="w-full h-20 bg-gray-100 overflow-hidden">
                            <img src={card.image} alt={card.title} className="w-full h-full object-cover" />
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-medium text-gray-900 line-clamp-2">{card.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex space-x-2 max-w-[80%]">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gray-200">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-gray-100 rounded-lg p-3">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Quick Questions — only shown until the user sends their first message */}
          {!hasUserInteracted && (
            <div className="px-3 pt-2 pb-3 border-t bg-gray-50/80">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Suggested</p>
              <div className="flex flex-wrap gap-1.5">
                {quickQuestions.map((question, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleQuickQuestion(question)}
                    className="text-xs px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors duration-200"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 sm:p-4 border-t bg-white">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
              <div className="flex-1 relative">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask about products, prices, locations..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={isLoading}
                  className="flex-1 min-h-[44px] sm:min-h-[40px] text-base sm:text-sm pr-4 resize-none"
                  style={{ 
                    fontSize: '16px',
                    lineHeight: '1.4',
                    minHeight: '44px'
                  }}
                />
              </div>
              <Button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputMessage.trim()}
                className="bg-blue-600 hover:bg-blue-700 min-h-[44px] sm:min-h-[40px] px-4 sm:px-3 flex-shrink-0"
              >
                <Send className="h-4 w-4 sm:h-4 sm:w-4" />
                <span className="ml-2 sm:hidden">Send</span>
              </Button>
            </div>
            
            {/* Status indicator */}
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>AI Assistant Online</span>
              </div>
              <span className="hidden sm:inline">Press Enter to send</span>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default EnhancedChatbot;
