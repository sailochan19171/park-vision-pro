import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const SmartParking = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Breadcrumb */}
      <section className="pb-4 bg-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-4xl">
          <nav className="flex items-center space-x-2 text-sm text-gray-500">
            <Link to="/" className="hover:text-blue-600 transition-colors">
              <Home className="h-4 w-4" />
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-gray-900">Smart Parking Solutions</span>
          </nav>
        </div>
      </section>

      {/* Article Header */}
      <article className="py-12 bg-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-4xl">
          
          {/* Hero Section */}
          <header className="mb-16 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-8 leading-tight">
              Smart Parking & ANPR Solutions
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed max-w-3xl mx-auto">
              Transform your parking operations with IoT-enabled boom barriers, ANPR technology, 
              ticketless systems, and comprehensive analytics for complete automation.
            </p>
          </header>

          {/* Introduction */}
          <section className="prose prose-lg max-w-none mb-16">
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              The parking industry is experiencing a revolutionary transformation through smart technology integration. 
              Modern parking facilities are no longer just spaces to store vehicles; they have evolved into intelligent 
              ecosystems that enhance user experience, optimize operations, and generate valuable insights.
            </p>
            
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Our comprehensive smart parking solutions combine IoT connectivity, artificial intelligence, 
              and cloud-based management to create seamless parking experiences. From automated boom barriers 
              to advanced number plate recognition systems, we provide end-to-end solutions that eliminate 
              traditional parking hassles while maximizing operational efficiency.
            </p>
          </section>

          {/* Key Technologies */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Core Technologies</h2>
            
            <div className="space-y-12">
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">IoT Boom Barriers</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  Smart automated boom barriers with IoT connectivity provide seamless vehicle access control. 
                  These intelligent barriers can be remotely controlled, monitored in real-time, and integrated 
                  with mobile applications for enhanced user convenience.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  The system reduces manual intervention by 90% while ensuring 24/7 automated operation 
                  with real-time monitoring capabilities and cost-effective maintenance.
                </p>
              </div>
              
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">ANPR Technology</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  Advanced Automatic Number Plate Recognition system with 99.5% accuracy enables truly 
                  ticketless parking experiences. Our ANPR cameras work effectively in all weather conditions 
                  and lighting scenarios, providing reliable vehicle identification.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  The technology eliminates human error, works consistently in all conditions, 
                  provides instant recognition, and includes robust fraud prevention mechanisms.
                </p>
              </div>
              
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Ticketless Parking System</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  Complete contactless parking solution with mobile app integration and digital payments. 
                  Users can enter parking facilities using QR codes, make payments through their smartphones, 
                  and receive digital receipts instantly.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  This system significantly improves user experience, reduces operational costs, 
                  enables faster entry and exit processes, and supports eco-friendly operations.
                </p>
              </div>
            </div>
          </section>

          {/* Benefits Section */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Key Benefits</h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Operational Excellence</h3>
                <p className="text-gray-700 leading-relaxed">
                  Achieve 99.9% system uptime with automated operations that require minimal human intervention. 
                  Real-time monitoring and predictive maintenance ensure smooth operations around the clock.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Enhanced User Experience</h3>
                <p className="text-gray-700 leading-relaxed">
                  Provide frictionless parking experiences with contactless entry, mobile payments, 
                  and real-time space availability information through intuitive mobile applications.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Data-Driven Insights</h3>
                <p className="text-gray-700 leading-relaxed">
                  Comprehensive analytics provide insights into parking utilization patterns, peak hours, 
                  revenue optimization opportunities, and predictive analytics for better decision-making.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Rapid ROI</h3>
                <p className="text-gray-700 leading-relaxed">
                  Most implementations achieve return on investment within 6-12 months through reduced 
                  operational costs, increased efficiency, and enhanced revenue generation capabilities.
                </p>
              </div>
            </div>
          </section>

          {/* Implementation */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Implementation Process</h2>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Our streamlined implementation process ensures minimal disruption to your existing operations. 
              Most systems can be installed and operational within 2-4 hours, with comprehensive training 
              and ongoing support included.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed">
              We provide 24/7 technical support with response times under 4 hours, ensuring your parking 
              operations continue smoothly. Our cloud-based management platform allows for remote monitoring 
              and management of multiple parking locations from a single dashboard.
            </p>
          </section>

          {/* Call to Action */}
          <section className="text-center py-16 bg-gray-50 rounded-2xl">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              Ready to Transform Your Parking Operations?
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of parking operators who have revolutionized their operations with our smart parking solutions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3">
                Schedule Consultation
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-3">
                Download Brochure
              </Button>
            </div>
          </section>
          
        </div>
      </article>

      <Footer />
    </div>
  );
};

export default SmartParking;