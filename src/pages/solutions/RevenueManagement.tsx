import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Target, Clock, Percent, CreditCard, Settings, BarChart3, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const RevenueManagement = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const keyFeatures = [
    {
      icon: TrendingUp,
      title: "Dynamic Pricing",
      description: "AI-powered dynamic pricing algorithms that adjust rates based on demand, events, and historical data to maximize revenue."
    },
    {
      icon: Target,
      title: "Revenue Optimization",
      description: "Advanced algorithms analyze occupancy patterns and market conditions to recommend optimal pricing strategies."
    },
    {
      icon: Clock,
      title: "Time-based Pricing",
      description: "Flexible pricing models including hourly, daily, weekly, and monthly rates with peak hour surcharges."
    },
    {
      icon: Percent,
      title: "Discount Management",
      description: "Comprehensive discount and promotion management with customer segmentation and loyalty program integration."
    },
    {
      icon: CreditCard,
      title: "Multi-Payment Processing",
      description: "Support for all payment methods including cards, digital wallets, UPI, and subscription-based payments."
    },
    {
      icon: BarChart3,
      title: "Revenue Analytics",
      description: "Real-time revenue tracking with detailed analytics, forecasting, and performance benchmarking capabilities."
    }
  ];

  const pricingStrategies = [
    {
      title: "Peak Hour Pricing",
      description: "Automatic rate adjustments during high-demand periods",
      features: ["Event-based pricing", "Rush hour premiums", "Weekend differentials", "Holiday surcharges"]
    },
    {
      title: "Occupancy-Based Pricing",
      description: "Dynamic rates based on real-time space availability",
      features: ["Real-time occupancy tracking", "Scarcity pricing", "Early bird discounts", "Last-minute deals"]
    },
    {
      title: "Customer Segmentation",
      description: "Targeted pricing for different customer groups",
      features: ["VIP customer rates", "Corporate discounts", "Loyalty program pricing", "New customer promotions"]
    },
    {
      title: "Subscription Models",
      description: "Recurring revenue through monthly and annual plans",
      features: ["Monthly parking passes", "Annual subscriptions", "Corporate packages", "Flexible plan options"]
    }
  ];

  const revenueMetrics = [
    {
      title: "Revenue per Space per Hour",
      description: "Track the performance of each parking space",
      features: ["Hourly revenue tracking", "Space utilization rates", "Peak performance analysis", "Comparative benchmarking"]
    },
    {
      title: "Customer Lifetime Value",
      description: "Understand long-term customer value and retention",
      features: ["Customer spending patterns", "Retention rate analysis", "Loyalty program effectiveness", "Churn prediction"]
    },
    {
      title: "Conversion Rate Optimization",
      description: "Improve booking and payment completion rates",
      features: ["Funnel analysis", "Abandonment tracking", "A/B testing support", "Payment success rates"]
    }
  ];

  const benefits = [
    "Increase revenue by up to 40% through dynamic pricing",
    "Reduce operational costs with automated pricing management",
    "Improve customer satisfaction with flexible payment options",
    "Gain insights into customer behavior and preferences",
    "Optimize space utilization during off-peak hours",
    "Create predictable revenue streams through subscriptions"
  ];

  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Hero Section */}
      <section className="pb-20 bg-gradient-to-br from-green-50 to-blue-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="mb-6 bg-green-100 text-green-600 px-4 py-2 text-sm font-medium">
              Revenue Management Solutions
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Maximize Your
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-blue-600"> Parking Revenue</span>
            </h1>
            <p className="text-xl text-gray-600 mb-12 leading-relaxed">
              Advanced revenue management platform with dynamic pricing, payment processing, 
              and comprehensive analytics to optimize your parking business profitability.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-gradient-to-r from-green-600 to-blue-600 hover:opacity-90 text-white px-8 py-4 text-lg">
                Start Free Trial
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-4 text-lg">
                See Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Core Revenue Features</h2>
            <p className="text-lg md:text-xl text-gray-700 max-w-2xl mx-auto">
              Everything you need to optimize pricing and maximize revenue from your parking operations.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {keyFeatures.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <div key={index} className="bg-white rounded-2xl p-6 md:p-8 border border-gray-200 hover:shadow-xl transition-shadow">
                  <div className="flex items-center mb-5">
                    <div className="p-4 bg-green-100 rounded-xl mr-5">
                      <IconComponent className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="text-2xl font-semibold text-gray-900">{feature.title}</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Strategies */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Smart Pricing Strategies</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Implement advanced pricing models that adapt to market conditions and customer behavior.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {pricingStrategies.map((strategy, index) => (
              <div key={index} className="bg-gray-50 rounded-xl p-8">
                <h3 className="text-2xl font-bold text-blue-600 mb-4">{strategy.title}</h3>
                <p className="text-gray-600 mb-6 text-lg">{strategy.description}</p>
                <div className="space-y-3">
                  {strategy.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Revenue Metrics */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Revenue Analytics & Insights</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive analytics to track performance and identify growth opportunities.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {revenueMetrics.map((metric, index) => (
              <div key={index} className="bg-white rounded-xl p-8 border border-gray-200">
                <h3 className="text-xl font-bold text-blue-600 mb-4">{metric.title}</h3>
                <p className="text-gray-600 mb-6">{metric.description}</p>
                <div className="space-y-3">
                  {metric.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-start">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                      <span className="text-gray-700 text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-6">Why Choose Our Revenue Management?</h2>
              <p className="text-xl text-gray-600">
                Transform your parking business with proven strategies that deliver measurable results.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-start bg-gray-50 rounded-lg p-6">
                  <CheckCircle className="h-6 w-6 text-green-600 mt-1 mr-4 flex-shrink-0" />
                  <span className="text-gray-700 text-lg">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-green-600 to-blue-600">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Boost Your Revenue?
          </h2>
          <p className="text-xl text-white/90 mb-12 max-w-3xl mx-auto">
            Join hundreds of parking operators who have increased their revenue by up to 40% 
            with our smart pricing solutions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 text-lg">
              Start Free Trial
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 text-lg">
              Request Demo
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default RevenueManagement;
