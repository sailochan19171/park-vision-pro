import { Button } from "./ui/button";
import { ArrowRight, Shield, Zap, Users } from "lucide-react";
import parkingTerminal from "../assets/parking-terminal.jpg";

const Hero = () => {
  return (
    <section id="home" className="min-h-screen flex items-center relative overflow-hidden bg-gradient-to-br from-tech-gray-light via-background to-secondary">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--tech-blue))_0%,transparent_50%)]"></div>
      </div>

      <div className="container mx-auto px-4 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center space-x-2 bg-tech-blue/10 text-tech-blue px-4 py-2 rounded-full text-sm font-medium">
                <Shield className="h-4 w-4" />
                <span>Advanced Parking Solutions</span>
              </div>
              
              <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
                ParkVision Pro
                <span className="block text-tech-blue">Parking Solutions</span>
                <span className="block text-2xl md:text-3xl font-medium text-muted-foreground mt-2">
                  Experts
                </span>
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-2xl">
                Transform your parking infrastructure with our cutting-edge vehicular access management solutions. 
                Streamline operations, enhance security, and provide effortless convenience to your users with our 
                advanced range of smart parking technologies.
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-success-green/10 rounded-lg flex items-center justify-center">
                  <Zap className="h-5 w-5 text-success-green" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Smart Automation</h3>
                  <p className="text-sm text-muted-foreground">AI-powered solutions</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-tech-blue/10 rounded-lg flex items-center justify-center">
                  <Shield className="h-5 w-5 text-tech-blue" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Secure Access</h3>
                  <p className="text-sm text-muted-foreground">Advanced security</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-warning-orange/10 rounded-lg flex items-center justify-center">
                  <Users className="h-5 w-5 text-warning-orange" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">User Friendly</h3>
                  <p className="text-sm text-muted-foreground">Intuitive interface</p>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90 text-white px-8"
              >
                Explore Solutions
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                className="border-tech-blue text-tech-blue hover:bg-tech-blue hover:text-white px-8"
              >
                Download Brochure
              </Button>
            </div>
          </div>

          {/* Image */}
          <div className="relative">
            <div className="relative z-10">
              <img
                src={parkingTerminal}
                alt="Parking Terminal Device"
                className="w-full max-w-lg mx-auto rounded-2xl shadow-2xl"
              />
            </div>
            
            {/* Floating Elements */}
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-success-green/20 rounded-full animate-pulse"></div>
            <div className="absolute -bottom-6 -left-6 w-16 h-16 bg-tech-blue/20 rounded-full animate-pulse delay-75"></div>
            <div className="absolute top-1/2 -right-8 w-12 h-12 bg-warning-orange/20 rounded-full animate-pulse delay-150"></div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-tech-blue rounded-full p-1">
          <div className="w-2 h-3 bg-tech-blue rounded-full animate-pulse"></div>
        </div>
      </div>
    </section>
  );
};

export default Hero;