import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Shield, Zap, Clock, CheckCircle, ArrowRight, Eye, Brain, Cloud } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const ANPRTechnology = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const keyFeatures = [
    {
      icon: Eye,
      title: "99.5% Recognition Accuracy",
      description: "Industry-leading OCR technology with advanced machine learning algorithms for precise plate recognition in all conditions."
    },
    {
      icon: Clock,
      title: "Real-time Processing",
      description: "Instant license plate detection and processing with sub-second response times for seamless traffic flow."
    },
    {
      icon: Shield,
      title: "Advanced Security",
      description: "Encrypted data transmission and secure cloud storage with comprehensive audit trails for compliance."
    },
    {
      icon: Brain,
      title: "AI-Powered Analytics",
      description: "Machine learning algorithms that continuously improve recognition accuracy and adapt to local conditions."
    },
    {
      icon: Cloud,
      title: "Cloud Integration",
      description: "Seamless cloud connectivity for remote monitoring, data backup, and system management capabilities."
    },
    {
      icon: Zap,
      title: "All-Weather Operation",
      description: "IP67-rated cameras with infrared illumination for 24/7 operation in all weather conditions."
    }
  ];

  const applications = [
    {
      title: "Parking Facilities",
      description: "Ticketless entry/exit systems for commercial and residential parking",
      benefits: ["Reduced wait times", "Contactless operation", "Revenue optimization"]
    },
    {
      title: "Access Control",
      description: "Secure vehicle access management for gated communities and corporate facilities",
      benefits: ["Enhanced security", "Visitor management", "Automated logging"]
    },
    {
      title: "Traffic Management",
      description: "Real-time traffic monitoring and violation detection systems",
      benefits: ["Traffic optimization", "Violation tracking", "Data analytics"]
    },
    {
      title: "Law Enforcement",
      description: "Automated vehicle identification for security and surveillance applications",
      benefits: ["Rapid identification", "Database integration", "Alert systems"]
    }
  ];

  const specifications = [
    { label: "Recognition Speed", value: "< 100ms per vehicle" },
    { label: "Operating Temperature", value: "-40°C to +70°C" },
    { label: "Image Resolution", value: "2MP to 8MP support" },
    { label: "Supported Formats", value: "All Indian number plate formats" },
    { label: "Network Connectivity", value: "Ethernet, WiFi, 4G LTE" },
    { label: "Power Consumption", value: "12W typical operation" },
    { label: "Installation Height", value: "2.5m to 6m adjustable" },
    { label: "Lane Coverage", value: "Up to 4 lanes per camera" }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="pb-16 bg-gradient-to-br from-tech-blue via-tech-blue-light to-tech-green">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-white space-y-6">
              <div className="space-y-4">
                <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                  Advanced Recognition Technology
                </Badge>
                <h1 className="text-4xl lg:text-6xl font-bold leading-tight">
                  ANPR Technology
                  <span className="block text-2xl lg:text-3xl font-normal opacity-90 mt-2">
                    Automatic Number Plate Recognition
                  </span>
                </h1>
                <p className="text-xl opacity-90 leading-relaxed">
                  Transform your parking and access control with our cutting-edge ANPR technology. 
                  Achieve 99.5% accuracy with real-time processing and comprehensive analytics.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="bg-white text-tech-blue hover:bg-white/90">
                  Request Demo
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-tech-blue">
                  Technical Specifications
                </Button>
              </div>
            </div>
            <div className="relative">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">99.5%</div>
                    <div className="text-sm opacity-80">Recognition Accuracy</div>
                  </div>
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">&lt;100ms</div>
                    <div className="text-sm opacity-80">Processing Time</div>
                  </div>
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">24/7</div>
                    <div className="text-sm opacity-80">Operation</div>
                  </div>
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">IP67</div>
                    <div className="text-sm opacity-80">Weather Proof</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Advanced Features</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Our ANPR technology combines cutting-edge hardware with intelligent software 
              to deliver unmatched performance and reliability.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {keyFeatures.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader>
                    <div className="w-12 h-12 bg-gradient-to-br from-tech-blue to-tech-blue-light rounded-lg flex items-center justify-center mb-4">
                      <IconComponent className="h-6 w-6 text-white" />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Applications */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Applications</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Versatile ANPR solutions for diverse industry requirements and use cases.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {applications.map((app, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl text-tech-blue">{app.title}</CardTitle>
                  <CardDescription className="text-base">{app.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {app.benefits.map((benefit, benefitIndex) => (
                      <div key={benefitIndex} className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Technical Specifications */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Technical Specifications</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Engineered for performance, built for reliability.
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-8">
                <div className="grid md:grid-cols-2 gap-8">
                  {specifications.map((spec, index) => (
                    <div key={index} className="flex justify-between items-center py-3 border-b border-border/50 last:border-b-0">
                      <span className="font-medium text-foreground">{spec.label}</span>
                      <span className="text-tech-blue font-semibold">{spec.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-tech-blue to-tech-blue-light">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center">
          <div className="max-w-3xl mx-auto text-white space-y-6">
            <h2 className="text-3xl lg:text-4xl font-bold">Ready to Transform Your Operations?</h2>
            <p className="text-xl opacity-90">
              Experience the power of advanced ANPR technology. Contact our experts for a 
              personalized demonstration and solution design.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-white text-tech-blue hover:bg-white/90">
                Schedule Demo
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-tech-blue">
                Download Brochure
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ANPRTechnology;