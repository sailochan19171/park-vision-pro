import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Home, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import Header from "../../components/Header.tsx";
import Footer from "../../components/Footer.tsx";
import tripodTurnstiles24 from "../../assets/tripod-turnstiles-24.jpg";
import swingGates26 from "../../assets/swing-gates-26.jpg";
import flapBarriers28 from "../../assets/flap-barriers-28.jpg";
import pedestrianSwingGate29 from "../../assets/pedestrian-swing-gate-29.jpg";
import pedestrian7 from "../../assets/pedistrian7.jpg";
import pedestrian8 from "../../assets/pedistrian8.jpg";

const PedestrianGates = () => {
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
    tripodTurnstiles24,
    swingGates26,
    flapBarriers28,
    pedestrianSwingGate29,
    pedestrian7,
    pedestrian8
  ];

  const pedestrianGateProducts = [
    {
      name: "TRIPOD TURNSTILES",

      image: tripodTurnstiles24,
      description: "Three-arm rotating turnstiles for controlled pedestrian access with robust stainless steel construction.",
      features: [
        "Stainless steel construction with anti-rust coating",
        "Smooth rotation with hydraulic damping system",
        "Compatible with various authentication methods",
        "Emergency release mechanism for safety compliance",
        "Weather-resistant design for outdoor installations",
        "LED indicators for access status feedback",
        "Anti-reverse rotation protection",
        "Manual override capability"
      ],
      applications: [
        "Office building entrances and lobbies",
        "Subway and metro station access points", 
        "Factory and warehouse security checkpoints",
        "University and school campus entries",
        "Stadium and venue crowd control",
        "Public building access management"
      ],
      specifications: {
        "Throughput": "25-30 people/minute",
        "Power Supply": "AC220V ±10%, 50/60Hz",
        "Operating Temperature": "-25°C to +70°C",
        "Channel Width": "550mm",
        "Material": "304 Stainless Steel",
        "Dimensions": "1200×280×980mm"
      }
    },
    {
      name: "SWING GATE TURNSTILES",

      image: swingGates26,
      description: "Modern swing gate systems with glass panels providing elegant pedestrian access control for premium installations.",
      features: [
        "Tempered glass swing panels for modern aesthetics",
        "Fast-acting swing mechanism with soft close technology",
        "Anti-tailgating sensors with dual detection zones",
        "Silent operation with brushless motor technology",
        "Emergency breakaway panels for fire safety compliance",
        "Integrated LED guidance and status indication",
        "Remote monitoring and diagnostics capability",
        "Customizable swing direction and access control"
      ],
      applications: [
        "Corporate headquarters and premium offices",
        "Shopping centers and luxury retail complexes",
        "Airport terminals and VIP lounges",
        "Hotel lobbies and conference centers",
        "Banking and financial institutions",
        "Healthcare facilities and hospitals"
      ],
      specifications: {
        "Throughput": "30-35 people/minute",
        "Power Supply": "AC220V ±10%, 50/60Hz",
        "Operating Temperature": "-15°C to +60°C",
        "Channel Width": "550-900mm",
        "Material": "Brushed Stainless Steel + Glass",
        "Dimensions": "1200×230×1020mm"
      }
    },
    {
      name: "FLAP BARRIER TURNSTILES",

      image: flapBarriers28,
      description: "High-speed flap barrier systems offering fast and secure pedestrian access control with modern design aesthetics.",
      features: [
        "High-speed flap operation with 0.2-second opening time",
        "Advanced obstacle detection with immediate stop function",
        "Bi-directional access control with LED status indicators",
        "Anti-pinch safety sensors throughout barrier path",
        "Vandal-resistant design with reinforced housing",
        "Integration with facial recognition and biometric systems",
        "Real-time monitoring and comprehensive access logging",
        "Fail-safe mode for emergency evacuation procedures"
      ],
      applications: [
        "High-traffic commercial buildings and towers",
        "Transportation hubs and busy terminals",
        "Government facilities and secure installations",
        "Healthcare facilities and hospital complexes",
        "Educational institutions and universities",
        "Sports venues and entertainment complexes"
      ],
      specifications: {
        "Throughput": "40-50 people/minute",
        "Power Supply": "AC220V ±10%, 50/60Hz",
        "Operating Temperature": "-20°C to +65°C",
        "Channel Width": "550-600mm",
        "Material": "304 Stainless Steel",
        "Dimensions": "1400×280×1020mm"
      }
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Simple Hero Section */}
      <section className="bg-gray-50 py-12">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            
            {/* Large Product Image */}
            <div>
              <div className="bg-white rounded-lg shadow-lg overflow-hidden h-[500px] relative">
                <img
                  src={productImages[currentImage]}
                  alt="Pedestrian Gate Systems"
                  className="w-full h-full object-contain p-8"
                />
                
                {/* Left/Right Navigation Buttons */}
                <button
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white text-gray-700 rounded-full p-3 shadow-md transition-all duration-200"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white text-gray-700 rounded-full p-3 shadow-md transition-all duration-200"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </div>
              
              {/* Thumbnail Gallery */}
              <div className="mt-6">
                <div className="flex space-x-3 justify-center">
                  {productImages.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImage(index)}
                      className={`w-20 h-16 rounded border-2 overflow-hidden transition-all duration-300 ${
                        currentImage === index 
                          ? "border-blue-500" 
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <img
                        src={image}
                        alt={`Product ${index + 1}`}
                        className="w-full h-full object-contain bg-white p-2"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Product Info */}
            <div>
              {/* Breadcrumb */}
              <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-4">
                <Link to="/" className="hover:text-blue-600 transition-colors">
                  <Home className="h-4 w-4" />
                </Link>
                <ChevronRight className="h-4 w-4" />
                <Link to="/products" className="hover:text-blue-600 transition-colors">
                  PRODUCTS
                </Link>
                <ChevronRight className="h-4 w-4" />
                <span>PEDESTRIAN GATES</span>
              </nav>

              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                Pedestrian Gate Systems
              </h1>
              
              <p className="text-gray-600 text-lg mb-8 leading-relaxed">
                Professional pedestrian access control solutions including turnstiles, swing gates, and flap barriers. 
                Built for security and reliability.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3">
                  Get Quote
                </Button>
                <Button size="lg" variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white px-8 py-3">
                  Download Catalog
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Simple Product Cards */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          
          {/* Section Header */}
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Our Product Range
            </h2>
            <p className="text-gray-600 text-lg max-w-3xl mx-auto">
              Professional pedestrian gate systems for various access control requirements.
            </p>
          </div>

          {/* Product Cards */}
          <div className="space-y-12">
            {pedestrianGateProducts.map((product, index) => (
              <Card key={index} className="bg-white shadow-lg rounded-lg overflow-hidden border">
                <div className="grid lg:grid-cols-2 gap-0">
                  
                  {/* Large Product Image */}
                  <div className="bg-gray-50">
                    <div className="h-[400px] flex items-center justify-center p-8">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-contain drop-shadow-xl"
                        style={{
                          filter: 'drop-shadow(0 25px 50px rgba(0, 0, 0, 0.15))'
                        }}
                      />
                    </div>
                  </div>

                  {/* Product Details */}
                  <div className="p-8">
                    <div className="h-full flex flex-col">
                      
                      <div className="mb-6">
                        <h3 className="text-2xl font-bold text-gray-900 mb-3">
                          {product.name}
                        </h3>
                        <div className="text-3xl font-bold text-blue-600 mb-4 bg-blue-50 px-4 py-2 rounded-lg inline-block">
                          {product.price}
                        </div>
                        <p className="text-gray-600 leading-relaxed">
                          {product.description}
                        </p>
                      </div>

                      {/* Features */}
                      <div className="mb-6 flex-grow">
                        <h4 className="text-[17px] font-semibold text-gray-900 mb-3">Features</h4>
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
                        <div className="space-y-6 border-t pt-6 mb-6">
                          
                          {/* Applications */}
                          <div>
                            <h4 className="text-[17px] font-semibold text-gray-900 mb-3">Applications</h4>
                            <div className="space-y-2">
                              {product.applications.map((application, i) => (
                                <div key={i} className="flex items-start">
                                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                                  <span className="text-gray-700 text-[14px] leading-relaxed">{application}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Technical Specifications */}
                          <div>
                            <h4 className="text-[17px] font-semibold text-gray-900 mb-3">Technical Specifications</h4>
                            <div className="bg-gray-50 rounded-lg p-4">
                              <div className="space-y-3">
                                {Object.entries(product.specifications).map(([key, value]) => (
                                  <div key={key} className="flex justify-between items-center border-b border-gray-200 pb-2">
                                    <span className="font-medium text-gray-700 text-[14px]">{key}:</span>
                                    <span className="text-gray-900 font-medium text-[14px]">{value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button 
                          onClick={() => setExpandedCard(expandedCard === index ? null : index)}
                          className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                        >
                          {expandedCard === index ? 'Show Less' : 'View Details'}
                        </Button>
                        
                        <Button 
                          variant="outline" 
                          className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white flex-1"
                        >
                          Get Quote
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default PedestrianGates;