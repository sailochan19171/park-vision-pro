import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Home, CheckCircle, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// Import VayAccess product images
import vayTripodTurnstilePremium from "@/assets/vay-tripod-turnstile-premium.jpg";
import vayFlapBarrierSlim from "@/assets/vay-flap-barrier-slim.jpg";
import vayFlapBarrierRed from "@/assets/vay-flap-barrier-red.jpg";
import vaySwingGateGlass from "@/assets/vay-swing-gate-glass.jpg";
import vayTripodTurnstileStandard from "@/assets/vay-tripod-turnstile-standard.jpg";

const AccessControl = () => {
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
    vayTripodTurnstilePremium,
    vayFlapBarrierSlim,
    vayFlapBarrierRed,
    vaySwingGateGlass,
    vayTripodTurnstileStandard,
  ];

  const vayAccessProducts = [
    {
      name: "VAY Premium Tripod Turnstiles",
      description: "High-end tripod turnstiles with glass panels and LED indicators for corporate environments.",
      image: vayTripodTurnstilePremium,
      features: [
        "Premium stainless steel construction with tempered glass panels",
        "LED status indicators with green/red access feedback",
        "Advanced anti-tailgating detection system",
        "Smooth 120° rotating mechanism with hydraulic damping",
        "Multiple authentication methods: RFID, biometric, mobile access",
        "Integration with existing security management systems",
        "Weather-resistant design for outdoor installations",
        "Emergency release mechanism for safety compliance"
      ],
      applications: [
        "Corporate headquarters and office buildings",
        "High-end shopping centers and retail complexes",
        "Premium residential complexes and gated communities",
        "Government buildings and secure facilities"
      ],
      technicalParameters: {
        throughput: "25-30 persons/min",
        powerSupply: "AC220V ±10%, 50/60Hz",
        workingTemperature: "-25°C to +70°C",
        protection: "IP54 weatherproof",
        material: "304 Stainless Steel",
        dimensions: "1200×280×980mm"
      }
    },
    {
      name: "VAY Slim Flap Barriers",
      description: "Compact flap barrier turnstiles perfect for high-traffic areas requiring elegant access control.",
      image: vayFlapBarrierSlim,
      features: [
        "Ultra-slim profile design saves valuable floor space",
        "Fast-operating flap barriers with 0.3-second opening",
        "Anti-pinch safety sensors with immediate stop function",
        "Silent operation with brushless DC motor technology",
        "LED guidance system for clear user direction",
        "Compatible with all standard access control systems",
        "Multi-authentication support including RFID and biometric",
        "Remote monitoring and diagnostics capability"
      ],
      applications: [
        "Metro stations and public transportation hubs",
        "Airport terminals and security checkpoints",
        "University campuses and educational facilities",
        "Healthcare facilities and hospital entrances"
      ],
      technicalParameters: {
        throughput: "35-40 persons/min",
        powerSupply: "AC220V ±10%, 50/60Hz",
        workingTemperature: "-15°C to +60°C",
        protection: "IP54 standard",
        openingTime: "0.3 seconds",
        dimensions: "1200×230×1020mm"
      }
    },
    {
      name: "VAY Flap Barrier Turnstiles",
      description: "Professional flap barrier systems with robust construction for medium to high-security environments.",
      image: vayFlapBarrierRed,
      features: [
        "Distinctive red barrier flaps for high visibility",
        "Heavy-duty construction for continuous operation",
        "Advanced infrared detection prevents barrier damage",
        "Real-time access logging and reporting capabilities",
        "Weather-resistant sealing for outdoor installations",
        "Remote monitoring and diagnostics via network interface",
        "Anti-tailgating detection system",
        "Emergency mode with instant barrier opening"
      ],
      applications: [
        "Industrial facilities and manufacturing plants",
        "Government buildings and secure installations",
        "Educational institutions and university campuses",
        "Corporate campuses and business complexes"
      ],
      technicalParameters: {
        throughput: "30-35 persons/min",
        powerSupply: "AC220V ±10%, 50/60Hz",
        workingTemperature: "-25°C to +70°C",
        protection: "IP65 industrial grade",
        material: "Heavy-duty stainless steel",
        dimensions: "1200×300×1000mm"
      }
    },
    {
      name: "VAY Swing Gate Systems",
      description: "Sophisticated swing gate turnstiles with glass barriers and advanced sensor technology.",
      image: vaySwingGateGlass,
      features: [
        "Crystal-clear tempered glass swing barriers for premium aesthetics",
        "Advanced 3D detection sensors prevent tailgating and collision",
        "Integration with facial recognition and biometric systems",
        "Emergency mode with instant barrier opening for evacuation",
        "Customizable barrier width from 600mm to 1200mm",
        "Network-ready with cloud management platform compatibility",
        "Silent servo motor operation",
        "LED guidance and status indication system"
      ],
      applications: [
        "Luxury hotels and hospitality venues",
        "Premium office towers and corporate headquarters",
        "High-end retail centers and shopping complexes",
        "Executive lounges and VIP areas"
      ],
      technicalParameters: {
        throughput: "25-30 persons/min",
        powerSupply: "AC220V ±10%, 50/60Hz",
        workingTemperature: "-15°C to +60°C",
        protection: "IP54 standard",
        material: "Brushed stainless steel + tempered glass",
        dimensions: "1200×230×1020mm"
      }
    },
    {
      name: "VAY Standard Tripod Turnstiles",
      description: "Heavy-duty standard tripod turnstiles with robust construction for high-volume applications.",
      image: vayTripodTurnstileStandard,
      features: [
        "Robust three-arm rotating mechanism for maximum durability",
        "Heavy-duty stainless steel construction for long service life",
        "Multiple authentication options: card, biometric, PIN, mobile",
        "Automatic locking mechanism prevents unauthorized passage",
        "Low maintenance requirements with self-lubricating bearings",
        "Scalable installation from single unit to multi-lane configurations",
        "Weather-resistant outdoor installation capability",
        "Manual override for emergency situations"
      ],
      applications: [
        "Factory entrances and industrial facilities",
        "Construction sites and outdoor installations",
        "Public facilities and government buildings",
        "Educational institutions and campuses"
      ],
      technicalParameters: {
        throughput: "20-25 persons/min",
        powerSupply: "AC220V ±10%, 50/60Hz",
        workingTemperature: "-30°C to +75°C",
        protection: "IP65 outdoor rated",
        material: "Heavy-duty stainless steel",
        dimensions: "1200×300×1000mm"
      }
    },
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
                  alt="Access Control Systems"
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
                <span>ACCESS CONTROL</span>
              </nav>

              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-3">
                Access Control Systems
              </h1>
              
              <p className="text-gray-600 mb-4">
                Professional access control solutions for secure facility management and pedestrian access.
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
            Professional access control systems for secure facility management and pedestrian access.
          </p>
        </div>

        {/* Compact Product Cards */}
        <div className="space-y-6">
          {vayAccessProducts.map((product, index) => (
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

export default AccessControl;