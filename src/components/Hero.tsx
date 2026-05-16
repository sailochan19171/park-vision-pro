import { Button } from "./ui/button";
import { Car, Scan, CheckCircle } from "lucide-react";
import vay3DModel from "../assets/vay-3d-model.jpg";
import { useToast } from "../hooks/use-toast";

const Hero = () => {
  const { toast } = useToast();

  const triggerBrochureDownload = () => {
    const link = document.createElement('a');
    link.href = '/vay-gate-brochure.pdf';
    link.download = 'VAY-Access-Control-Brochure.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section id="home" className="relative bg-gradient-to-br from-gray-50 via-white to-blue-50/30 scroll-mt-20 py-12 md:py-16 lg:py-20 overflow-hidden">
      {/* Background Pattern */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
                           radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 40% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)`,
        }}
      />

      {/* Main Content */}
      <div className="relative z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-10 md:gap-12 lg:gap-16 items-center">
            
            {/* Left Column - Content */}
            <div className="space-y-8">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-blue-50/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700 backdrop-blur-sm" data-aos="fade-up">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                Smart Access Systems
              </div>

              {/* Main Heading */}
              <div className="space-y-1">
                <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 leading-[1.05] tracking-tight font-poppins">
                  Vay Access
                </h1>
                <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.05] tracking-tight font-poppins">
                  <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 bg-clip-text text-transparent">
                    Control Systems
                  </span>
                </h1>
              </div>

              {/* Subtitle */}
              <div className="flex items-center gap-3">
                <span className="h-px w-10 bg-gradient-to-r from-blue-600 to-transparent"></span>
                <h2 className="text-2xl lg:text-3xl font-semibold text-gray-800 font-poppins">
                  Industry Experts
                </h2>
              </div>

              {/* Description */}
              <div className="space-y-4 text-gray-600 text-base leading-relaxed font-poppins font-normal max-w-xl" data-aos="fade-up" data-aos-delay="400">
                <p>
                  Building tomorrow's infrastructure with our cutting-edge vehicular access management solutions. Transform your parking operations, enhance security, and provide effortless convenience to your users.
                </p>
                <p className="text-blue-700 font-semibold font-poppins">
                  Engineering the future of smart parking today.
                </p>
              </div>

              {/* Features */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-8" data-aos="fade-up" data-aos-delay="500">
                {[
                  { Icon: Scan, title: "Smart Automation", desc: "AI-powered solutions", delay: 600 },
                  { Icon: CheckCircle, title: "Secure Access", desc: "99.9% reliability", delay: 700 },
                  { Icon: Car, title: "User Friendly", desc: "Intuitive interface", delay: 800 },
                ].map(({ Icon, title, desc, delay }) => (
                  <div key={title} className="text-center group cursor-default" data-aos="zoom-in" data-aos-delay={delay}>
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-blue-100 ring-1 ring-blue-200/50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-blue-300/70">
                      <Icon className="w-7 h-7 text-blue-600 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1 text-base font-poppins">{title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed font-poppins font-normal">{desc}</p>
                  </div>
                ))}
              </div>

              {/* Brochure Request Form (stacked, responsive) */}
              <div className="pt-0" data-aos="fade-up" data-aos-delay="550">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget as HTMLFormElement;
                    const fd = new FormData(form);
                    const name = String(fd.get('name') || '').trim();
                    const email = String(fd.get('email') || '').trim();
                    const phone = String(fd.get('phone') || '').trim();
                    const countryCode = String(fd.get('countryCode') || '').trim();
                    const city = String(fd.get('city') || '').trim();
                    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;

                    if (!name || !/[^@\s]+@[^@\s]+\.[^@\s]+/.test(email) || !phone || !city) {
                      toast({
                        title: 'Missing information',
                        description: 'Please enter your name, a valid email, phone, and city.',
                        variant: 'destructive',
                      });
                      return;
                    }

                    if (submitBtn) submitBtn.disabled = true;
                    const payload = {
                      name,
                      email,
                      phone: countryCode ? `${countryCode} ${phone}` : phone,
                      city,
                    };

                    try {
                      // POST to the Vercel serverless function which uses Resend to
                      // send the brochure PDF as a real attachment to both the
                      // visitor and info@vayaccess.com.
                      const res = await fetch('/api/send-brochure', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                      });
                      const json = await res.json().catch(() => ({ ok: res.ok }));

                      // Always trigger the local download too — the visitor gets the
                      // file immediately regardless of email delivery status.
                      triggerBrochureDownload();

                      if (res.ok && json.ok) {
                        toast({
                          title: 'Brochure sent!',
                          description: `Thanks ${name}! The brochure PDF has been emailed to ${email} and downloaded to your device.`,
                        });
                        form.reset();
                      } else {
                        toast({
                          title: 'Brochure downloaded',
                          description: json?.error
                            ? `Saved to your device. Email send failed: ${json.error}`
                            : 'Saved to your device. We could not reach our email service right now.',
                          variant: 'destructive',
                        });
                      }
                    } catch (err) {
                      triggerBrochureDownload();
                      toast({
                        title: 'Brochure downloaded',
                        description: 'Saved to your device. Network issue while sending emails.',
                        variant: 'destructive',
                      });
                    } finally {
                      if (submitBtn) submitBtn.disabled = false;
                    }
                  }}
                  className="w-full max-w-lg bg-white/95 backdrop-blur-md rounded-2xl p-5 border border-gray-200/70 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] flex flex-col gap-3"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input name="name" required placeholder="Full Name" className="border border-gray-200 rounded-lg px-3 py-2.5 bg-white text-sm placeholder:text-gray-400 transition focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                    <input name="email" required type="email" placeholder="Email" className="border border-gray-200 rounded-lg px-3 py-2.5 bg-white text-sm placeholder:text-gray-400 transition focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex gap-2 min-w-0">
                      <select name="countryCode" defaultValue="+91" className="w-28 min-w-24 shrink-0 border border-gray-200 rounded-lg px-3 py-2.5 bg-white text-sm transition focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                        <option value="+1">+1 (US)</option>
                        <option value="+44">+44 (UK)</option>
                        <option value="+61">+61 (AU)</option>
                        <option value="+65">+65 (SG)</option>
                        <option value="+91">+91 (IN)</option>
                        <option value="+971">+971 (AE)</option>
                      </select>
                      <input name="phone" required placeholder="Phone Number" className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 bg-white text-sm placeholder:text-gray-400 transition focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                    </div>
                    <div className="flex gap-2 min-w-0">
                      <input
                        name="city"
                        required
                        placeholder="City (type to search)"
                        list="city-options"
                        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 bg-white text-sm placeholder:text-gray-400 transition focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <datalist id="city-options">
                        <option value="Hyderabad" />
                        <option value="Bengaluru" />
                        <option value="Mumbai" />
                        <option value="Delhi" />
                        <option value="Chennai" />
                        <option value="Pune" />
                      </datalist>
                    </div>
                  </div>
                  <div className="flex justify-start pt-1">
                    <Button type="submit" size="lg" className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 text-base font-semibold rounded-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                      Send Brochure
                    </Button>
                  </div>
                </form>
              </div>

            </div>

            {/* Right Column - 3D VAY Access Control System */}
            <div className="relative mt-10 lg:mt-0">
              {/* Soft glow halo behind container */}
              <div className="absolute -inset-6 bg-gradient-to-tr from-blue-200/30 via-transparent to-blue-100/40 blur-2xl rounded-[3rem] pointer-events-none"></div>

              {/* 3D Model Container */}
              <div className="relative w-full h-[360px] sm:h-[420px] md:h-[480px] lg:h-[520px] xl:h-[560px] bg-gradient-to-br from-gray-50 via-white to-blue-50/40 rounded-[2rem] overflow-hidden border border-gray-200/70 shadow-[0_25px_60px_-20px_rgba(15,23,42,0.18)]">

                {/* Polished Inner Highlight */}
                <div className="absolute inset-1 rounded-[1.75rem] border border-white/50 pointer-events-none"></div>

                {/* 3D Model Image */}
                <div className="relative w-full h-full flex items-center justify-center p-6 lg:p-5">
                  <div className="relative w-full h-full max-w-md mx-auto -translate-y-2 lg:-translate-y-3">
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