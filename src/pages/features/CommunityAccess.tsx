import { Button } from "@/components/ui/button";
import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const CommunityAccess = () => {

  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Breadcrumb */}
      <section className="pt-24 pb-4 bg-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-4xl">
          <nav className="flex items-center space-x-2 text-sm text-gray-500">
            <Link to="/" className="hover:text-blue-600 transition-colors">
              <Home className="h-4 w-4" />
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-gray-900">Community Access Control</span>
          </nav>
        </div>
      </section>

      {/* Article Header */}
      <article className="py-12 bg-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-4xl">
          
          {/* Hero Section */}
          <header className="mb-16 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-8 leading-tight">
              Community Access Management Solutions
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed max-w-3xl mx-auto">
              Transform your gated community with comprehensive visitor management, resident services, 
              vehicle tracking, and integrated security solutions for modern living.
            </p>
          </header>

          {/* Introduction */}
          <section className="prose prose-lg max-w-none mb-16">
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Modern gated communities demand sophisticated security and management systems that go beyond traditional 
              gate guards and paper-based visitor logs. Today's residents expect seamless, technology-driven experiences 
              that enhance security while providing convenience and transparency in community operations.
            </p>
            
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Our comprehensive community access management platform integrates visitor management, resident services, 
              vehicle tracking, and emergency response systems into a unified solution. This holistic approach ensures 
              maximum security while creating a frictionless experience for residents, visitors, and service providers.
            </p>
          </section>

          {/* Core Systems */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Core Management Systems</h2>
            
            <div className="space-y-12">
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Digital Visitor Management</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  Complete visitor registration, approval, and tracking system that eliminates paper-based processes. 
                  Visitors can be pre-approved by residents through mobile applications, with automatic QR code generation 
                  for contactless entry. The system maintains comprehensive digital logs for security and compliance purposes.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Photo capture, identity verification, and host notifications ensure that every visitor is properly 
                  documented and authorized, significantly reducing security risks while improving the visitor experience.
                </p>
              </div>
              
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Resident Mobile Application</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  All-in-one mobile platform that serves as the central hub for resident interactions with community 
                  services. From visitor pre-approval to community announcements, service bookings, and emergency alerts, 
                  the app streamlines all resident communications and transactions.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Integrated payment systems allow residents to handle maintenance fees, utility bills, and service 
                  payments seamlessly, while push notifications keep everyone informed about important community updates.
                </p>
              </div>
              
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Vehicle Entry Management</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  Advanced vehicle tracking system combining ANPR technology with RFID tags for comprehensive 
                  vehicle management. The system maintains a complete database of resident and authorized vehicles, 
                  automatically logging entry and exit times for security purposes.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Blacklist management and visitor vehicle registration ensure that only authorized vehicles gain 
                  access, while traffic flow optimization reduces congestion during peak hours.
                </p>
              </div>
            </div>
          </section>

          {/* Security Features */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Advanced Security Features</h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Multi-Layer Authentication</h3>
                <p className="text-gray-700 leading-relaxed">
                  Biometric access control, RFID cards, and mobile-based authentication provide multiple security 
                  layers. This redundant approach ensures that access is granted only to authorized individuals 
                  while maintaining user convenience.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Real-Time Monitoring</h3>
                <p className="text-gray-700 leading-relaxed">
                  24/7 system monitoring with instant alerts for unusual activities or security breaches. 
                  The centralized dashboard provides security personnel with complete visibility into all 
                  community access points and ongoing activities.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Visitor Verification</h3>
                <p className="text-gray-700 leading-relaxed">
                  Comprehensive visitor background verification system that cross-references visitor information 
                  with security databases. This proactive approach helps prevent security incidents before they occur.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Emergency Response</h3>
                <p className="text-gray-700 leading-relaxed">
                  Integrated emergency alert system with panic buttons, emergency contact management, and 
                  automated response coordination. Quick response protocols ensure resident safety during emergencies.
                </p>
              </div>
            </div>
          </section>

          {/* Implementation Benefits */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Implementation Benefits</h2>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Communities implementing our access management solutions typically experience a 75% reduction in 
              security incidents, streamlined operations, and significantly improved resident satisfaction. 
              The system pays for itself through reduced security staff requirements and improved operational efficiency.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed">
              Complete audit trails ensure compliance with security regulations, while contactless operations 
              provide hygienic access control that meets modern health and safety standards. The scalable 
              platform grows with your community's needs and can integrate with existing security infrastructure.
            </p>
          </section>

          {/* Call to Action */}
          <section className="text-center py-16 bg-gray-50 rounded-2xl">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              Ready to Secure Your Community?
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join hundreds of gated communities that have enhanced their security and resident experience 
              with our comprehensive access management solutions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3">
                Schedule Site Visit
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-3">
                Get Custom Quote
              </Button>
            </div>
          </section>
          
        </div>
      </article>

      <Footer />
    </div>
  );
};

export default CommunityAccess;