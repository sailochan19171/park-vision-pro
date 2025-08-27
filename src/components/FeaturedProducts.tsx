import { useState } from "react";
import { Button } from "./ui/button";
import { ArrowRight, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import QuoteRequestModal from "./QuoteRequestModal";
import { useToast } from "../hooks/use-toast";

import smartTrafficSystem29 from "../assets/29.jpg";
import intelligentGateSystem16 from "../assets/16.jpg";
import barrierGate13 from "../assets/DSC_8033-2.png";

// Define interface for TypeScript
interface FeaturedProduct {
  id: string;
  name: string;
  image: string;
  description: string;
  fullDescription: string;
  specifications: string[];
}

const FeaturedProducts = () => {
  const { toast } = useToast();
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  const featuredProducts: FeaturedProduct[] = [
    {
      id: "vay-parking-barrier-gate",
      name: "VAY Parking Barrier Gate",
      image: barrierGate13,
      description:
        "Advanced vehicle access control with smart integrated systems for parking facilities...",
      fullDescription:
        "This premium parking barrier gate combines robust construction with intelligent control systems, offering seamless integration with RFID, license plate recognition, and mobile payment systems. Perfect for parking facilities requiring reliable, high-speed vehicle access control.",
      specifications: [
        "Smart Control Integration",
        "RFID & LPR Integration",
        "Anti-crash Safety Mechanism",
        "Weatherproof Construction",
        "Opening Time: 1-3s",
        "Use Case: Parking Lots / Commercial Buildings"
      ]
    },
    {
      id: "smart-traffic-system-29",
      name: "Smart Traffic Light & Boom Barrier System",
      image: smartTrafficSystem29,
      description:
        "Optimize entry/exit lanes with synchronized boom barriers and traffic light systems...",
      fullDescription:
        "Our integrated system combines LED-based traffic signals and automatic boom barriers for streamlined parking management. Perfect for toll booths, mall entrances, and corporate parking lots, ensuring clear visual guidance and efficient flow.",
      specifications: [
        "LED Traffic Light Integration",
        "Auto Synchronization with Boom Barrier",
        "Durable Arm with Reflective Strips",
        "Works with LPR, RFID, and Manual Triggers",
        "Ideal for Public Parking & Toll Areas"
      ]
    },
    {
      id: "intelligent-gate-16",
      name: "Intelligent Gate Entry Solution",
      image: intelligentGateSystem16,
      description:
        "Enhance your entry automation with our intelligent gate entry solution...",
      fullDescription:
        "Features smart sensors, automatic license plate recognition (LPR), and seamless integration with your building's access dashboard. Ensures controlled access to secure facilities with high-speed detection and logging.",
      specifications: [
        "Integrated LPR System",
        "Supports Mobile App Control",
        "Anti-crash Safety Mechanism",
        "All-weather Resistant Design",
        "Ideal for Societies, Campuses, Warehouses"
      ]
    }
  ];

  const toggleProductExpand = (id: string) => {
    setExpandedProductId(prev => (prev === id ? null : id));
  };

  const handleRequestQuote = (productName: string) => {
    setSelectedProduct(productName);
    setIsQuoteModalOpen(true);

    toast({
      title: "Quote Request Form",
      description: "Fill out the form to get your personalized quote.",
    });
  };

  const handleCloseModal = () => {
    setIsQuoteModalOpen(false);
    setSelectedProduct("");
  };

  return (
    <section className="py-24 bg-gradient-to-br from-gray-50/50 via-white to-blue-50/30 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-20 right-20 w-72 h-72 bg-blue-600 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-64 h-64 bg-blue-400 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl opacity-20"></div>
      </div>

      <div className="container mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 max-w-7xl relative w-full">
        <div className="text-center mb-8 sm:mb-12 lg:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
            Popular Parking Solutions
          </h2>
          <p className="text-sm text-gray-600 max-w-4xl mx-auto leading-relaxed px-2 sm:px-0">
            Discover our most trusted parking and access control systems designed for modern facilities
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-12">
          {featuredProducts.map((product) => {
            const isExpanded = expandedProductId === product.id;
            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden hover:-translate-y-2 group mx-2 sm:mx-0"
              >
                <div className="relative w-full h-64 sm:h-80 lg:h-96 overflow-hidden rounded-t-2xl">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-500 p-4 sm:p-6 lg:p-8"
                    loading="lazy"
                    style={{
                      filter: 'brightness(1.02) contrast(1.05) saturate(1.05)',
                      imageRendering: 'crisp-edges'
                    }}
                  />
                </div>

                <div className="p-4 sm:p-5 lg:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-2 leading-snug">
                    {product.name}
                  </h3>
                  <p className="text-gray-600 mb-3 leading-relaxed text-sm">
                    {product.description}
                  </p>

                  {isExpanded && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-sm text-gray-700 mb-2">
                        {product.fullDescription}
                      </p>
                      <h4 className="text-xs font-semibold text-gray-900 mb-1">Specifications:</h4>
                      <ul className="list-disc list-inside text-gray-700 text-xs space-y-1">
                        {product.specifications.map((spec, idx) => (
                          <li key={idx}>{spec}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-center gap-3 mt-4">
                    {/* <Button
                      onClick={() => handleRequestQuote(product.name)}
                      size="lg"
                      className="bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white flex items-center gap-2 text-base px-4 py-2 rounded-lg font-semibold hover:scale-105 transition-transform duration-300"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Request Quote
                    </Button> */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleProductExpand(product.id)}
                      className="hover:bg-tech-blue hover:text-white transition-colors flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border-tech-blue/30 text-tech-blue font-medium"
                    >
                      {isExpanded ? (
                        <>
                          Show Less
                          <ChevronUp className="w-3 h-3" />
                        </>
                      ) : (
                        <>
                          View Details
                          <ChevronDown className="w-3 h-3" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-4">
          <Button
            onClick={() => {
              window.location.href = "/products";
            }}
            className="bg-gradient-to-r from-tech-blue to-blue-600 hover:from-blue-600 hover:to-tech-blue text-white px-4 py-2 text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-300"
          >
            View All Products
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      <QuoteRequestModal
        isOpen={isQuoteModalOpen}
        onClose={handleCloseModal}
        productName={selectedProduct}
      />
    </section>
  );
};

export default FeaturedProducts;