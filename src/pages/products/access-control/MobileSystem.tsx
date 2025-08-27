import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Home, Smartphone, Bluetooth, Wifi, Monitor, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import mobileAccessControl from "@/assets/mobile-access-control.jpg";

const MobileSystem = () => {
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
            <span className="text-foreground font-medium">Mobile Access Control</span>
          </nav>

          {/* Back Button */}
          <Link to="/products/access-control" className="inline-flex items-center text-tech-blue hover:text-tech-blue-dark mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Access Control Systems
          </Link>

          <div className="max-w-4xl">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Mobile Access Control Solution
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Modern mobile-based access control system using smartphone credentials. 
              Seamlessly integrate with parking systems for a unified access experience with real-time monitoring.
            </p>
            <div className="flex flex-wrap gap-2 mb-8">
              <Badge variant="secondary" className="text-sm">Smartphone Integration</Badge>
              <Badge variant="secondary" className="text-sm">Bluetooth/NFC</Badge>
              <Badge variant="secondary" className="text-sm">Remote Management</Badge>
              <Badge variant="secondary" className="text-sm">Real-time Monitoring</Badge>
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
            <img
              src={mobileAccessControl}
              alt="Mobile Access Control Solution"
              className="w-full h-[500px] object-cover rounded-lg shadow-lg mb-8"
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Smart Mobile Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <Card className="text-center">
                <CardHeader>
                  <Smartphone className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Smartphone App</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Native mobile apps for iOS and Android with intuitive user interface
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Bluetooth className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Bluetooth/NFC</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Support for both Bluetooth Low Energy and NFC communication protocols
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Monitor className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Remote Management</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Cloud-based management platform for remote configuration and monitoring
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Wifi className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Real-time Sync</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Real-time synchronization of access permissions and event logging
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8">Why Choose Mobile Access Control?</h2>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-2 h-2 bg-tech-blue rounded-full mt-3"></div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Ultimate Convenience</h3>
                  <p className="text-muted-foreground">
                    Users can access parking facilities using their smartphones, eliminating the need for physical cards, 
                    keys, or remembering access codes.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-2 h-2 bg-tech-blue rounded-full mt-3"></div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Enhanced Security</h3>
                  <p className="text-muted-foreground">
                    Advanced encryption and authentication protocols ensure secure communication between 
                    the mobile app and access control systems.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-2 h-2 bg-tech-blue rounded-full mt-3"></div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Cost Effective</h3>
                  <p className="text-muted-foreground">
                    Reduce operational costs by eliminating the need for physical cards, 
                    card readers, and associated maintenance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-12">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-tech-blue rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto">
                  1
                </div>
                <h3 className="text-xl font-semibold">Download App</h3>
                <p className="text-muted-foreground">
                  Users download the mobile app and register their account with valid credentials
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="w-16 h-16 bg-tech-blue rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto">
                  2
                </div>
                <h3 className="text-xl font-semibold">Approach Gate</h3>
                <p className="text-muted-foreground">
                  When approaching the parking gate, the app automatically detects the access point
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="w-16 h-16 bg-tech-blue rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto">
                  3
                </div>
                <h3 className="text-xl font-semibold">Access Granted</h3>
                <p className="text-muted-foreground">
                  The system verifies credentials and automatically opens the gate for authorized users
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-cyan-600 to-blue-600">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Go Mobile?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Transform your parking facility with cutting-edge mobile access control technology. 
            Contact us for a personalized solution.
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

export default MobileSystem;