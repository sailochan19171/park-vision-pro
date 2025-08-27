import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { 
  Car, 
  Shield, 
  Smartphone, 
  CreditCard, 
  Camera, 
  Users, 
  MapPin, 
  Zap,
  FileText,
  Home,
  Building2,
  Truck,
  Clock,
  BarChart3,
  QrCode,
  Wifi,
  Bell,
  Settings,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Search,
  Filter,
  Download,
  Edit,
  Trash,
  Plus
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const VayAccess = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const featureCategories = [
    {
      id: "smart-parking",
      title: "Smart Parking & ANPR",
      description: "Smart parking with license plate recognition",
      icon: <Camera className="h-8 w-8" />,
      color: "from-blue-600 to-cyan-600",
      features: [
        { name: "IoT Boom Barriers", desc: "Automated barrier gates", icon: <Shield className="h-5 w-5" /> },
        { name: "ANPR Technology", desc: "License plate recognition", icon: <Camera className="h-5 w-5" /> },
        { name: "Ticketless Parking", desc: "Entry without tickets", icon: <QrCode className="h-5 w-5" /> },
        { name: "Real-time Analytics", desc: "Live parking data", icon: <BarChart3 className="h-5 w-5" /> },
        { name: "Mobile Integration", desc: "App-based control", icon: <Smartphone className="h-5 w-5" /> },
        { name: "Cloud Dashboard", desc: "Centralized management", icon: <Wifi className="h-5 w-5" /> }
      ]
    },
    {
      id: "community-access",
      title: "Community Access Control",
      description: "Visitor and resident management",
      icon: <Users className="h-8 w-8" />,
      color: "from-green-600 to-emerald-600",
      features: [
        { name: "Digital Guest Management", desc: "QR code-based visitor access system", icon: <QrCode className="h-5 w-5" /> },
        { name: "RFID Access Cards", desc: "Contactless resident access cards", icon: <CreditCard className="h-5 w-5" /> },
        { name: "Biometric Systems", desc: "Fingerprint and facial recognition", icon: <Shield className="h-5 w-5" /> },
        { name: "Intercom Integration", desc: "Audio/video communication systems", icon: <Bell className="h-5 w-5" /> },
        { name: "Delivery Management", desc: "Package and delivery tracking", icon: <Truck className="h-5 w-5" /> },
        { name: "Security Analytics", desc: "Access logs and security reporting", icon: <BarChart3 className="h-5 w-5" /> }
      ]
    },
    {
      id: "mobile-platform",
      title: "Mobile Application Suite",
      description: "Comprehensive mobile app for users and administrators",
      icon: <Smartphone className="h-8 w-8" />,
      color: "from-purple-600 to-pink-600",
      features: [
        { name: "User Mobile App", desc: "Parking booking and community access", icon: <Smartphone className="h-5 w-5" /> },
        { name: "Admin Dashboard", desc: "Complete system management interface", icon: <BarChart3 className="h-5 w-5" /> },
        { name: "Real-time Notifications", desc: "Push notifications and alerts", icon: <Bell className="h-5 w-5" /> },
        { name: "Payment Gateway", desc: "Integrated payment processing", icon: <CreditCard className="h-5 w-5" /> },
        { name: "GPS Navigation", desc: "Location-based services and navigation", icon: <MapPin className="h-5 w-5" /> },
        { name: "Multi-language Support", desc: "Localized interface and content", icon: <Home className="h-5 w-5" /> }
      ]
    },
    {
      id: "comprehensive-services",
      title: "Vehicle & Mobility Services",
      description: "Complete vehicle management and mobility solutions",
      icon: <Car className="h-8 w-8" />,
      color: "from-orange-600 to-red-600",
      features: [
        { name: "FASTag Services", desc: "FASTag recharge and management", icon: <CreditCard className="h-5 w-5" /> },
        { name: "Challan Tracking", desc: "Traffic fine tracking and payment", icon: <FileText className="h-5 w-5" /> },
        { name: "Car Insurance", desc: "Vehicle insurance services", icon: <Shield className="h-5 w-5" /> },
        { name: "Vehicle Services", desc: "Maintenance and service booking", icon: <Car className="h-5 w-5" /> },
        { name: "EV Charging", desc: "Electric vehicle charging network", icon: <Zap className="h-5 w-5" /> },
        { name: "Fleet Management", desc: "Commercial fleet operations", icon: <Truck className="h-5 w-5" /> }
      ]
    }
  ];

  const industryStats = [
    { label: "Active Users", value: "50K+", icon: <Users className="h-6 w-6" /> },
    { label: "Parking Spots", value: "10K+", icon: <Car className="h-6 w-6" /> },
    { label: "Communities", value: "500+", icon: <Building2 className="h-6 w-6" /> },
    { label: "Daily Transactions", value: "25K+", icon: <CreditCard className="h-6 w-6" /> }
  ];

  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Hero Section */}
      <section className="pb-20 bg-gradient-to-br from-blue-50 via-white to-cyan-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center max-w-5xl mx-auto">
            {/* <Badge className="mb-6 bg-blue-100 text-blue-600 px-4 py-2 text-sm font-medium">
            </Badge> */}
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-8">
              Complete Mobility & 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600"> Access Platform</span>
            </h1>
            <p className="text-xl text-gray-600 mb-12 leading-relaxed max-w-4xl mx-auto">
              Smart parking and access control solutions in one platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:opacity-90 text-white px-8 py-4 text-lg">
                Start Free Trial
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-4 text-lg">
                Watch Demo
              </Button>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              {industryStats.map((stat, index) => (
                <div key={index} className="text-center bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex justify-center mb-3 text-blue-600">
                    {stat.icon}
                  </div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
                  <div className="text-sm text-gray-600 font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Complete Feature Suite
            </h2>
            <p className="text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
              Everything you need for modern parking management, community access control, 
              and comprehensive vehicle services.
            </p>
          </div>

          <Tabs defaultValue="smart-parking" className="w-full">
            <TabsList className="grid w-full grid-cols-1 md:grid-cols-4 h-auto bg-white rounded-xl p-1 shadow-sm border border-gray-200 mb-12">
              {featureCategories.map((category) => (
                <TabsTrigger 
                  key={category.id} 
                  value={category.id}
                  className="flex flex-col items-center p-4 h-auto data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-200"
                >
                  <div className="mb-2">{category.icon}</div>
                  <div className="text-sm font-medium text-center">{category.title}</div>
                </TabsTrigger>
              ))}
            </TabsList>

            {featureCategories.map((category) => (
              <TabsContent key={category.id} value={category.id} className="mt-8">
                <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
                  <div className="text-center mb-12">
                    <div className="flex justify-center mb-6">
                      <div className={`p-4 rounded-full bg-gradient-to-br ${category.color} text-white`}>
                        {category.icon}
                      </div>
                    </div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-4">{category.title}</h3>
                    <p className="text-gray-600 mb-8 text-lg max-w-2xl mx-auto">{category.description}</p>
                    <Button 
                      asChild 
                      className={`bg-gradient-to-br ${category.color} hover:opacity-90 text-white px-8 py-3 text-lg`}
                    >
                      <Link to={`/features/${
                        category.id === 'smart-parking' ? 'smart-parking' :
                        category.id === 'community-access' ? 'community-access' :
                        category.id === 'mobile-platform' ? 'mobile-app' :
                        'comprehensive-services'
                      }`}>
                        View Complete Solution
                      </Link>
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {category.features.map((feature, index) => (
                      <div key={index} className="bg-gray-50 rounded-xl p-6 hover:bg-gray-100 transition-colors">
                        <div className="flex items-center mb-4">
                          <div className={`p-2 rounded-lg bg-gradient-to-br ${category.color} text-white mr-4`}>
                            {feature.icon}
                          </div>
                          <h4 className="text-lg font-semibold text-gray-900">{feature.name}</h4>
                        </div>
                        <p className="text-gray-600">{feature.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </section>

      {/* Dashboard Sections */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              VayAccess Dashboard Suite
            </h2>
            <p className="text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
              Comprehensive dashboards for administrators and users with real-time monitoring and management capabilities.
            </p>
          </div>

          <Tabs defaultValue="admin-dashboard" className="w-full">
            <TabsList className="grid w-full grid-cols-1 md:grid-cols-4 h-auto bg-white rounded-xl p-1 shadow-sm border border-gray-200 mb-12">
              <TabsTrigger 
                value="admin-dashboard"
                className="flex flex-col items-center p-4 h-auto data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-200"
              >
                <Settings className="h-6 w-6 mb-2" />
                <div className="text-sm font-medium">Admin Dashboard</div>
              </TabsTrigger>
              <TabsTrigger 
                value="user-dashboard"
                className="flex flex-col items-center p-4 h-auto data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-200"
              >
                <Users className="h-6 w-6 mb-2" />
                <div className="text-sm font-medium">User Dashboard</div>
              </TabsTrigger>
              <TabsTrigger 
                value="anpr-logs"
                className="flex flex-col items-center p-4 h-auto data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-200"
              >
                <Camera className="h-6 w-6 mb-2" />
                <div className="text-sm font-medium">ANPR Logs</div>
              </TabsTrigger>
              <TabsTrigger 
                value="billing"
                className="flex flex-col items-center p-4 h-auto data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-200"
              >
                <CreditCard className="h-6 w-6 mb-2" />
                <div className="text-sm font-medium">Billing & Invoicing</div>
              </TabsTrigger>
            </TabsList>

            {/* Admin Dashboard */}
            <TabsContent value="admin-dashboard" className="mt-8">
              <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
                <div className="text-center mb-8">
                  <h3 className="text-3xl font-bold text-gray-900 mb-4">Admin Dashboard</h3>
                  <p className="text-gray-600 text-lg">Complete system management interface for administrators</p>
                </div>
                
                {/* Admin Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Users className="h-6 w-6 text-blue-600" />
                      </div>
                      <span className="text-green-600 text-sm font-medium">+12%</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">2,847</div>
                    <div className="text-gray-600 text-sm">Active Users</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Camera className="h-6 w-6 text-green-600" />
                      </div>
                      <span className="text-green-600 text-sm font-medium">+8%</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">1,254</div>
                    <div className="text-gray-600 text-sm">ANPR Scans Today</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <CreditCard className="h-6 w-6 text-purple-600" />
                      </div>
                      <span className="text-green-600 text-sm font-medium">+15%</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">₹45,280</div>
                    <div className="text-gray-600 text-sm">Revenue Today</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <AlertCircle className="h-6 w-6 text-orange-600" />
                      </div>
                      <span className="text-orange-600 text-sm font-medium">3 Active</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">99.2%</div>
                    <div className="text-gray-600 text-sm">System Uptime</div>
                  </div>
                </div>

                {/* Admin Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center mb-4">
                      <Users className="h-6 w-6 text-blue-600 mr-3" />
                      <h4 className="text-lg font-semibold text-gray-900">User Management</h4>
                    </div>
                    <p className="text-gray-600 mb-4">Manage user accounts, permissions, and access levels</p>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div>• Add/Remove Users</div>
                      <div>• Role-based Access Control</div>
                      <div>• User Activity Monitoring</div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center mb-4">
                      <BarChart3 className="h-6 w-6 text-green-600 mr-3" />
                      <h4 className="text-lg font-semibold text-gray-900">Analytics & Reports</h4>
                    </div>
                    <p className="text-gray-600 mb-4">Comprehensive analytics and reporting dashboard</p>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div>• Usage Statistics</div>
                      <div>• Revenue Analytics</div>
                      <div>• Performance Metrics</div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center mb-4">
                      <Camera className="h-6 w-6 text-purple-600 mr-3" />
                      <h4 className="text-lg font-semibold text-gray-900">Camera Controls</h4>
                    </div>
                    <p className="text-gray-600 mb-4">Monitor and control all ANPR cameras</p>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div>• Live Camera Feeds</div>
                      <div>• Camera Health Status</div>
                      <div>• Remote Configuration</div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center mb-4">
                      <Settings className="h-6 w-6 text-orange-600 mr-3" />
                      <h4 className="text-lg font-semibold text-gray-900">System Settings</h4>
                    </div>
                    <p className="text-gray-600 mb-4">Configure system parameters and preferences</p>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div>• Pricing Configuration</div>
                      <div>• System Notifications</div>
                      <div>• Backup & Maintenance</div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center mb-4">
                      <CreditCard className="h-6 w-6 text-red-600 mr-3" />
                      <h4 className="text-lg font-semibold text-gray-900">Billing Management</h4>
                    </div>
                    <p className="text-gray-600 mb-4">Handle all billing and payment processes</p>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div>• Invoice Generation</div>
                      <div>• Payment Processing</div>
                      <div>• Revenue Tracking</div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center mb-4">
                      <Shield className="h-6 w-6 text-teal-600 mr-3" />
                      <h4 className="text-lg font-semibold text-gray-900">Security & Access</h4>
                    </div>
                    <p className="text-gray-600 mb-4">Security monitoring and access control</p>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div>• Access Logs</div>
                      <div>• Security Alerts</div>
                      <div>• Audit Trails</div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* User Dashboard */}
            <TabsContent value="user-dashboard" className="mt-8">
              <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
                <div className="text-center mb-8">
                  <h3 className="text-3xl font-bold text-gray-900 mb-4">User Dashboard</h3>
                  <p className="text-gray-600 text-lg">Simplified interface for end-users to manage their parking and access</p>
                </div>
                
                {/* User Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 text-center">
                    <Car className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                    <div className="text-2xl font-bold text-gray-900 mb-1">12</div>
                    <div className="text-gray-600 text-sm">Parking Sessions</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 text-center">
                    <CreditCard className="h-8 w-8 text-green-600 mx-auto mb-3" />
                    <div className="text-2xl font-bold text-gray-900 mb-1">₹850</div>
                    <div className="text-gray-600 text-sm">Current Balance</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 text-center">
                    <Clock className="h-8 w-8 text-purple-600 mx-auto mb-3" />
                    <div className="text-2xl font-bold text-gray-900 mb-1">2h 45m</div>
                    <div className="text-gray-600 text-sm">Active Session</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 text-center">
                    <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-3" />
                    <div className="text-2xl font-bold text-gray-900 mb-1">Active</div>
                    <div className="text-gray-600 text-sm">Subscription</div>
                  </div>
                </div>

                {/* User Dashboard Features */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Recent Vehicle Entries */}
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Car className="h-5 w-5 text-blue-600 mr-2" />
                      Recent Vehicle Entries
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">MH12AB1234</div>
                          <div className="text-sm text-gray-600">Entry Gate A</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">Today, 2:30 PM</div>
                          <div className="text-xs text-green-600">Active</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">MH12AB1234</div>
                          <div className="text-sm text-gray-600">Exit Gate B</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">Yesterday, 6:45 PM</div>
                          <div className="text-xs text-gray-500">Completed</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">MH14CD5678</div>
                          <div className="text-sm text-gray-600">Entry Gate A</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">2 days ago, 10:15 AM</div>
                          <div className="text-xs text-gray-500">Completed</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Bills */}
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <FileText className="h-5 w-5 text-green-600 mr-2" />
                      Recent Bills
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">Parking Session #1234</div>
                          <div className="text-sm text-gray-600">2h 30m duration</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-green-600">₹75</div>
                          <div className="text-xs text-green-600">Paid</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">Monthly Pass</div>
                          <div className="text-sm text-gray-600">March 2024</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-orange-600">₹1,500</div>
                          <div className="text-xs text-orange-600">Pending</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">Parking Session #1233</div>
                          <div className="text-sm text-gray-600">1h 45m duration</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-green-600">₹50</div>
                          <div className="text-xs text-green-600">Paid</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subscription Status */}
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Bell className="h-5 w-5 text-purple-600 mr-2" />
                      Subscription Status
                    </h4>
                    <div className="space-y-4">
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-green-800">Premium Monthly</span>
                          <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">Active</span>
                        </div>
                        <div className="text-sm text-green-700">Valid until: March 31, 2024</div>
                        <div className="text-sm text-green-700">Benefits: Unlimited parking, priority access</div>
                      </div>
                    </div>
                  </div>

                  {/* Visit Logs */}
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Eye className="h-5 w-5 text-teal-600 mr-2" />
                      Visit Logs
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">Phoenix Mall</div>
                          <div className="text-sm text-gray-600">Parking Duration: 3h 15m</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">Today</div>
                          <div className="text-xs text-gray-500">₹95 paid</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-gray-900">Central Plaza</div>
                          <div className="text-sm text-gray-600">Parking Duration: 1h 30m</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">Yesterday</div>
                          <div className="text-xs text-gray-500">₹45 paid</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ANPR Logs */}
            <TabsContent value="anpr-logs" className="mt-8">
              <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
                <div className="text-center mb-8">
                  <h3 className="text-3xl font-bold text-gray-900 mb-4">ANPR Logs</h3>
                  <p className="text-gray-600 text-lg">Real-time automatic number plate recognition monitoring</p>
                </div>
                
                {/* Search and Filter Bar */}
                <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-8">
                  <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex-1 relative">
                      <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                      <input 
                        type="text" 
                        placeholder="Search by license plate..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button className="flex items-center px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                        <Filter className="h-4 w-4 mr-2" />
                        Filter
                      </button>
                      <button className="flex items-center px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </button>
                    </div>
                  </div>
                </div>

                {/* ANPR Logs Table */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Date & Time</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Camera</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">License Plate</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Status</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Confidence</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        <tr className="hover:bg-gray-50">
                          <td className="py-4 px-6 text-gray-900">
                            <div>March 15, 2024</div>
                            <div className="text-sm text-gray-500">2:45:32 PM</div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center">
                              <Camera className="h-4 w-4 text-blue-600 mr-2" />
                              Entry Gate A
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="font-mono font-semibold text-gray-900">MH12AB1234</span>
                          </td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Recognized
                            </span>
                          </td>
                          <td className="py-4 px-6 text-gray-900">98.5%</td>
                          <td className="py-4 px-6">
                            <div className="flex space-x-2">
                              <button className="text-blue-600 hover:text-blue-800">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="text-gray-600 hover:text-gray-800">
                                <Edit className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        <tr className="hover:bg-gray-50">
                          <td className="py-4 px-6 text-gray-900">
                            <div>March 15, 2024</div>
                            <div className="text-sm text-gray-500">2:43:18 PM</div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center">
                              <Camera className="h-4 w-4 text-blue-600 mr-2" />
                              Exit Gate B
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="font-mono font-semibold text-gray-900">MH14CD5678</span>
                          </td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Recognized
                            </span>
                          </td>
                          <td className="py-4 px-6 text-gray-900">95.2%</td>
                          <td className="py-4 px-6">
                            <div className="flex space-x-2">
                              <button className="text-blue-600 hover:text-blue-800">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="text-gray-600 hover:text-gray-800">
                                <Edit className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        <tr className="hover:bg-gray-50">
                          <td className="py-4 px-6 text-gray-900">
                            <div>March 15, 2024</div>
                            <div className="text-sm text-gray-500">2:41:05 PM</div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center">
                              <Camera className="h-4 w-4 text-red-600 mr-2" />
                              Entry Gate C
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="font-mono font-semibold text-gray-500">UNCLEAR</span>
                          </td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </span>
                          </td>
                          <td className="py-4 px-6 text-gray-900">45.8%</td>
                          <td className="py-4 px-6">
                            <div className="flex space-x-2">
                              <button className="text-blue-600 hover:text-blue-800">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="text-orange-600 hover:text-orange-800">
                                <Edit className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        <tr className="hover:bg-gray-50">
                          <td className="py-4 px-6 text-gray-900">
                            <div>March 15, 2024</div>
                            <div className="text-sm text-gray-500">2:38:42 PM</div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center">
                              <Camera className="h-4 w-4 text-blue-600 mr-2" />
                              Entry Gate A
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="font-mono font-semibold text-gray-900">KA05MN9876</span>
                          </td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Review
                            </span>
                          </td>
                          <td className="py-4 px-6 text-gray-900">78.3%</td>
                          <td className="py-4 px-6">
                            <div className="flex space-x-2">
                              <button className="text-blue-600 hover:text-blue-800">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="text-gray-600 hover:text-gray-800">
                                <Edit className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        <tr className="hover:bg-gray-50">
                          <td className="py-4 px-6 text-gray-900">
                            <div>March 15, 2024</div>
                            <div className="text-sm text-gray-500">2:36:15 PM</div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center">
                              <Camera className="h-4 w-4 text-blue-600 mr-2" />
                              Exit Gate B
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="font-mono font-semibold text-gray-900">DL08XY4321</span>
                          </td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Recognized
                            </span>
                          </td>
                          <td className="py-4 px-6 text-gray-900">97.1%</td>
                          <td className="py-4 px-6">
                            <div className="flex space-x-2">
                              <button className="text-blue-600 hover:text-blue-800">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="text-gray-600 hover:text-gray-800">
                                <Edit className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination */}
                  <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Showing 1 to 5 of 247 entries
                      </div>
                      <div className="flex space-x-2">
                        <button className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                          Previous
                        </button>
                        <button className="px-3 py-1 text-sm text-white bg-blue-600 border border-blue-600 rounded">
                          1
                        </button>
                        <button className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                          2
                        </button>
                        <button className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                          3
                        </button>
                        <button className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Billing & Invoicing */}
            <TabsContent value="billing" className="mt-8">
              <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
                <div className="text-center mb-8">
                  <h3 className="text-3xl font-bold text-gray-900 mb-4">Billing & Invoicing</h3>
                  <p className="text-gray-600 text-lg">Complete billing history and payment management</p>
                </div>
                
                {/* Billing Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 text-center">
                    <div className="text-3xl font-bold text-green-600 mb-2">₹45,280</div>
                    <div className="text-gray-600 text-sm">Total Revenue</div>
                    <div className="text-xs text-green-600 mt-1">+15% from last month</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 text-center">
                    <div className="text-3xl font-bold text-blue-600 mb-2">1,247</div>
                    <div className="text-gray-600 text-sm">Total Invoices</div>
                    <div className="text-xs text-blue-600 mt-1">This month</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 text-center">
                    <div className="text-3xl font-bold text-orange-600 mb-2">₹8,940</div>
                    <div className="text-gray-600 text-sm">Pending Amount</div>
                    <div className="text-xs text-orange-600 mt-1">23 invoices</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 text-center">
                    <div className="text-3xl font-bold text-purple-600 mb-2">97.2%</div>
                    <div className="text-gray-600 text-sm">Collection Rate</div>
                    <div className="text-xs text-green-600 mt-1">+2.1% improvement</div>
                  </div>
                </div>

                {/* Billing Table */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <h4 className="text-lg font-semibold text-gray-900">Billing History</h4>
                      <div className="flex gap-3">
                        <button className="flex items-center px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                          <Filter className="h-4 w-4 mr-2" />
                          Filter
                        </button>
                        <button className="flex items-center px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                          <Plus className="h-4 w-4 mr-2" />
                          New Invoice
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Invoice ID</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Customer</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Date</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Amount</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Status</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Payment Method</th>
                          <th className="text-left py-4 px-6 font-semibold text-gray-900">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        <tr className="hover:bg-gray-50">
                          <td className="py-4 px-6 font-mono text-blue-600">#INV-001234</td>
                          <td className="py-4 px-6">
                            <div>
                              <div className="font-medium text-gray-900">Rahul Sharma</div>
                              <div className="text-sm text-gray-500">rahul@example.com</div>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-gray-900">March 15, 2024</td>
                          <td className="py-4 px-6 font-semibold text-gray-900">₹1,250</td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Paid
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center">
                              <CreditCard className="h-4 w-4 text-gray-400 mr-2" />
                              UPI
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex space-x-2">
                              <button className="text-blue-600 hover:text-blue-800">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="text-gray-600 hover:text-gray-800">
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        <tr className="hover:bg-gray-50">
                          <td className="py-4 px-6 font-mono text-blue-600">#INV-001233</td>
                          <td className="py-4 px-6">
                            <div>
                              <div className="font-medium text-gray-900">Priya Patel</div>
                              <div className="text-sm text-gray-500">priya@example.com</div>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-gray-900">March 14, 2024</td>
                          <td className="py-4 px-6 font-semibold text-gray-900">₹875</td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center">
                              <CreditCard className="h-4 w-4 text-gray-400 mr-2" />
                              Credit Card
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex space-x-2">
                              <button className="text-blue-600 hover:text-blue-800">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="text-gray-600 hover:text-gray-800">
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        <tr className="hover:bg-gray-50">
                          <td className="py-4 px-6 font-mono text-blue-600">#INV-001232</td>
                          <td className="py-4 px-6">
                            <div>
                              <div className="font-medium text-gray-900">Amit Kumar</div>
                              <div className="text-sm text-gray-500">amit@example.com</div>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-gray-900">March 13, 2024</td>
                          <td className="py-4 px-6 font-semibold text-gray-900">₹2,150</td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Paid
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center">
                              <CreditCard className="h-4 w-4 text-gray-400 mr-2" />
                              Net Banking
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex space-x-2">
                              <button className="text-blue-600 hover:text-blue-800">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="text-gray-600 hover:text-gray-800">
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        <tr className="hover:bg-gray-50">
                          <td className="py-4 px-6 font-mono text-blue-600">#INV-001231</td>
                          <td className="py-4 px-6">
                            <div>
                              <div className="font-medium text-gray-900">Sneha Reddy</div>
                              <div className="text-sm text-gray-500">sneha@example.com</div>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-gray-900">March 12, 2024</td>
                          <td className="py-4 px-6 font-semibold text-gray-900">₹640</td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center">
                              <CreditCard className="h-4 w-4 text-gray-400 mr-2" />
                              UPI
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex space-x-2">
                              <button className="text-blue-600 hover:text-blue-800">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="text-orange-600 hover:text-orange-800">
                                <Edit className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        <tr className="hover:bg-gray-50">
                          <td className="py-4 px-6 font-mono text-blue-600">#INV-001230</td>
                          <td className="py-4 px-6">
                            <div>
                              <div className="font-medium text-gray-900">Vikash Singh</div>
                              <div className="text-sm text-gray-500">vikash@example.com</div>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-gray-900">March 11, 2024</td>
                          <td className="py-4 px-6 font-semibold text-gray-900">₹1,890</td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Paid
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center">
                              <CreditCard className="h-4 w-4 text-gray-400 mr-2" />
                              Debit Card
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex space-x-2">
                              <button className="text-blue-600 hover:text-blue-800">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="text-gray-600 hover:text-gray-800">
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination */}
                  <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Showing 1 to 5 of 156 invoices
                      </div>
                      <div className="flex space-x-2">
                        <button className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                          Previous
                        </button>
                        <button className="px-3 py-1 text-sm text-white bg-blue-600 border border-blue-600 rounded">
                          1
                        </button>
                        <button className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                          2
                        </button>
                        <button className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                          3
                        </button>
                        <button className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-cyan-600">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Transform Your Mobility Platform?
          </h2>
          <p className="text-xl text-white/90 mb-12 max-w-4xl mx-auto leading-relaxed">
            Join thousands of communities, parking operators, and businesses using VayAccess 
            for complete mobility and access management solutions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 text-lg">
              Get Started Today
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 text-lg">
              Contact Sales
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default VayAccess;