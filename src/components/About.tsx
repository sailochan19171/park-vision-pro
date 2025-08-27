import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";

import parkingGarage from "../assets/parking-garage.jpg";
import pic6 from "../assets/PIC_6-removebg-preview.png";
import missionImage from "../assets/innovation-mission.jpg";
import smartParkingGuidance from "../assets/smart-parking-guidance.jpg";
import qtq20 from "../assets/qtq20.jpg";

const About = () => {
  const { toast } = useToast();

  const handleStartProject = () => {
    // Scroll to contact section with proper header offset
    const contactElement = document.querySelector('#contact');
    if (contactElement) {
      const headerHeight = 80;
      const elementPosition = contactElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      
      // Pre-fill the message field with project inquiry
      setTimeout(() => {
        const messageTextarea = document.querySelector('textarea[name="message"]');
        if (messageTextarea) {
          const textareaElement = messageTextarea as HTMLTextAreaElement;
          textareaElement.value = "Hi! I'm interested in starting a parking solution project. Please contact me to discuss my requirements and get a comprehensive proposal.";
          textareaElement.focus();
        }
      }, 1000);
    }
    
    toast({
      title: "Redirecting to Contact Form",
      description: "Please fill out the form below to start your project inquiry.",
    });
  };

  const values = [
    {
      title: "Innovation",
      description: "Advanced parking technology solutions",
    },
    {
      title: "Security",
      description: "Reliable and secure access control",
    },
    {
      title: "Efficiency",
      description: "Streamlined parking operations",
    },
    {
      title: "Sustainability",
      description: "Eco-friendly smart infrastructure",
    },
  ];

  return (
    <section id="about" className="py-18 bg-white scroll-mt-20 relative overflow-x-hidden">
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative w-full">
        {/* Section Header */}
        <div className="text-center mb-14" data-aos="fade-up">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            About VayAccess Solutions
          </h2>
          <p className="text-sm text-gray-700 max-w-3xl mx-auto leading-relaxed" data-aos="fade-up" data-aos-delay="100">
            Building tomorrow's infrastructure with advanced parking technology and proven reliability for modern smart city solutions.
          </p>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-10 items-start mb-12">
          {/* Content */}
          <div className="space-y-6" data-aos="fade-right" data-aos-delay="200">
            <h3 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight">
              Engineering Tomorrow's Infrastructure
            </h3>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-700 leading-relaxed">
                VayAccess Solutions specializes in advanced barrier gates, turnstiles, and access control systems for modern parking facilities. We serve diverse industries including corporate offices, shopping centers, residential complexes, airports, hospitals, and educational institutions.
              </p>
              
              <p className="text-sm text-gray-700 leading-relaxed">
                Our comprehensive solutions include automatic barrier gates, flap barrier turnstiles, tripod turnstiles, pedestrian swing gates, parking management kiosks, and intelligent guidance systems. Each product is designed with cutting-edge technology to ensure maximum security, efficiency, and user satisfaction.
              </p>

              <p className="text-sm text-gray-700 leading-relaxed">
                From consultation and design to installation and ongoing support, we provide end-to-end parking solutions tailored to your specific requirements. Our 24/7 technical support ensures your systems operate smoothly with minimal downtime.
              </p>
            </div>
          </div>

          {/* Image - Circular, aligned with Mission styling */}
          <div className="relative mt-0 lg:mt-8" data-aos="fade-left" data-aos-delay="300">
            <div className="w-64 h-64 sm:w-72 sm:h-72 lg:w-80 lg:h-80 mx-auto rounded-full overflow-hidden shadow-2xl ring-4 ring-white/80 border border-gray-200/60">
              <img
                src={parkingGarage}
                alt="Engineering Tomorrow's Smart Parking Infrastructure"
                className="w-full h-full object-cover"
                loading="lazy"
                style={{ 
                  filter: 'brightness(1.03) contrast(1.08) saturate(1.05)'
                }}
              />
            </div>
          </div>
        </div>

        {/* Our Vision */}
        <div className="mb-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Vision Image - Circular to match Mission styling */}
            <div className="relative flex justify-center items-center lg:mt-10">
              <div className="w-64 h-64 sm:w-72 sm:h-72 lg:w-80 lg:h-80 rounded-full overflow-hidden shadow-2xl ring-4 ring-white/80 border border-gray-200/60">
                <img
                  src={qtq20}
                  alt="Building Tomorrow's Infrastructure"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  style={{ 
                    filter: 'brightness(1.03) contrast(1.08) saturate(1.05)'
                  }}
                />
              </div>
            </div>
            
            {/* Vision Content */}
            <div className="space-y-6">
              <div>
                {/* <Badge className="mb-4 bg-blue-100 text-blue-800 border-blue-200">
                  Our Vision
                </Badge> */}
                <h3 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 leading-tight">
                  Building Tomorrow's Infrastructure
                </h3>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-gray-700 leading-relaxed">
                  To be the global leader in smart parking solutions, creating seamless experiences 
                  for billions of users worldwide. We envision a future where parking is no longer 
                  a hassle but a smooth, intelligent process.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Our vision extends beyond traditional parking management to encompass comprehensive 
                  smart city infrastructure, integrating IoT sensors, AI-powered analytics, and 
                  sustainable technologies to create parking ecosystems that are efficient, 
                  environmentally friendly, and user-centric.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  We aim to eliminate parking stress, reduce traffic congestion, and contribute to 
                  cleaner, more organized urban environments through innovative technology solutions 
                  that adapt to the evolving needs of modern cities.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Our Mission */}
        <div className="mb-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Mission Content */}
            <div className="space-y-6 lg:order-1">
              <div>
                {/* <Badge className="mb-4 bg-green-100 text-green-800 border-green-200">
                  Our Mission
                </Badge> */}
                <h3 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 leading-tight">
                  Transforming Parking Through Innovation
                </h3>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-gray-700 leading-relaxed">
                  To transform parking infrastructure worldwide through innovative, secure, and 
                  user-friendly technology solutions that make urban mobility more efficient and 
                  sustainable for everyone.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  We are committed to developing cutting-edge parking management systems that integrate 
                  seamlessly with existing infrastructure while providing scalable solutions for 
                  businesses, municipalities, and individuals.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Our mission involves continuous research and development in solar technology, 
                  LED lighting systems, RFID integration, and smart access control to deliver 
                  comprehensive parking solutions that are both technologically advanced and 
                  environmentally responsible.
                </p>
              </div>

              <div className="pt-4">
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                    <div className="text-gray-900 font-bold">Innovation-Driven Solutions</div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                    <div className="text-gray-900 font-bold">Customer-Centric Approach</div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                    <div className="text-gray-900 font-bold">Sustainable Technology</div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Mission Image - Circular, no white card */}
            <div className="relative lg:order-2 flex justify-center items-center lg:mt-10">
              <div className="w-64 h-64 sm:w-72 sm:h-72 lg:w-80 lg:h-80 rounded-full overflow-hidden shadow-2xl ring-4 ring-white/80 border border-gray-200/60">
                <img
                  src={missionImage}
                  alt="Transforming Parking Through Innovation"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  style={{ 
                    filter: 'brightness(1.03) contrast(1.08) saturate(1.05)'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Achievements */}
        <div className="mb-12">
          <div className="text-center mb-8">
            {/* <h3 className="text-3xl font-bold text-foreground mb-4">Our Impact in Numbers</h3> */}
            {/* <p className="text-lg text-muted-foreground">Real results from real implementations</p> */}
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 text-center">
            {/* {achievements.map((achievement, index) => ( */}
              {/* <div key={index} className="bg-card p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow"> */}
                {/* <div className="text-3xl font-bold text-primary mb-1"> */}
                  {/* {achievement.number} */}
                {/* </div> */}
                {/* <div className="text-muted-foreground font-medium">{achievement.label}</div> */}
              {/* </div> */}
            {/* ))} */}
          </div>
        </div>

        {/* Core Values */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h3 className="text-3xl font-bold text-foreground mb-3">
              {/* What Drives Our Excellence */}
            </h3>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-3">
              {/* The fundamental principles that shape our approach to parking solutions */}
            </p>
            
            <p className="text-sm text-muted-foreground max-w-4xl mx-auto">
              {/* Our core values drive every aspect of our business, from product development and customer service 
              to installation and ongoing support. These principles ensure that every solution we deliver not 
              only meets but exceeds our clients' expectations while contributing to more efficient, secure, 
              and sustainable parking infrastructure worldwide. */}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <div key={index} className="text-center bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <h4 className="text-lg font-bold text-gray-900 mb-3">
                  {value.title}
                </h4>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <div className="mb-6">
            {/* <span className="text-primary font-semibold text-lg">Global Presence</span> */}
          </div>
          <h3 className="text-3xl font-bold text-foreground mb-6">
            {/* Ready to Transform Your Parking Infrastructure? */}
          </h3>
          <p className="text-lg text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
            {/* Join hundreds of satisfied customers who have revolutionized their parking operations with our solutions. */}
          </p>
          {/* <Button 
            onClick={handleStartProject}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90 px-4 py-2 text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-300"
          >
            Start Your Project
          </Button> */}
        </div>
      </div>
    </section>
  );
};

export default About;