import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Home, CheckCircle, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// Images
import vayParkingBarrierGate10 from "@/assets/vay-parking-barrier-gate-10.jpg";
import barrierGate9 from "@/assets/barrier-gate-9.jpg";
import barrierGate10 from "@/assets/barrier-gate-10.jpg";
import barrierGate11 from "@/assets/barrier-gate-11.jpg";
import barrierGate20 from "@/assets/barrier-gate-20.jpg";
import barrierGate30 from "@/assets/barrier-gate-30.jpg";

const BarrierGates = () => {
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
    vayParkingBarrierGate10,
    barrierGate20,
    barrierGate9,
    barrierGate10,
    barrierGate11,
    barrierGate30,
  ];

  const barrierGateProducts = [
    {
      name: "VAY PARKING BARRIER GATE",
      description: "High-performance automatic barrier gate with advanced control systems for parking and access control applications.",
      image: vayParkingBarrierGate10,
      features: [
        "Automatic barrier arm operation with variable speed control",
        "Integrated LED display for status and pricing information",
        "Weather-resistant enclosure rated IP54",
        "Support for IC/ID card authentication systems",
        "Mobile app payment integration capability",
        "Emergency manual release mechanism",
        "Anti-crash safety sensors with obstacle detection",
        "Customizable boom length from 3-6 meters"
      ],
      applications: [
        "Parking facility entrance and exit control",
        "Toll collection points and highway access",
        "Industrial facility security checkpoints",
        "Residential complex gate automation"
      ],
      technicalParameters: {
        boomLength: "3-6 meters (customizable)",
        operatingTime: "3-6 seconds",
        powerSupply: "AC220V ±10%, 50/60Hz",
        workingTemperature: "-25°C to +70°C",
        protection: "IP54 weatherproof",
        motorType: "Brushless DC motor"
      }
    },
    {
      name: "HEAVY DUTY BARRIER GATE BG-HD-002",
      description: "Industrial-grade heavy duty barrier gates designed for high-traffic commercial and industrial applications.",
      image: barrierGate20,
      features: [
        "Heavy-duty construction for continuous operation",
        "Variable boom length up to 8 meters",
        "Advanced collision avoidance technology",
        "Integrated traffic light control system",
        "Remote monitoring and diagnostics",
        "Backup power system with UPS integration",
        "Multi-lane control capability",
        "Vandal-resistant design"
      ],
      applications: [
        "High-traffic commercial parking facilities",
        "Industrial complexes and factories",
        "Airport and seaport security zones",
        "Government and military installations"
      ],
      technicalParameters: {
        boomLength: "Up to 8 meters",
        operatingTime: "2-4 seconds",
        powerSupply: "AC380V ±10%, 50/60Hz",
        workingTemperature: "-30°C to +75°C",
        protection: "IP65 industrial grade",
        motorType: "High-torque servo motor"
      }
    },
    {
      name: "SMART PARKING BARRIER BG-SMART-003",
      description: "Intelligent parking barrier with integrated payment systems, LED guidance, and IoT connectivity.",
      image: barrierGate9,
      features: [
        "Integrated QR code and mobile payment processing",
        "LED guidance system for driver assistance",
        "Cloud-based management and monitoring",
        "License plate recognition integration",
        "Real-time occupancy tracking",
        "Energy-efficient LED lighting system",
        "Voice guidance and announcements",
        "Anti-tailgating detection system"
      ],
      applications: [
        "Smart city parking solutions",
        "Shopping mall parking systems",
        "Airport short-term parking",
        "Hotel and hospitality parking"
      ],
      technicalParameters: {
        boomLength: "3-5 meters",
        operatingTime: "2-3 seconds",
        powerSupply: "AC220V ±10%, 50/60Hz",
        workingTemperature: "-20°C to +60°C",
        protection: "IP54 standard",
        connectivity: "4G/WiFi/Ethernet"
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
                  alt="Barrier Gate Systems"
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
                <span>BARRIER GATES</span>
              </nav>

              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-3">
                Barrier Gate Systems
              </h1>
              
              <p className="text-gray-600 mb-4">
                Professional automatic barrier gates for parking and access control applications.
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
            Professional barrier gate systems for parking and access control applications.
          </p>
        </div>

        {/* Compact Product Cards */}
        <div className="space-y-6">
          {barrierGateProducts.map((product, index) => (
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

export default BarrierGates;