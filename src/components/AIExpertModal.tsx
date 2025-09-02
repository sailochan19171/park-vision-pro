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
        { id: 'solutions', label: '🧭 Solutions', action: 'message', value: 'Show me your solutions' },
        { id: 'compare', label: '⚖️ Compare', action: 'message', value: 'Compare barrier gates and turnstiles' },
        { id: 'demo', label: '🎥 Request Demo', action: 'message', value: 'I want a product demo' },
        { id: 'install', label: '🛠️ Installation timeline', action: 'message', value: 'What is the installation timeline?' },
        { id: 'integration', label: '🔗 Integrations', action: 'message', value: 'Do you integrate with existing systems?' },
        { id: 'callback', label: '📞 Request a Callback', action: 'message', value: 'Request a callback' },
        { id: 'locations', label: '📍 Locations', action: 'message', value: 'Where do you operate?' }
      ]
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Purchase intent flow state
  // Purchase intent flow state
const [pendingProduct, setPendingProduct] = useState<string | null>(null);
const [awaitingContact, setAwaitingContact] = useState(false);
const [collectedName, setCollectedName] = useState<string | null>(null);
const [collectedEmail, setCollectedEmail] = useState<string | null>(null);
const [collectedPhone, setCollectedPhone] = useState<string | null>(null);
const [awaitingBuyConfirm, setAwaitingBuyConfirm] = useState(false);

  // Callback flow state
  const [awaitingCallback, setAwaitingCallback] = useState(false);
  const [callbackPhone, setCallbackPhone] = useState<string | null>(null);

  // Resolve asset URLs so images work in Vite in both dev and build
  const resolveAsset = (file: string) => new URL(`../assets/${file}`, import.meta.url).href;

  // Minimal catalog for product/solution image cards
  const expertProductCategories = [
    {
      name: 'Barrier Gates',
      products: [
        { name: 'Smart Barrier Gate System', image: resolveAsset('barrier-gate-10.jpg'), route: '/products/barrier-gates' },
        { name: 'Heavy Duty Barriers', image: resolveAsset('heavy-duty-barrier-gates.jpg'), route: '/products/barrier-gates' },
      ],
    },
    {
      name: 'Pedestrian Gates',
      products: [
        { name: 'Tripod Turnstiles', image: resolveAsset('tripod-turnstiles-24.jpg'), route: '/products/turnstiles' },
        { name: 'Flap Barrier Turnstiles', image: resolveAsset('flap-barrier-turnstiles.png'), route: '/products/turnstiles' },
      ],
    },
    {
      name: 'Access Control',
      products: [
        { name: 'RFID Card Readers', image: resolveAsset('rfid-card-reader.jpg'), route: '/products/access-control' },
        { name: 'Biometric Systems', image: resolveAsset('facial-recognition-terminal.jpg'), route: '/products/access-control' },
      ],
    },
    {
      name: 'Parking Management',
      products: [
        { name: 'Ticketless Parking', image: resolveAsset('parking-system-architecture.jpg'), route: '/solutions' },
        { name: 'Parking Guidance', image: resolveAsset('parking-guidance-23.jpg'), route: '/solutions' },
      ],
    },
  ];

  // Solutions catalog for image cards
  const expertSolutions = [
    { id: 'ticketless-parking', title: 'Ticketless Parking', image: resolveAsset('parking-system-architecture.jpg'), action: 'message' as const, value: 'Tell me about Ticketless Parking' },
    { id: 'parking-guidance', title: 'Parking Guidance', image: resolveAsset('parking-guidance-23.jpg'), action: 'message' as const, value: 'Tell me about Parking Guidance' },
    { id: 'mobile-access', title: 'Mobile Access', image: resolveAsset('mobile-access-control.jpg'), action: 'message' as const, value: 'Tell me about Mobile Access' },
    { id: 'license-plate-recognition', title: 'License Plate Recognition', image: resolveAsset('barrier-gate-9.jpg'), action: 'message' as const, value: 'Tell me about License Plate Recognition' },
  ];

  const getCardsForQuery = (q: string): ProductCard[] | undefined => {
    const lower = q.toLowerCase();

    if (/(all|show|view|list).*products/.test(lower) || lower.includes('how many products')) {
      return expertProductCategories.flatMap(cat => cat.products.map(p => ({
        id: p.name.toLowerCase().replace(/\s+/g, '-'),
        title: p.name,
        image: p.image,
        action: 'message' as const,
        value: `Tell me about ${p.name}`,
      })));
    }

    const addCategory = (name: string) => {
      const cat = expertProductCategories.find(c => c.name.toLowerCase() === name.toLowerCase());
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

    for (const cat of expertProductCategories) {
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

  const handleSendMessage = async (forcedText?: string) => {
    const originalUserInput = (forcedText ?? inputMessage);
    if (!originalUserInput.trim()) return;

    // If awaiting callback, collect phone number
    if (awaitingCallback) {
      const phoneMatch = originalUserInput.match(/\+?\d[\d\s\-()]{6,}/);
      if (!phoneMatch) {
        const needPhone: Message = {
          id: (Date.now() + 1).toString(),
          content: 'Please provide a valid phone number with country code (e.g., +91 98765 43210).',
          role: 'assistant',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, needPhone]);
        setInputMessage('');
        setIsLoading(false);
        return;
      }
      setCallbackPhone(phoneMatch[0].replace(/\s+/g, ''));
      setAwaitingCallback(false);
      const confirmCb: Message = {
        id: (Date.now() + 2).toString(),
        content: `Thanks! We’ll call you back shortly at ${phoneMatch[0]}. If you’d like, you can also share your email for confirmation.`,
        role: 'assistant',
        timestamp: new Date(),
        options: [
          { id: 'share-email', label: '✉️ Share email', action: 'message', value: 'My email is ' },
          { id: 'browse-products', label: '📦 Browse products', action: 'message', value: 'Show me your products' },
        ]
      };
      setMessages(prev => [...prev, confirmCb]);
      setInputMessage('');
      setIsLoading(false);
      return;
    }

    // If awaiting contact details, capture email and phone
    if (awaitingContact) {
      const emailMatch = originalUserInput.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      const phoneMatch = originalUserInput.match(/\+?\d[\d\s\-()]{6,}/);

      if (emailMatch) setCollectedEmail(emailMatch[0]);
      if (phoneMatch) setCollectedPhone(phoneMatch[0].replace(/\s+/g, ''));

      if (!emailMatch || !phoneMatch) {
        const missing = !emailMatch && !phoneMatch
          ? 'email and phone number'
          : !emailMatch
            ? 'email address'
            : 'phone number';
        const needMore: Message = {
          id: (Date.now() + 1).toString(),
          content: `Thanks! I still need your ${missing} to proceed. You can paste both together, e.g.: john@company.com, +91 98765 43210`,
          role: 'assistant',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, needMore]);
        setInputMessage('');
        setIsLoading(false);
        return;
      }

      const confirmMsg: Message = {
        id: (Date.now() + 2).toString(),
        content: `Great! We received your details. Email: ${emailMatch[0]}, Phone: ${phoneMatch[0]}. Our representative will contact you shortly regarding ${pendingProduct ?? 'your selected product'}.`,
        role: 'assistant',
        timestamp: new Date(),
        options: [
          { id: 'view-products', label: '📦 View more products', action: 'message', value: 'Show me your products' },
          { id: 'ask-more', label: '❓ Ask another question', action: 'message', value: 'I have another question' },
        ],
      };
      setAwaitingContact(false);
      setPendingProduct(null);
      setMessages(prev => [...prev, confirmMsg]);
      setInputMessage('');
      setIsLoading(false);
      return;
    }

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
      // Intent handling before calling AI: locations, purchase flow, and pricing
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
          ],
          cards: getCardsForQuery(originalUserInput)
        };
        setMessages(prev => [...prev, locationsResponse]);
        setIsLoading(false);
        return;
      }

      // 1.5) Products listing intent - show image cards
      if (/(all|show|view|list).*products/i.test(lowerInput) || lowerInput.includes('how many products') || lowerInput.startsWith('show me your products')) {
        const cards = getCardsForQuery('all products') || [];
        const msg: Message = {
          id: (Date.now() + 2).toString(),
          content: 'Here are our products. Tap any to learn more:',
          role: 'assistant',
          timestamp: new Date(),
          cards,
          options: [
            { id: 'solutions', label: '🧭 Solutions', action: 'message', value: 'Show me your solutions' },
            { id: 'compare', label: '⚖️ Compare', action: 'message', value: 'Compare barrier gates and turnstiles' },
          ]
        };
        setMessages(prev => [...prev, msg]);
        setIsLoading(false);
        return;
      }

      // 1.55) Product details intent - describe then ask to buy
      {
        const tellMatch = originalUserInput.match(/tell me about\s+(.+)/i) || originalUserInput.match(/details of\s+(.+)/i);
        let matchedProduct: { name: string; image: string; route: string } | null = null;
        if (tellMatch) {
          const candidate = tellMatch[1].trim().toLowerCase();
          for (const cat of expertProductCategories) {
            const p = cat.products.find(prod => prod.name.toLowerCase().includes(candidate) || candidate.includes(prod.name.toLowerCase()));
            if (p) { matchedProduct = p as any; break; }
          }
        } else {
          for (const cat of expertProductCategories) {
            const p = cat.products.find(prod => lowerInput.includes(prod.name.toLowerCase()));
            if (p) { matchedProduct = p as any; break; }
          }
        }
        if (matchedProduct) {
          const name = matchedProduct.name;
          // Minimal descriptions for known products
          const descs: Record<string, { desc: string; features: string[]; applications: string[] }> = {
            'smart barrier gate system': {
              desc: 'Advanced automatic barrier gate with LED indicators and anti-crash safety.',
              features: ['LED status indicators', 'Anti-crash mechanism', 'Remote monitoring', 'Weather resistant'],
              applications: ['Corporate offices', 'Malls', 'Residential', 'Parking lots'],
            },
            'heavy duty barriers': {
              desc: 'Industrial-grade barriers designed for high-traffic, continuous operation.',
              features: ['High traffic volume', 'Reinforced build', '24/7 duty cycle', 'Reliable motors'],
              applications: ['Airports', 'Industrial facilities', 'Govt buildings', 'Toll plazas'],
            },
            'tripod turnstiles': {
              desc: 'Compact and reliable pedestrian access control.',
              features: ['Biometric/card integration', 'Compact design', 'Bidirectional access', 'Durable'],
              applications: ['Offices', 'Metro', 'Education', 'Gyms'],
            },
            'flap barrier turnstiles': {
              desc: 'Elegant fast-passage pedestrian gates with anti-tailgating.',
              features: ['Fast passage', 'LED indicators', 'Anti-tailgating', 'Sleek design'],
              applications: ['Lobbies', 'Hotels', 'Hospitals', 'Malls'],
            },
            'rfid card readers': {
              desc: 'Secure contactless card-based access control.',
              features: ['Long-range reading', 'Multiple card types', 'Secure encryption', 'Weather resistant'],
              applications: ['Offices', 'Societies', 'Education', 'Healthcare'],
            },
            'biometric systems': {
              desc: 'Fingerprint and facial recognition access control.',
              features: ['Face/fingerprint', 'Anti-spoofing', 'Multi-modal', 'Fast matching'],
              applications: ['High-security areas', 'Banks', 'Govt', 'Data centers'],
            },
            'ticketless parking': {
              desc: 'Modern ticketless parking with LPR and mobile app.',
              features: ['Mobile app', 'Real-time monitoring', 'Digital payments', 'License plate recognition'],
              applications: ['Smart cities', 'Airports', 'Hospitals', 'Commercial complexes'],
            },
            'parking guidance': {
              desc: 'Intelligent space detection and guidance system.',
              features: ['Space detection', 'LED indicators', 'Analytics dashboard', 'Real-time updates'],
              applications: ['Multi-level parking', 'Malls', 'Airports', 'Offices'],
            },
          };
          const key = name.toLowerCase();
          const info = descs[key];
          const detailsText = info
            ? `**${name}**\n\n${info.desc}\n\n• ${info.features.join('\n• ')}\n\nApplications:\n• ${info.applications.join('\n• ')}`
            : `**${name}**\n\nKey features and integrations are available. Would you like a detailed demo?`;
          
          const detailsMsg: Message = {
            id: (Date.now() + 2).toString(),
            content: detailsText,
            role: 'assistant',
            timestamp: new Date(),
            cards: [{
              id: name.toLowerCase().replace(/\s+/g, '-'),
              title: name,
              image: (matchedProduct as any).image,
              action: 'navigate',
              value: (matchedProduct as any).route,
            }]
          };
          setMessages(prev => [...prev, detailsMsg]);

          setPendingProduct(name);
          setAwaitingBuyConfirm(true);
          const askBuy: Message = {
            id: (Date.now() + 3).toString(),
            content: `Are you willing to buy ${name}?`,
            role: 'assistant',
            timestamp: new Date(),
            options: [
              { id: 'buy-yes', label: '✅ Yes', action: 'message', value: 'Yes, I want to buy' },
              { id: 'buy-no', label: '❌ No', action: 'message', value: 'No, not now' },
            ],
          };
          setMessages(prev => [...prev, askBuy]);
          setIsLoading(false);
          return;
        }
      }

      // 1.6) Explicit buy intent (no product selected yet)
      const purchaseIntent = /(buy|purchase|interested|want\s+to\s+buy|like\s+to\s+buy|order)\b/i;
      // Only prompt to buy if we’re not already awaiting a Yes/No
      if (!awaitingBuyConfirm && purchaseIntent.test(lowerInput)) {
        if (!pendingProduct) {
          const promptPick: Message = {
            id: (Date.now() + 2).toString(),
            content: 'Great! Which product are you interested in?',
            role: 'assistant',
            timestamp: new Date(),
            cards: getCardsForQuery('all products')
          };
          setMessages(prev => [...prev, promptPick]);
          setIsLoading(false);
          return;
        } else {
          setAwaitingBuyConfirm(true);
          const askBuy: Message = {
            id: (Date.now() + 2).toString(),
            content: `Are you willing to buy ${pendingProduct}?`,
            role: 'assistant',
            timestamp: new Date(),
            options: [
              { id: 'buy-yes', label: '✅ Yes', action: 'message', value: 'Yes, I want to buy' },
              { id: 'buy-no', label: '❌ No', action: 'message', value: 'No, not now' },
            ],
          };
          setMessages(prev => [...prev, askBuy]);
          setIsLoading(false);
          return;
        }
      }

      // 1.6) Yes/No follow-up handling (only when awaiting user confirm)
      if (awaitingBuyConfirm && (/^\s*yes\b/i.test(originalUserInput) || /\b(i\s+want\s+to\s+buy|buy\s+now|interested\s+to\s+buy)\b/i.test(lowerInput))) {
        const positive: Message = {
          id: (Date.now() + 3).toString(),
          content: `Great! You're interested in ${pendingProduct ?? 'this product'}. Please provide your Name, Email, and Phone number.`,
          role: 'assistant',
          timestamp: new Date(),
        };
        setAwaitingBuyConfirm(false);
        setAwaitingContact(true);
        // Clear any options from the last askBuy message by pushing a new assistant message without options
        // Clear any options from the last askBuy message by pushing a new assistant message without options
        setMessages(prev => [...prev, positive]);
        setIsLoading(false);
        return;
      }

      if (awaitingBuyConfirm && (/^no[,\s.!]?/i.test(originalUserInput) || /\bnot now\b/i.test(lowerInput))) {
        const negative: Message = {
          id: (Date.now() + 4).toString(),
          content: 'Ohh, thanks for your valuable time and interest in VayAccess control systems. If you need anything later, feel free to ask or explore more products.',
          role: 'assistant',
          timestamp: new Date(),
          options: [
            { id: 'explore-solutions', label: '🧭 Explore solutions', action: 'message', value: 'Show me your solutions' },
            { id: 'compare-products', label: '⚖️ Compare products', action: 'message', value: 'Compare barrier gates and turnstiles' },
            { id: 'subscribe', label: '🔔 Get updates', action: 'message', value: 'Subscribe me to updates' },
          ]
        };
        setAwaitingBuyConfirm(false);
        setPendingProduct(null);
        setMessages(prev => [...prev, negative]);
        setIsLoading(false);
        return;
      }

      // 1.7) Extra intents for compare/demo/timeline/integration/solutions/callback
      if (/\bcompare\b/i.test(lowerInput)) {
        const msg: Message = {
          id: (Date.now() + 5).toString(),
          content: 'Comparison: Barrier gates vs Turnstiles.\n\n- Barrier Gates: Vehicle access control, arm-type barriers, high throughput for cars.\n- Turnstiles: Pedestrian access control, tripod/flap/swing, anti-tailgating.\n\nChoose what you want to explore next:',
          role: 'assistant',
          timestamp: new Date(),
          options: [
            { id: 'barrier-gates', label: '🚗 Barrier Gates', action: 'message', value: 'Show me barrier gates' },
            { id: 'turnstiles', label: '🚶 Turnstiles', action: 'message', value: 'Show me turnstiles' },
            { id: 'access-control', label: '🔐 Access Control', action: 'message', value: 'Tell me about access control' },
          ],
          cards: getCardsForQuery('barrier gates')
        };
        setMessages(prev => [...prev, msg]);
        setIsLoading(false);
        return;
      }

      if (/demo|product\s+demo|request\s+demo/i.test(lowerInput)) {
        const msg: Message = {
          id: (Date.now() + 6).toString(),
          content: 'Great! We can arrange a product demo. Please share the product you want to see and your preferred time. You can also provide your email and phone to schedule quickly.',
          role: 'assistant',
          timestamp: new Date(),
          options: [
            { id: 'give-contacts', label: '📩 Share contacts', action: 'message', value: 'Here are my email and phone' },
            { id: 'browse-products', label: '📦 Browse products', action: 'message', value: 'Show me your products' },
          ],
        };
        setMessages(prev => [...prev, msg]);
        setIsLoading(false);
        return;
      }

      if (/install(ation)?\s+(timeline|time|duration)|how\s+long\s+install/i.test(lowerInput)) {
        const msg: Message = {
          id: (Date.now() + 7).toString(),
          content: 'Typical installation timeline:\n\n- Site survey and assessment: 1–3 days\n- Hardware delivery and setup: 3–7 days\n- Software configuration and testing: 2–5 days\n- Training and handover: 1–2 days\n\nActual time varies by project. Would you like a site assessment?',
          role: 'assistant',
          timestamp: new Date(),
          options: [
            { id: 'site-assessment', label: '📍 Request site assessment', action: 'message', value: 'I want a site assessment' },
            { id: 'contact-sales', label: '📞 Contact sales', action: 'phone', value: '+91 720 724 4344' },
          ],
        };
        setMessages(prev => [...prev, msg]);
        setIsLoading(false);
        return;
      }

      if (/integrat(e|ion)|existing\s+systems|third\s*party/i.test(lowerInput)) {
        const msg: Message = {
          id: (Date.now() + 8).toString(),
          content: 'Yes, VayAccess integrates with many systems including:\n\n- LPR/ANPR cameras\n- RFID and biometric readers\n- Payment gateways\n- Building management systems\n- Mobile access apps\n\nTell me what system you need integration with.',
          role: 'assistant',
          timestamp: new Date(),
          options: [
            { id: 'lpr', label: '📸 LPR Cameras', action: 'message', value: 'Integration with LPR cameras' },
            { id: 'bms', label: '🏢 Building Mgmt', action: 'message', value: 'Integration with BMS' },
            { id: 'payments', label: '💳 Payments', action: 'message', value: 'Integration with payment gateways' },
          ],
        };
        setMessages(prev => [...prev, msg]);
        setIsLoading(false);
        return;
      }

      if (/\bsolutions?\b|show\s+me\s+your\s+solutions/i.test(lowerInput)) {
        const msg: Message = {
          id: (Date.now() + 9).toString(),
          content: 'Here are some of our VayAccess solutions. Tap any to learn more:',
          role: 'assistant',
          timestamp: new Date(),
          cards: expertSolutions,
          options: [
            { id: 'request-demo', label: '🎥 Request demo', action: 'message', value: 'I want a product demo' },
            { id: 'compare', label: '⚖️ Compare', action: 'message', value: 'Compare barrier gates and turnstiles' },
          ]
        };
        setMessages(prev => [...prev, msg]);
        setIsLoading(false);
        return;
      }

      if (/request\s+a?\s*callback|callback\b/i.test(lowerInput)) {
        setAwaitingCallback(true);
        const msg: Message = {
          id: (Date.now() + 10).toString(),
          content: 'Sure, we can call you back. Please share your phone number with country code (e.g., +91 98765 43210).',
          role: 'assistant',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, msg]);
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
          ],
          cards: getCardsForQuery(originalUserInput)
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
          { id: 'ask-buy', label: '🛒 Interested to buy?', action: 'message', value: 'I want to buy' },
          { id: 'service-locations', label: '📍 Service Locations', action: 'message', value: 'Where do you operate?' },
          { id: 'call-sales', label: '📞 Call Sales', action: 'phone', value: '+91 720 724 4344' },
          { id: 'email-sales', label: '✉️ Email Sales', action: 'email', value: 'info@vayaccess.com' }
        ],
        cards: getCardsForQuery(originalUserInput)
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
                                handleSendMessage(opt.value);
                                setInputMessage('');
                              } else if (opt.action === 'phone') {
                                window.location.href = `tel:${opt.value}`;
                              } else if (opt.action === 'email') {
                                window.location.href = `mailto:${opt.value}`;
                              } else if (opt.action === 'link') {
                                window.open(opt.value, '_blank');
                              } else if (opt.action === 'navigate') {
                                window.location.href = opt.value;
                              }
                            }}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    )}

                    {message.cards && message.role === 'assistant' && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {message.cards.map(card => (
                          <div
                            key={card.id}
                            className="bg-white rounded-lg shadow border hover:shadow-md transition cursor-pointer overflow-hidden"
                            onClick={() => {
                              if (card.action === 'navigate') {
                                window.location.href = card.value;
                              } else {
                                setInputMessage(card.value);
                                handleSendMessage();
                              }
                            }}
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