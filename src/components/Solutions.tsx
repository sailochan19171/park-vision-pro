import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { ArrowRight, Car, Receipt, Camera, Navigation, Info, Users, Scan } from "lucide-react";

const Solutions = () => {
  const navigate = useNavigate();

  const handleViewAllSolutions = () => {
    navigate('/solutions');
  };

  const solutions = [
    {
      icon: Car,
      title: "Hybrid ANPR/FASTAG System",
      description: "Combined automatic number plate recognition with FASTAG integration for seamless vehicle access"
    },
    {
      icon: Navigation,
      title: "Ticketless Parking Management System", 
      description: "Modern ticketless parking solution with mobile app integration and digital payments"
    },
    {
      icon: Receipt,
      title: "Ticket Based Parking Management System",
      description: "Traditional ticket-based parking system with automated dispensing and validation"
    },
    {
      icon: Camera,
      title: "ANPR Based Vehicle Access Control",
      description: "Advanced camera-based vehicle recognition system for automated access control"
    },
    {
      icon: Navigation,
      title: "Parking Guidance System",
      description: "Smart guidance system with real-time space availability and directional indicators"
    },
    {
      icon: Info,
      title: "Parking Information System", 
      description: "Digital information displays showing parking availability, pricing, and facility information"
    },
    {
      icon: Users,
      title: "Pedestrian Access Control System",
      description: "Comprehensive pedestrian access management with turnstiles and biometric authentication"
    },
    {
      icon: Scan,
      title: "ANPR Camera System For Toll Applications",
      description: "High-accuracy camera systems designed specifically for toll plaza applications"
    }
  ];

  return (
    <section id="solutions" className="py-12 md:py-16 lg:py-20 bg-gradient-to-b from-white to-gray-50 scroll-mt-20">
      <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl">
        
        {/* Section Header */}
        <div className="text-center mb-10" data-aos="fade-up">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 font-poppins">
            Building Tomorrow's Solutions
          </h2>
          <p className="text-sm text-gray-600 max-w-4xl mx-auto leading-relaxed font-poppins font-normal" data-aos="fade-up" data-aos-delay="100">
            Comprehensive parking management and access control solutions designed to build tomorrow's infrastructure and smart cities.
          </p>
        </div>

        {/* Solutions Grid with Mobile Mockup */}
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          
          {/* Solutions Grid */}
          <div className="lg:col-span-8" data-aos="fade-right" data-aos-delay="200">
            <div className="grid md:grid-cols-2 gap-8">
              {solutions.map((solution, index) => {
                const IconComponent = solution.icon;
                return (
                  <div
                    key={index}
                    className={`p-6 rounded-xl border transition-all duration-300 hover:shadow-lg image-container ${
                      solution.featured 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}
                    data-aos="zoom-in"
                    data-aos-delay={300 + index * 100}
                  >
                    <div className="mb-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
                        solution.featured ? 'bg-white/20' : 'bg-blue-50'
                      }`}>
                        <IconComponent className={`h-6 w-6 ${
                          solution.featured ? 'text-white' : 'text-blue-600'
                        }`} />
                      </div>
                      <h3 className={`text-lg font-bold mb-2 font-poppins ${
                        solution.featured ? 'text-white' : 'text-gray-900'
                      }`}>
                        {solution.title}
                      </h3>
                      <p className={`text-sm leading-relaxed font-poppins font-normal ${
                        solution.featured ? 'text-blue-100' : 'text-gray-600'
                      }`}>
                        {solution.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile App Mockup */}
          <div className="lg:col-span-4" data-aos="fade-left" data-aos-delay="400">
            <div className="lg:sticky lg:top-96">
              <div className="relative mx-auto w-fit">
                {/* Mobile Phone Frame - Front-facing design */}
                <div className="relative">
                  <div className="w-72 h-[580px] bg-black rounded-[2.5rem] shadow-xl p-2 mx-auto">
                    <div className="w-full h-full bg-white rounded-[2rem] overflow-hidden relative">
                      {/* Home Indicator */}
                      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-black rounded-full"></div>
                      
                      {/* Mock Mobile App Interface */}
                      <div className="h-full bg-gradient-to-b from-blue-50 to-blue-100 p-4 relative">
                        {/* Status Bar */}
                        <div className="flex justify-between items-center text-xs text-gray-800 mb-4 px-2">
                          <span className="font-semibold">9:41</span>
                          <div className="flex items-center space-x-1">
                            <div className="flex space-x-1">
                              <div className="w-1 h-1 bg-gray-800 rounded-full"></div>
                              <div className="w-1 h-1 bg-gray-800 rounded-full"></div>
                              <div className="w-1 h-1 bg-gray-800 rounded-full"></div>
                            </div>
                            <div className="w-6 h-3 border border-gray-800 rounded-sm">
                              <div className="w-4 h-2 bg-green-500 rounded-sm m-0.5"></div>
                            </div>
                          </div>
                        </div>
                        
                        {/* App Header */}
                        <div className="text-center mb-6">
                          <h4 className="text-lg font-bold text-blue-600 mb-1 font-poppins">VayAccess</h4>
                          <p className="text-xs text-gray-600 font-poppins">Smart Parking Solutions</p>
                        </div>

                        {/* Mock App Content */}
                        <div className="space-y-3">
                          <div className="bg-white rounded-lg p-3 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-gray-800">Available Spaces</span>
                              <span className="text-sm font-bold text-green-600">247</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div className="bg-green-500 h-1.5 rounded-full w-3/4"></div>
                            </div>
                          </div>

                          <div className="bg-white rounded-lg p-3 shadow-sm">
                            <h5 className="text-xs font-medium text-gray-800 mb-2">Quick Actions</h5>
                            <div className="grid grid-cols-2 gap-2">
                              <button className="bg-blue-100 text-blue-600 p-2 rounded-lg text-xs font-medium">
                                Find Parking
                              </button>
                              <button className="bg-green-100 text-green-600 p-2 rounded-lg text-xs font-medium">
                                Pay Online
                              </button>
                            </div>
                          </div>

                          <div className="bg-white rounded-lg p-3 shadow-sm">
                            <h5 className="text-xs font-medium text-gray-800 mb-2">Recent Activity</h5>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-600">Mall Parking - A2</span>
                                <span className="text-gray-800">₹50</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-600">Office Complex - B1</span>
                                <span className="text-gray-800">₹120</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Navigation Icons */}
                        <div className="absolute bottom-4 left-4 right-4">
                          <div className="bg-white rounded-full p-2 shadow-lg">
                            <div className="flex justify-around">
                              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                                <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                              </div>
                              <div className="w-6 h-6 bg-gray-100 rounded-full"></div>
                              <div className="w-6 h-6 bg-gray-100 rounded-full"></div>
                              <div className="w-6 h-6 bg-gray-100 rounded-full"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-12 text-center" data-aos="fade-up" data-aos-delay="600">
          <Button 
            onClick={handleViewAllSolutions}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 font-medium rounded-lg transition-all duration-300 hover:shadow-lg flex items-center gap-2 mx-auto font-poppins"
          >
            View All Solutions
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

      </div>
    </section>
  );
};

export default Solutions;
