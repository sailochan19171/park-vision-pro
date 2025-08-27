import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "../hooks/use-toast";
import { 
  Shield, 
  Clock, 
  Users, 
  Headphones, 
  Settings, 
  Monitor, 
  BookOpen, 
  Play,
  Globe,
  MapPin,
  Phone,
  Mail,
  CheckCircle
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import serviceHero from "@/assets/vay-parking-sign.png";
import reliabilityService from "@/assets/vay-reliability-service.png";
import customerSupport from "@/assets/vay-support-service.png";
import trustSustainability from "@/assets/biometric-access-control.jpg";
import trainingSession from "@/assets/visitor-management.jpg";

interface Location {
  city: string;
  country: string;
  phone: string;
  email: string;
}

const Services = () => {
  const { toast } = useToast();

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleEnrollment = (programTitle: string) => {
    // Navigate to contact section with pre-filled enrollment message
    const contactElement = document.querySelector('#contact');
    if (contactElement) {
      const headerHeight = 80;
      const elementPosition = contactElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      
      // Pre-fill enrollment message
      setTimeout(() => {
        const messageTextarea = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
        if (messageTextarea) {
          messageTextarea.value = `Hi! I would like to enroll in the "${programTitle}" training program. Please provide me with details about:
- Available training dates
- Pricing information
- Prerequisites (if any)
- Training materials included
- Certification process

I'm interested in learning more about the enrollment process and next steps.`;
          messageTextarea.focus();
        }
      }, 1000);
    } else {
      // Fallback - redirect to contact page
      window.location.href = '/#contact';
    }
    
    toast({
      title: "Enrollment Request Initiated",
      description: `Redirecting you to complete enrollment for "${programTitle}". Our team will contact you within 24 hours.`,
      duration: 5000,
    });
  };

  const handleContactOffice = (location: Location) => {
    // Open phone dialer
    window.location.href = `tel:${location.phone}`;
    
    toast({
      title: "Calling Office",
      description: `Connecting you to our ${location.city} office at ${location.phone}`,
      duration: 3000,
    });
  };

  const serviceFeatures = [
    {
      icon: Shield,
      title: "24/7 System Monitoring",
      description: "24/7 monitoring and proactive maintenance"
    },
    {
      icon: Headphones,
      title: "Expert Technical Support",
      description: "Expert support with rapid response times"
    },
    {
      icon: Settings,
      title: "Preventive Maintenance",
      description: "Regular maintenance to prevent operational issues"
    },
    {
      icon: Users,
      title: "Training & Development",
      description: "Training programs to maximize system use"
    }
  ];

  const trainingPrograms = [
    {
      title: "System Administration",
      description: "Complete training on system configuration and daily operations",
      duration: "2 days",
      format: "On-site/Virtual"
    },
    {
      title: "Advanced Features",
      description: "Deep dive into advanced features and customization options",
      duration: "1 day",
      format: "Virtual/Classroom"
    },
    {
      title: "Troubleshooting",
      description: "Hands-on troubleshooting techniques and problem resolution",
      duration: "1 day",
      format: "On-site"
    }
  ];

  const globalLocations = [
    { city: "Mumbai", country: "India", phone: "+91 720 724 4344", email: "mumbai@parkvisionpro.com" },
    { city: "Delhi", country: "India", phone: "+91 720 724 4345", email: "delhi@parkvisionpro.com" },
    { city: "Bangalore", country: "India", phone: "+91 720 724 4346", email: "bangalore@parkvisionpro.com" },
    { city: "Chennai", country: "India", phone: "+91 720 724 4347", email: "chennai@parkvisionpro.com" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="pb-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/90 to-blue-700/90 z-10"></div>
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${serviceHero})` }}
        ></div>
        <div className="relative z-20 container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl py-24 text-center text-white">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-6xl md:text-8xl font-bold mb-8">
              <span className="text-yellow-400">let's</span>
              <br />
              <span className="text-white font-light">welcome</span>
              <br />
              <span className="text-yellow-400 text-5xl md:text-6xl">expert services</span>
            </h1>
          </div>
        </div>
      </section>

      {/* Expert Services Introduction */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-8">
              VayAccess <span className="font-light">Expert Services</span>
            </h2>
            <p className="text-xl md:text-2xl text-gray-700 leading-relaxed">
              Expert parking solutions with comprehensive support and maintenance services.
            </p>
          </div>
        </div>
      </section>

      {/* Reliability Through Service Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="w-full lg:w-1/2">
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                Reliability through optimal service
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Expert support to keep your parking systems running smoothly.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {serviceFeatures.map((feature, index) => {
                  const IconComponent = feature.icon;
                  return (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-tech-blue rounded-lg flex items-center justify-center mt-1">
                        <IconComponent className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
                        <p className="text-sm text-gray-600">{feature.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="w-full lg:w-1/2">
              <div className="relative overflow-hidden rounded-2xl shadow-2xl transform perspective-1000">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent z-20 rounded-2xl"></div>
                <img
                  src={reliabilityService}
                  alt="Reliability through optimal service"
                  className="w-full h-[400px] object-cover hover:scale-105 transition-transform duration-500 rounded-2xl"
                  style={{
                    filter: 'brightness(1.02) contrast(1.05) saturate(1.05)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/20 to-transparent h-1/4 rounded-2xl"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Always Right Service Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl">
          <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
            <div className="w-full lg:w-1/2">
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                Always the right service at the right time
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                As a VayAccess customer, you get access to our Expert 
                Services, which are perfectly tailored to your needs. From 
                preventive to proactive and predictive maintenance 
                concepts, you decide which service offering meets your 
                needs. And whenever you need us, there is always a local 
                service partner nearby.
              </p>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-tech-blue" />
                  <span className="text-gray-700">24/7 remote monitoring and support</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-tech-blue" />
                  <span className="text-gray-700">Predictive maintenance algorithms</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-tech-blue" />
                  <span className="text-gray-700">Local service partners nationwide</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-tech-blue" />
                  <span className="text-gray-700">Customized service level agreements</span>
                </div>
              </div>
            </div>
            
            <div className="w-full lg:w-1/2">
              <div className="relative overflow-hidden rounded-2xl shadow-2xl transform perspective-1000">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent z-10 rounded-2xl"></div>
                <img
                  src={customerSupport}
                  alt="Customer Support Representative"
                  className="w-full h-[400px] object-cover hover:scale-105 transition-transform duration-500 rounded-2xl"
                  style={{
                    filter: 'brightness(1.02) contrast(1.05) saturate(1.05)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/30 to-transparent h-1/3 rounded-2xl"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust and Sustainability Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="w-full lg:w-1/2">
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                Focus on trust, transparency and sustainability
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                We help you be productive and generate added value from 
                day one. This builds the foundation for a successful long-term partnership.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-tech-blue rounded-full flex items-center justify-center mx-auto mb-4">
                    <Shield className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Trust</h3>
                  <p className="text-sm text-gray-600">Reliable partnerships built on transparency</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-tech-blue rounded-full flex items-center justify-center mx-auto mb-4">
                    <Monitor className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Transparency</h3>
                  <p className="text-sm text-gray-600">Clear communication and reporting</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-tech-blue rounded-full flex items-center justify-center mx-auto mb-4">
                    <Globe className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Sustainability</h3>
                  <p className="text-sm text-gray-600">Long-term solutions for lasting success</p>
                </div>
              </div>
            </div>
            
            <div className="w-full lg:w-1/2">
              <div className="relative overflow-hidden rounded-2xl shadow-2xl transform perspective-1000">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent z-10 rounded-2xl"></div>
                <img
                  src={trustSustainability}
                  alt="Trust and Sustainability"
                  className="w-full h-[400px] object-cover hover:scale-105 transition-transform duration-500 rounded-2xl"
                  style={{
                    filter: 'brightness(1.02) contrast(1.05) saturate(1.05)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/30 to-transparent h-1/3 rounded-2xl"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cloud Hosting Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Carefree Operation of your Software Solutions – 
              <br />hosted by VayAccess Solutions
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed max-w-4xl mx-auto mb-12">
              Our Hosted Services team ensures that your VayAccess systems are always up-to-date and available. Our professional 
              IT infrastructure is at your service 24/7, enabling you to reduce your operating costs while increasing efficiency and 
              operational reliability - without any intervention on your part. VayAccess is certified according to ISO 27001. This 
              internacional standard assesses the effectiveness of the internal control system of service organizations. VayAccess
              maintains this certification since 2024.
            </p>
            <Button className="bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90 px-4 py-2 text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-300">
              Learn About Cloud Services
            </Button>
          </div>
        </div>
      </section>

      {/* Training Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl text-center">
          <div className="max-w-4xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              VayAccess <span className="font-light">Trainings and Video Tutorials</span>
            </h2>
            <h3 className="text-2xl text-tech-blue font-semibold mb-6">
              The Power of Knowledge Transfer in Training Sessions
            </h3>
            <p className="text-lg text-gray-600 leading-relaxed mb-12">
              The better you know your VayAccess system, the more you can get out of it. That's why we share our know-how with you in dedicated training 
              sessions. In our in-house training rooms, directly on-site or via our comprehensive online training and video tutorial platform, our training 
              team will provide the optimal education to enhance your VayAccess knowledge. Check out our training programs and ask our sales team about 
              individual training options.
            </p>
          </div>

          {/* Video Hero Section */}
          <div className="relative mb-16">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl transform perspective-1000">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent z-20 rounded-2xl"></div>
              <div 
                className="h-[400px] bg-cover bg-center rounded-2xl relative overflow-hidden"
                style={{ 
                  backgroundImage: `url(${trainingSession})`,
                  filter: 'brightness(1.1) contrast(1.1) saturate(1.1)',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-900/70 to-cyan-900/70 flex items-center justify-center z-10 rounded-2xl">
                  <div className="text-center text-white">
                    <span className="text-yellow-400 text-4xl md:text-6xl font-bold">let's</span>
                    <br />
                    <span className="text-white text-3xl md:text-5xl font-light">welcome</span>
                    <br />
                    <span className="text-yellow-400 text-2xl md:text-3xl">Skills.Care the new training portal!</span>
                    <div className="mt-6">
                      <Button className="bg-yellow-400 text-gray-900 hover:bg-yellow-500 rounded-full w-12 h-12 shadow-lg hover:shadow-xl transition-all duration-300">
                        <Play className="h-6 w-6" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Training Programs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {trainingPrograms.map((program, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="w-12 h-12 bg-tech-blue rounded-lg flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{program.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription className="text-base">
                    {program.description}
                  </CardDescription>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span><Clock className="h-4 w-4 inline mr-1" />{program.duration}</span>
                    <span><Monitor className="h-4 w-4 inline mr-1" />{program.format}</span>
                  </div>
                  <Button 
                    className="w-full mt-4 text-sm py-2 font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-300" 
                    variant="outline"
                    onClick={() => handleEnrollment(program.title)}
                  >
                    Enroll Now
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Worldwide Service Teams */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl text-center">
          <div className="max-w-4xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              VayAccess Solutions <span className="font-light">Worldwide Service Teams</span>
            </h2>
            <h3 className="text-2xl text-tech-blue font-semibold mb-6">
              VayAccess is where you are
            </h3>
            <p className="text-lg text-gray-600 leading-relaxed mb-12">
              The combination of international experience, regional presence and technical know-how enables us to provide the 
              best possible service and maximum availability around the world.
            </p>
            <p className="text-xl font-semibold text-gray-900 mb-12">
              This means, wherever you are we are there too.
            </p>
            <Button className="bg-yellow-400 text-gray-900 hover:bg-yellow-500 mb-16 px-4 py-2 text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-300">
              Contact Us
            </Button>
          </div>

          {/* World Map Placeholder */}
          <div className="relative mb-16">
            <div className="h-[400px] bg-gradient-to-br from-yellow-200 to-yellow-400 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Globe className="h-32 w-32 text-yellow-600 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-gray-800">Global Presence</h3>
                <p className="text-gray-700">Service centers across major cities</p>
              </div>
            </div>
          </div>

          {/* Service Locations */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {globalLocations.map((location, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader className="text-center">
                  <div className="w-12 h-12 bg-tech-blue rounded-full flex items-center justify-center mx-auto mb-4">
                    <MapPin className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-lg">{location.city}</CardTitle>
                  <CardDescription>{location.country}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-center">
                  <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{location.phone}</span>
                  </div>
                  <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span className="break-all">{location.email}</span>
                  </div>
                  <Button 
                    className="w-full mt-4 text-sm py-2 font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-300" 
                    size="sm"
                    onClick={() => handleContactOffice(location)}
                  >
                    Contact Office
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-cyan-600 to-blue-600">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold text-white mb-6">
              Ready to Experience Expert Service?
            </h2>
            <p className="text-xl text-white/90 mb-8">
              Let our expert service team help you maximize your VayAccess investment 
              with tailored support solutions and comprehensive training programs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="secondary" className="bg-white text-cyan-600 hover:bg-gray-100 px-4 py-2 text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-300">
                Contact Service Team
              </Button>
              <Button variant="outline" className="border-white text-white hover:bg-white hover:text-cyan-600 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300">
                Schedule Consultation
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Services;