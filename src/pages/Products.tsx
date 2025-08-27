import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import QuoteRequestModal from "@/components/QuoteRequestModal";

// Import product images
import vayParkingBarrierGate10 from "@/assets/vay-parking-barrier-gate-10.jpg";
import barrierGate20 from "@/assets/barrier-gate-20.jpg";
import tripodTurnstiles24 from "@/assets/tripod-turnstiles-24.jpg";
import swingGates26 from "@/assets/swing-gates-26.jpg";
import flapBarriers28 from "@/assets/flap-barriers-28.jpg";
import vayParkingGuidanceDisplay23 from "@/assets/vay-parking-guidance-display-23.jpg";
import parkingPaymentKiosk18 from "@/assets/parking-payment-kiosk-18.jpg";
import facialRecognitionTerminal from "@/assets/facial-recognition-terminal.jpg";
import vayTripodTurnstilePremium from "@/assets/vay-tripod-turnstile-premium.jpg";

interface Product {
  name: string;
  image?: string;
  description: string;
  price: string;
  link?: string;
}

interface ProductCategory {
  id: string;
  label: string;
  description: string;
  products: Product[];
}

const Products = () => {
  const { toast } = useToast();
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleCloseModal = () => {
    setIsQuoteModalOpen(false);
    setSelectedProduct("");
  };

  const productCategories: ProductCategory[] = [
    {
      id: "barrier-gates",
      label: "Barrier Gates",
      description: "Automatic barrier gates for vehicle access control",
      products: [
        {
          name: "VAY Parking Barrier Gate",
          image: vayParkingBarrierGate10,
          description: "High-performance automatic barrier gate with advanced control systems and weather-resistant design for parking facilities.",
          price: "Rs. 1,85,000",
          link: "/products/barrier-gates"
        },
        {
          name: "Heavy Duty Barrier Gate",
          image: barrierGate20,
          description: "Industrial-grade heavy duty barrier gates designed for high-traffic commercial applications with variable boom length.",
          price: "Rs. 3,25,000",
          link: "/products/barrier-gates"
        }
      ]
    },
    {
      id: "pedestrian-gates",
      label: "Pedestrian Gates",
      description: "Advanced pedestrian access control solutions",
      products: [
        {
          name: "Tripod Turnstiles",
          image: tripodTurnstiles24,
          description: "Three-arm rotating turnstiles with stainless steel construction and hydraulic damping system for reliable access control.",
          price: "Rs. 85,000",
          link: "/products/pedestrian-gates"
        },
        {
          name: "Swing Gate Turnstiles",
          image: swingGates26,
          description: "Modern swing gate systems with tempered glass panels and anti-tailgating sensors for premium installations.",
          price: "Rs. 1,25,000",
          link: "/products/pedestrian-gates"
        },
        {
          name: "Flap Barrier Turnstiles",
          image: flapBarriers28,
          description: "High-speed flap barrier systems with 0.2-second opening time and obstacle detection for fast access control.",
          price: "Rs. 95,000",
          link: "/products/pedestrian-gates"
        }
      ]
    },
    {
      id: "parking-management",
      label: "Parking Management",
      description: "Smart parking guidance and management systems",
      products: [
        {
          name: "VAY Parking Guidance Display",
          image: vayParkingGuidanceDisplay23,
          description: "Advanced guidance display with LED indicators showing real-time parking availability and navigation information.",
          price: "Rs. 85,000",
          link: "/products/parking-management"
        },
        {
          name: "Interactive Parking Kiosk",
          image: parkingPaymentKiosk18,
          description: "Touchscreen parking kiosks with multiple payment options and QR code generation for mobile integration.",
          price: "Rs. 1,25,000",
          link: "/products/parking-management"
        }
      ]
    },
    {
      id: "access-control",
      label: "Access Control",
      description: "Biometric and smart access control systems",
      products: [
        {
          name: "Facial Recognition Terminal",
          image: facialRecognitionTerminal,
          description: "AI-powered facial recognition system with contactless operation and liveness detection for enhanced security.",
          price: "Rs. 1,50,000",
          link: "/products/access-control"
        },
        {
          name: "Biometric Access System",
          image: vayTripodTurnstilePremium,
          description: "Multi-modal biometric system with fingerprint recognition and card support for comprehensive access control.",
          price: "Rs. 1,20,000",
          link: "/products/access-control"
        }
      ]
    }
  ];

  const handleRequestQuote = (name: string) => {
    setSelectedProduct(name);
    setIsQuoteModalOpen(true);
    toast({
      title: "Quote Request",
      description: `Opening quote form for ${name}`,
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Hero Section */}
      <section className="py-12 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-6xl">
          <div className="text-center mb-10">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 font-poppins">
              Our Products
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed font-poppins font-normal">
              Complete range of parking and access control solutions designed for modern businesses.
            </p>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            <div className="text-center bg-white rounded-lg p-4 shadow-sm border">
              <div className="text-2xl font-bold text-blue-600 mb-1 font-poppins">500+</div>
              <div className="text-gray-600 font-poppins font-normal text-sm">Happy Clients</div>
            </div>
            <div className="text-center bg-white rounded-lg p-4 shadow-sm border">
              <div className="text-2xl font-bold text-blue-600 mb-1 font-poppins">1000+</div>
              <div className="text-gray-600 font-poppins font-normal text-sm">Installations</div>
            </div>
            <div className="text-center bg-white rounded-lg p-4 shadow-sm border">
              <div className="text-2xl font-bold text-blue-600 mb-1 font-poppins">99.9%</div>
              <div className="text-gray-600 font-poppins font-normal text-sm">Uptime</div>
            </div>
            <div className="text-center bg-white rounded-lg p-4 shadow-sm border">
              <div className="text-2xl font-bold text-blue-600 mb-1 font-poppins">24/7</div>
              <div className="text-gray-600 font-poppins font-normal text-sm">Support</div>
            </div>
          </div>

          {/* Product Categories */}
          <Tabs defaultValue="barrier-gates" className="w-full">
            <TabsList className="grid grid-cols-2 lg:grid-cols-4 w-full mb-12 bg-gray-100 p-1 rounded-lg">
              {productCategories.map((category) => (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className="text-sm font-medium px-4 py-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {productCategories.map((category) => (
              <TabsContent key={category.id} value={category.id} className="mt-0">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-2 font-poppins">
                    {category.label}
                  </h2>
                  <p className="text-gray-600 max-w-2xl mx-auto font-poppins font-normal text-sm">
                    {category.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                  {category.products.map((product, index) => (
                    <Card key={index} className="bg-white shadow-md hover:shadow-xl transition-all duration-300 border-0 overflow-hidden h-full flex flex-col">
                      {/* Product Image */}
                      <div className="h-48 sm:h-52 lg:h-56 bg-gray-50 overflow-hidden flex-shrink-0">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-contain p-3 hover:scale-105 transition-transform duration-300"
                        />
                      </div>

                      <CardContent className="p-4 flex-1 flex flex-col">
                        <div className="mb-4 flex-1">
                          <h3 className="text-lg font-bold text-gray-900 mb-2 font-poppins line-clamp-2">
                            {product.name}
                          </h3>
                          <div className="text-xl font-bold text-blue-600 mb-3 font-poppins">
                            {product.price}
                          </div>
                          <p className="text-gray-600 leading-relaxed text-sm font-poppins font-normal line-clamp-3">
                            {product.description}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 mt-auto">
                          <Link to={product.link || '#'}>
                            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-poppins text-sm py-2 mb-2">
                              View Details
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            onClick={() => handleRequestQuote(product.name)}
                            className="flex-1 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white font-poppins text-sm py-2"
                          >
                            Get Quote
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* Why Choose Us Section */}
          <div className="mt-20 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-12 text-white">
            <div className="text-center mb-12">
              <h3 className="text-3xl font-bold mb-4">Why Choose Our Solutions?</h3>
              <p className="text-blue-100 text-lg max-w-3xl mx-auto">
                Professional products backed by expert support and comprehensive warranties.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <div className="w-8 h-8 bg-white rounded-full"></div>
                </div>
                <h4 className="text-xl font-bold mb-4">Quality Products</h4>
                <p className="text-blue-100">
                  Premium quality products with industry-leading durability and performance standards.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <div className="w-8 h-8 bg-white rounded-full"></div>
                </div>
                <h4 className="text-xl font-bold mb-4">Expert Support</h4>
                <p className="text-blue-100">
                  Professional installation, maintenance, and 24/7 technical support for all products.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <div className="w-8 h-8 bg-white rounded-full"></div>
                </div>
                <h4 className="text-xl font-bold mb-4">Competitive Pricing</h4>
                <p className="text-blue-100">
                  Best-in-market pricing with flexible payment options and comprehensive warranties.
                </p>
              </div>
            </div>

            <div className="text-center mt-12">
              <Button 
                size="lg"
                className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-3 font-bold"
                onClick={() => setIsQuoteModalOpen(true)}
              >
                Get Custom Quote
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <QuoteRequestModal
        isOpen={isQuoteModalOpen}
        onClose={handleCloseModal}
        productName={selectedProduct}
      />
    </div>
  );
};

export default Products;