import { useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { useToast } from "../hooks/use-toast";
import { submitContactForm, ContactFormData } from "../services/contactService";
import AICallModal from "./AICallModal";
import { 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  Building, 
  Factory,
  MessageCircle,
  Loader2,
  Bot
} from "lucide-react";

const Contact = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAICallModalOpen, setIsAICallModalOpen] = useState(false);

  const validateForm = (data: ContactFormData) => {
    const errors: string[] = [];
    
    if (!data.name.trim()) {
      errors.push('Name is required');
    }
    
    if (!data.email.trim()) {
      errors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('Please enter a valid email address');
    }
    
    if (!data.message.trim()) {
      errors.push('Message is required');
    } else if (data.message.trim().length < 10) {
      errors.push('Message must be at least 10 characters long');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const validation = validateForm(formData);
    if (!validation.isValid) {
      toast({
        title: "Validation Error",
        description: validation.errors.join('. '),
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log(' Submitting contact form to live email backend...', formData);
      
      // Submit the form with automated real-time email processing
      const result = await submitContactForm(formData);
      
      if (result.success) {
        toast({
          title: "Message Sent Successfully! ",
          description: result.message,
          duration: 10000,
        });
        setFormData({ name: '', email: '', message: '' });
      } else {
        toast({
          title: "Submission Failed",
          description: result.message,
          variant: "destructive",
          duration: 8000,
        });
      }
    } catch (error) {
      console.error('Contact form error:', error);
      toast({
        title: "Error Sending Message",
        description: "Sorry, there was an error sending your message. Please try again or contact us directly at info@vayaccess.com or +91 720 724 4344.",
        variant: "destructive",
        duration: 8000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAICall = () => {
    setIsAICallModalOpen(true);
  };

  const handleWhatsAppContact = () => {
    const message = encodeURIComponent('Hi, I am interested in your parking solutions. Please provide more information.');
    window.open(`https://wa.me/+917013799462?text=${message}`, '_blank');
  };

  const contactInfo = [
    {
      title: "Corporate Office",
      icon: <Building className="h-5 w-5" />,
      details: [
        "Plot No. 26, Road No.1, West Gandhi Nagar",
        "Rampally X Road, Nagaram, Keesara (M)",
        "Hyderabad - 500083, TS, India"
      ]
    },
    {
      title: "Factory",
      icon: <Factory className="h-5 w-5" />,
      details: [
        "TIF, MSME, Green Industrial Park, Dandu Malkapur Village, Choutuppal Mandal,",
        "Yadadri - Bhuvanagiri District-508252",
        "M - 9154703116"
      ]
    },
    // {
    //   title: "Phone Numbers",
    //   icon: <Phone className="h-5 w-5" />,
    //   details: [
    //     "+91 720 724 4344 (Primary)",
    //     "+91 720 724 4345 (Support)",
    //     "+91 720 724 4346 (Sales)"
    //   ]
    // },
    // {
    //   title: "Email",
    //   icon: <Mail className="h-5 w-5" />,
    //   // details: [
    //   //   "info@vayaccess.com",
    //   //   "sales@vayaccess.com",
    //   //   "support@vayaccess.com"
    //   // ]
    // },

  ];

  return (
    <section id="contact" className="py-16 bg-gradient-to-br from-gray-50 via-white to-blue-50/30 scroll-mt-20 relative overflow-x-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 right-20 w-72 h-72 bg-blue-600 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-64 h-64 bg-blue-400 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl opacity-20"></div>
      </div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative w-full overflow-x-hidden">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 font-poppins">
            Contact Us
          </h2>
          <p className="text-sm text-gray-600 max-w-3xl mx-auto leading-relaxed font-poppins font-normal">
            Get in touch for customized parking solutions and expert support from our experienced team.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Contact Form - Full Width */}
          <div className="bg-white p-6 rounded-lg shadow-sm image-container w-full" data-aos="fade-right" data-aos-delay="200">
            <h3 className="text-lg font-bold text-gray-900 mb-3 font-poppins">
              Send us a Message
            </h3>
            
            <p className="text-gray-600 mb-5 text-sm font-poppins font-normal">
              Complete the form below with details about your parking solution requirements. Our technical 
              specialists will review your information and provide a detailed response with recommendations, 
              pricing estimates, and implementation timelines within 2 hours during business hours.
            </p>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700 font-poppins">Full Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Your full name"
                    required
                    disabled={isSubmitting}
                    className="mt-1 font-poppins font-normal"
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700 font-poppins">Email Address *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="your@email.com"
                    required
                    disabled={isSubmitting}
                    className="mt-1 font-poppins font-normal"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="message" className="text-sm font-medium text-gray-700 font-poppins">Project Details *</Label>
                <Textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  placeholder="Tell us about your parking solution requirements..."
                  rows={3}
                  required
                  disabled={isSubmitting}
                  className="mt-1 resize-none font-poppins font-normal"
                />
              </div>

              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full bg-tech-blue hover:bg-tech-blue/90 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-2 text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-300 font-poppins"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending Message...
                  </>
                ) : (
                  'Send Message'
                )}
              </Button>
            </form>
          </div>
        </div>


      </div>

      {/* AI Call Modal */}
      <AICallModal
        isOpen={isAICallModalOpen}
        onClose={() => setIsAICallModalOpen(false)}
        customerName={formData.name}
        customerPhone=""
      />
    </section>
  );
};

export default Contact;
