import React from 'react';
import { Button } from './ui/button';
import { ArrowRight, Phone, Mail, Calendar } from 'lucide-react';

const CTASection = () => {
  const handleGetStarted = () => {
    const contactElement = document.querySelector('#contact');
    if (contactElement) {
      const headerHeight = 80;
      const elementPosition = contactElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });

      setTimeout(() => {
        const messageTextarea = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
        if (messageTextarea) {
          messageTextarea.value = "Hi! I'm ready to get started with your smart parking solutions. Please contact me to discuss my project requirements and get a detailed proposal.";
          messageTextarea.focus();
        }
      }, 1000);
    }
  };

  const handleScheduleCall = () => {
    const contactElement = document.querySelector('#contact');
    if (contactElement) {
      const headerHeight = 80;
      const elementPosition = contactElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });

      setTimeout(() => {
        const messageTextarea = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
        if (messageTextarea) {
          messageTextarea.value = "Hi! I'd like to schedule a consultation call to discuss my parking solution needs. Please let me know your available times.";
          messageTextarea.focus();
        }
      }, 1000);
    }
  };

  return (
    <section className="py-24 bg-gradient-to-br from-gray-900 to-blue-900 relative overflow-x-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/5 to-transparent transform skew-y-6"></div>
        <div className="absolute top-10 right-10 w-96 h-96 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full blur-3xl opacity-20"></div>
        <div className="absolute bottom-10 left-10 w-80 h-80 bg-gradient-to-r from-green-400 to-blue-500 rounded-full blur-3xl opacity-15"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 max-w-7xl relative">
        <div className="text-center mb-16">
          {/* Main CTA Content */}
          <div className="max-w-4xl mx-auto">

            
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Let's Build Your Smart
              <span className="block bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
                Parking Solution
              </span>
            </h2>
            
            <p className="text-sm text-gray-300 mb-8 leading-relaxed max-w-3xl mx-auto">
              Join hundreds of satisfied clients who've revolutionized their parking systems with our cutting-edge 
              technology. Get a free consultation and customized proposal today.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button
                onClick={handleGetStarted}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 text-sm font-medium rounded-lg shadow-lg hover:shadow-blue-500/25 transition-all duration-300 hover:-translate-y-1"
              >
                Get Started Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              
              <Button
                onClick={handleScheduleCall}
                variant="outline"
                className="border-2 border-blue-400 text-blue-400 hover:bg-blue-400 hover:text-white px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 hover:-translate-y-1"
              >
                <Calendar className="w-5 h-5 mr-2" />
                Schedule Consultation
              </Button>
            </div>

            {/* Quick Contact Options */}
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all duration-300 group">
                <div className="flex items-center justify-center w-12 h-12 bg-blue-500/20 rounded-lg mb-4 mx-auto group-hover:bg-blue-500/30 transition-colors">
                  <Phone className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-white font-semibold mb-2">Call Us Directly</h3>
                <p className="text-gray-300 text-sm mb-3">Speak with our experts</p>
                <a 
                  href="tel:+917207244344" 
                  className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                >
                  +91 720 724 4344
                </a>
              </div>

              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all duration-300 group">
                <div className="flex items-center justify-center w-12 h-12 bg-green-500/20 rounded-lg mb-4 mx-auto group-hover:bg-green-500/30 transition-colors">
                  <Mail className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-white font-semibold mb-2">Email Us</h3>
                <p className="text-gray-300 text-sm mb-3">Get detailed proposals</p>
                <a 
                  href="mailto:info@vayaccess.com" 
                  className="text-green-400 hover:text-green-300 font-medium transition-colors"
                >
                  info@vayaccess.com
                </a>
              </div>

              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all duration-300 group">
                <div className="flex items-center justify-center w-12 h-12 bg-purple-500/20 rounded-lg mb-4 mx-auto group-hover:bg-purple-500/30 transition-colors">
                  <Calendar className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-white font-semibold mb-2">Site Visit</h3>
                <p className="text-gray-300 text-sm mb-3">On-site consultation</p>
                <span className="text-purple-400 font-medium">
                  Free Assessment
                </span>
              </div>
            </div>

            {/* Guarantee Badge */}
            {/* <div className="mt-12 inline-flex items-center gap-3 bg-green-500/10 border border-green-400/30 px-6 py-3 rounded-full"> */}
              {/* <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div> */}
              {/* <span className="text-green-300 font-medium"> */}
                {/* ✓ Free Consultation • ✓ Custom Design • ✓ 2-Year Warranty */}
              {/* </span> */}
            {/* </div> */}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;