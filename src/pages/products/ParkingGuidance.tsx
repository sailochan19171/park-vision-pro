import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import kioskTerminal22 from "@/assets/kiosk-terminal-22.jpg";
import parkingGuidance23 from "@/assets/parking-guidance-23.jpg";
import parkingGuidanceTerminalBlack from "@/assets/parking-guidance-terminal-black.jpg";
import parkingGuidanceTerminalOrange from "@/assets/parking-guidance-terminal-orange.jpg";

const ParkingGuidance = () => {
  const products = [
    {
      id: 1,
      name: "Interactive Parking Kiosk",
      image: kioskTerminal22,
      description: "Smart self-service kiosk for parking payments, reservations, and customer assistance with VAY branding.",
      features: ["Touchscreen Interface", "Multiple Payment Options", "Real-time Information", "Weather Resistant"],

    },
    {
      id: 2,
      name: "Smart Parking Guidance Display",
      image: parkingGuidance23,
      description: "Digital guidance pillar with real-time parking information and directional assistance.",
      features: ["LED Display", "Real-time Updates", "Multi-language Support", "Voice Guidance"],

    },
    {
      id: 3,
      name: "Parking Management Terminal",
      image: kioskTerminal22,
      description: "Advanced terminal for comprehensive parking facility management and customer service.",
      features: ["Management Dashboard", "Customer Support", "Payment Processing", "Analytics"],

    },
    {
      id: 4,
      name: "Digital Parking Signage",
      image: parkingGuidance23,
      description: "Smart digital signage system for parking guidance and space availability display.",
      features: ["Dynamic Content", "Space Detection", "Network Integration", "Remote Management"],

    },
    {
      id: 5,
      name: "Split Ultrasonic Sensor",
      image: "/api/placeholder/300/200",
      description: "Modular ultrasonic sensor system for flexible parking guidance deployment.",
      features: ["Modular Design", "Easy Maintenance", "High Precision", "Long Lifespan"],

    },
    {
      id: 6,
      name: "Parking Lot Guidance Screen",
      image: parkingGuidanceTerminalBlack,
      description: "LED display system showing real-time parking availability and directions.",
      features: ["LED Display", "Multi-color Indicators", "Weather Proof", "Energy Efficient"],

    },
    {
      id: 7,
      name: "Information Query Terminal",
      image: parkingGuidanceTerminalOrange,
      description: "Interactive terminal providing parking information and wayfinding assistance.",
      features: ["Touch Screen", "Multi-language Support", "Map Integration", "User-friendly Interface"],

    },
    {
      id: 8,
      name: "Smart Guidance Controller",
      image: "/api/placeholder/300/200",
      description: "Intelligent controller system for comprehensive parking guidance management.",
      features: ["AI Integration", "Cloud Connectivity", "Mobile App Support", "Analytics Dashboard"],

    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="pt-20 pb-12 bg-gradient-to-br from-green-500/10 via-background to-emerald-500/10">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-8">
            <Link to="/" className="flex items-center hover:text-tech-blue transition-colors">
              <Home className="h-4 w-4 mr-1" />
              Home
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span>Products</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground font-medium">Parking Guidance System</span>
          </nav>

          <div className="max-w-4xl">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Parking Guidance System
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Smart parking guidance solutions that help drivers quickly find available parking spaces. 
              Our systems use advanced sensor technology, real-time displays, and intelligent algorithms 
              to reduce traffic congestion and improve parking efficiency.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-sm">Smart Sensors</Badge>
              <Badge variant="secondary" className="text-sm">Real-time Display</Badge>
              <Badge variant="secondary" className="text-sm">Traffic Reduction</Badge>
              <Badge variant="secondary" className="text-sm">Easy Navigation</Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => (
              <Card key={product.id} className="group hover:shadow-lg transition-shadow duration-300">
                <CardHeader className="p-0">
                  <div className="aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 rounded-t-lg overflow-hidden">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <CardTitle className="text-lg font-semibold text-foreground mb-2 line-clamp-2">
                    {product.name}
                  </CardTitle>
                  <CardDescription className="text-sm text-muted-foreground mb-4 line-clamp-3">
                    {product.description}
                  </CardDescription>
                  
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {product.features.slice(0, 2).map((feature, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                      {product.features.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{product.features.length - 2} more
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-tech-blue">
                        {product.price}
                      </span>
                      <Button size="sm" className="bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90">
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-tech-blue to-tech-blue-light to-emerald-600">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Optimize Your Parking with Smart Guidance
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Let our parking guidance experts help you design the perfect solution for your facility.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="bg-white text-green-600 hover:bg-gray-100">
              Get Free Quote
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-green-600">
              Schedule Demo
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ParkingGuidance;