import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Home, CreditCard, Wifi, Shield, Database, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import rfidCardReader from "@/assets/rfid-card-reader.jpg";

const RFIDSystem = () => {
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
            <span className="text-foreground font-medium">RFID Card Reader</span>
          </nav>

          {/* Back Button */}
          <Link to="/products/access-control" className="inline-flex items-center text-tech-blue hover:text-tech-blue-dark mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Access Control Systems
          </Link>

          <div className="max-w-4xl">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              RFID Card Reader System
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Professional RFID card reader system for secure and convenient access control. 
              Support multiple card types with advanced network connectivity and anti-passback features.
            </p>
            <div className="flex flex-wrap gap-2 mb-8">
              <Badge variant="secondary" className="text-sm">RFID Technology</Badge>
              <Badge variant="secondary" className="text-sm">Multiple Card Types</Badge>
              <Badge variant="secondary" className="text-sm">Network Connectivity</Badge>
              <Badge variant="secondary" className="text-sm">Anti-passback</Badge>
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
              src={rfidCardReader}
              alt="RFID Card Reader System"
              className="w-full h-[500px] object-cover rounded-lg shadow-lg mb-8"
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Advanced RFID Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <Card className="text-center">
                <CardHeader>
                  <CreditCard className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Multi-Card Support</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Compatible with various RFID card types including proximity cards, smart cards, and key fobs
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Wifi className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Network Ready</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Built-in TCP/IP connectivity for real-time monitoring and centralized management
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Shield className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Anti-Passback</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Advanced anti-passback features prevent unauthorized card sharing and tailgating
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Database className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Large Storage</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Store up to 30,000 cards and 100,000 access events with offline operation capability
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
                    <span className="font-medium">Reading Distance:</span>
                    <span>2-15cm (adjustable)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Card Types:</span>
                    <span>125kHz/13.56MHz</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Display:</span>
                    <span>LCD with backlight</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Operating Temperature:</span>
                    <span>-30°C to +70°C</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">IP Rating:</span>
                    <span>IP68</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Software Features</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="font-medium">Card Capacity:</span>
                    <span>30,000 cards</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Event Records:</span>
                    <span>100,000 events</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Communication:</span>
                    <span>TCP/IP, RS485, Wiegand</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Access Modes:</span>
                    <span>Card, Card+PIN, Card+Bio</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Power Supply:</span>
                    <span>DC 12V, 1.5A</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Applications Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8">Perfect For</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Commercial Buildings</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>Office building entrances</li>
                  <li>Elevator access control</li>
                  <li>Parking garage entry</li>
                  <li>Storage room access</li>
                </ul>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Industrial Facilities</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>Manufacturing floor access</li>
                  <li>Warehouse security</li>
                  <li>Equipment room control</li>
                  <li>Chemical storage areas</li>
                </ul>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Educational Institutions</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>Student dormitories</li>
                  <li>Laboratory access</li>
                  <li>Library systems</li>
                  <li>Administrative offices</li>
                </ul>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Healthcare Facilities</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>Patient room access</li>
                  <li>Pharmacy security</li>
                  <li>Operating room control</li>
                  <li>Medical records storage</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-cyan-600 to-blue-600">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Upgrade to Smart RFID Access Control
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Enhance your facility's security with our reliable RFID card reader systems. 
            Contact us for a customized solution.
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

export default RFIDSystem;