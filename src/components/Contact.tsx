import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  MapPin, 
  Phone, 
  Mail, 
  Clock,
  MessageSquare,
  Send,
  CheckCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Contact = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Message Sent!",
      description: "Thank you for your inquiry. We'll get back to you within 24 hours.",
    });
    setFormData({ name: '', email: '', message: '' });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const contactInfo = [
    {
      icon: <MapPin className="h-5 w-5" />,
      title: "Corporate Office",
      details: [
        "Plot No. 26, Road No.1, West Gandhi Nagar",
        "Rampally X Road, Nagaram, Keesara (M)",
        "Hyderabad - 500083, TS, India"
      ]
    },
    {
      icon: <MapPin className="h-5 w-5" />,
      title: "Factory",
      details: [
        "Plot No. 34, TIF MSME Green Industrial Park",
        "Dandumalkapur(V), Choutuppal (M)",
        "Yadagiri District, Telangana, India - 508252"
      ]
    },
    {
      icon: <Phone className="h-5 w-5" />,
      title: "Phone Numbers",
      details: [
        "Corporate: +91 720 724 4344",
        "Factory: +91 915 470 3116",
        "Support: +91 800 123 4567"
      ]
    },
    {
      icon: <Mail className="h-5 w-5" />,
      title: "Email Addresses",
      details: [
        "info@parkvisionpro.com",
        "sales@parkvisionpro.com",
        "support@parkvisionpro.com"
      ]
    }
  ];

  const businessHours = [
    { day: "Monday - Friday", time: "09:00 AM - 06:00 PM" },
    { day: "Saturday", time: "09:00 AM - 02:00 PM" },
    { day: "Sunday", time: "Closed" },
    { day: "Emergency Support", time: "24/7 Available" }
  ];

  return (
    <section id="contact" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-tech-blue/10 text-tech-blue border-tech-blue/20">
            Contact Us
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Get In Touch
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Ready to transform your parking infrastructure? Drop us a line and our experts 
            will get back to you with a customized solution for your needs.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-12">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-xl bg-card">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-2xl">
                  <MessageSquare className="h-6 w-6 text-tech-blue" />
                  <span>Send us a Message</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name *</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="Enter your full name"
                        required
                        className="border-tech-gray-light focus:border-tech-blue"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="Enter your email"
                        required
                        className="border-tech-gray-light focus:border-tech-blue"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="message">Message *</Label>
                    <Textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      placeholder="Tell us about your parking solution requirements..."
                      rows={6}
                      required
                      className="border-tech-gray-light focus:border-tech-blue resize-none"
                    />
                  </div>

                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success-green" />
                    <span>We respect your privacy and will never share your information</span>
                  </div>

                  <Button 
                    type="submit" 
                    size="lg"
                    className="w-full bg-gradient-to-r from-tech-blue to-tech-blue-light hover:opacity-90"
                  >
                    Send Message
                    <Send className="ml-2 h-4 w-4" />
                  </Button>
                </form>

                {/* WhatsApp Button */}
                <div className="mt-6 pt-6 border-t">
                  <Button 
                    variant="outline"
                    size="lg"
                    className="w-full border-success-green text-success-green hover:bg-success-green hover:text-white"
                  >
                    <MessageSquare className="mr-2 h-5 w-5" />
                    Message us on WhatsApp
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Contact Information */}
          <div className="space-y-8">
            {/* Contact Details */}
            <div className="space-y-6">
              {contactInfo.map((info, index) => (
                <Card key={index} className="border-0 bg-tech-gray-light">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 bg-tech-blue/10 rounded-lg flex items-center justify-center text-tech-blue mt-1">
                        {info.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground mb-2">{info.title}</h3>
                        <div className="space-y-1">
                          {info.details.map((detail, detailIndex) => (
                            <p key={detailIndex} className="text-sm text-muted-foreground">
                              {detail}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Business Hours */}
            <Card className="border-0 bg-tech-gray-light">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="h-5 w-5 text-tech-blue" />
                  <span>Business Hours</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {businessHours.map((hour, index) => (
                  <div key={index} className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium text-foreground">{hour.day}</span>
                    <span className="text-sm text-muted-foreground">{hour.time}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Response Promise */}
            <Card className="border-0 bg-gradient-to-br from-tech-blue/5 to-tech-blue-light/5 border-tech-blue/20">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-tech-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-tech-blue" />
                </div>
                <h3 className="font-bold text-foreground mb-2">Quick Response Guarantee</h3>
                <p className="text-sm text-muted-foreground">
                  We respond to all inquiries within 24 hours during business days. 
                  Emergency support is available 24/7 for existing customers.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;