import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Home, CheckCircle, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// Import parking management images
import vayParkingGuidanceDisplay23 from "../../assets/vay-parking-guidance-display-23.jpg";
import parkingGuidanceTerminal16 from "../../assets/parking-guidance-terminal-16.jpg";
import parkingKioskTerminal17 from "../../assets/parking-kiosk-terminal-17.jpg";
import parkingPaymentKiosk18 from "../../assets/parking-payment-kiosk-18.jpg";
import parkingSystemArchitecture from "../../assets/parking-system-architecture.jpg";
import parkingSystemGuidance from "../../assets/parking-system-guidance.jpg";

const ParkingManagement = () => {
  const [currentImage, setCurrentImage] = useState(0);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const nextImage = () => {
    setCurrentImage((prev) => (prev + 1) % productImages.length);
  };

  const prevImage = () => {
    setCurrentImage((prev) => (prev - 1 + productImages.length) % productImages.length);
  };

  const productImages = [
    vayParkingGuidanceDisplay23,
    parkingGuidanceTerminal16,
    parkingKioskTerminal17,
    parkingPaymentKiosk18,
    parkingSystemArchitecture,
    parkingSystemGuidance
  ];

  const parkingManagementProducts = [
    {
      name: "VAY PARKING GUIDANCE DISPLAY",
      description: "Advanced guidance display with LED indicators showing real-time parking availability and navigation information.",
      image: vayParkingGuidanceDisplay23,
      features: [
        "Real-time parking space availability display",
        "Color-coded LED indicators for space status",
        "Multi-level parking guidance system",
        "Integration with mobile applications",
        "Weather-resistant outdoor installation",
        "Energy-efficient LED technology",
        "Remote monitoring and control capability",
        "Customizable display messages and branding"
      ],
      applications: [
        "Shopping mall and retail complex parking",
        "Airport and transportation hub parking",
        "Hospital and healthcare facility parking",
        "Office building and corporate parking"
      ],
      technicalParameters: {
        displaySize: "15-32 inch LED display options",
        powerSupply: "AC220V ±10%, 50/60Hz",
        workingTemperature: "-25°C to +70°C",
        protection: "IP65 weatherproof rating",
        connectivity: "Ethernet, WiFi, 4G LTE",
        dimensions: "1200×800×200mm (wall mount)"
      }
    },
    {
      name: "INTERACTIVE PARKING KIOSK TERMINAL",
      description: "Modern touchscreen kiosks providing comprehensive parking services including payments, reservations, and information.",
      image: parkingKioskTerminal17,
      features: [
        "Large touchscreen interface with intuitive navigation",
        "Multiple payment options including cash and cards",
        "QR code generation for mobile integration",
        "Real-time parking availability information",
        "Multi-language support for diverse users",
        "Receipt printing and digital receipt options",
        "Emergency assistance and help features",
        "Vandal-resistant tempered glass design"
      ],
      applications: [
        "Public parking facilities and street parking",
        "Commercial complexes and business districts",
        "Tourist areas and entertainment venues",
        "Residential communities and apartment complexes"
      ],
      technicalParameters: {
        screenSize: "21-27 inch capacitive touchscreen",
        powerSupply: "AC220V ±10%, 50/60Hz",
        workingTemperature: "-20°C to +60°C",
        protection: "IP54 standard protection",
        connectivity: "Ethernet, WiFi, 4G cellular",
        dimensions: "1800×600×400mm (floor standing)"
      }
    },
    {
      name: "COMPREHENSIVE PARKING SYSTEM",
      description: "Complete parking management architecture with integrated sensors, controllers, and cloud-based management platform.",
      image: parkingSystemArchitecture,
      features: [
        "Cloud-based centralized management platform",
        "Real-time occupancy monitoring and analytics",
        "Automated revenue collection and reporting",
        "Integration with access control systems",
        "Mobile app for end-users and administrators",
        "Advanced data analytics and reporting tools",
        "Scalable architecture for future expansion",
        "24/7 remote monitoring and support"
      ],
      applications: [
        "Large-scale commercial parking operations",
        "Multi-site parking facility management",
        "Smart city parking infrastructure",
        "Corporate campus parking solutions"
      ],
      technicalParameters: {
        systemCapacity: "Unlimited parking spaces",
        dataStorage: "Cloud-based with local backup",
        networkRequirement: "Broadband internet connection",
        supportedDevices: "All VAY parking hardware",
        apiIntegration: "REST API for third-party systems",
        uptime: "99.9% guaranteed system availability"
      }
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Compact Hero Section */}
      <section className="bg-white border-b">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 py-6">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Product Image */}
            <div>
              <div className="rounded-lg overflow-hidden h-[400px] bg-white relative">
                <img
                  src={productImages[currentImage]}
                  alt="Parking Management Systems"
                  className="w-full h-full object-contain"
                />
                
                {/* Left/Right Navigation Buttons */}
                <button
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white text-gray-700 rounded-full p-2 shadow-md transition-all duration-200"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white text-gray-700 rounded-full p-2 shadow-md transition-all duration-200"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              
              {/* Thumbnail Gallery */}
              <div className="mt-4">
                <div className="flex space-x-2 overflow-x-auto">
                  {productImages.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImage(index)}
                      className={`flex-shrink-0 w-14 h-10 rounded border overflow-hidden ${
                        currentImage === index ? "border-blue-500" : "border-gray-200"
                      }`}
                    >
                      <img
                        src={image}
                        alt={`Product ${index + 1}`}
                        className="w-full h-full object-contain bg-white p-1"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Product Info */}
            <div>
              {/* Breadcrumb */}
              <nav className="flex items-center space-x-2 text-xs text-gray-500 mb-3">
                <Link to="/" className="hover:text-blue-600 transition-colors">
                  <Home className="h-3 w-3" />
                </Link>
                <ChevronRight className="h-3 w-3" />
                <Link to="/products" className="hover:text-blue-600 transition-colors">
                  PRODUCTS
                </Link>
                <ChevronRight className="h-3 w-3" />
                <span>PARKING MANAGEMENT</span>
              </nav>

              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-3">
                Parking Management Systems
              </h1>
              
              <p className="text-gray-600 mb-4">
                Comprehensive parking management solutions including guidance terminals, payment kiosks, and integrated systems.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  Get Quote
                </Button>
                <Button variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white">
                  View Details
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Compact Product Cards Section */}
      <div className="container mx-auto px-4 md:px-6 lg:px-8 py-6 bg-white">
        {/* Compact Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Our Product Range
          </h2>
          <p className="text-gray-600">
            Complete parking management solutions including guidance terminals and payment systems.
          </p>
        </div>

        {/* Compact Product Cards */}
        <div className="space-y-6">
          {parkingManagementProducts.map((product, index) => (
            <Card key={index} className="bg-white border border-gray-200 shadow-sm overflow-hidden">
              <div className="grid lg:grid-cols-2 gap-0">
                {/* Product Image */}
                <div className="h-[320px] bg-white">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-contain p-4"
                  />
                </div>

                {/* Product Info */}
                <div className="p-4">
                  <CardHeader className="p-0 pb-3">
                    <CardTitle className="text-lg font-bold text-gray-900 mb-2">
                      {product.name}
                    </CardTitle>
                    <p className="text-gray-600 text-sm">{product.description}</p>
                  </CardHeader>

                  <CardContent className="p-0">
                    {/* Features */}
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 mb-2 text-[17px]">Features</h4>
                      <div className="space-y-2">
                        {(expandedCard === index ? product.features : product.features.slice(0, 4)).map((feature, i) => (
                          <div key={i} className="flex items-start">
                            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <span className="text-gray-700 text-[14px] leading-relaxed">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Expandable Details */}
                    {expandedCard === index && (
                      <div className="space-y-4 mb-4">
                        {/* Applications */}
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2 text-[17px]">Applications</h4>
                          <div className="space-y-2">
                            {product.applications.map((application, i) => (
                              <div key={i} className="flex items-start">
                                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                                <span className="text-gray-700 text-[14px] leading-relaxed">{application}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Technical Parameters */}
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2 text-[17px]">Technical Specifications</h4>
                          <div className="bg-gray-50 p-3 rounded">
                            <div className="grid grid-cols-1 gap-2">
                              {Object.entries(product.technicalParameters).map(([key, value]) => (
                                <div key={key} className="flex justify-between border-b border-gray-200 pb-1">
                                  <span className="font-medium text-gray-700 text-[14px] capitalize">
                                    {key.replace(/([A-Z])/g, " $1").trim()}:
                                  </span>
                                  <span className="text-gray-600 text-[14px]">{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Button */}
                    <Button 
                      onClick={() => setExpandedCard(expandedCard === index ? null : index)}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {expandedCard === index ? 'Show Less' : 'More Details'}
                    </Button>
                  </CardContent>
                </div>
              </div>
            </Card>
          ))}
        </div>


      </div>

      <Footer />
    </div>
  );
};

export default ParkingManagement;