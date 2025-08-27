import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Home, Hash, Users, Shield, FileText, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import keypadAccessControl from "@/assets/keypad-access-control.jpg";

const KeypadSystem = () => {
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
            <span className="text-foreground font-medium">Keypad Access Control</span>
          </nav>

          {/* Back Button */}
          <Link to="/products/access-control" className="inline-flex items-center text-tech-blue hover:text-tech-blue-dark mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Access Control Systems
          </Link>

          <div className="max-w-4xl">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Keypad Access Control Panel
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Reliable keypad-based access control panel with numeric code entry. 
              Weather-resistant design perfect for outdoor installations with multiple user codes and audit trail.
            </p>
            <div className="flex flex-wrap gap-2 mb-8">
              <Badge variant="secondary" className="text-sm">Numeric Keypad</Badge>
              <Badge variant="secondary" className="text-sm">Multiple User Codes</Badge>
              <Badge variant="secondary" className="text-sm">Weather Resistant</Badge>
              <Badge variant="secondary" className="text-sm">Audit Trail</Badge>
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
              src={keypadAccessControl}
              alt="Keypad Access Control Panel"
              className="w-full h-[500px] object-cover rounded-lg shadow-lg mb-8"
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Robust Keypad Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <Card className="text-center">
                <CardHeader>
                  <Hash className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Numeric Keypad</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Illuminated numeric keypad with tactile feedback for easy operation in all conditions
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Users className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Multi-User Codes</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Support for up to 1000 individual user codes with time-based access control
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Shield className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Weather Resistant</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    IP65 rated housing designed for outdoor use in harsh weather conditions
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <FileText className="h-12 w-12 text-tech-blue mx-auto mb-4" />
                  <CardTitle className="text-lg">Audit Trail</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Comprehensive logging of all access attempts with date, time, and user identification
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
                    <span className="font-medium">Keypad Type:</span>
                    <span>12-key backlit numeric</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Display:</span>
                    <span>2-line LCD with backlight</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Housing Material:</span>
                    <span>Die-cast aluminum</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Operating Temperature:</span>
                    <span>-40°C to +70°C</span>
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
                    <span className="font-medium">User Codes:</span>
                    <span>Up to 1000 codes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Code Length:</span>
                    <span>4-8 digits</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Event Memory:</span>
                    <span>10,000 events</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Communication:</span>
                    <span>RS485, TCP/IP</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Power Supply:</span>
                    <span>12V DC, 500mA</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Installation Options */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">Installation Options</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle>Surface Mount</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Quick installation on existing walls or surfaces with standard mounting brackets.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>Easy retrofitting</li>
                    <li>Minimal wiring required</li>
                    <li>Quick installation</li>
                    <li>Cost-effective solution</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Flush Mount</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Recessed installation for a clean, professional appearance with enhanced security.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>Professional appearance</li>
                    <li>Enhanced tamper resistance</li>
                    <li>Weather protection</li>
                    <li>Vandal resistant</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8">Advanced Security Features</h2>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-2 h-2 bg-tech-blue rounded-full mt-3"></div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Anti-Tailgating Protection</h3>
                  <p className="text-muted-foreground">
                    Built-in sensors detect when multiple people attempt to enter using a single code, 
                    preventing unauthorized access.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-2 h-2 bg-tech-blue rounded-full mt-3"></div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Code Scrambling</h3>
                  <p className="text-muted-foreground">
                    Random number display prevents code observation by showing false numbers 
                    before and after the actual access code.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-2 h-2 bg-tech-blue rounded-full mt-3"></div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Lockout Protection</h3>
                  <p className="text-muted-foreground">
                    Automatic lockout after multiple failed attempts prevents brute force attacks 
                    and unauthorized access attempts.
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
            Secure Your Facility with Keypad Access Control
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Reliable, weather-resistant keypad systems perfect for outdoor installations and high-security areas.
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

export default KeypadSystem;