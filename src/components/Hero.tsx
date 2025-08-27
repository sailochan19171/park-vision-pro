import { Button } from "./ui/button";
import { ArrowRight, Download, Building, Car, Scan, CheckCircle } from "lucide-react";
import vay3DModel from "../assets/vay-3d-model.jpg";

const Hero = () => {
  // No complex animation needed - using static 3D model

  const handleExploreSolutions = () => {
    const solutionsElement = document.querySelector('#solutions');
    if (solutionsElement) {
      const headerHeight = 80;
      const elementPosition = solutionsElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const handleDownloadBrochure = () => {
    try {
      const link = document.createElement('a');
      link.href = '/vay-common-brochure.pdf';
      link.download = 'VAY-Parking-Solutions-Brochure.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('Brochure download started successfully');
    } catch (error) {
      console.error('Error downloading brochure:', error);
      alert('Sorry, there was an error downloading the brochure. Please contact us directly.');
    }
  };

  return (
    <section id="home" className="relative min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 overflow-x-hidden scroll-mt-20">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
                           radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 40% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)`
        }} />
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex items-center py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            
            {/* Left Column - Content */}
            <div className="space-y-8">
              {/* Main Heading */}
              <div className="space-y-2">
                <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 leading-tight font-poppins">
                  Vay Access
                </h1>
                <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold text-blue-700 leading-tight font-poppins">
                  <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 bg-clip-text [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] [background-clip:text]" style={{
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}>
                    Control Systems
                  </span>
                </h1>
              </div>

              {/* Subtitle */}
              <h2 className="text-2xl lg:text-3xl font-semibold text-gray-700 font-poppins">
                Industry Experts
              </h2>

              {/* Description */}
              <div className="space-y-4 text-gray-600 text-sm leading-relaxed font-poppins font-normal" data-aos="fade-up" data-aos-delay="400">
                <p>
                  Building tomorrow's infrastructure with our cutting-edge vehicular access management solutions. Transform your parking operations, enhance security, and provide effortless convenience to your users.
                </p>
                <p className="text-blue-700 font-semibold font-poppins">
                  Engineering the future of smart parking today.
                </p>
              </div>

              {/* Features */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-8" data-aos="fade-up" data-aos-delay="500">
                <div className="text-center group" data-aos="zoom-in" data-aos-delay="600">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-100 to-blue-200 rounded-full flex items-center justify-center mx-auto mb-4 transition-transform duration-300">
                    <Scan className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2 text-lg font-poppins">Smart Automation</h3>
                  <p className="text-sm text-gray-600 leading-relaxed font-poppins font-normal">AI-powered solutions</p>
                </div>
                <div className="text-center group" data-aos="zoom-in" data-aos-delay="700">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-100 to-blue-200 rounded-full flex items-center justify-center mx-auto mb-4 transition-transform duration-300">
                    <CheckCircle className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2 text-lg font-poppins">Secure Access</h3>
                  <p className="text-sm text-gray-600 leading-relaxed font-poppins font-normal">99.9% reliability</p>
                </div>
                <div className="text-center group" data-aos="zoom-in" data-aos-delay="800">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-100 to-blue-200 rounded-full flex items-center justify-center mx-auto mb-4 transition-transform duration-300">
                    <Car className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2 text-lg font-poppins">User Friendly</h3>
                  <p className="text-sm text-gray-600 leading-relaxed font-poppins font-normal">Intuitive interface</p>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4" data-aos="fade-up" data-aos-delay="600">
                <Button 
                  onClick={handleExploreSolutions}
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 rounded-lg font-poppins"
                >
                  <ArrowRight className="mr-2 h-5 w-5" />
                  Explore Solutions
                </Button>
                <Button 
                  onClick={handleDownloadBrochure}
                  variant="outline" 
                  size="lg"
                  className="border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 rounded-lg font-poppins"
                >
                  <Download className="mr-2 h-5 w-5" />
                  Download Brochure
                </Button>
              </div>

              {/* Statistics */}
              <div className="flex gap-12 pt-6 border-t border-gray-200">
                <div>
                  {/* <div className="text-4xl font-bold text-gray-900">500+</div> */}
                  {/* <div className="text-gray-600 font-medium">Projects</div> */}
                </div>
                <div>
                  {/* <div className="text-4xl font-bold text-gray-900">50+</div> */}
                  {/* <div className="text-gray-600 font-medium">Cities</div> */}
                </div>
              </div>
            </div>

            {/* Right Column - 3D VAY Access Control System */}
            <div className="relative mt-8 lg:mt-0">
              {/* 3D Model Container */}
              <div className="relative w-full h-[500px] bg-gradient-to-br from-gray-50 via-white to-blue-50/30 rounded-[2rem] overflow-hidden border-2 border-gray-300/30">
                
                {/* Polished Inner Highlight */}
                <div className="absolute inset-1 rounded-[1.75rem] border border-white/40 pointer-events-none"></div>

                {/* 3D Model Image */}
                <div className="relative w-full h-full flex items-center justify-center p-8">
                  <div className="relative w-full h-full max-w-md mx-auto">
                    <img
                      src={vay3DModel}
                      alt="VAY Access Control System - 3D Model"
                      className="w-full h-full object-contain rounded-2xl transform hover:scale-105 transition-transform duration-700 ease-out"
                      style={{
                        filter: 'brightness(1.08) contrast(1.15) saturate(1.2)',
                        imageRendering: 'crisp-edges'
                      }}
                    />
                    

                  </div>
                </div>

                {/* Professional Overlay Information */}
                {/* <div className="absolute top-6 left-6 bg-black/80 text-white px-4 py-2 rounded-lg backdrop-blur-sm border border-white/10">
                  <div className="text-xs font-mono text-blue-400 mb-1">VAY ACCESS CONTROL</div>
                  <div className="text-sm font-semibold">3D System Model</div>
                </div> */}

                {/* Feature Highlights */}
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="space-y-1">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                          <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                        </div>
                        <div className="text-xs font-semibold text-gray-800">Smart Barriers</div>
                      </div>
                      <div className="space-y-1">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                          <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                        </div>
                        <div className="text-xs font-semibold text-gray-800">RFID Access</div>
                      </div>
                      <div className="space-y-1">
                        <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                          <div className="w-3 h-3 bg-orange-600 rounded-full"></div>
                        </div>
                        <div className="text-xs font-semibold text-gray-800">Real-time Control</div>
                      </div>
                    </div>
                  </div>
                </div>




              </div>


            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;