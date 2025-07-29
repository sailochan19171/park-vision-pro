import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Target, 
  Eye, 
  Award, 
  Users,
  ArrowRight,
  CheckCircle,
  Globe,
  Shield,
  Zap
} from "lucide-react";
import parkingGarage from "@/assets/parking-garage.jpg";

const About = () => {
  const values = [
    {
      icon: <Target className="h-6 w-6" />,
      title: "Innovation",
      description: "Continuously developing cutting-edge technologies to transform parking experiences"
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: "Security",
      description: "Ensuring the highest levels of security and reliability in all our solutions"
    },
    {
      icon: <Users className="h-6 w-6" />,
      title: "Customer Focus",
      description: "Putting our customers' needs first and delivering exceptional service"
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "Efficiency",
      description: "Optimizing operations and maximizing efficiency through smart technology"
    }
  ];

  const achievements = [
    { number: "500+", label: "Successful Projects" },
    { number: "50+", label: "Cities Covered" },
    { number: "15+", label: "Years Experience" },
    { number: "99.9%", label: "System Uptime" }
  ];

  const certifications = [
    "ISO 9001:2015 Certified",
    "CE Marking Compliance", 
    "FCC Certified Products",
    "IP65 Weather Protection",
    "EMC Compliance",
    "RoHS Compliant"
  ];

  return (
    <section id="about" className="py-20 bg-tech-gray-light">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-warning-orange/10 text-warning-orange border-warning-orange/20">
            About Us
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Leading the Future of Parking
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            With over 15 years of expertise in parking solutions, we specialize in innovative technologies 
            like solar studs and LED lights, committed to becoming a leading supplier in smart infrastructure management.
          </p>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
          {/* Content */}
          <div className="space-y-8">
            <div>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
                Your One-Stop Solution for Smart Parking, Access Control, and Traffic Management
              </h3>
              
              <div className="space-y-4 mb-8">
                <p className="text-muted-foreground">
                  ParkVision Pro is committed to revolutionizing parking infrastructure through 
                  innovative technology solutions. We specialize in comprehensive parking management 
                  systems that enhance efficiency and reliability in modern infrastructure.
                </p>
                <p className="text-muted-foreground">
                  Our expertise spans across smart turnstiles, RFID systems, automatic gates, 
                  and advanced tools for parking space management, all designed to make spaces 
                  safer, smarter, and more convenient for everyone.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {certifications.map((cert, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-success-green" />
                    <span className="text-sm text-foreground">{cert}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mission & Vision */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="border-0 bg-background">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-12 h-12 bg-tech-blue/10 rounded-lg flex items-center justify-center">
                      <Target className="h-6 w-6 text-tech-blue" />
                    </div>
                    <h4 className="font-bold text-foreground">Our Mission</h4>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    To transform parking infrastructure worldwide through innovative, 
                    secure, and user-friendly technology solutions.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 bg-background">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-12 h-12 bg-success-green/10 rounded-lg flex items-center justify-center">
                      <Eye className="h-6 w-6 text-success-green" />
                    </div>
                    <h4 className="font-bold text-foreground">Our Vision</h4>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    To be the global leader in smart parking solutions, 
                    creating seamless experiences for billions of users.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Image */}
          <div className="relative">
            <img
              src={parkingGarage}
              alt="Modern Parking Garage"
              className="w-full rounded-2xl shadow-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-tech-blue/20 to-transparent rounded-2xl"></div>
            
            {/* Floating Achievement Card */}
            <div className="absolute -bottom-6 -left-6 bg-background p-6 rounded-xl shadow-xl border">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-success-green/10 rounded-lg flex items-center justify-center">
                  <Award className="h-6 w-6 text-success-green" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">15+</div>
                  <div className="text-sm text-muted-foreground">Years Excellence</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Achievements */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {achievements.map((achievement, index) => (
            <div key={index} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-tech-blue mb-2">
                {achievement.number}
              </div>
              <div className="text-muted-foreground">{achievement.label}</div>
            </div>
          ))}
        </div>

        {/* Values */}
        <div className="space-y-8">
          <div className="text-center">
            <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              Our Core Values
            </h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The principles that guide everything we do and drive our commitment 
              to excellence in parking solutions.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <Card key={index} className="group hover:shadow-lg transition-all duration-300 border-0 bg-background">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 bg-tech-blue/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-tech-blue group-hover:scale-110 transition-transform duration-300">
                    {value.icon}
                  </div>
                  <h4 className="font-bold text-foreground mb-3">{value.title}</h4>
                  <p className="text-muted-foreground text-sm">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <div className="inline-flex items-center space-x-2 bg-tech-blue/10 text-tech-blue px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Globe className="h-4 w-4" />
            <span>Global Presence</span>
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-4">
            Ready to Transform Your Parking Infrastructure?
          </h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Join hundreds of satisfied customers who have revolutionized their parking operations with our solutions.
          </p>
          <Button size="lg" className="bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90">
            Start Your Project
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default About;