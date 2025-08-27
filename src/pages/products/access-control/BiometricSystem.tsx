import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Home, Shield, Fingerprint, Eye, Smartphone, Cloud, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import biometricAccessControl from "@/assets/biometric-access-control.jpg";
import facialRecognitionTerminalTall from "@/assets/facial-recognition-terminal-tall.jpg";
import biometricAccessTerminal from "@/assets/biometric-access-terminal.jpg";

const BiometricSystem = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="pt-20 pb-12 bg-gradient-to-br from-cyan-500/10 via-background to-blue-500/10">
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
            <Link to="/products/access-control" className="hover:text-tech-blue transition-colors">
              Access Control
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground font-medium">Biometric System</span>
          </nav>

          {/* Back Button */}
          <Link to="/products/access-control" className="inline-flex items-center text-tech-blue hover:text-tech-blue-dark mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Access Control Systems
          </Link>

          <div className="max-w-4xl">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Biometric Access Control System
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Advanced biometric access control system with fingerprint and facial recognition capabilities. 
              Provide the highest level of security with multi-modal authentication and cloud integration.
            </p>
            <div className="flex flex-wrap gap-2 mb-8">
              <Badge variant="secondary" className="text-sm">Fingerprint Recognition</Badge>
              <Badge variant="secondary" className="text-sm">Facial Recognition</Badge>
              <Badge variant="secondary" className="text-sm">Multi-modal Authentication</Badge>
              <Badge variant="secondary" className="text-sm">Cloud Integration</Badge>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90">
                Get Quote
              </Button>
              <Button size="lg" variant="outline">
                Request Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Product Image Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <img
                src={facialRecognitionTerminalTall}
                alt="Facial Recognition Terminal"
                className="w-full h-[500px] object-cover rounded-lg shadow-lg"
              />
              <img
                src={biometricAccessTerminal}
                alt="Biometric Access Terminal with Keypad"
                className="w-full h-[500px] object-cover rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Advanced Security Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <Card className="text-center">
                <CardHeader>
                  <Fingerprint className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Fingerprint Recognition</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    High-precision fingerprint scanning with advanced algorithms for accurate identification
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Eye className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Facial Recognition</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    AI-powered facial recognition technology for contactless access control
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Shield className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Multi-modal Auth</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Combine multiple authentication methods for enhanced security layers
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Cloud className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Cloud Integration</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Seamless cloud connectivity for remote management and monitoring
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Specifications */}
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8">Technical Specifications</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle>Hardware Specifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="font-medium">Display:</span>
                    <span>5" TFT LCD Touchscreen</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Fingerprint Sensor:</span>
                    <span>Optical/Capacitive</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Camera:</span>
                    <span>2MP Wide Angle</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Operating Temperature:</span>
                    <span>-20°C to +60°C</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">IP Rating:</span>
                    <span>IP65</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Software Features</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="font-medium">User Capacity:</span>
                    <span>Up to 50,000 users</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Template Storage:</span>
                    <span>100,000 templates</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Log Capacity:</span>
                    <span>1,000,000 records</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Communication:</span>
                    <span>TCP/IP, Wi-Fi, RS485</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Power Supply:</span>
                    <span>12V DC, 3A</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8">Why Choose Our Biometric System?</h2>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-2 h-2 bg-tech-blue rounded-full mt-3"></div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Unparalleled Security</h3>
                  <p className="text-muted-foreground">
                    Biometric authentication provides the highest level of security by using unique human characteristics 
                    that cannot be duplicated or stolen like traditional cards or keys.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-2 h-2 bg-tech-blue rounded-full mt-3"></div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Contactless Operation</h3>
                  <p className="text-muted-foreground">
                    Facial recognition technology allows for completely contactless access, 
                    improving hygiene and user experience while maintaining security.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-2 h-2 bg-tech-blue rounded-full mt-3"></div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Easy Management</h3>
                  <p className="text-muted-foreground">
                    Cloud-based management system allows for remote configuration, monitoring, 
                    and user management from anywhere with internet access.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-cyan-600 to-blue-600">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Upgrade Your Security?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Contact our experts to discuss how our biometric access control system can enhance your facility's security.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="bg-white text-cyan-600 hover:bg-gray-100">
              Get Free Quote
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-cyan-600">
              Schedule Demo
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default BiometricSystem;