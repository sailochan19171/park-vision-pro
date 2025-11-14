import React, { useState } from "react";
import { X, CheckCircle } from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";

interface BrochureRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName?: string;
}

const BrochureRequestModal: React.FC<BrochureRequestModalProps> = ({
  isOpen,
  onClose,
  productName = "General Brochure",
}) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    city: "",
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.fullName.trim() || !formData.email.trim() || !formData.phone.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in your full name, email and phone number.",
        variant: "destructive",
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    // Optional: enforce +91 format lightly
    const phone = formData.phone.trim();
    if (!/^\+?91[\s-]?\d{10}$/.test(phone) && !/^\d{10}$/.test(phone)) {
      toast({
        title: "+91 Phone Format",
        description: "Please enter a valid 10-digit phone or prefix with +91.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = (import.meta.env as any).VITE_FORMSPREE_ENDPOINT || 'https://formspree.io/f/meorqoaq';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          form: 'brochure',
          _subject: `Brochure Request: ${productName}`,
          product: productName,
          fullName: formData.fullName,
          email: formData.email,
          phone: phone.startsWith('+') ? phone : `+91 ${phone}`,
          city: formData.city,
        }),
      });

      const json = await res.json().catch(() => ({ ok: res.ok }));
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`);

      toast({
        title: "Brochure Request Sent!",
        description: "We will email you the brochure shortly.",
      });

      setFormData({ fullName: "", email: "", phone: "", city: "" });
      setTimeout(() => onClose(), 900);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send brochure request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Send Brochure</h2>
            <p className="text-gray-600 mt-1">Product: {productName}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your full name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">+91 (IN) Phone Number *</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+91 9876543210 or 9876543210"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">City (type to search)</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Start typing your city"
                list="cities"
              />
              {/* Simple starter datalist; can be expanded */}
              <datalist id="cities">
                <option value="Mumbai" />
                <option value="Delhi" />
                <option value="Bengaluru" />
                <option value="Hyderabad" />
                <option value="Chennai" />
                <option value="Pune" />
                <option value="Ahmedabad" />
                <option value="Kolkata" />
              </datalist>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6">
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Send Brochure
                </span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BrochureRequestModal;