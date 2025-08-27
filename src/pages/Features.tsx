import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
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
import accessControlDevices from "../assets/access-control-devices.jpg";

interface Feature {
  title: string;
  description: string;
  content: string;
  image: string;
  features: string[];
}

const Features = () => {
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleLearnMore = (featureName: string) => {
    setExpandedFeatures(prev => {
      const newSet = new Set(prev);
      if (newSet.has(featureName)) {
        newSet.delete(featureName);
      } else {
        newSet.add(featureName);
      }
      return newSet;
    });
  };

  const features: Feature[] = [
    {
      title: "Smart Parking Barrier Systems",
      description: "Automatic vehicle barrier gates with license plate recognition.",
      content: "Smart barriers with RFID and mobile app integration for seamless vehicle access control.",
      image: barrierGate21,
      features: ["Automatic License Plate Recognition", "RFID Integration", "Mobile App Control", "Traffic Flow Management"]
    },
    {
      title: "Parking Payment Kiosks",
      description: "Self-service payment terminals with multiple payment options.",
      content: "Advanced payment kiosks with cash, card, and contactless support for convenient parking payments.",
      image: kioskTerminal22,
      features: ["Multiple Payment Methods", "Camera Monitoring", "Touch Screen Interface", "Receipt Printing"]
    },
    {
      title: "Turnstile Access Control",
      description: "Professional turnstile systems for pedestrian access control.",
      content: "Advanced turnstiles with biometric and RFID authentication for secure pedestrian access.",
      image: tripodTurnstiles24,
      features: ["Biometric Authentication", "RFID Support", "Bidirectional Access", "Real-time Monitoring"]
    },
    {
      title: "Automated Parking Systems",
      description: "Automated parking with robotic vehicle handling.",
      content: "Multi-level parking systems with intelligent space optimization and robotic vehicle management.",
      image: automatedParkingSystem,
      features: ["Robotic Vehicle Handling", "Multi-level Stacking", "Space Optimization", "24/7 Automated Operation"]
    },
    {
      title: "Vehicle Barrier Gates",
      description: "Professional barrier gates with LED indicators.",
      content: "Heavy-duty gates with anti-crash technology and weatherproof design for reliable vehicle control.",
      image: vehicleBarrierGate,
      features: ["Anti-crash Technology", "LED Strip Lighting", "Weatherproof Design", "Remote Control Operation"]
    },
    {
      title: "Premium Barrier Gate Systems",
      description: "High-end barrier gates with advanced technology.",
      content: "Premium barriers with smooth operation and intelligent LED guidance for luxury installations.",
      image: premiumBarrierGate,
      features: ["Smooth Operation", "Intelligent LED Guidance", "Premium Design", "Silent Motor Technology"]
    },
    {
      title: "Mobile Access Solutions",
      description: "Comprehensive mobile app ecosystem for seamless parking experience and digital convenience.",
      content: "Complete mobile platform with QR code access, digital payments, booking systems, and real-time parking availability for enhanced user experience.",
      image: mobileAccess,
      features: ["QR Code Access", "Digital Payments", "Real-time Availability", "Booking System"]
    },
    {
      title: "IoT Integration Hub",
      description: "Connected device management for comprehensive smart parking ecosystem automation.",
      content: "Advanced IoT platform with sensor networks, cloud connectivity, and remote monitoring capabilities for fully integrated parking solutions.",
      image: multiDoorController,
      features: ["Sensor Networks", "Cloud Connectivity", "Remote Monitoring", "System Integration"]
    },
    {
      title: "RFID Card Systems",
      description: "Professional RFID access control with advanced encryption and multi-site management capabilities.",
      content: "Enterprise-grade RFID solutions supporting multiple card formats with military-level encryption and centralized management across multiple locations.",
      image: rfidCardReader,
      features: ["Multiple Card Formats", "Military-grade Encryption", "Multi-site Management", "Offline Capability"]
    },
    {
      title: "Facial Recognition Terminal",
      description: "Advanced biometric access control with high-resolution facial recognition technology for secure entry management.",
      content: "Professional facial recognition terminal with touchless access, temperature screening, mask detection, and real-time visitor identification for enhanced security protocols.",
      image: facialRecognitionTerminal,
      features: ["Touchless Access", "Temperature Screening", "Mask Detection", "Real-time Identification"]
    },
    {
      title: "Access Control Devices",
      description: "Comprehensive range of smart access control devices with multi-color LED indicators and advanced authentication methods.",
      content: "Professional access control ecosystem featuring RFID readers, proximity sensors, biometric scanners, and smart card systems with visual status indicators for seamless integration.",
      image: accessControlDevices,
      features: ["Multi-color LED Status", "RFID Integration", "Biometric Scanning", "Smart Card Support"]
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl">
          
          {/* Section Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Our Features
            </h1>
            <p className="text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
              Comprehensive feature set of intelligent parking infrastructure solutions including barrier gates, 
              payment kiosks, facial recognition terminals, and automated parking systems.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const isCardExpanded = expandedFeatures.has(feature.title);
              return (
                <div
                  key={index}
                  className="bg-white rounded-lg border shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                >
                  <div className="h-64 overflow-hidden bg-gray-50">
                    <img
                      src={feature.image}
                      alt={feature.title}
                      className="w-full h-full object-contain p-4 hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-3">
                      {feature.title}
                    </h3>
                    <p className="text-gray-600 mb-4 leading-relaxed">
                      {feature.description}
                    </p>
                    
                    {!isCardExpanded && (
                      <div className="space-y-2 mb-4">
                        {feature.features.slice(0, 3).map((item, featureIndex) => (
                          <div key={featureIndex} className="flex items-center space-x-2 text-gray-700 text-sm">
                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0"></div>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isCardExpanded && (
                      <div className="space-y-4 mb-4">
                        <p className="text-gray-700 text-sm leading-relaxed">
                          {feature.content}
                        </p>
                        <div className="space-y-2">
                          {feature.features.map((item, featureIndex) => (
                            <div key={featureIndex} className="flex items-center space-x-2 text-gray-700 text-sm">
                              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0"></div>
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      onClick={() => handleLearnMore(feature.title)}
                      className="w-full border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
                    >
                      {isCardExpanded ? (
                        <>
                          Show Less <ChevronUp className="ml-2 h-4 w-4" />
                        </>
                      ) : (
                        <>
                          Learn More <ChevronDown className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Call to Action */}
          <div className="mt-20 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-12 text-white text-center">
            <h3 className="text-3xl font-bold mb-4">
              Ready to Implement These Features?
            </h3>
            <p className="text-blue-100 text-lg mb-8 max-w-3xl mx-auto">
              Get a customized solution with the features that best fit your facility's needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg"
                className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-3 font-bold"
                onClick={() => navigate('/services')}
              >
                Get Quote
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="border-2 border-white text-white hover:bg-white hover:text-blue-600 px-8 py-3 font-bold"
                onClick={() => navigate('/products')}
              >
                View Products
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Features;