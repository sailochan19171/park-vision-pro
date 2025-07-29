import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { 
  Car, 
  Shield, 
  Smartphone, 
  BarChart3, 
  Camera, 
  Wifi,
  ArrowRight,
  CheckCircle
} from "lucide-react";
import parkingGates from "../assets/parking-gates.jpg";

const Solutions = () => {
  const solutions = [
    {
      icon: <Car className="h-8 w-8" />,
      title: "Smart Turnstiles",
      description: "Advanced access control with RFID, QR codes, and mobile integration",
      features: ["Contactless entry", "Real-time monitoring", "Integration ready"],
      color: "tech-blue"
    },
    {
      icon: <Shield className="h-8 w-8" />,
      title: "Security Systems", 
      description: "Comprehensive surveillance and access management solutions",
      features: ["24/7 monitoring", "Facial recognition", "Alert systems"],
      color: "success-green"
    },
    {
      icon: <Smartphone className="h-8 w-8" />,
      title: "Mobile Solutions",
      description: "User-friendly mobile apps for seamless parking experience",
      features: ["Digital payments", "Booking system", "Navigation"],
      color: "warning-orange"
    },
    {
      icon: <BarChart3 className="h-8 w-8" />,
      title: "Analytics Dashboard",
      description: "Real-time insights and comprehensive reporting tools",
      features: ["Usage analytics", "Revenue tracking", "Predictive insights"],
      color: "tech-blue"
    },
    {
      icon: <Camera className="h-8 w-8" />,
      title: "ANPR Systems",
      description: "Automatic Number Plate Recognition for efficient vehicle tracking",
      features: ["License plate scanning", "Vehicle identification", "Traffic flow"],
      color: "success-green"
    },
    {
      icon: <Wifi className="h-8 w-8" />,
      title: "IoT Integration",
      description: "Connected devices for smart parking ecosystem management",
      features: ["Sensor networks", "Cloud connectivity", "Remote control"],
      color: "warning-orange"
    }
  ];

  return (
    <section id="solutions" className="py-20 bg-tech-gray-light">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-tech-blue/10 text-tech-blue border-tech-blue/20">
            Solutions
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Complete Parking Solutions
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            From smart turnstiles to comprehensive analytics, we provide end-to-end 
            parking management solutions that enhance security, efficiency, and user experience.
          </p>
        </div>

        {/* Main Solutions Grid */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
          {/* Image */}
          <div className="relative">
            <img
              src={parkingGates}
              alt="Smart Parking Gates"
              className="w-full rounded-2xl shadow-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-tech-blue/20 to-transparent rounded-2xl"></div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                Advanced Access Control Systems
              </h3>
              <p className="text-muted-foreground mb-6">
                Our state-of-the-art turnstiles and gates provide secure, efficient vehicle 
                access management with multiple authentication methods and real-time monitoring capabilities.
              </p>
            </div>

            <div className="space-y-3">
              {[
                "RFID & NFC card authentication",
                "QR code and mobile app integration", 
                "Biometric access control",
                "Real-time traffic monitoring",
                "Emergency override systems"
              ].map((feature, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-success-green" />
                  <span className="text-foreground">{feature}</span>
                </div>
              ))}
            </div>

            <Button className="bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90">
              Learn More
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Solutions Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {solutions.map((solution, index) => (
            <Card key={index} className="group hover:shadow-lg transition-all duration-300 border-0 bg-background">
              <CardContent className="p-6">
                <div className={`w-16 h-16 rounded-2xl mb-6 flex items-center justify-center bg-${solution.color}/10 text-${solution.color} group-hover:scale-110 transition-transform duration-300`}>
                  {solution.icon}
                </div>
                
                <h3 className="text-xl font-bold text-foreground mb-3">
                  {solution.title}
                </h3>
                
                <p className="text-muted-foreground mb-4">
                  {solution.description}
                </p>
                
                <div className="space-y-2">
                  {solution.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-center space-x-2 text-sm">
                      <div className={`w-2 h-2 rounded-full bg-${solution.color}`}></div>
                      <span className="text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Solutions;