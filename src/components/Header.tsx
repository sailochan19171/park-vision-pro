import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Menu, X, Phone, ChevronDown, Shield, Car, BarChart3, Smartphone, Settings, Wifi, Building2, Cloud, Zap, Camera, QrCode, Bell, User, Activity, MapPin } from "lucide-react";
import { cn } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Link, useNavigate } from "react-router-dom";
// Import the logo image - place your image as logo.png in the assets folder
import logoImage from "../assets/vay-logo.jpg";

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          
          // Update background blur/transparency based on scroll position
          setIsScrolled(currentScrollY > 10);
          
          // Smart header visibility logic
          if (currentScrollY < 10) {
            // Always show header at the top
            setIsHeaderVisible(true);
          } else if (currentScrollY < lastScrollY) {
            // Scrolling up - show header
            setIsHeaderVisible(true);
          } else if (currentScrollY > lastScrollY && currentScrollY > 80) {
            // Scrolling down and past 80px - hide header
            setIsHeaderVisible(false);
            // Close mobile menu when hiding header
            setIsMobileMenuOpen(false);
          }
          
          setLastScrollY(currentScrollY);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMobileMenuOpen]);

  const navItems = [
    { href: "/", label: "Home" },
    // { href: "/products", label: "Products" },
    { href: "/solutions", label: "Solutions" },
    // { href: "/features", label: "Features" },
    // { href: "/vayaccess", label: "VayAccess Platform" },
    // { href: "/services", label: "Services" },
    // { href: "/about", label: "About" },
    // { href: "/mockups", label: "Mockups" },
  ];

  const productsCategories = [
    {
      title: "Parking & Access Control",
      description: "Comprehensive access management solutions",
      icon: Shield,
      products: [
        { href: "/products/access-control", label: "Access Control Systems", description: "Advanced security and access management" },
        { href: "/products/barrier-gates", label: "Barrier Gates", description: "Automated vehicle access control" },
        { href: "/products/pedestrian-gates", label: "Pedestrian Gates", description: "Secure pedestrian access solutions" },
        { href: "/products/parking-management", label: "Parking Management", description: "Complete parking facility control" },
      ]
    }
  ];

  // const solutionsCategories = [
  //   {
  //     title: "Smart Mobility Solutions",
  //     description: "Intelligent transportation technology",
  //     icon: Car,
  //     solutions: [
  //       { href: "/features/smart-parking", label: "Smart Parking", description: "IoT-enabled parking solutions" },
  //       { href: "/products/parking-guidance", label: "Parking Guidance", description: "Real-time space availability" },
  //       { href: "/solutions/anpr-technology", label: "ANPR Technology", description: "Automatic number plate recognition" },
  //       { href: "/features/mobile-app", label: "Mobile Solutions", description: "App-based parking management" },
  //     ]
  //   }
  // ];

  return (
    <>
      {/* Dynamic spacer div that adjusts with header size */}
      <div className="h-16 md:h-20"></div>
      <header
        className={cn(
          "fixed top-0 w-full z-50 bg-white shadow-lg border-b transition-transform duration-300",
          isHeaderVisible ? "translate-y-0" : "-translate-y-full",
          isMobileMenuOpen && "transform-none"
        )}
      >
      <div className="container mx-auto px-6 lg:px-8 py-0 relative">
        <div className="flex items-center justify-between h-20 md:h-28">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <div className="flex items-center justify-center w-20 h-20 md:w-28 md:h-28">
              <img 
                src={logoImage} 
                alt="Company Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  // Fallback to PV logo if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const fallbackDiv = document.createElement('div');
                  fallbackDiv.className = 'w-20 h-20 md:w-28 md:h-28 bg-gradient-to-br from-tech-blue to-blue-400 rounded-lg flex items-center justify-center';
                  fallbackDiv.innerHTML = '<span class="text-white font-bold text-lg md:text-xl">VAY</span>';
                  target.parentElement?.appendChild(fallbackDiv);
                }}
              />
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6 ml-auto mr-8">
            {navItems.filter(item => item.label !== 'Products').map((item) => (
              item.href.startsWith('/') ? (
                <Link
                  key={item.href}
                  to={item.href}
                  className="text-foreground hover:text-tech-blue transition-colors duration-300 font-medium font-poppins"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-foreground hover:text-tech-blue transition-colors duration-300 font-medium font-poppins"
                >
                  {item.label}
                </a>
              )
            ))}
            
            {/* Products Mega Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center space-x-1 text-foreground hover:text-tech-blue transition-colors duration-300 font-medium outline-none">
                <span>Products</span>
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[600px] p-6">
                <div className="grid grid-cols-1 gap-8">
                  {productsCategories.map((category, index) => {
                    const IconComponent = category.icon;
                    return (
                      <div key={index} className="space-y-4">
                        <div className="flex items-center space-x-3 pb-3 border-b border-border">
                          <div className="w-10 h-10 bg-gradient-to-br from-tech-blue to-blue-400 rounded-lg flex items-center justify-center">
                            <IconComponent className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground text-lg">{category.title}</h3>
                            <p className="text-sm text-muted-foreground">{category.description}</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {category.products.map((product, productIndex) => (
                            <Link
                              key={productIndex}
                              to={product.href}
                              className="block p-3 rounded-lg hover:bg-accent/50 transition-colors group"
                            >
                              <div className="flex items-start">
                                <div className="flex-1">
                                  <h4 className="font-medium text-foreground group-hover:text-tech-blue transition-colors">
                                    {product.label}
                                  </h4>
                                  <p className="text-sm text-muted-foreground leading-relaxed">
                                    {product.description}
                                  </p>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-8 pt-6 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      {/* <h4 className="font-semibold text-foreground">View All Products</h4> */}
                      {/* <p className="text-sm text-muted-foreground">Explore our complete product portfolio and solutions.</p> */}
                    </div>
                    {/* <Button variant="default" className="bg-gradient-to-r from-tech-blue to-blue-400 hover:opacity-90" asChild>
                      <Link to="/products">View All</Link>
                    </Button> */}
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Solutions Mega Menu */}
            {/* <DropdownMenu> */}
              {/* <DropdownMenuTrigger className="flex items-center space-x-1 text-foreground hover:text-tech-blue transition-colors duration-300 font-medium outline-none"> */}
                {/* <span>Solutions</span> */}
                {/* <ChevronDown className="h-4 w-4" /> */}
              {/* </DropdownMenuTrigger> */}
              {/* <DropdownMenuContent align="start" className="w-[600px] p-6"> */}
                {/* <div className="grid grid-cols-1 gap-8"> */}
                  {/* {solutionsCategories.map((category, index) => { */}
                    {/* const IconComponent = category.icon; */}
                    {/* return (
                      <div key={index} className="space-y-4">
                        <div className="flex items-center space-x-3 pb-3 border-b border-border">
                          <div className="w-10 h-10 bg-gradient-to-br from-tech-blue to-blue-400 rounded-lg flex items-center justify-center">
                            <IconComponent className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground text-lg">{category.title}</h3>
                            <p className="text-sm text-muted-foreground">{category.description}</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {category.solutions.map((solution, solutionIndex) => (
                            <Link
                              key={solutionIndex}
                              to={solution.href}
                              className="block p-3 rounded-lg hover:bg-accent/50 transition-colors group"
                            >
                              <div className="flex items-start">
                                <div className="flex-1">
                                  <h4 className="font-medium text-foreground group-hover:text-tech-blue transition-colors">
                                    {solution.label}
                                  </h4>
                                  <p className="text-sm text-muted-foreground leading-relaxed">
                                    {solution.description}
                                  </p>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })} */}
                {/* </div> */}
                {/* <div className="mt-8 pt-6 border-t border-border"> */}
                  {/* <div className="flex items-center justify-between"> */}
                    {/* <div> */}
                      {/* <h4 className="font-semibold text-foreground">Need a Custom Solution?</h4> */}
                      {/* <p className="text-sm text-muted-foreground">Our experts can help design the perfect solution for your needs.</p> */}
                    {/* </div> */}
                    {/* <Button variant="default" className="bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90"> */}
                      {/* Contact Experts */}
                    {/* </Button> */}
                  {/* </div> */}
                {/* </div> */}
              {/* </DropdownMenuContent> */}
            {/* </DropdownMenu> */}
          </nav>

          {/* Contact Info & CTA */}
          <div className={cn(
            "hidden lg:flex items-center transition-all duration-500",
            isScrolled ? "space-x-2" : "space-x-4"
          )}>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              {/* <span>+91 720 724 4344</span> */}
            </div>
            
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-tech-blue/20 relative z-50"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMobileMenuOpen ? 
              <X className="h-6 w-6 text-gray-700 transition-transform duration-200" /> : 
              <Menu className="h-6 w-6 text-gray-700 transition-transform duration-200" />
            }
          </button>
        </div>

      </div>
      
      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Menu Content */}
          <div className="md:hidden fixed inset-0 pt-20 bg-white/95 backdrop-blur-lg border-b shadow-xl z-40">
            <div className="container mx-auto px-4 py-6 max-h-[calc(100vh-5rem)] overflow-y-auto">
              {/* Close Button Inside Menu */}
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-tech-blue/20"
                  aria-label="Close menu"
                >
                  <X className="h-6 w-6 text-gray-700" />
                </button>
              </div>
              
              {/* Main Navigation */}
              <div className="space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="block px-4 py-3 text-base font-medium text-gray-900 hover:text-tech-blue hover:bg-gray-50 rounded-lg transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              
              {/* Products Section */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 px-4">Products</h4>
                <div className="space-y-1">
                  {productsCategories[0].products.map((product, index) => (
                    <Link
                      key={index}
                      to={product.href}
                      className="block px-4 py-3 text-sm font-medium text-gray-600 hover:text-tech-blue hover:bg-gray-50 rounded-lg transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {product.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
    </>
  );
};

export default Header;