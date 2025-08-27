import React, { useEffect } from 'react';
import { Clock, Cog, CheckCircle, Settings, Shield, Car } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import barrierGateMockup from '../assets/barrier-gate-mockup.png';
import turnstileMockup from '../assets/turnstile-mockup.png';
import parkingTerminalMockup from '../assets/parking-terminal-mockup.png';
import facialRecognitionTerminal from '../assets/facial-recognition-terminal.jpg';
import flapBarrierTurnstiles from '../assets/flap-barrier-turnstiles.png';

const Mockups = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const manufacturingSteps = [
    {
      id: 1,
      title: "Advanced Barrier Gate System Design",
      subtitle: "Engineering Excellence in Access Control",
      image: barrierGateMockup,
      description: "Advanced barrier gate system with modern access control technology.",
      features: [
        "High-strength aluminum construction",
        "Precision lifting mechanism",
        "Integrated LED lighting",
        "Modular design",
        "Advanced safety sensors"
      ],
      technicalSpecs: [
        "Operating Temperature: -40°C to +85°C",
        "Lifting Speed: 1.5-6 seconds (adjustable)",
        "Maximum Boom Length: Up to 6 meters",
        "Power Consumption: <50W standby, <150W operation",
        "Communication: RS485, TCP/IP, Wireless options"
      ],
      process: "Design Phase - CAD Modeling & Prototyping"
    },
    {
      id: 2,
      title: "Smart Turnstile Access Control System",
      subtitle: "Precision Manufacturing for Pedestrian Security",
      image: turnstileMockup,
      description: "Advanced turnstile system for high-traffic environments with security features.",
      features: [
        "Stainless steel construction",
        "Bidirectional access control",
        "Multiple authentication methods",
        "Fail-safe operational modes",
        "Real-time monitoring"
      ],
      technicalSpecs: [
        "Throughput: 25-35 persons per minute",
        "Lane Width: 550-900mm (customizable)",
        "Operating Voltage: 110-240VAC, 50/60Hz",
        "Material: 304 stainless steel with satin finish",
        "Integration: Access control systems, fire alarm, BMS"
      ],
      process: "Prototype Development - Functional Testing"
    },
    {
      id: 3,
      title: "Automatic Number Plate Recognization Terminal",
      subtitle: "Smart Technology Integration & Field Testing",
      image: parkingTerminalMockup,
      description: "Intelligent parking terminal with advanced display and weather-resistant design.",
      features: [
        "High-resolution LED display with adaptive brightness",
        "Integrated camera system for license plate recognition", 
        "Weather-resistant enclosure rated IP65",
        "Multi-language support with voice guidance",
        "Contactless payment and mobile app integration"
      ],
      technicalSpecs: [
        "Display: 15.6\" LED with anti-glare coating",
        "Camera: 2MP with IR illumination",
        "Storage: 32GB internal with cloud backup",
        "Connectivity: 4G/LTE, WiFi, Ethernet",
        "Operating System: Embedded Linux with custom UI"
      ],
      process: "Pre-Installation Testing - Quality Assurance"
    },
    {
      id: 4,
      title: "Advanced Facial Recognition Terminal",
      subtitle: "Next-Generation Biometric Access Control Prototype",
      image: facialRecognitionTerminal,
      description: "AI-powered facial recognition terminal for high-security access control.",
      features: [
        "AI-powered facial recognition with 99.9% accuracy rate",
        "15-inch high-resolution display with ambient light adjustment",
        "Integrated camera system with IR illumination for low-light conditions",
        "Multi-factor authentication support (face + PIN + card)",
        "Real-time temperature screening and health monitoring",
        "Vandal-resistant construction with IP65 weatherproof rating"
      ],
      technicalSpecs: [
        "Recognition Speed: <0.5 seconds per person",
        "Database Capacity: 50,000+ face templates",
        "Display: 15\" LCD touchscreen with anti-glare coating",
        "Operating Temperature: -20°C to +60°C",
        "Connectivity: Ethernet, WiFi, 4G/LTE optional",
        "Power: 12V DC, <30W normal operation"
      ],
      process: "Advanced Prototype - Field Testing Phase"
    },
    {
      id: 5,
      title: "Production-Ready Flap Barrier Turnstiles",
      subtitle: "Final Manufacturing Prototype for Mass Production",
      image: flapBarrierTurnstiles,
      description: "Production-ready flap barrier turnstiles designed for high-volume manufacturing.",
      features: [
        "Dual-directional access control with independent lane operation",
        "Fast-opening flap barriers with 0.3-second response time",
        "LED indicators for clear visual guidance",
        "Anti-tailgating sensors with advanced detection algorithms",
        "Emergency release mechanism for fire safety compliance",
        "Modular design for easy maintenance and component replacement"
      ],
      technicalSpecs: [
        "Throughput: 40+ persons per minute per lane",
        "Barrier Material: Reinforced acrylic with safety edges",
        "Housing: 304 stainless steel with brushed finish",
        "Integration: All major access control systems",
        "Safety Standards: CE, FCC, IP54 rated",
        "Dimensions: 1200mm (L) × 280mm (W) × 1000mm (H)"
      ],
      process: "Production Ready - Manufacturing Optimization"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <Header />
      {/* Hero Section */}
      <section className="relative py-20 bg-gradient-to-r from-blue-900 to-blue-700 text-white overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
              Manufacturing Mockups
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-blue-100">
              Product development from concept to production.
            </p>
            <div className="flex items-center justify-center space-x-8 text-blue-200">
              <div className="flex items-center space-x-2">
                <Cog className="h-6 w-6" />
                <span>Design</span>
              </div>
              <div className="w-8 h-px bg-blue-300"></div>
              <div className="flex items-center space-x-2">
                <Settings className="h-6 w-6" />
                <span>Prototype</span>
              </div>
              <div className="w-8 h-px bg-blue-300"></div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-6 w-6" />
                <span>Production</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Manufacturing Process Steps */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl">
          <div className="max-w-6xl mx-auto">
            {manufacturingSteps.map((step, index) => (
              <div key={step.id} className="mb-20 last:mb-0">
                {/* Process Step Header */}
                <div className="text-center mb-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full mb-4">
                    <span className="text-2xl font-bold">{step.id}</span>
                  </div>
                  <h2 className="text-4xl font-bold text-gray-800 mb-2">{step.title}</h2>
                  <p className="text-xl text-blue-600 font-medium">{step.subtitle}</p>
                  <div className="flex items-center justify-center mt-4">
                    <div className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      {step.process}
                    </div>
                  </div>
                </div>

                {/* Content Layout */}
                <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
                  index % 2 === 1 ? 'lg:grid-flow-col-dense' : ''
                }`}>
                  {/* Image Section */}
                  <div className={`${index % 2 === 1 ? 'lg:col-start-2' : ''}`}>
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity duration-300"></div>
                      <div className="relative bg-white p-6 rounded-2xl shadow-2xl border border-gray-200">
                        <div className="aspect-square max-h-80 mx-auto overflow-hidden rounded-lg">
                          <img 
                            src={step.image} 
                            alt={step.title}
                            className="w-full h-full object-contain shadow-lg"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className={`${index % 2 === 1 ? 'lg:col-start-1' : ''}`}>
                    <div className="space-y-8">
                      {/* Description */}
                      <div>
                        <p className="text-lg text-gray-700 leading-relaxed">
                          {step.description}
                        </p>
                      </div>

                      {/* Key Features */}
                      <div>
                        <h3 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
                          <Shield className="h-6 w-6 text-blue-600 mr-2" />
                          Key Features
                        </h3>
                        <ul className="space-y-3">
                          {step.features.map((feature, featureIndex) => (
                            <li key={featureIndex} className="flex items-start">
                              <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-700">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Technical Specifications */}
                      <div>
                        <h3 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
                          <Cog className="h-6 w-6 text-blue-600 mr-2" />
                          Technical Specifications
                        </h3>
                        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                          {step.technicalSpecs.map((spec, specIndex) => (
                            <div key={specIndex} className="flex items-center justify-between py-1 border-b border-gray-200 last:border-b-0">
                              <span className="text-gray-700 text-sm">{spec}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Process Flow Indicator */}
                {index < manufacturingSteps.length - 1 && (
                  <div className="flex justify-center mt-16 mb-8">
                    <div className="flex flex-col items-center">
                      <div className="w-1 h-16 bg-gradient-to-b from-blue-600 to-blue-400 rounded-full"></div>
                      <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Development Timeline Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-800 mb-6">Product Development Timeline</h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                Development phases from concept to production
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-blue-600 font-bold">1-2</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800">Concept & Initial Design</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  <strong>Timeline:</strong> Months 1-8<br/>
                  <strong>Purpose:</strong> Proof of concept and engineering validation
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• CAD modeling and simulation</li>
                  <li>• Material selection and testing</li>
                  <li>• Initial functionality verification</li>
                  <li>• Cost analysis and feasibility studies</li>
                </ul>
              </div>
              
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-orange-500">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-orange-600 font-bold">3</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800">Pre-Production Testing</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  <strong>Timeline:</strong> Months 9-15<br/>
                  <strong>Purpose:</strong> Real-world validation and optimization
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Field testing in controlled environments</li>
                  <li>• Performance optimization</li>
                  <li>• Safety and compliance verification</li>
                  <li>• Customer feedback integration</li>
                </ul>
              </div>
              
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-purple-600 font-bold">4</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800">Advanced Prototyping</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  <strong>Timeline:</strong> Months 12-18<br/>
                  <strong>Purpose:</strong> Feature-complete beta testing
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Full feature implementation</li>
                  <li>• Extended field trials</li>
                  <li>• Integration testing with existing systems</li>
                  <li>• Final design refinements</li>
                </ul>
              </div>
              
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500 md:col-span-2 lg:col-span-1">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-green-600 font-bold">5</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800">Production Ready</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  <strong>Timeline:</strong> Months 18-24<br/>
                  <strong>Purpose:</strong> Mass production and market launch
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Manufacturing process optimization</li>
                  <li>• Quality assurance protocols</li>
                  <li>• Supply chain establishment</li>
                  <li>• Market deployment and support</li>
                </ul>
              </div>
              
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 text-white md:col-span-2">
                <h3 className="text-xl font-semibold mb-4">When Prototypes Become Products</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">Transition Criteria:</h4>
                    <ul className="space-y-1 opacity-90">
                      <li>• 99.9% reliability in 6-month field tests</li>
                      <li>• Full regulatory compliance certification</li>
                      <li>• Positive customer validation feedback</li>
                      <li>• Optimized manufacturing cost structure</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Production Readiness:</h4>
                    <ul className="space-y-1 opacity-90">
                      <li>• Supply chain partnerships established</li>
                      <li>• Quality control processes validated</li>
                      <li>• Technical support infrastructure ready</li>
                      <li>• Market demand confirmed through pre-orders</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Manufacturing Excellence Section */}
      <section className="py-16 bg-gradient-to-r from-blue-900 to-blue-800 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl font-bold mb-6">Manufacturing Excellence</h2>
            <p className="text-xl text-blue-100 mb-12">
              Precision engineering from concept to deployment
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Cog className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Design & Engineering</h3>
                <p className="text-blue-100">CAD modeling and simulation</p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Settings className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Prototype Testing</h3>
                <p className="text-blue-100">Testing for reliability and durability</p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Quality Assurance</h3>
                <p className="text-blue-100">Quality checks before deployment</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-6">
              Ready to Experience Our Solutions?
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Contact us for parking and access control solutions
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-300 font-semibold">
                Request Demo
              </button>
              <button className="px-8 py-4 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all duration-300 font-semibold">
                Download Brochure
              </button>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Mockups;