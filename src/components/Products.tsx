import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { 
  Settings, 
  Smartphone, 
  BarChart3, 
  Shield,
  ArrowRight,
  Star,
  Users,
  Clock,
  TrendingUp
} from "lucide-react";

const Products = () => {
  const productCategories = [
    {
      id: "hardware",
      label: "Hardware Solutions",
      icon: <Settings className="h-4 w-4" />,
      products: [
        {
          name: "ParkGate Pro X1",
          description: "Premium turnstile with advanced biometric authentication",
          features: ["Facial recognition", "RFID support", "Weather resistant", "Remote monitoring"],
          price: "From ₹2,50,000",
          rating: 4.9,
          image: "🚪",
          popular: true
        },
        {
          name: "SmartBarrier Elite",
          description: "Automated barrier gates for vehicle access control",
          features: ["ANPR integration", "LED guidance", "Emergency override", "Cloud connectivity"],
          price: "From ₹1,80,000", 
          rating: 4.8,
          image: "🚧",
          popular: false
        },
        {
          name: "AccessPod Mini",
          description: "Compact pedestrian access control system",
          features: ["QR scanning", "Mobile integration", "Compact design", "Easy installation"],
          price: "From ₹85,000",
          rating: 4.7,
          image: "📱",
          popular: false
        }
      ]
    },
    {
      id: "software",
      label: "Software Solutions", 
      icon: <Smartphone className="h-4 w-4" />,
      products: [
        {
          name: "ParkVision Dashboard",
          description: "Comprehensive parking management platform",
          features: ["Real-time monitoring", "Analytics", "Multi-site management", "Mobile app"],
          price: "From ₹15,000/month",
          rating: 4.9,
          image: "📊",
          popular: true
        },
        {
          name: "PayPark Mobile",
          description: "User-friendly mobile payment application",
          features: ["Digital payments", "Booking system", "Navigation", "Notifications"],
          price: "From ₹8,000/month",
          rating: 4.6,
          image: "💳",
          popular: false
        },
        {
          name: "SecurityWatch AI",
          description: "AI-powered surveillance and security monitoring",
          features: ["Object detection", "Incident alerts", "Video analytics", "24/7 monitoring"],
          price: "From ₹25,000/month",
          rating: 4.8,
          image: "🔒",
          popular: false
        }
      ]
    },
    {
      id: "analytics",
      label: "Analytics & Reports",
      icon: <BarChart3 className="h-4 w-4" />,
      products: [
        {
          name: "DataInsight Pro",
          description: "Advanced analytics and business intelligence platform",
          features: ["Predictive analytics", "Custom reports", "Revenue optimization", "Forecasting"],
          price: "From ₹20,000/month",
          rating: 4.9,
          image: "📈",
          popular: true
        },
        {
          name: "TrendAnalyzer",
          description: "Traffic pattern and usage trend analysis",
          features: ["Pattern recognition", "Heat maps", "Occupancy tracking", "Peak hour analysis"],
          price: "From ₹12,000/month",
          rating: 4.7,
          image: "🔄",
          popular: false
        }
      ]
    },
    {
      id: "services", 
      label: "Support Services",
      icon: <Shield className="h-4 w-4" />,
      products: [
        {
          name: "24/7 Premium Support",
          description: "Round-the-clock technical support and maintenance",
          features: ["24/7 helpdesk", "Remote assistance", "On-site support", "Emergency response"],
          price: "From ₹10,000/month",
          rating: 4.8,
          image: "🛠️",
          popular: false
        },
        {
          name: "Installation & Setup",
          description: "Professional installation and configuration services",
          features: ["Site survey", "Custom installation", "Training", "Go-live support"],
          price: "From ₹50,000",
          rating: 4.9,
          image: "⚙️",
          popular: true
        }
      ]
    }
  ];

  const stats = [
    { icon: <Users className="h-6 w-6" />, value: "500+", label: "Happy Clients" },
    { icon: <Settings className="h-6 w-6" />, value: "1000+", label: "Installations" },
    { icon: <Clock className="h-6 w-6" />, value: "99.9%", label: "Uptime" },
    { icon: <TrendingUp className="h-6 w-6" />, value: "24/7", label: "Support" }
  ];

  return (
    <section id="products" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-success-green/10 text-success-green border-success-green/20">
            Products & Solutions
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Complete Product Portfolio
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Discover our comprehensive range of parking solutions designed to meet every business need, 
            from small facilities to large enterprise deployments.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="w-16 h-16 bg-tech-blue/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-tech-blue">
                {stat.icon}
              </div>
              <div className="text-2xl md:text-3xl font-bold text-foreground mb-2">{stat.value}</div>
              <div className="text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Product Tabs */}
        <Tabs defaultValue="hardware" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-2 md:grid-cols-4 mb-12 bg-tech-gray-light">
            {productCategories.map((category) => (
              <TabsTrigger 
                key={category.id} 
                value={category.id}
                className="flex items-center space-x-2 data-[state=active]:bg-tech-blue data-[state=active]:text-white"
              >
                {category.icon}
                <span className="hidden sm:inline">{category.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {productCategories.map((category) => (
            <TabsContent key={category.id} value={category.id} className="space-y-8">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {category.products.map((product, index) => (
                  <Card key={index} className="group hover:shadow-xl transition-all duration-300 border-0 bg-card relative overflow-hidden">
                    {product.popular && (
                      <div className="absolute top-4 right-4 z-10">
                        <Badge className="bg-warning-orange text-white">
                          Popular
                        </Badge>
                      </div>
                    )}
                    
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-4xl">{product.image}</div>
                        <div className="flex items-center space-x-1">
                          <Star className="h-4 w-4 text-warning-orange fill-current" />
                          <span className="text-sm font-medium">{product.rating}</span>
                        </div>
                      </div>
                      <CardTitle className="text-xl group-hover:text-tech-blue transition-colors">
                        {product.name}
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        {product.description}
                      </p>
                    </CardHeader>
                    
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        {product.features.map((feature, featureIndex) => (
                          <div key={featureIndex} className="flex items-center space-x-2 text-sm">
                            <div className="w-2 h-2 rounded-full bg-success-green"></div>
                            <span className="text-muted-foreground">{feature}</span>
                          </div>
                        ))}
                      </div>
                      
                      <div className="pt-4 border-t">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-lg font-bold text-tech-blue">{product.price}</span>
                        </div>
                        <Button className="w-full bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90">
                          Get Quote
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* CTA Section */}
        <div className="text-center mt-16 p-8 bg-tech-gray-light rounded-2xl">
          <h3 className="text-2xl font-bold text-foreground mb-4">
            Need a Custom Solution?
          </h3>
          <p className="text-muted-foreground mb-6">
            Our experts can design and implement a tailored parking solution for your specific requirements.
          </p>
          <Button size="lg" className="bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90">
            Consult Our Experts
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Products;