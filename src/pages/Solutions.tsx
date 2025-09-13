import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

import barrierGate21 from "../assets/barrier-gate-21.jpg";
import kioskTerminal22 from "../assets/kiosk-terminal-22.jpg";
import tripodTurnstiles24 from "../assets/tripod-turnstiles-24.jpg";
import automatedParkingSystem from "../assets/automated-parking-system.jpg";
import vehicleBarrierGate from "../assets/vehicle-barrier-gate.jpg";
import premiumBarrierGate from "../assets/premium-barrier-gate.jpg";
import mobileAccess from "../assets/mobile-access-control.jpg";
import multiDoorController from "../assets/multi-door-controller.jpg";
import rfidCardReader from "../assets/rfid-card-reader.jpg";
import facialRecognitionTerminal from "../assets/facial-recognition-terminal-tall.jpg";
import integratedAccessDevices from "../assets/33.jpg";
import biometricFaceRecognition from "../assets/38.jpg";
import smartTurnstileGate from "../assets/39.jpg";

interface Solution {
  title: string;
  description: string;
  content: string;
  image: string;
  features: string[];
}

const Solutions = () => {
  const navigate = useNavigate();

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
    try {
      import('@/utils/eventTracker').then(({ trackCategoryView }) => {
        trackCategoryView('parking-management', { route: '/solutions' });
      });
    } catch {}
    try {
      import('@/utils/eventTracker').then(({ trackCategoryView }) => {
        trackCategoryView('parking-management', { route: '/solutions' });
      });
    } catch {}
  }, []);

  const solutions: Solution[] = [
    {
      title: "Smart Parking Barrier Systems",
      description: "Revolutionary automatic vehicle barrier gates that seamlessly integrate cutting-edge license plate recognition technology with intelligent traffic management systems.",
      content: "Our smart barrier systems represent the pinnacle of parking automation technology. These advanced systems combine high-resolution cameras, AI-powered license plate recognition, and intelligent sensors to create a completely automated entry and exit experience. The barriers feature robust construction with weather-resistant materials and can handle high-volume traffic while maintaining precise control over vehicle access. Integration with mobile applications allows users to pre-register vehicles and receive real-time notifications about parking availability and access permissions.",
      image: barrierGate21,
      features: ["AI-Powered License Plate Recognition", "Real-Time Traffic Analytics", "Mobile App Integration", "Weather-Resistant Construction", "Anti-Tailgating Technology", "Emergency Override Systems"]
    },
    {
      title: "Self-Service Payment Kiosks",
      description: "Intuitive self-service payment terminals featuring comprehensive payment options and advanced security measures for modern parking facilities.",
      content: "Our payment kiosks revolutionize the parking payment experience with their sleek design and comprehensive functionality. These terminals support multiple payment methods including cash, credit cards, contactless payments, and mobile wallets. The high-resolution touchscreen interface provides multilingual support and accessibility features for all users. Built-in security cameras and tamper-detection systems ensure safe transactions, while the robust construction withstands harsh weather conditions and heavy usage in busy parking environments.",
      image: kioskTerminal22,
      features: ["Multi-Language Touch Interface", "Contactless Payment Support", "Integrated Security Cameras", "Receipt & SMS Notifications", "ADA Compliance Features", "Remote Management Capabilities"]
    },
    {
      title: "Advanced Turnstile Systems",
      description: "Professional-grade turnstile access control systems engineered for high-security pedestrian management with biometric authentication capabilities.",
      content: "Our turnstile systems provide uncompromising security and smooth pedestrian flow management. These precision-engineered units feature advanced biometric scanners, RFID readers, and smart card compatibility for multi-layered authentication. The bidirectional design allows for efficient entry and exit monitoring, while the robust construction ensures reliable operation in high-traffic environments. Integration with building management systems provides comprehensive access control and detailed visitor analytics.",
      image: tripodTurnstiles24,
      features: ["Multi-Modal Biometric Authentication", "Bidirectional Access Control", "Anti-Passback Technology", "Real-Time Visitor Analytics", "Emergency Release Mechanisms", "Customizable Access Permissions"]
    },
    {
      title: "Robotic Parking Systems",
      description: "State-of-the-art automated parking solutions featuring robotic vehicle handling and intelligent space optimization for maximum efficiency.",
      content: "Our automated parking systems represent the future of urban parking solutions. These sophisticated systems use advanced robotics and AI algorithms to transport and park vehicles with precision and efficiency. The multi-level stacking capability maximizes space utilization while the gentle handling mechanisms ensure vehicle safety. Fully automated operation eliminates the need for drivers to navigate parking structures, reducing emissions and improving air quality while providing a premium parking experience.",
      image: automatedParkingSystem,
      features: ["Precision Robotic Handling", "AI-Powered Space Optimization", "Multi-Level Vehicle Stacking", "Emission-Free Operation", "Vehicle Damage Prevention", "Smartphone Integration"]
    },
    {
      title: "Heavy-Duty Barrier Gates",
      description: "Industrial-strength vehicle barrier gates with advanced LED guidance systems and anti-crash technology for maximum security and durability.",
      content: "Our heavy-duty barrier gates are engineered for demanding environments where security and reliability are paramount. These robust systems feature reinforced construction capable of withstanding attempted forced entry while maintaining smooth operation for authorized vehicles. The integrated LED strip lighting provides clear visual guidance for drivers, while advanced sensors prevent accidental contact and damage. Weather-resistant components ensure reliable operation in all environmental conditions.",
      image: vehicleBarrierGate,
      features: ["Reinforced Anti-Crash Construction", "Intelligent LED Guidance System", "Advanced Proximity Sensors", "All-Weather Operation", "Remote Monitoring Capabilities", "Customizable Access Schedules"]
    },
    {
      title: "Premium Gate Systems",
      description: "Luxury barrier gate solutions combining elegant design with whisper-quiet operation and intelligent LED guidance for upscale facilities.",
      content: "Our premium barrier gate systems elevate the parking experience with their sophisticated design and ultra-quiet operation. These high-end systems feature precision-engineered motors that operate virtually silently, making them ideal for residential and upscale commercial environments. The intelligent LED guidance system provides intuitive visual cues for drivers, while the premium materials and finishes complement modern architectural designs. Advanced control systems ensure smooth, reliable operation with minimal maintenance requirements.",
      image: premiumBarrierGate,
      features: ["Whisper-Quiet Motor Technology", "Premium Architectural Design", "Intelligent LED Guidance", "Precision Engineering", "Minimal Maintenance Requirements", "Customizable Finish Options"]
    },
    {
      title: "Mobile Access Platform",
      description: "Comprehensive mobile application ecosystem providing seamless digital parking experiences with QR code access and real-time availability tracking.",
      content: "Our mobile access platform transforms the parking experience through innovative smartphone integration. Users can locate available spaces, make reservations, and access parking facilities using secure QR codes generated on their mobile devices. The platform features real-time occupancy monitoring, digital payment processing, and personalized parking history tracking. Push notifications keep users informed about reservation confirmations, payment receipts, and important updates, creating a completely digital parking ecosystem.",
      image: mobileAccess,
      features: ["Secure QR Code Access", "Real-Time Space Availability", "Digital Wallet Integration", "Reservation Management", "Push Notification System", "Parking History Analytics"]
    },
    {
      title: "IoT Smart Hub",
      description: "Advanced IoT integration platform connecting all parking devices through intelligent sensor networks and cloud-based management systems.",
      content: "Our IoT integration hub serves as the central nervous system for smart parking infrastructure. This sophisticated platform connects all parking devices through secure wireless networks, enabling real-time monitoring, predictive maintenance, and intelligent resource allocation. Cloud-based analytics provide detailed insights into usage patterns, revenue optimization opportunities, and system performance metrics. The scalable architecture supports easy expansion and integration with existing building management systems.",
      image: multiDoorController,
      features: ["Wireless Sensor Networks", "Cloud Analytics Platform", "Predictive Maintenance Alerts", "Scalable Architecture", "Third-Party System Integration", "Advanced Security Protocols"]
    },
    {
      title: "Enterprise RFID Systems",
      description: "Military-grade RFID access control solutions supporting multiple card formats with advanced encryption and centralized multi-site management.",
      content: "Our enterprise RFID systems provide bank-level security for large-scale parking operations. These sophisticated systems support various card formats and authentication methods while maintaining the highest security standards through military-grade encryption. The centralized management platform allows administrators to oversee multiple locations from a single interface, manage user permissions, and generate comprehensive reports. Offline capability ensures continuous operation even during network interruptions.",
      image: rfidCardReader,
      features: ["Military-Grade Encryption", "Multi-Format Card Support", "Centralized Site Management", "Offline Operation Capability", "Comprehensive Reporting", "Role-Based Access Control"]
    },
    {
      title: "Biometric Recognition Terminal",
      description: "Next-generation facial recognition technology with touchless access, health screening capabilities, and real-time visitor identification for enhanced security.",
      content: "Our facial recognition terminals represent the cutting edge of contactless access control technology. These advanced systems use AI-powered facial recognition algorithms to provide instant, touchless authentication while maintaining the highest accuracy standards. Integrated temperature screening and mask detection capabilities support health and safety protocols, while the high-resolution cameras capture detailed visitor information for security purposes. The sleek design and intuitive interface ensure user acceptance and smooth operation.",
      image: facialRecognitionTerminal,
      features: ["AI-Powered Facial Recognition", "Contactless Authentication", "Temperature Screening", "Mask Detection Technology", "High-Resolution Imaging", "Privacy Protection Compliance"]
    },
    {
      title: "Infrared photoelectric sensors",
      description: "Advanced access control devices featuring multi-color LED indicators for clear status communication and enhanced security management.",
      content: "Our multi-color LED access control devices provide intuitive visual feedback through sophisticated LED indicator systems. These devices feature blue, green, and red LED configurations that clearly communicate access status, system health, and security alerts. The robust construction ensures reliable operation in demanding environments while the sleek design complements modern architectural aesthetics. Advanced sensor technology provides precise detection and authentication capabilities for enhanced security management.",
      image: integratedAccessDevices,
      features: ["Multi-Color LED Status Indicators", "Advanced Sensor Technology", "Robust Weather-Resistant Construction", "Intuitive Visual Communication", "Modern Architectural Design", "Enhanced Security Management"]
    },
    {
      title: "Biometric Face Recognition Terminal",
      description: "State-of-the-art facial recognition terminal with touchscreen interface and advanced biometric authentication for secure access control.",
      content: "Our biometric face recognition terminal combines cutting-edge facial recognition technology with an intuitive touchscreen interface. The system features high-resolution cameras and advanced AI algorithms for accurate facial detection and authentication. The sleek white design with integrated display provides real-time feedback and user interaction capabilities. Temperature screening and health monitoring features ensure comprehensive security and safety protocols for modern facilities.",
      image: biometricFaceRecognition,
      features: ["Advanced Facial Recognition AI", "High-Resolution Touchscreen Display", "Temperature Screening Capability", "Real-Time User Feedback", "Health Monitoring Integration", "Sleek Modern Design"]
    },
    {
      title: "Smart Barrier Gate System",
      description: "Professional-grade smart turnstile system with LED display integration and advanced access control for high-security pedestrian management.",
      content: "Our smart turnstile gate system represents the pinnacle of pedestrian access control technology. The system features integrated LED displays for real-time status communication and user guidance. The robust stainless steel construction with blue accent lighting provides both durability and modern aesthetics. Advanced sensor technology ensures smooth operation while preventing unauthorized access through sophisticated anti-tailgating mechanisms.",
      image: smartTurnstileGate,
      features: ["Integrated LED Display System", "Stainless Steel Construction", "Anti-Tailgating Technology", "Real-Time Status Communication", "Modern Blue Accent Lighting", "Advanced Sensor Integration"]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <Header />

      {/* Hero Section */}
      <section className="py-12 md:py-16 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 relative overflow-hidden">
        <div className="absolute inset-0 pattern-dots opacity-30"></div>
        
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-5xl text-center relative z-10">
          <h1 className="font-poppins font-bold text-white mb-6 leading-tight text-4xl md:text-5xl">
            Smart Parking
            <span className="block bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent"> Solutions</span>
          </h1>
          <p className="font-poppins text-blue-100 max-w-3xl mx-auto leading-relaxed text-lg">
            Discover our comprehensive range of intelligent parking infrastructure solutions designed to transform modern facilities with cutting-edge technology.
          </p>
        </div>
      </section>

      {/* Solutions Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl">
          {solutions.map((solution, index) => (
            <article 
              key={index} 
              className={`mb-12 ${index !== solutions.length - 1 ? 'border-b border-gray-200 pb-12' : ''}`}
            >
              <div className={`grid lg:grid-cols-2 gap-8 lg:gap-12 items-start`}>
                {/* Image Section */}
                <div className={`${index % 2 === 1 ? 'lg:order-2' : ''}`}>
                  <div className="relative overflow-hidden rounded-xl shadow-lg">
                    <div className="aspect-[4/3] flex items-center justify-center p-4">
                      <img
                        src={solution.image}
                        alt={solution.title}
                        className="w-full h-full object-contain rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Content Section */}
                <div className={`${index % 2 === 1 ? 'lg:order-1' : ''}`}>
                  <div className="space-y-6">
                    {/* Title */}
                    <div>
                      <h2 className="font-poppins font-bold text-gray-900 leading-tight mb-2" style={{ fontSize: '17px' }}>
                        {solution.title}
                      </h2>
                      <div className="w-12 h-0.5 bg-blue-600"></div>
                    </div>

                    {/* Description */}
                    <p className="font-poppins text-gray-600 leading-relaxed" style={{ fontSize: '14px' }}>
                      {solution.description}
                    </p>

                    {/* Content */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="font-poppins text-gray-700 leading-relaxed" style={{ fontSize: '14px' }}>
                        {solution.content}
                      </p>
                    </div>
                    
                    {/* Features */}
                    <div className="space-y-3">
                      <h4 className="font-poppins font-semibold text-gray-800" style={{ fontSize: '17px' }}>
                        Key Features
                      </h4>
                      <div className="grid gap-2">
                        {solution.features.map((feature, featureIndex) => (
                          <div key={featureIndex} className="font-poppins text-gray-600" style={{ fontSize: '14px' }}>
                            {feature}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}

          {/* Bottom CTA */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <div className="text-center space-y-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6">
              <h3 className="font-poppins font-bold text-gray-900" style={{ fontSize: '17px' }}>
                Ready to Transform Your Parking?
              </h3>
              <p className="font-poppins text-gray-600 max-w-2xl mx-auto" style={{ fontSize: '14px' }}>
                Explore our complete product catalog or get in touch with our experts for a customized solution.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="font-poppins bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                  onClick={() => navigate('/products')}
                >
                  Browse All Products
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="font-poppins border-2 border-blue-600 text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg font-semibold transition-all duration-300"
                  onClick={() => navigate('/about')}
                >
                  Learn About Us
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Solutions;