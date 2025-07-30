import Header from "../components/Header";
import Footer from "../components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { 
  Car, 
  Shield, 
  Smartphone, 
  BarChart3, 
  Camera, 
  Wifi, 
  ArrowRight, 
  CheckCircle,
  Clock,
  MapPin,
  CreditCard,
  Users,
  Zap,
  Settings,
  Phone,
  Mail
} from "lucide-react";

const SolutionsPage = () => {
  const solutions = [
    {
      id: "smart-parking",
      title: "Smart Parking Management",
      description: "Complete IoT-enabled parking solution with real-time monitoring and automated operations",
      icon: Car,
      color: "from-blue-500 to-blue-600",
      features: [
        "Real-time space detection",
        "Automated billing system",
        "Mobile app integration",
        "Analytics dashboard",
        "24/7 monitoring"
      ],
      benefits: [
        "Reduce operational costs by 40%",
        "Increase parking efficiency by 60%",
        "Improve customer satisfaction",
        "Generate detailed usage reports"
      ]
    },
    {
      id: "access-control",
      title: "Advanced Access Control",
      description: "Multi-layer security system with RFID, license plate recognition, and mobile access",
      icon: Shield,
      color: "from-green-500 to-green-600",
      features: [
        "RFID/NFC access cards",
        "License plate recognition",
        "Mobile app access",
        "Visitor management",
        "Integration with existing systems"
      ],
      benefits: [
        "Enhanced security protocols",
        "Contactless entry/exit",
        "Visitor tracking and management",
        "Audit trail and reporting"
      ]
    },
    {
      id: "payment-solutions",
      title: "Integrated Payment Solutions",
      description: "Seamless payment processing with multiple payment methods and automated billing",
      icon: CreditCard,
      color: "from-purple-500 to-purple-600",
      features: [
        "Multiple payment methods",
        "Contactless payments",
        "Subscription management",
        "Dynamic pricing",
        "Receipt generation"
      ],
      benefits: [
        "Reduced cash handling",
        "Faster transaction processing",
        "Flexible pricing models",
        "Automated revenue collection"
      ]
    },
    {
      id: "analytics",
      title: "Advanced Analytics & Reporting",
      description: "Comprehensive data analytics with predictive insights and business intelligence",
      icon: BarChart3,
      color: "from-orange-500 to-orange-600",
      features: [
        "Real-time dashboards",
        "Predictive analytics",
        "Custom reports",
        "Data visualization",
        "Performance metrics"
      ],
      benefits: [
        "Data-driven decision making",
        "Optimize parking operations",
        "Identify revenue opportunities",
        "Improve resource allocation"
      ]
    }
  ];

  const caseStudies = [
    {
      title: "Metropolitan Shopping Mall",
      description: "Implemented smart parking solution for 2000+ spaces",
      results: ["60% reduction in parking search time", "45% increase in customer satisfaction", "35% increase in revenue"],
      image: "/parking-garage.jpg"
    },
    {
      title: "Corporate Office Complex",
      description: "Deployed access control and analytics for 500 employees",
      results: ["90% reduction in unauthorized access", "50% faster entry/exit", "25% improvement in space utilization"],
      image: "/parking-terminal.jpg"
    }
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-20">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-background via-background to-muted py-20">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-4xl mx-auto">
              <Badge variant="outline" className="mb-6 text-tech-blue border-tech-blue">
                Complete Parking Solutions
              </Badge>
              <h1 className="text-5xl font-bold text-foreground mb-6">
                Revolutionize Your Parking
                <span className="bg-gradient-to-r from-tech-blue to-tech-blue-light bg-clip-text text-transparent block">
                  Management System
                </span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Transform your parking facility with our comprehensive suite of intelligent solutions designed to maximize efficiency, enhance security, and boost revenue.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" className="bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90">
                  Get Custom Solution
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline">
                  Schedule Demo
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Solutions Tabs */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-foreground mb-4">Our Solutions</h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Comprehensive parking management solutions tailored to your specific needs
              </p>
            </div>

            <Tabs defaultValue="smart-parking" className="max-w-6xl mx-auto">
              <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 mb-12">
                {solutions.map((solution) => (
                  <TabsTrigger key={solution.id} value={solution.id} className="text-sm">
                    {solution.title.split(' ')[0]} {solution.title.split(' ')[1]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {solutions.map((solution) => (
                <TabsContent key={solution.id} value={solution.id}>
                  <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <div>
                      <div className={`inline-flex p-3 rounded-lg bg-gradient-to-r ${solution.color} mb-6`}>
                        <solution.icon className="h-8 w-8 text-white" />
                      </div>
                      <h3 className="text-3xl font-bold text-foreground mb-4">{solution.title}</h3>
                      <p className="text-lg text-muted-foreground mb-8">{solution.description}</p>
                      
                      <div className="grid md:grid-cols-2 gap-8">
                        <div>
                          <h4 className="text-lg font-semibold text-foreground mb-4">Key Features</h4>
                          <ul className="space-y-2">
                            {solution.features.map((feature, index) => (
                              <li key={index} className="flex items-center text-muted-foreground">
                                <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-foreground mb-4">Benefits</h4>
                          <ul className="space-y-2">
                            {solution.benefits.map((benefit, index) => (
                              <li key={index} className="flex items-center text-muted-foreground">
                                <ArrowRight className="h-4 w-4 text-tech-blue mr-2 flex-shrink-0" />
                                {benefit}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                    
                    <div className="lg:pl-8">
                      <Card className="p-8 bg-gradient-to-br from-background to-muted border-0 shadow-xl">
                        <div className="text-center">
                          <div className={`inline-flex p-4 rounded-full bg-gradient-to-r ${solution.color} mb-6`}>
                            <solution.icon className="h-12 w-12 text-white" />
                          </div>
                          <h4 className="text-xl font-semibold text-foreground mb-4">Ready to Get Started?</h4>
                          <p className="text-muted-foreground mb-6">
                            Contact our experts to learn how this solution can transform your parking facility.
                          </p>
                          <Button className="w-full bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90">
                            Request Consultation
                          </Button>
                        </div>
                      </Card>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>

        {/* Case Studies */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-foreground mb-4">Success Stories</h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                See how our solutions have transformed parking operations for businesses worldwide
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {caseStudies.map((study, index) => (
                <Card key={index} className="overflow-hidden hover:shadow-xl transition-shadow duration-300">
                  <div className="aspect-video bg-gradient-to-br from-tech-blue/20 to-tech-blue-light/20 flex items-center justify-center">
                    <Camera className="h-16 w-16 text-tech-blue" />
                  </div>
                  <CardContent className="p-8">
                    <h3 className="text-xl font-bold text-foreground mb-3">{study.title}</h3>
                    <p className="text-muted-foreground mb-6">{study.description}</p>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-foreground">Key Results:</h4>
                      {study.results.map((result, idx) => (
                        <div key={idx} className="flex items-center text-sm text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                          {result}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Implementation Process */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-foreground mb-4">Implementation Process</h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Our proven methodology ensures smooth deployment and optimal results
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { step: "01", title: "Assessment", description: "Site analysis and requirement gathering", icon: MapPin },
                { step: "02", title: "Design", description: "Custom solution design and planning", icon: Settings },
                { step: "03", title: "Installation", description: "Professional installation and setup", icon: Zap },
                { step: "04", title: "Support", description: "Training and ongoing support", icon: Users }
              ].map((phase, index) => (
                <Card key={index} className="text-center p-6 hover:shadow-lg transition-shadow duration-300">
                  <CardContent className="pt-6">
                    <div className="w-16 h-16 bg-gradient-to-r from-tech-blue to-tech-blue-light rounded-full flex items-center justify-center mx-auto mb-4">
                      <phase.icon className="h-8 w-8 text-white" />
                    </div>
                    <div className="text-2xl font-bold text-tech-blue mb-2">{phase.step}</div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{phase.title}</h3>
                    <p className="text-muted-foreground text-sm">{phase.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="py-20 bg-gradient-to-r from-tech-blue to-tech-blue-light">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Ready to Transform Your Parking?</h2>
            <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
              Get in touch with our experts to discuss your specific requirements and receive a customized solution proposal.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" className="bg-white text-tech-blue hover:bg-white/90">
                <Phone className="mr-2 h-5 w-5" />
                Call Now: +91 720 724 4344
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-tech-blue">
                <Mail className="mr-2 h-5 w-5" />
                Send Email
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default SolutionsPage;