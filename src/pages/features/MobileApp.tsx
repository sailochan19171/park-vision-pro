import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const MobileApp = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
            <span className="text-gray-900">Mobile Application Suite</span>
          </nav>
        </div>
      </section>

      {/* Article Header */}
      <article className="py-12 bg-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-4xl">
          
          {/* Hero Section */}
          <header className="mb-16 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-8 leading-tight">
              Complete Mobile Parking Experience
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed max-w-3xl mx-auto">
              Transform your parking experience with our comprehensive mobile application featuring 
              smart discovery, booking, payments, and seamless integration with parking infrastructure.
            </p>
          </header>

          {/* Introduction */}
          <section className="prose prose-lg max-w-none mb-16">
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              The modern parking experience has evolved far beyond simply finding a space. Today's drivers demand 
              intelligent solutions that anticipate their needs, streamline the entire process, and integrate 
              seamlessly with their digital lifestyle. Our comprehensive mobile application represents the 
              pinnacle of parking technology innovation.
            </p>
            
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              From initial space discovery to final payment completion, every aspect of the parking journey has 
              been carefully designed and optimized. The result is an intuitive platform that reduces parking 
              time by up to 30 minutes per session while providing unprecedented convenience and control.
            </p>
          </section>

          {/* Core Capabilities */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Core Application Capabilities</h2>
            
            <div className="space-y-12">
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Intelligent Parking Discovery</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  AI-powered parking spot discovery engine that analyzes real-time availability, user preferences, 
                  and traffic patterns to recommend optimal parking locations. The system learns from your habits 
                  to provide increasingly personalized suggestions over time.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Advanced filtering options allow users to search by distance, price, security features, and 
                  accessibility requirements, ensuring every recommendation meets specific needs and preferences.
                </p>
              </div>
              
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Advanced Booking System</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  Reserve parking spaces in advance with flexible timing options and easy cancellation policies. 
                  The booking system supports recurring reservations for regular commuters and event-based bookings 
                  for special occasions.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Automated reminders and real-time updates keep users informed about upcoming reservations, 
                  parking duration limits, and available extensions, eliminating the stress of time management.
                </p>
              </div>
              
              <div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Integrated Payment Gateway</h3>
                <p className="text-lg text-gray-700 leading-relaxed mb-4">
                  Comprehensive payment solution supporting multiple methods including credit cards, digital wallets, 
                  UPI, and cryptocurrency. The system processes transactions instantly and provides immediate 
                  confirmation with digital receipts.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Automated payment features handle recurring fees and extensions seamlessly, while intelligent 
                  spending analytics help users track and optimize their parking expenses over time.
                </p>
              </div>
            </div>
          </section>

          {/* User Experience Features */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Enhanced User Experience</h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Intuitive Interface Design</h3>
                <p className="text-gray-700 leading-relaxed">
                  Clean, intuitive interface designed for users of all technical skill levels. Large, accessible 
                  buttons and clear navigation ensure effortless interaction even while driving or in stressful 
                  parking situations.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Real-Time Updates</h3>
                <p className="text-gray-700 leading-relaxed">
                  Live parking availability updates and instant booking confirmations eliminate uncertainty. 
                  Push notifications provide timely alerts about reservation confirmations, approaching time 
                  limits, and special offers.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Smart Navigation</h3>
                <p className="text-gray-700 leading-relaxed">
                  Integrated GPS navigation with turn-by-turn directions to reserved parking spaces. Indoor 
                  mapping helps users locate specific spots within large parking facilities quickly and efficiently.
                </p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Cross-Platform Compatibility</h3>
                <p className="text-gray-700 leading-relaxed">
                  Available on iOS, Android, and web platforms with synchronized data across all devices. 
                  Users can start a booking on their phone and complete it on their computer seamlessly.
                </p>
              </div>
            </div>
          </section>

          {/* Integration and Technology */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Technology Integration</h2>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              The mobile application integrates seamlessly with existing parking infrastructure through QR code 
              scanning, Bluetooth connectivity, and RFID technology. This multi-modal approach ensures 
              compatibility with various parking systems while maintaining consistent user experience.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed">
              Cloud-based architecture ensures reliable performance and real-time data synchronization across 
              all connected devices and parking facilities. Advanced security measures protect user data and 
              payment information while maintaining fast, responsive performance.
            </p>
          </section>

          {/* Call to Action */}
          <section className="text-center py-16 bg-gray-50 rounded-2xl">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              Ready to Transform Your Parking Experience?
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of users who have made parking hassle-free with our comprehensive mobile application.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3">
                Download for iOS
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-3">
                Download for Android
              </Button>
            </div>
          </section>
          
        </div>
      </article>

      <Footer />
    </div>
  );
};

export default MobileApp;