import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Calendar, Download, Eye, Target, Users, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const AnalyticsReporting = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const keyFeatures = [
    {
      icon: BarChart3,
      title: "Real-time Dashboards",
      description: "Live monitoring of parking occupancy, revenue, and operational metrics with customizable dashboard views."
    },
    {
      icon: TrendingUp,
      title: "Predictive Analytics",
      description: "AI-powered forecasting for demand patterns, revenue optimization, and capacity planning."
    },
    {
      icon: Calendar,
      title: "Automated Reports",
      description: "Scheduled daily, weekly, and monthly reports delivered automatically to stakeholders."
    },
    {
      icon: Target,
      title: "Performance KPIs",
      description: "Track key performance indicators including utilization rates, average stay duration, and revenue per space."
    },
    {
      icon: Users,
      title: "Customer Insights",
      description: "Detailed customer behavior analysis including peak usage patterns and customer journey mapping."
    },
    {
      icon: DollarSign,
      title: "Revenue Analytics",
      description: "Comprehensive financial reporting with revenue optimization recommendations and pricing analysis."
    }
  ];

  const reportTypes = [
    {
      title: "Operational Reports",
      reports: [
        "Daily Occupancy Summary",
        "Peak Hour Analysis",
        "Equipment Status Report",
        "Staff Performance Metrics",
        "System Health Dashboard"
      ]
    },
    {
      title: "Financial Reports",
      reports: [
        "Revenue by Time Period",
        "Payment Method Analysis",
        "Pricing Optimization Report",
        "Discount & Promotion Impact",
        "Profit Margin Analysis"
      ]
    },
    {
      title: "Customer Analytics",
      reports: [
        "Customer Behavior Patterns",
        "Loyalty Program Metrics",
        "Average Stay Duration",
        "Customer Satisfaction Scores",
        "Visit Frequency Analysis"
      ]
    },
    {
      title: "Strategic Reports",
      reports: [
        "Capacity Planning Forecast",
        "Market Trend Analysis",
        "Competitive Benchmarking",
        "ROI & Business Growth",
        "Future Expansion Planning"
      ]
    }
  ];

  const benefits = [
    {
      title: "Data-Driven Decisions",
      description: "Make informed business decisions based on comprehensive data analysis and insights.",
      metrics: "Up to 25% improvement in operational efficiency"
    },
    {
      title: "Revenue Optimization",
      description: "Identify revenue opportunities and optimize pricing strategies for maximum profitability.",
      metrics: "Average 15-20% increase in revenue"
    },
    {
      title: "Operational Excellence",
      description: "Monitor and improve operational performance with real-time alerts and notifications.",
      metrics: "Reduce operational costs by 30%"
    },
    {
      title: "Customer Experience",
      description: "Enhance customer satisfaction through better understanding of usage patterns.",
      metrics: "Improve customer satisfaction by 40%"
    }
  ];

  const dashboardFeatures = [
    "Real-time occupancy monitoring",
    "Revenue tracking and forecasting",
    "Equipment status and maintenance alerts",
    "Customer behavior analytics",
    "Peak hour identification",
    "Comparative performance analysis",
    "Mobile-responsive design",
    "Custom report builder",
    "Data export capabilities",
    "Multi-location management"
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
                  Business Intelligence Platform
                </Badge>
                <h1 className="text-4xl lg:text-6xl font-bold leading-tight">
                  Analytics & Reporting
                  <span className="block text-2xl lg:text-3xl font-normal opacity-90 mt-2">
                    Data-Driven Insights & Intelligence
                  </span>
                </h1>
                <p className="text-xl opacity-90 leading-relaxed">
                  Transform raw parking data into actionable business insights. Our comprehensive 
                  analytics platform provides real-time dashboards, automated reports, and 
                  predictive analytics for optimal decision-making.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="bg-white text-tech-blue hover:bg-white/90">
                  View Demo Dashboard
                </Button>
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-tech-blue">
                  Sample Reports
                </Button>
              </div>
            </div>
            <div className="relative">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">50+</div>
                    <div className="text-sm opacity-80">Report Types</div>
                  </div>
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">Real-time</div>
                    <div className="text-sm opacity-80">Data Updates</div>
                  </div>
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">24/7</div>
                    <div className="text-sm opacity-80">Monitoring</div>
                  </div>
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">AI-Powered</div>
                    <div className="text-sm opacity-80">Predictions</div>
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
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Comprehensive Analytics Platform</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Powerful tools and insights to optimize your parking operations and maximize revenue potential.
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

      {/* Report Types */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Comprehensive Report Suite</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Access over 50 different report types covering all aspects of your parking operations.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {reportTypes.map((category, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl text-tech-blue">{category.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {category.reports.map((report, reportIndex) => (
                      <li key={reportIndex} className="flex items-center space-x-2 text-sm">
                        <div className="w-2 h-2 bg-tech-blue rounded-full"></div>
                        <span>{report}</span>
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
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Business Impact</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Measurable results that drive business growth and operational excellence.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {benefits.map((benefit, index) => (
              <Card key={index} className="border-0 shadow-lg p-8">
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold text-tech-blue">{benefit.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{benefit.description}</p>
                  <div className="bg-gradient-to-r from-tech-blue to-tech-blue-light text-white px-4 py-2 rounded-lg inline-block">
                    <span className="font-semibold">{benefit.metrics}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard Features */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl lg:text-4xl font-bold">Intelligent Dashboard</h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Our advanced dashboard provides a comprehensive view of your parking operations 
                with customizable widgets and real-time data visualization.
              </p>
              <div className="grid grid-cols-1 gap-3">
                {dashboardFeatures.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-tech-blue rounded-full"></div>
                    <span className="text-foreground">{feature}</span>
                  </div>
                ))}
              </div>
              <Button size="lg" className="bg-gradient-to-r from-tech-blue to-tech-blue-light">
                Explore Dashboard Features
              </Button>
            </div>
            <div className="relative">
              <Card className="border-0 shadow-2xl">
                <CardContent className="p-8">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Today's Overview</h3>
                      <Badge variant="secondary">Live</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-tech-blue">85%</div>
                        <div className="text-sm text-muted-foreground">Occupancy</div>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">₹24,850</div>
                        <div className="text-sm text-muted-foreground">Revenue</div>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-orange-600">124</div>
                        <div className="text-sm text-muted-foreground">Vehicles</div>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">2.5h</div>
                        <div className="text-sm text-muted-foreground">Avg Stay</div>
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
            <h2 className="text-3xl lg:text-4xl font-bold">Start Making Data-Driven Decisions</h2>
            <p className="text-xl opacity-90">
              Unlock the power of your parking data with our comprehensive analytics platform. 
              Schedule a demo to see how our insights can transform your operations.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-white text-tech-blue hover:bg-white/90">
                Schedule Demo
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-tech-blue">
                Download Sample Reports
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default AnalyticsReporting;