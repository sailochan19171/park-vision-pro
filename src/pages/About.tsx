import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useToast } from "../hooks/use-toast";
import { 
  Building2, 
  Users, 
  Settings, 
  Award, 
  MapPin, 
  Phone, 
  Mail, 
  Calendar,
  Factory,
  Wrench,
  CheckCircle,
  Star,
  Globe,
  Shield,
  Truck,
  Clock,
  Camera,
  Smartphone,
  CreditCard,
  Zap,
  QrCode,
  Wifi,
  BarChart3,
  Car,
  Eye,
  Lock,
  Bell,
  Database,
  Cloud,
  Monitor,
  FileText,
  TrendingUp,
  Target,
  Lightbulb,
  Cog,
  PieChart,
  Activity,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle
} from "lucide-react";

// Import assets
import parkingGarage from "../assets/parking-garage.jpg";
import barrierGate from "../assets/barrier-gate-system.png";
import accessControl from "../assets/access-control-software.jpg";

const About = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleStartProject = () => {
    toast({
      title: "Project Inquiry Started!",
      description: "Our team will contact you within 24 hours to discuss your requirements.",
    });
    
    // Scroll to contact section with proper header offset
    const contactElement = document.querySelector('#contact');
    if (contactElement) {
      const headerHeight = 80;
      const elementPosition = contactElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const boardMembers = [
    {
      name: "Nanda Srinivas Rao",
      position: "Chairman & CEO",
      experience: "30+ years",
      // specialization: "Smart Infrastructure & IoT Solutions",
      // education: "MS in Electrical Engineering, IIT Delhi",
      image: "/api/placeholder/150/150",
      // bio: "Visionary leader with over 25 years in the smart infrastructure industry. Pioneered the adoption of IoT-based parking solutions in India and leads our strategic vision for global expansion."
    },
    {
      name: "Siva Rama Krishna",
      position: "Chief Technology Officer",
      experience: "30 years",
      // specialization: "RFID & Access Control Systems",
      // education: "PhD in Computer Science, IISc Bangalore",
      image: "/api/placeholder/150/150",
      // bio: "Technology innovator specializing in RFID and access control systems. Holds 12 patents in smart parking technology and drives our R&D initiatives."
    },
    {
      name: "Venkat Rao",
      position: "Director",
      experience: "30+ years",
      // specialization: "Industrial Automation & Quality Control",
      // education: "B.Tech Mechanical Engineering, NIT Surat",
      image: "/api/placeholder/150/150",
      // bio: "Manufacturing expert with extensive experience in industrial automation. Ensures world-class quality standards across all our manufacturing processes."
    },
    {
      name: "Sunita Reddy",
      position: "Chief Financial Officer",
      experience: "15+ years",
      specialization: "Financial Strategy & Risk Management",
      education: "CA, MBA Finance from XLRI",
      image: "/api/placeholder/150/150",
      bio: "Financial strategist with proven track record in scaling technology companies. Manages our financial operations and growth investments."
    }
  ];

  const vayAccessFeatures = [
    {
      title: "ANPR Technology",
      description: "Advanced Automatic Number Plate Recognition with 99.5% accuracy",
      icon: <Camera className="h-8 w-8" />,
      benefits: [
        "Real-time license plate detection and recognition",
        "Multi-camera integration with centralized monitoring",
        "AI-powered image processing for enhanced accuracy",
        "Support for Indian and international number plate formats",
        "Night vision capabilities with infrared illumination",
        "Weather-resistant operation in all conditions"
      ],
      techSpecs: {
        accuracy: "99.5%",
        processingTime: "<200ms",
        supportedFormats: "15+ countries",
        cameraResolution: "4K Ultra HD"
      }
    },
    {
      title: "IoT Barrier Gates",
      description: "Smart automated barrier gates with remote monitoring and control",
      icon: <Shield className="h-8 w-8" />,
      benefits: [
        "Automatic vehicle detection and barrier operation",
        "Remote monitoring and control via mobile app",
        "Anti-crash safety mechanisms with obstacle detection",
        "Customizable boom lengths from 3m to 6m",
        "LED strip lighting for enhanced visibility",
        "Battery backup for uninterrupted operation"
      ],
      techSpecs: {
        operatingSpeed: "2-6 seconds",
        durability: "1M+ operations",
        powerConsumption: "150W",
        connectivity: "4G/WiFi/Ethernet"
      }
    },
    {
      title: "Mobile Application Suite",
      description: "Comprehensive mobile apps for users and administrators",
      icon: <Smartphone className="h-8 w-8" />,
      benefits: [
        "User-friendly interface for parking booking and payment",
        "Real-time parking space availability and navigation",
        "Digital wallet integration with multiple payment options",
        "Push notifications for entry/exit and payment alerts",
        "Historical parking data and expense tracking",
        "Admin dashboard for system monitoring and control"
      ],
      techSpecs: {
        platforms: "iOS & Android",
        languages: "12+ languages",
        offline: "Offline mode available",
        security: "Bank-grade encryption"
      }
    },
    {
      title: "Cloud-Based Management",
      description: "Centralized cloud platform for comprehensive parking management",
      icon: <Cloud className="h-8 w-8" />,
      benefits: [
        "Real-time monitoring of all parking facilities",
        "Automated billing and revenue management",
        "Advanced analytics and reporting dashboards",
        "Multi-location management from single interface",
        "API integration with third-party systems",
        "Scalable infrastructure with 99.9% uptime"
      ],
      techSpecs: {
        uptime: "99.9%",
        dataCenter: "AWS/Azure",
        apiCalls: "10M+ per day",
        storage: "Unlimited"
      }
    },
    {
      title: "RFID Access Control",
      description: "Contactless RFID-based vehicle and pedestrian access management",
      icon: <CreditCard className="h-8 w-8" />,
      benefits: [
        "Contactless vehicle and pedestrian access",
        "Long-range RFID readers (up to 10 meters)",
        "Encrypted RFID cards with anti-cloning protection",
        "Integration with existing access control systems",
        "Visitor management with temporary access cards",
        "Audit trails and access logging for security"
      ],
      techSpecs: {
        readRange: "Up to 10m",
        cardLife: "10+ years",
        encryption: "AES-256",
        compatibility: "ISO 14443"
      }
    },
    {
      title: "Smart Analytics & Reporting",
      description: "AI-powered analytics for operational insights and optimization",
      icon: <BarChart3 className="h-8 w-8" />,
      benefits: [
        "Real-time occupancy monitoring and forecasting",
        "Revenue analytics with profit/loss tracking",
        "Peak hour analysis and capacity optimization",
        "Customer behavior insights and trends",
        "Automated report generation and scheduling",
        "Predictive maintenance alerts and scheduling"
      ],
      techSpecs: {
        dataPoints: "100+ metrics",
        reporting: "Real-time & Scheduled",
        forecasting: "AI-powered",
        integration: "BI tools compatible"
      }
    }
  ];

  const manufacturingCapabilities = [
    {
      title: "Advanced Manufacturing Facility",
      description: "State-of-the-art 50,000 sq ft manufacturing facility equipped with latest automation technology",
      features: [
        "ISO 9001:2015 certified quality management",
        "Automated assembly lines for barrier gates",
        "RFID card production and encoding facility",
        "Quality testing labs with environmental chambers"
      ],
      capacity: "5,000 units/month",
      location: "Pune, Maharashtra"
    },
    {
      title: "Product Range",
      description: "Comprehensive range of smart parking and access control solutions",
      features: [
        "Automatic Barrier Gates (3m to 6m boom lengths)",
        "RFID Access Control Systems",
        "Pedestrian Turnstiles & Gates",
        "Parking Management Software",
        "Solar-powered LED guidance systems"
      ],
      certifications: ["CE Marking", "FCC Certification", "IP65 Rating", "RoHS Compliance"]
    },
    {
      title: "Quality Standards",
      description: "Rigorous quality control processes ensuring reliability and durability",
      features: [
        "100% product testing before dispatch",
        "Environmental stress testing",
        "EMC compliance verification",
        "Continuous improvement processes"
      ],
      warranty: "2-year comprehensive warranty",
      support: "24/7 technical support"
    }
  ];

  const installationServices = [
    {
      title: "Site Survey & Planning",
      description: "Comprehensive site assessment and customized solution design",
      timeline: "1-2 days",
      deliverables: [
        "Detailed site survey report",
        "Technical specifications document",
        "Installation timeline and milestones",
        "Cost estimation and project proposal"
      ]
    },
    {
      title: "Professional Installation",
      description: "Expert installation by certified technicians",
      timeline: "2-5 days (depending on project size)",
      deliverables: [
        "Complete system installation",
        "Electrical connections and commissioning",
        "System configuration and testing",
        "User training and documentation"
      ]
    },
    {
      title: "Testing & Commissioning",
      description: "Thorough testing to ensure optimal performance",
      timeline: "1 day",
      deliverables: [
        "System performance verification",
        "Load testing and stress testing",
        "Integration testing with existing systems",
        "Performance optimization"
      ]
    },
    {
      title: "Maintenance & Support",
      description: "Ongoing maintenance and technical support services",
      timeline: "Ongoing",
      deliverables: [
        "Preventive maintenance schedules",
        "Remote monitoring and diagnostics",
        "Spare parts availability",
        "Annual maintenance contracts"
      ]
    }
  ];

  const companyMilestones = [
    { year: 2015, event: "Company founded with vision for smart parking solutions" },
    { year: 2017, event: "First major VayAccess deployment - 500 parking spaces in Mumbai" },
    { year: 2019, event: "Achieved ISO 9001:2015 certification and launched ANPR technology" },
    { year: 2020, event: "Expanded VayAccess platform to 25+ cities across India" },
    { year: 2022, event: "Launched IoT-enabled VayAccess smart parking platform with mobile apps" },
    { year: 2023, event: "Crossed 100,000+ parking spaces under VayAccess management" },
    { year: 2024, event: "International expansion of VayAccess to Southeast Asia markets" }
  ];

  const vayAccessBenefits = [
    {
      category: "For Property Owners",
      icon: <Building2 className="h-6 w-6" />,
      benefits: [
        "Increased revenue through optimized pricing and utilization",
        "Reduced operational costs with automated management",
        "Enhanced security with ANPR and access control",
        "Real-time monitoring and control of parking facilities",
        "Detailed analytics for better decision making",
        "Improved customer satisfaction and retention"
      ]
    },
    {
      category: "For End Users",
      icon: <Users className="h-6 w-6" />,
      benefits: [
        "Seamless parking experience with mobile app booking",
        "Real-time availability and navigation to parking spots",
        "Contactless payment options and digital receipts",
        "No physical tickets or cards required",
        "Parking history and expense tracking",
        "24/7 customer support and assistance"
      ]
    },
    {
      category: "For System Administrators",
      icon: <Settings className="h-6 w-6" />,
      benefits: [
        "Centralized management of multiple parking locations",
        "Automated billing and revenue collection",
        "Real-time monitoring and alert systems",
        "Comprehensive reporting and analytics",
        "Remote troubleshooting and maintenance",
        "Scalable platform for business growth"
      ]
    }
  ];

  const technologyStack = [
    {
      layer: "Hardware Layer",
      icon: <Cog className="h-6 w-6" />,
      components: [
        "IP cameras with AI processing chips",
        "IoT-enabled barrier gates and sensors",
        "RFID readers and access control panels",
        "LED displays and guidance systems",
        "Network switches and communication modules"
      ]
    },
    {
      layer: "Software Layer",
      icon: <Monitor className="h-6 w-6" />,
      components: [
        "ANPR engine with machine learning algorithms",
        "Real-time parking management system",
        "Mobile applications (iOS & Android)",
        "Web-based admin dashboard",
        "API gateway for third-party integrations"
      ]
    },
    {
      layer: "Cloud Infrastructure",
      icon: <Cloud className="h-6 w-6" />,
      components: [
        "AWS/Azure cloud hosting with auto-scaling",
        "Microservices architecture for reliability",
        "Real-time data processing and analytics",
        "Secure payment gateway integration",
        "Backup and disaster recovery systems"
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="pb-16 bg-gradient-to-br from-tech-blue/5 via-white to-tech-blue-light/5">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-tech-blue/10 text-tech-blue border-tech-blue/20">
              About VayAccess 
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
              Pioneering Smart Parking
              <span className="text-tech-blue"> Solutions</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
              From our world-class VayAccess platform to comprehensive manufacturing and installation services, 
              discover how we're transforming parking infrastructure across the globe with cutting-edge technology.
            </p>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <section className="py-8 border-b">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
              <TabsTrigger value="overview">Company Overview</TabsTrigger>
              <TabsTrigger value="vayaccess">VayAccess Platform</TabsTrigger>
              <TabsTrigger value="board">Leadership Team</TabsTrigger>
              <TabsTrigger value="manufacturing">Manufacturing</TabsTrigger>
              <TabsTrigger value="installation">Installation</TabsTrigger>
            </TabsList>

            {/* Company Overview */}
            <TabsContent value="overview" className="mt-12">
              <div className="max-w-4xl mx-auto prose prose-lg">
                {/* Company Story */}
                <div className="mb-16">
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
                    Our Story: Revolutionizing Urban Parking with VayAccess
                  </h2>
                  
                  <div className="mb-8">
                    <img
                      src={parkingGarage}
                      alt="VayAccess Smart Parking Solutions"
                      className="w-full rounded-lg shadow-lg mb-6"
                    />
                  </div>

                  <p className="text-lg text-muted-foreground leading-relaxed mb-6">
                    Founded in 2015 with a vision to revolutionize parking infrastructure in India, VayAccess parking solutions has grown from a startup to a leading smart parking solutions provider serving over 100,000 parking spaces across 50+ cities through our flagship VayAccess platform. What started as a simple idea to solve urban parking challenges has evolved into a comprehensive ecosystem that transforms how we think about parking management.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Our journey began when our founders recognized the growing challenges of urban parking management and the need for intelligent, sustainable solutions. In bustling metropolitan cities, traditional parking systems were struggling to keep pace with increasing vehicle density and user expectations. We saw an opportunity to bridge this gap through technology innovation.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Today, we combine cutting-edge ANPR (Automatic Number Plate Recognition) technology, IoT integration, and mobile-first approach to deliver comprehensive parking management systems that benefit property owners, administrators, and end users alike. VayAccess, our flagship platform, represents the culmination of years of research and development in smart parking technology, offering seamless integration of hardware and software solutions for modern parking challenges.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    The VayAccess platform has become synonymous with reliability, innovation, and user satisfaction in the smart parking industry. Our commitment to continuous improvement and customer-centric design has earned us the trust of clients ranging from small commercial complexes to large-scale municipal parking facilities across India and Southeast Asia.
                  </p>
                </div>

                {/* Company Milestones */}
                <div className="mb-16">
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
                    The VayAccess Evolution: A Timeline of Innovation
                  </h2>
                  
                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Our journey with VayAccess has been marked by significant milestones that have shaped the smart parking landscape in India. Each year brought new challenges, innovations, and opportunities to refine our platform and expand our reach.
                  </p>

                  <div className="space-y-6 mb-8">
                    <div className="border-l-4 border-tech-blue pl-6">
                      <h3 className="text-xl font-semibold text-foreground mb-2">2015: The Foundation</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        Company founded with vision for smart parking solutions. Our initial focus was on understanding the pain points of traditional parking systems and developing a technology-first approach to address these challenges.
                      </p>
                    </div>

                    <div className="border-l-4 border-tech-blue pl-6">
                      <h3 className="text-xl font-semibold text-foreground mb-2">2017: First Major VayAccess Deployment</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        Our first major deployment of 500 parking spaces in Mumbai marked the beginning of VayAccess as a commercially viable platform. This project became our testing ground for refining user experience and system reliability.
                      </p>
                    </div>

                    <div className="border-l-4 border-tech-blue pl-6">
                      <h3 className="text-xl font-semibold text-foreground mb-2">2019: Technology Advancement</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        Achieved ISO 9001:2015 certification and launched ANPR technology integration. This year marked our transition from basic parking management to AI-powered vehicle recognition systems.
                      </p>
                    </div>

                    <div className="border-l-4 border-tech-blue pl-6">
                      <h3 className="text-xl font-semibold text-foreground mb-2">2020: Rapid Expansion</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        Expanded VayAccess platform to 25+ cities across India. Despite global challenges, we continued to grow by adapting our solutions to meet changing urban mobility needs.
                      </p>
                    </div>

                    <div className="border-l-4 border-tech-blue pl-6">
                      <h3 className="text-xl font-semibold text-foreground mb-2">2022: IoT Revolution</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        Launched IoT-enabled VayAccess smart parking platform with mobile apps. This transformation made parking management truly intelligent and user-friendly.
                      </p>
                    </div>

                    <div className="border-l-4 border-tech-blue pl-6">
                      <h3 className="text-xl font-semibold text-foreground mb-2">2023: Major Milestone</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        Crossed 100,000+ parking spaces under VayAccess management. This achievement validated our platform's scalability and reliability at enterprise level.
                      </p>
                    </div>

                    <div className="border-l-4 border-tech-blue pl-6">
                      <h3 className="text-xl font-semibold text-foreground mb-2">2024: Global Reach</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        International expansion of VayAccess to Southeast Asia markets. Our platform is now serving diverse markets with localized features and support.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Key Statistics */}
                <div className="mb-16 bg-gradient-to-r from-tech-blue/5 to-tech-blue-light/5 p-8 rounded-lg">
                  <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
                    VayAccess Platform Achievements
                  </h2>
                  <div className="grid md:grid-cols-4 gap-8 text-center">
                    <div>
                      <div className="text-3xl font-bold text-tech-blue mb-2">500+</div>
                      <div className="text-muted-foreground">VayAccess Installations</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-tech-blue mb-2">50+</div>
                      <div className="text-muted-foreground">Cities with VayAccess</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-tech-blue mb-2">100K+</div>
                      <div className="text-muted-foreground">Parking Spaces Managed</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-tech-blue mb-2">99.9%</div>
                      <div className="text-muted-foreground">Platform Uptime</div>
                    </div>
                  </div>
                </div>

                {/* VayAccess Benefits Overview */}
                <div className="mb-16">
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
                    Why Choose VayAccess: Transforming Parking for Everyone
                  </h2>
                  
                  <p className="text-muted-foreground leading-relaxed mb-8">
                    VayAccess is designed with a multi-stakeholder approach, ensuring that every participant in the parking ecosystem benefits from our technology. Our platform creates value for property owners, delivers convenience to end users, and provides powerful tools for system administrators.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-4">
                    <Building2 className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Benefits for Property Owners
                  </h3>
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Property owners experience increased revenue through optimized pricing and utilization strategies powered by VayAccess analytics. Our platform reduces operational costs with automated management systems, eliminating the need for manual oversight while enhancing security through integrated ANPR and access control systems. Real-time monitoring and control capabilities provide property owners with unprecedented visibility into their parking facilities, enabling data-driven decision making that improves customer satisfaction and retention rates.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-4">
                    <Users className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Enhanced Experience for End Users
                  </h3>
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    End users enjoy a seamless parking experience through our mobile app booking system, which provides real-time availability information and navigation assistance to available parking spots. VayAccess eliminates the hassle of physical tickets or cards, offering contactless payment options and digital receipts. Users can track their parking history and expenses while receiving 24/7 customer support and assistance whenever needed.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-4">
                    <Settings className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Powerful Tools for System Administrators
                  </h3>
                  <p className="text-muted-foreground leading-relaxed mb-8">
                    System administrators benefit from centralized management capabilities that allow oversight of multiple parking locations from a single interface. VayAccess automates billing and revenue collection processes while providing real-time monitoring and alert systems. Comprehensive reporting and analytics tools enable administrators to make informed decisions, while remote troubleshooting and maintenance capabilities ensure optimal system performance. The scalable platform grows with business needs, accommodating expansion without requiring complete system overhauls.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* VayAccess Platform Details */}
            <TabsContent value="vayaccess" className="mt-12">
              <div className="max-w-4xl mx-auto prose prose-lg">
                {/* VayAccess Platform Overview */}
                <div className="mb-16">
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
                    VayAccess Smart Parking Platform: The Complete Solution
                  </h2>
                  
                  <p className="text-xl text-muted-foreground leading-relaxed mb-8">
                    Our comprehensive VayAccess platform combines ANPR technology, IoT integration, mobile applications, and cloud-based management to deliver the ultimate smart parking experience. This isn't just another parking system – it's a complete ecosystem designed to transform how parking facilities operate and how users interact with parking services.
                  </p>

                  <div className="mb-8">
                    <img
                      src={barrierGate}
                      alt="VayAccess Barrier Gate System"
                      className="w-full rounded-lg shadow-lg mb-6"
                    />
                  </div>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <Camera className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Advanced ANPR Technology: The Heart of VayAccess
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    At the core of VayAccess lies our Advanced Automatic Number Plate Recognition technology, delivering an impressive 99.5% accuracy rate with processing times under 200 milliseconds. This technology represents years of refinement and optimization for Indian road conditions and number plate formats, while also supporting international standards from over 15 countries.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Our ANPR system features real-time license plate detection and recognition capabilities, seamlessly integrating multiple cameras into a centralized monitoring system. The AI-powered image processing engine enhances accuracy even in challenging conditions, while specialized algorithms handle various Indian and international number plate formats with remarkable precision.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    What sets our ANPR technology apart is its night vision capabilities with infrared illumination and weather-resistant operation in all conditions. Whether it's monsoon rains, bright sunlight, or complete darkness, VayAccess maintains consistent performance with 4K Ultra HD camera resolution ensuring crystal-clear image capture for reliable recognition.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <Shield className="inline h-6 w-6 mr-2 text-tech-blue" />
                    IoT Barrier Gates: Smart Infrastructure at Its Best
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    VayAccess IoT Barrier Gates represent the perfect fusion of mechanical engineering and intelligent software control. These smart automated systems operate with lightning-fast 2-6 second response times while maintaining durability standards exceeding 1 million operational cycles. Each barrier gate is equipped with automatic vehicle detection sensors and advanced anti-crash safety mechanisms with sophisticated obstacle detection capabilities.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Remote monitoring and control capabilities allow facility managers to oversee operations via mobile applications from anywhere in the world. Our barrier gates are available in customizable boom lengths from 3 meters to 6 meters, accommodating various site requirements. LED strip lighting enhances visibility and safety, while integrated battery backup systems ensure uninterrupted operation even during power outages.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    With power consumption optimized at just 150 watts and multiple connectivity options including 4G, WiFi, and Ethernet, our barrier gates seamlessly integrate into existing infrastructure while maintaining environmental efficiency and operational reliability.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <Smartphone className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Mobile Application Suite: User-Centric Design
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    The VayAccess Mobile Application Suite transforms the parking experience through intuitive user interfaces designed for both iOS and Android platforms. Supporting over 12 languages with offline mode capabilities, our applications ensure accessibility across diverse user demographics. The user-friendly interface simplifies parking booking and payment processes while providing real-time parking space availability and intelligent navigation assistance.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Digital wallet integration supports multiple payment options, making transactions seamless and secure with bank-grade encryption protecting all user data and financial information. Push notifications keep users informed about entry and exit activities, payment alerts, and important updates. Historical parking data and expense tracking features help users manage their parking budgets effectively.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    For administrators, our comprehensive admin dashboard provides powerful system monitoring and control capabilities, enabling real-time oversight of parking operations, user management, and detailed analytics reporting from any mobile device.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <Cloud className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Cloud-Based Management: Scalable and Reliable
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    VayAccess cloud infrastructure, built on AWS and Azure platforms, delivers industry-leading 99.9% uptime while processing over 10 million API calls daily. This centralized platform enables real-time monitoring of all parking facilities from a single interface, regardless of geographical location or facility size. Automated billing and revenue management systems streamline financial operations while advanced analytics and reporting dashboards provide actionable insights.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Multi-location management capabilities allow operators to oversee numerous parking facilities from one centralized dashboard, while API integration facilitates seamless connection with third-party systems and existing infrastructure. The scalable architecture accommodates unlimited data storage requirements and automatically adjusts to handle varying traffic loads without performance degradation.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Our cloud platform's robust security measures ensure data protection and privacy compliance while providing disaster recovery capabilities and automated backup systems that safeguard critical operational data and ensure business continuity.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <CreditCard className="inline h-6 w-6 mr-2 text-tech-blue" />
                    RFID Access Control: Contactless and Secure
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    VayAccess RFID Access Control systems provide contactless vehicle and pedestrian access management with read ranges extending up to 10 meters. Our long-range RFID readers utilize AES-256 encryption for maximum security, while RFID cards maintain functionality for over 10 years with anti-cloning protection built into every card.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Integration capabilities with existing access control systems ensure smooth transitions for facilities upgrading their infrastructure. Visitor management features include temporary access cards and comprehensive audit trails that log all access activities for security and compliance purposes. ISO 14443 compatibility ensures interoperability with industry standards.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    The contactless nature of our RFID system enhances user convenience while reducing physical contact points, making it ideal for modern hygiene-conscious environments while maintaining the highest security standards for access control.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <BarChart3 className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Smart Analytics & Reporting: Data-Driven Insights
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    VayAccess Smart Analytics engine processes over 100 different metrics to provide AI-powered insights for operational optimization. Real-time occupancy monitoring and forecasting capabilities help facility managers make informed decisions about pricing, capacity, and resource allocation. Revenue analytics with detailed profit and loss tracking provide financial transparency and performance visibility.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Peak hour analysis and capacity optimization features identify usage patterns and suggest improvements for maximum efficiency. Customer behavior insights and trend analysis help operators understand user preferences and adapt services accordingly. Automated report generation and scheduling ensure stakeholders receive timely updates without manual intervention.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Predictive maintenance alerts and scheduling capabilities prevent equipment failures before they occur, reducing downtime and maintenance costs. The platform's compatibility with business intelligence tools enables deeper analytics integration for enterprise-level reporting and strategic planning.
                  </p>

                  <div className="bg-gradient-to-r from-tech-blue/5 to-tech-blue-light/5 p-8 rounded-lg mb-16">
                    <h3 className="text-2xl font-bold text-foreground mb-6 text-center">
                      VayAccess Technology Architecture
                    </h3>
                    
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      The VayAccess technology stack operates on three integrated layers that work seamlessly together to deliver comprehensive parking management capabilities. Each layer is designed for reliability, scalability, and performance.
                    </p>

                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xl font-semibold text-foreground mb-3">
                          <Cog className="inline h-5 w-5 mr-2 text-tech-blue" />
                          Hardware Layer Foundation
                        </h4>
                        <p className="text-muted-foreground leading-relaxed">
                          Our hardware foundation consists of IP cameras with dedicated AI processing chips that enable real-time image analysis and number plate recognition. IoT-enabled barrier gates and sensors provide physical access control, while RFID readers and access control panels manage user authentication. LED displays and guidance systems offer visual feedback, all connected through robust network switches and communication modules that ensure reliable data transmission across the entire system.
                        </p>
                      </div>

                      <div>
                        <h4 className="text-xl font-semibold text-foreground mb-3">
                          <Monitor className="inline h-5 w-5 mr-2 text-tech-blue" />
                          Software Layer Intelligence
                        </h4>
                        <p className="text-muted-foreground leading-relaxed">
                          The software layer powers VayAccess intelligence through our proprietary ANPR engine with machine learning algorithms that continuously improve recognition accuracy. Real-time parking management systems coordinate all facility operations, while native mobile applications for iOS and Android provide user interfaces. Web-based admin dashboards offer comprehensive control panels, and API gateways facilitate third-party integrations and system extensions.
                        </p>
                      </div>

                      <div>
                        <h4 className="text-xl font-semibold text-foreground mb-3">
                          <Cloud className="inline h-5 w-5 mr-2 text-tech-blue" />
                          Cloud Infrastructure Reliability
                        </h4>
                        <p className="text-muted-foreground leading-relaxed">
                          Our cloud infrastructure leverages AWS and Azure hosting with auto-scaling capabilities that adjust to demand fluctuations. Microservices architecture ensures system reliability and fault tolerance, while real-time data processing and analytics engines provide immediate insights. Secure payment gateway integration handles all financial transactions, supported by comprehensive backup and disaster recovery systems that protect data integrity and ensure business continuity.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Board Members */}
            <TabsContent value="board" className="mt-12">
              <div className="max-w-4xl mx-auto prose prose-lg">
                <div className="mb-16">
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
                    Leadership Team: Driving VayAccess Innovation
                  </h2>
                  
                  <p className="text-xl text-muted-foreground leading-relaxed mb-8">
                    Behind every successful platform like VayAccess stands a team of visionary leaders who bring decades of combined experience in technology, manufacturing, operations, and finance. Our leadership team drives innovation and excellence in VayAccess development and deployment, ensuring that our smart parking solutions remain at the forefront of industry advancement.
                  </p>

                  <div className="mb-12">
                    <h3 className="text-2xl font-semibold text-foreground mb-6">
                      <Building2 className="inline h-6 w-6 mr-2 text-tech-blue" />
                      Rajesh Kumar - Chairman & CEO
                    </h3>
                    
                    <div className="bg-gradient-to-r from-tech-blue/5 to-tech-blue-light/5 p-6 rounded-lg mb-6">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-tech-blue to-tech-blue-light rounded-full flex items-center justify-center text-white text-xl font-bold">
                          RK
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">25+ years experience in Smart Infrastructure & IoT Solutions</div>
                          <div className="text-sm text-tech-blue font-medium">MS in Electrical Engineering, IIT Delhi</div>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      As the visionary leader behind VayAccess, Rajesh Kumar brings over 25 years of experience in the smart infrastructure industry to VayAccess Pro. His pioneering work in IoT-based parking solutions has fundamentally shaped how India approaches smart parking infrastructure. Under his leadership, VayAccess has evolved from a conceptual platform to a comprehensive ecosystem serving hundreds of thousands of parking spaces across multiple countries.
                    </p>
                    
                    <p className="text-muted-foreground leading-relaxed mb-8">
                      Rajesh's strategic vision for global expansion has positioned VayAccess as a leader in international markets, particularly in Southeast Asia. His deep understanding of both technology trends and market dynamics enables ParkVision Pro to anticipate industry needs and develop solutions that address real-world challenges faced by parking facility operators and users alike.
                    </p>
                  </div>

                  <div className="mb-12">
                    <h3 className="text-2xl font-semibold text-foreground mb-6">
                      <Cog className="inline h-6 w-6 mr-2 text-tech-blue" />
                      Priya Sharma - Chief Technology Officer
                    </h3>
                    
                    <div className="bg-gradient-to-r from-tech-blue/5 to-tech-blue-light/5 p-6 rounded-lg mb-6">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-tech-blue to-tech-blue-light rounded-full flex items-center justify-center text-white text-xl font-bold">
                          PS
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">18+ years experience in RFID & Access Control Systems</div>
                          <div className="text-sm text-tech-blue font-medium">PhD in Computer Science, IISc Bangalore</div>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      Priya Sharma stands as the technological backbone of VayAccess, specializing in RFID and access control systems with over 18 years of hands-on experience. Her innovative approach to technology integration has resulted in 12 patents in smart parking technology, many of which form the core intellectual property behind VayAccess's advanced features.
                    </p>
                    
                    <p className="text-muted-foreground leading-relaxed mb-8">
                      Leading our Research & Development initiatives, Priya ensures that VayAccess remains at the cutting edge of parking technology. Her expertise in ANPR systems, IoT integration, and mobile application development has been instrumental in creating the seamless user experience that VayAccess delivers. Under her technical leadership, the platform maintains its industry-leading 99.5% accuracy rate while continuously evolving to meet emerging market demands.
                    </p>
                  </div>

                  <div className="mb-12">
                    <h3 className="text-2xl font-semibold text-foreground mb-6">
                      <Factory className="inline h-6 w-6 mr-2 text-tech-blue" />
                      Amit Patel - VP Manufacturing & Operations
                    </h3>
                    
                    <div className="bg-gradient-to-r from-tech-blue/5 to-tech-blue-light/5 p-6 rounded-lg mb-6">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-tech-blue to-tech-blue-light rounded-full flex items-center justify-center text-white text-xl font-bold">
                          AP
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">22+ years experience in Industrial Automation & Quality Control</div>
                          <div className="text-sm text-tech-blue font-medium">B.Tech Mechanical Engineering, NIT Surat</div>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      Amit Patel's extensive 22-year career in industrial automation and quality control ensures that every VayAccess hardware component meets world-class standards. His expertise in manufacturing processes has been crucial in scaling VayAccess production to meet growing demand while maintaining the reliability and durability that customers expect.
                    </p>
                    
                    <p className="text-muted-foreground leading-relaxed mb-8">
                      Under Amit's operational leadership, our manufacturing facility achieves production capacity of 5,000 units per month while maintaining ISO 9001:2015 certification standards. His commitment to quality excellence ensures that VayAccess hardware components consistently perform in challenging environmental conditions, from extreme temperatures to high-humidity environments, maintaining the platform's reputation for reliability.
                    </p>
                  </div>

                  <div className="mb-12">
                    <h3 className="text-2xl font-semibold text-foreground mb-6">
                      <BarChart3 className="inline h-6 w-6 mr-2 text-tech-blue" />
                      Sunita Reddy - Chief Financial Officer
                    </h3>
                    
                    <div className="bg-gradient-to-r from-tech-blue/5 to-tech-blue-light/5 p-6 rounded-lg mb-6">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-tech-blue to-tech-blue-light rounded-full flex items-center justify-center text-white text-xl font-bold">
                          SR
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">15+ years experience in Financial Strategy & Risk Management</div>
                          <div className="text-sm text-tech-blue font-medium">CA, MBA Finance from XLRI</div>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      Sunita Reddy brings 15+ years of financial strategy expertise with a proven track record in scaling technology companies from startup to enterprise level. Her financial acumen has been instrumental in securing the resources necessary for VayAccess platform development, international expansion, and continuous innovation initiatives.
                    </p>
                    
                    <p className="text-muted-foreground leading-relaxed mb-8">
                      Managing VayAccess Pro's financial operations and growth investments, Sunita ensures sustainable business practices that support long-term VayAccess development goals. Her expertise in risk management and financial planning provides the stability needed for ambitious expansion plans while maintaining operational efficiency. Under her guidance, the company has successfully navigated multiple funding rounds and strategic partnerships that fuel VayAccess innovation.
                    </p>
                  </div>

                  <div className="bg-gradient-to-r from-tech-blue/5 to-tech-blue-light/5 p-8 rounded-lg">
                    <h3 className="text-2xl font-bold text-foreground mb-6 text-center">
                      Collective Leadership Impact
                    </h3>
                    
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      Together, our leadership team represents over 80 years of combined experience across technology, manufacturing, operations, and finance. This diverse expertise enables VayAccess to address complex challenges from multiple perspectives, ensuring comprehensive solutions that serve all stakeholders in the parking ecosystem.
                    </p>
                    
                    <p className="text-muted-foreground leading-relaxed">
                      Their collaborative approach to leadership has fostered a culture of innovation, quality, and customer-centricity that permeates every aspect of VayAccess development and deployment. From strategic planning to daily operations, their combined vision drives the platform's continued evolution and market leadership.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Manufacturing */}
            <TabsContent value="manufacturing" className="mt-12">
              <div className="max-w-4xl mx-auto prose prose-lg">
                <div className="mb-16">
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
                    VayAccess Hardware Manufacturing: Excellence in Production
                  </h2>
                  
                  <p className="text-xl text-muted-foreground leading-relaxed mb-8">
                    Behind every VayAccess installation lies a foundation of world-class hardware components manufactured in our state-of-the-art facilities. Our commitment to manufacturing excellence ensures that VayAccess systems deliver reliable performance in the most demanding environments, from scorching summers to monsoon seasons, maintaining consistent operation year-round.
                  </p>

                  <div className="mb-8">
                    <img
                      src={accessControl}
                      alt="VayAccess Manufacturing Excellence"
                      className="w-full rounded-lg shadow-lg mb-6"
                    />
                  </div>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <Factory className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Advanced Manufacturing Facility: Where Innovation Meets Production
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Our state-of-the-art 50,000 square foot manufacturing facility in Pune, Maharashtra, represents the pinnacle of modern industrial automation technology. This facility serves as the heart of VayAccess hardware production, equipped with cutting-edge automation systems that ensure consistent quality while achieving impressive production volumes of 5,000 units per month.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    The facility operates under ISO 9001:2015 certified quality management systems, ensuring that every VayAccess component meets international standards for reliability and performance. Our automated assembly lines for barrier gates incorporate precision robotics and quality control checkpoints at every stage of production, minimizing human error while maximizing efficiency and consistency.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    A dedicated RFID card production and encoding facility within our premises enables complete control over access control components, ensuring security and compatibility across all VayAccess installations. Advanced quality testing laboratories equipped with environmental chambers simulate real-world conditions, subjecting every component to rigorous testing protocols before approval for deployment.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    The integration of Industry 4.0 principles throughout our manufacturing processes enables real-time monitoring of production metrics, predictive maintenance of manufacturing equipment, and data-driven optimization of production workflows. This technological approach ensures that VayAccess hardware maintains consistent quality standards while meeting growing global demand.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <Cog className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Comprehensive Product Range: Complete VayAccess Ecosystem
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Our comprehensive manufacturing capabilities encompass the complete VayAccess hardware ecosystem, from automatic barrier gates to sophisticated access control systems. Barrier gates are manufactured in customizable boom lengths ranging from 3 meters to 6 meters, accommodating diverse site requirements from compact residential complexes to expansive commercial facilities.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    RFID Access Control Systems manufactured in our facility incorporate the latest security technologies, including encrypted communication protocols and anti-tampering mechanisms. Pedestrian turnstiles and gates complement our vehicle access solutions, providing comprehensive access management for mixed-use developments.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Our parking management software hardware platforms, including edge computing devices and IoT controllers, are designed and manufactured to support the sophisticated software algorithms that power VayAccess intelligence. Solar-powered LED guidance systems represent our commitment to sustainable technology, reducing environmental impact while maintaining operational effectiveness.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Every component in our product range carries prestigious certifications including CE Marking for European compliance, FCC Certification for electromagnetic compatibility, IP65 Rating for environmental protection, and RoHS Compliance for environmental safety. These certifications ensure that VayAccess hardware meets international standards for safety, performance, and environmental responsibility.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <Shield className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Uncompromising Quality Standards: Built to Last
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Quality assurance at our manufacturing facility goes beyond industry standards, with rigorous testing protocols that ensure every VayAccess component delivers reliable performance throughout its operational lifecycle. Our commitment to quality begins with 100% product testing before dispatch, ensuring that no defective components reach customer installations.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Environmental stress testing subjects components to extreme conditions far beyond normal operational parameters. Temperature cycling from -20°C to +70°C ensures reliable operation in diverse climatic conditions, while humidity resistance testing up to 95% relative humidity validates performance in high-moisture environments. Vibration and shock testing confirm mechanical durability under transportation and operational stresses.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Electromagnetic Compatibility (EMC) compliance verification ensures that VayAccess components operate reliably in electronically noisy environments without interfering with other systems. This testing is particularly crucial for installations in urban environments where multiple electronic systems operate in close proximity.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Continuous improvement processes drive ongoing refinement of manufacturing techniques and quality standards. Regular audits, customer feedback analysis, and performance data evaluation contribute to evolving manufacturing practices that enhance product reliability and customer satisfaction.
                  </p>

                  <div className="bg-gradient-to-r from-tech-blue/5 to-tech-blue-light/5 p-8 rounded-lg mb-16">
                    <h3 className="text-2xl font-bold text-foreground mb-6 text-center">
                      VayAccess Quality Assurance Specifications
                    </h3>
                    
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      Every VayAccess hardware component undergoes comprehensive testing protocols that exceed industry standards, ensuring reliable operation in real-world conditions across diverse environmental and operational challenges.
                    </p>

                    <div className="grid md:grid-cols-2 gap-8">
                      <div>
                        <h4 className="text-xl font-semibold text-foreground mb-4">Environmental Testing Standards</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Temperature Range:</span>
                            <span className="font-medium text-foreground">-20°C to +70°C</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Humidity Resistance:</span>
                            <span className="font-medium text-foreground">Up to 95% RH</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Protection Rating:</span>
                            <span className="font-medium text-foreground">IP65 Certified</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Operational Cycles:</span>
                            <span className="font-medium text-foreground">1M+ Tested</span>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-xl font-semibold text-foreground mb-4">Service & Support Commitment</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Warranty Period:</span>
                            <span className="font-medium text-foreground">2-Year Comprehensive</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Technical Support:</span>
                            <span className="font-medium text-foreground">24/7 Availability</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Response Time:</span>
                            <span className="font-medium text-foreground">&lt;4 Hours</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Production Capacity:</span>
                            <span className="font-medium text-foreground">5,000 Units/Month</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Our manufacturing excellence extends beyond production to comprehensive post-delivery support. Every VayAccess hardware component comes with a 2-year comprehensive warranty backed by 24/7 technical support with response times under 4 hours. This commitment to customer support ensures that VayAccess installations maintain optimal performance throughout their operational lifecycle, providing peace of mind for facility operators and end users alike.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Installation Services */}
            <TabsContent value="installation" className="mt-12">
              <div className="max-w-4xl mx-auto prose prose-lg">
                <div className="mb-16">
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
                    VayAccess Installation & Support Services: Your Success Partnership
                  </h2>
                  
                  <p className="text-xl text-muted-foreground leading-relaxed mb-8">
                    Deploying VayAccess successfully requires more than just quality hardware and software – it demands expertise, precision, and ongoing commitment to excellence. Our comprehensive installation and support services ensure that your VayAccess deployment not only meets your immediate needs but continues to deliver exceptional performance throughout its operational lifecycle.
                  </p>

                  <div className="mb-8">
                    <img
                      src={barrierGate}
                      alt="VayAccess Professional Installation"
                      className="w-full rounded-lg shadow-lg mb-6"
                    />
                  </div>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <MapPin className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Site Survey & Planning: Foundation for Success
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Every successful VayAccess deployment begins with comprehensive site assessment and customized solution design, typically completed within 1-2 days depending on facility complexity. Our experienced engineers conduct detailed site surveys that evaluate physical infrastructure, electrical systems, network connectivity, and operational workflows to ensure optimal system integration.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    The detailed site survey report provides comprehensive documentation of existing conditions, identifying opportunities for optimization and potential challenges that require attention during installation. Technical specifications documents outline precisely how VayAccess components will integrate with your facility's existing infrastructure, ensuring compatibility and optimal performance.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Installation timeline and milestone documentation provides clear expectations for project progression, while cost estimation and project proposals offer transparent pricing and service descriptions. This thorough planning phase ensures that your VayAccess installation proceeds smoothly with minimal disruption to ongoing operations.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Our site survey process also includes consultation on future expansion possibilities, ensuring that your initial VayAccess installation can accommodate growth and evolving requirements without requiring complete system redesign.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <Wrench className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Professional Installation: Precision and Expertise
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    VayAccess professional installation services are performed by certified technicians with extensive experience in smart parking system deployment. Installation timelines typically range from 2-5 days depending on project size and complexity, with larger facilities requiring additional time for comprehensive system integration and testing.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Complete system installation encompasses all hardware components, from ANPR cameras and barrier gates to RFID readers and control panels. Electrical connections and commissioning ensure that all components receive proper power supply and communication connectivity, while system configuration optimizes performance parameters for your specific operational requirements.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Comprehensive system testing validates all functionality before handover, including ANPR accuracy verification, barrier gate operation testing, mobile application connectivity, and payment system integration. Our technicians conduct thorough testing protocols that simulate real-world usage scenarios to ensure reliable operation from day one.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    User training and documentation delivery ensures that your staff can effectively operate and maintain the VayAccess system. Training sessions cover administrative functions, troubleshooting procedures, and best practices for ongoing system management, empowering your team to maximize system benefits.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <CheckCircle className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Testing & Commissioning: Ensuring Optimal Performance
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Following installation completion, comprehensive testing and commissioning processes ensure that your VayAccess system operates at optimal performance levels. This critical phase, typically completed within one day, validates system performance against specifications and identifies any adjustments needed for peak operation.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    System performance verification includes accuracy testing of ANPR recognition, response time measurement of barrier gates, connectivity validation of mobile applications, and functionality testing of payment processing systems. Load testing simulates high-traffic scenarios to ensure reliable operation during peak usage periods.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Integration testing with existing systems confirms seamless connectivity with your facility's access control, security, or building management systems. This comprehensive approach ensures that VayAccess enhances rather than disrupts your existing operational workflows.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Performance optimization fine-tunes system parameters based on testing results and operational requirements, ensuring that your VayAccess installation delivers maximum efficiency and user satisfaction from the moment it goes live.
                  </p>

                  <h3 className="text-2xl font-semibold text-foreground mb-6">
                    <Settings className="inline h-6 w-6 mr-2 text-tech-blue" />
                    Maintenance & Support: Ongoing Excellence
                  </h3>
                  
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    VayAccess maintenance and support services provide ongoing assurance that your system continues to operate at peak performance throughout its lifecycle. Our comprehensive support approach includes preventive maintenance schedules designed to identify and address potential issues before they impact operations.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Remote monitoring and diagnostics capabilities enable our support team to continuously monitor system health and performance metrics, identifying trends and potential issues before they affect system operation. This proactive approach minimizes downtime and ensures consistent user experience.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-6">
                    Spare parts availability ensures rapid resolution of any hardware issues, with comprehensive inventory management that guarantees replacement components are available when needed. Our supply chain management ensures that spare parts remain available throughout the system's operational lifecycle.
                  </p>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Annual maintenance contracts provide comprehensive coverage for system upkeep, including regular inspections, software updates, performance optimization, and priority technical support. These contracts offer cost-effective maintenance solutions while ensuring consistent system performance.
                  </p>

                  <div className="bg-gradient-to-r from-tech-blue/5 to-tech-blue-light/5 p-8 rounded-lg mb-16">
                    <h3 className="text-2xl font-bold text-foreground mb-6 text-center">
                      VayAccess Support Excellence Metrics
                    </h3>
                    
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      Our dedicated support team ensures your VayAccess installation operates at peak performance with industry-leading service levels and comprehensive maintenance protocols that exceed customer expectations.
                    </p>

                    <div className="grid md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <div className="text-center p-6 bg-white rounded-lg shadow-sm">
                          <div className="text-3xl font-bold text-tech-blue mb-2">24/7</div>
                          <div className="text-muted-foreground">Technical Support Availability</div>
                          <div className="text-sm text-muted-foreground mt-2">Round-the-clock assistance for critical issues</div>
                        </div>
                        
                        <div className="text-center p-6 bg-white rounded-lg shadow-sm">
                          <div className="text-3xl font-bold text-tech-blue mb-2">99.9%</div>
                          <div className="text-muted-foreground">System Uptime Guarantee</div>
                          <div className="text-sm text-muted-foreground mt-2">Industry-leading reliability standards</div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="text-center p-6 bg-white rounded-lg shadow-sm">
                          <div className="text-3xl font-bold text-tech-blue mb-2">&lt;4hrs</div>
                          <div className="text-muted-foreground">Response Time</div>
                          <div className="text-sm text-muted-foreground mt-2">Rapid response for urgent support requests</div>
                        </div>
                        
                        <div className="text-center p-6 bg-white rounded-lg shadow-sm">
                          <div className="text-3xl font-bold text-tech-blue mb-2">Remote</div>
                          <div className="text-muted-foreground">Diagnostics Capability</div>
                          <div className="text-sm text-muted-foreground mt-2">Proactive monitoring and issue resolution</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Our commitment to customer success extends beyond initial installation to encompass the entire operational lifecycle of your VayAccess system. Through continuous monitoring, proactive maintenance, and responsive support services, we ensure that your smart parking investment continues to deliver value and exceed expectations year after year. This comprehensive approach to service excellence has earned us the trust of customers across diverse markets and facility types, establishing VayAccess as the preferred choice for smart parking solutions.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-tech-blue to-tech-blue-light">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Deploy VayAccess at Your Location?
          </h2>
          <p className="text-xl text-white/90 mb-12 max-w-4xl mx-auto leading-relaxed">
            Join hundreds of satisfied customers who have revolutionized their parking operations 
            with VayAccess smart parking solutions. Experience the future of parking management today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={handleStartProject}
              size="lg" 
              className="bg-white text-tech-blue hover:bg-gray-100 px-8 py-4 text-lg font-semibold"
            >
              Start Your VayAccess Project
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-tech-blue px-8 py-4 text-lg"
            >
              Schedule Demo
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default About;