import { Button } from "@/components/ui/button";
import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const ComprehensiveServices = () => {

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
            <span className="text-gray-900">Comprehensive Services</span>
          </nav>
        </div>
      </section>

      {/* Article Header */}
      <article className="py-12 bg-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-4xl">
          
          {/* Hero Section */}
          <header className="mb-16 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-8 leading-tight">
              Complete Vehicle Services Platform
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed max-w-3xl mx-auto">
              From FASTag services to vehicle insurance, maintenance booking to EV charging - 
              everything you need for complete vehicle management in one platform.
            </p>
          </header>

          {/* Introduction */}
          <section className="prose prose-lg max-w-none mb-16">
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Modern vehicle ownership extends far beyond the simple act of driving. Today's vehicle owners 
              require comprehensive support across financial services, maintenance scheduling, regulatory 
              compliance, and infrastructure access. Our integrated platform addresses every aspect of 
              vehicle ownership through a unified digital ecosystem.
            </p>
            
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              By consolidating traditionally fragmented services into a single platform, we eliminate the 
              complexity of managing multiple vendors, payment systems, and service relationships. The result 
              is a streamlined experience that saves time, reduces costs, and provides unprecedented 
              convenience for individual vehicle owners and fleet operators alike.
            </p>
          </section>

          {/* Core Service Areas */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Core Service Areas</h2>
            
            <div className="space-y-12">
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Financial Services</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  Complete FASTag solution with automated recharge, balance monitoring, and toll payment 
                  management across all major highways. Our system provides real-time balance alerts and 
                  maintains detailed transaction histories for expense tracking and business compliance.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Comprehensive vehicle insurance services allow users to compare quotes from leading 
                  providers, purchase policies instantly, and manage claims through a single interface. 
                  Automated renewal reminders ensure continuous coverage protection.
                </p>
              </div>
              
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Vehicle Maintenance & Services</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  Direct booking with certified service centers for routine maintenance, repairs, and 
                  specialized services. Our platform connects users with qualified technicians while 
                  providing transparent pricing, service tracking, and warranty support.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Preventive maintenance scheduling uses vehicle data to recommend service intervals, 
                  ensuring optimal performance while minimizing unexpected breakdowns and extending 
                  vehicle lifespan.
                </p>
              </div>
              
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Traffic & Compliance Management</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  Automated challan tracking and payment system covering all states with instant notifications 
                  for new violations. The platform monitors penalty deadlines and available discount periods 
                  to minimize financial impact while ensuring legal compliance.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Real-time traffic updates and route optimization help drivers avoid congestion and reduce 
                  travel time, while violation history tracking supports defensive driving practices.
                </p>
              </div>
            </div>
          </section>

          {/* Advanced Features */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Advanced Platform Features</h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">EV Charging Network</h3>
                <p className="text-gray-700 leading-relaxed">
                  Comprehensive electric vehicle charging infrastructure with real-time station availability, 
                  smart charging optimization, and seamless payment integration. Support for all major 
                  charging standards and network providers.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Fleet Management Solutions</h3>
                <p className="text-gray-700 leading-relaxed">
                  Complete fleet management platform for businesses including vehicle tracking, driver 
                  management, fuel monitoring, and route optimization. Advanced analytics provide insights 
                  for cost reduction and efficiency improvement.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Digital Documentation</h3>
                <p className="text-gray-700 leading-relaxed">
                  Secure digital storage for all vehicle-related documents including registration, insurance 
                  policies, service records, and compliance certificates. Cloud-based access ensures 
                  documents are always available when needed.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">24/7 Support System</h3>
                <p className="text-gray-700 leading-relaxed">
                  Round-the-clock customer support with dedicated assistance for emergencies, service 
                  inquiries, and platform navigation. Multi-channel support including chat, phone, 
                  and in-app messaging.
                </p>
              </div>
            </div>
          </section>

          {/* Platform Benefits */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Platform Advantages</h2>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Our integrated approach eliminates the complexity of managing multiple service providers, 
              payment systems, and vendor relationships. Users benefit from competitive pricing through 
              our network partnerships, transparent billing practices, and consolidated expense tracking 
              that simplifies both personal and business vehicle management.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed">
              The platform's real-time notification system keeps users informed about service requirements, 
              regulatory deadlines, and available opportunities for cost savings. Secure payment processing 
              and data protection ensure all transactions and personal information remain safe and confidential.
            </p>
          </section>

          {/* Call to Action */}
          <section className="text-center py-16 bg-gray-50 rounded-2xl">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              Ready to Simplify Your Vehicle Management?
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of users who have streamlined their vehicle services with our comprehensive platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3">
                Download Mobile App
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-3">
                Contact Support
              </Button>
            </div>
          </section>
          
        </div>
      </article>

      <Footer />
    </div>
  );
};

export default ComprehensiveServices;