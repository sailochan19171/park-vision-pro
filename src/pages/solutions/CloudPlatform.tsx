import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cloud, Shield, Zap, Globe, Server, Lock, Smartphone, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const CloudPlatform = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const keyFeatures = [
    {
      icon: Cloud,
      title: "Multi-Cloud Architecture",
      description: "Deployed on AWS, Azure, and Google Cloud with automatic failover for 99.99% uptime guarantee."
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-grade security with end-to-end encryption, SOC 2 compliance, and advanced threat protection."
    },
    {
      icon: Zap,
      title: "Auto-Scaling",
      description: "Dynamic resource allocation that scales automatically based on demand and usage patterns."
    },
    {
      icon: Globe,
      title: "Global CDN",
      description: "Content delivery network ensures fast access from anywhere in the world with minimal latency."
    },
    {
      icon: Server,
      title: "Edge Computing",
      description: "Local processing capabilities with cloud connectivity for hybrid deployment scenarios."
    },
    {
      icon: Smartphone,
      title: "Mobile-First Design",
      description: "Responsive design with native mobile apps for iOS and Android platforms."
    }
  ];

  const cloudBenefits = [
    {
      title: "Scalability",
      description: "Grow from single location to enterprise-wide deployment",
      metrics: "Scale to 1000+ locations seamlessly"
    },
    {
      title: "Cost Efficiency",
      description: "Pay-as-you-use pricing with no upfront infrastructure costs",
      metrics: "Reduce IT costs by up to 60%"
    },
    {
      title: "Reliability",
      description: "99.99% uptime with automatic backup and disaster recovery",
      metrics: "Less than 4 minutes downtime per month"
    },
    {
      title: "Performance",
      description: "Lightning-fast response times with global edge locations",
      metrics: "Sub-100ms response times globally"
    }
  ];

  const deploymentOptions = [
    {
      title: "Public Cloud",
      description: "Fully managed cloud solution with zero infrastructure management",
      features: ["No setup required", "Automatic updates", "24/7 monitoring", "Global availability"]
    },
    {
      title: "Private Cloud",
      description: "Dedicated cloud environment for enhanced security and control",
      features: ["Isolated infrastructure", "Custom configurations", "Enhanced security", "Compliance ready"]
    },
    {
      title: "Hybrid Cloud",
      description: "Best of both worlds with on-premise and cloud components",
      features: ["Local processing", "Cloud analytics", "Flexible deployment", "Cost optimization"]
    },
    {
      title: "Edge Computing",
      description: "Local processing with cloud connectivity for remote locations",
      features: ["Offline capability", "Low latency", "Bandwidth efficiency", "Local redundancy"]
    }
  ];

  const securityFeatures = [
    "256-bit AES encryption in transit and at rest",
    "Multi-factor authentication (MFA)",
    "Role-based access control (RBAC)",
    "API rate limiting and throttling",
    "Advanced threat detection and monitoring",
    "Automated security patching",
    "SOC 2 Type II compliance",
    "GDPR and data privacy compliance",
    "Regular security audits and penetration testing",
    "24/7 security operations center (SOC)"
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="pb-16 bg-gradient-to-br from-tech-blue via-tech-blue-light to-tech-green">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-white space-y-6">
              <div className="space-y-4">
                <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                  Enterprise Cloud Platform
                </Badge>
                <h1 className="text-4xl lg:text-6xl font-bold leading-tight">
                  Cloud Platform
                  <span className="block text-2xl lg:text-3xl font-normal opacity-90 mt-2">
                    Scalable & Secure Infrastructure
                  </span>
                </h1>
                <p className="text-xl opacity-90 leading-relaxed">
                  Enterprise-grade cloud platform powering smart parking solutions worldwide. 
                  Secure, scalable, and reliable infrastructure with 99.99% uptime guarantee 
                  and global edge computing capabilities.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="bg-white text-tech-blue hover:bg-white/90">
                  Start Free Trial
                </Button>
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-tech-blue">
                  Architecture Overview
                </Button>
              </div>
            </div>
            <div className="relative">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">99.99%</div>
                    <div className="text-sm opacity-80">Uptime SLA</div>
                  </div>
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">&lt;100ms</div>
                    <div className="text-sm opacity-80">Response Time</div>
                  </div>
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">24/7</div>
                    <div className="text-sm opacity-80">Monitoring</div>
                  </div>
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">Multi-Cloud</div>
                    <div className="text-sm opacity-80">Architecture</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Enterprise-Grade Features</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Built for scale, security, and performance with cutting-edge cloud technologies.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {keyFeatures.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader>
                    <div className="w-12 h-12 bg-gradient-to-br from-tech-blue to-tech-blue-light rounded-lg flex items-center justify-center mb-4">
                      <IconComponent className="h-6 w-6 text-white" />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Deployment Options */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Flexible Deployment Options</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Choose the deployment model that best fits your requirements and constraints.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {deploymentOptions.map((option, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl text-tech-blue">{option.title}</CardTitle>
                  <CardDescription className="text-base">{option.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {option.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-tech-blue rounded-full"></div>
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Cloud Advantages</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Experience the benefits of modern cloud infrastructure and architecture.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {cloudBenefits.map((benefit, index) => (
              <Card key={index} className="border-0 shadow-lg text-center p-6">
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-tech-blue">{benefit.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{benefit.description}</p>
                  <div className="bg-gradient-to-r from-tech-blue to-tech-blue-light text-white px-3 py-2 rounded-lg text-sm font-semibold">
                    {benefit.metrics}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-tech-blue to-tech-blue-light rounded-lg flex items-center justify-center">
                  <Lock className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-3xl lg:text-4xl font-bold">Enterprise Security</h2>
              </div>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Bank-grade security with comprehensive protection at every layer of the infrastructure.
              </p>
              <div className="grid grid-cols-1 gap-3">
                {securityFeatures.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-tech-blue rounded-full"></div>
                    <span className="text-foreground">{feature}</span>
                  </div>
                ))}
              </div>
              <Button size="lg" className="bg-gradient-to-r from-tech-blue to-tech-blue-light">
                Security Documentation
              </Button>
            </div>
            <div className="relative">
              <Card className="border-0 shadow-2xl">
                <CardContent className="p-8">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Security Dashboard</h3>
                      <Badge variant="secondary" className="bg-green-100 text-green-800">Secure</Badge>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm">Threat Detection</span>
                        <span className="font-bold text-green-600">Active</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm">Encryption Status</span>
                        <span className="font-bold text-tech-blue">256-bit AES</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm">Compliance</span>
                        <span className="font-bold text-orange-600">SOC 2 Type II</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm">Security Score</span>
                        <span className="font-bold text-purple-600">99.8/100</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-tech-blue to-tech-blue-light">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center">
          <div className="max-w-3xl mx-auto text-white space-y-6">
            <h2 className="text-3xl lg:text-4xl font-bold">Ready to Move to the Cloud?</h2>
            <p className="text-xl opacity-90">
              Experience the power of enterprise-grade cloud infrastructure. Start your free trial 
              today and discover how our platform can transform your parking operations.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-white text-tech-blue hover:bg-white/90">
                Start Free Trial
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-tech-blue">
                Contact Cloud Experts
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default CloudPlatform;