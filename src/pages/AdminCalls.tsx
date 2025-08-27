import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminCallDashboard from '../components/AdminCallDashboard';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useToast } from '../hooks/use-toast';
import { Shield, Eye, EyeOff } from 'lucide-react';

const AdminCalls = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Simple admin authentication - replace with your actual auth system
  const ADMIN_PASSWORD = 'vayaccess2024'; // Change this to a secure password

  useEffect(() => {
    // Check if already authenticated in this session
    const adminAuth = sessionStorage.getItem('vayaccess_admin_auth');
    if (adminAuth === 'authenticated') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('vayaccess_admin_auth', 'authenticated');
      toast({
        title: "Access Granted 🎉",
        description: "Welcome to VayAccess AI Call Dashboard",
        duration: 3000
      });
    } else {
      toast({
        title: "Access Denied",
        description: "Invalid password. Please try again.",
        variant: "destructive"
      });
      setPassword('');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('vayaccess_admin_auth');
    setPassword('');
    toast({
      title: "Logged Out",
      description: "You have been logged out successfully.",
      duration: 2000
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div>
              <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                Admin Access Required
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                Enter admin password to access AI Call Dashboard
              </p>
            </div>
            
            <form className="mt-8 space-y-6" onSubmit={handleLogin}>
              <div>
                <label htmlFor="password" className="sr-only">
                  Admin Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                    placeholder="Admin password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <Button
                  type="submit"
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Access Dashboard
                </Button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="text-blue-600 hover:text-blue-500 text-sm"
                >
                  ← Back to Homepage
                </button>
              </div>
            </form>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                <strong>Demo Mode:</strong> This is a simplified authentication for demo purposes. 
                In production, implement proper authentication with JWT tokens, role-based access control, 
                and secure session management.
              </p>
            </div>
          </div>
        </div>
        
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {/* Admin Header */}
        <div className="mb-6 flex justify-between items-center bg-white rounded-lg shadow-sm p-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">VayAccess Admin Panel</h1>
            <p className="text-gray-600">AI Call Agent Dashboard & Management</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500">
              Session: Active
            </div>
            <Button 
              onClick={handleLogout}
              variant="outline"
              size="sm"
            >
              Logout
            </Button>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900">Admin Dashboard Access</h3>
              <p className="text-sm text-blue-800 mt-1">
                You have administrative access to view all AI call recordings, conversation transcripts, 
                and customer interaction analytics. This information is confidential and should be handled 
                according to your data privacy policies.
              </p>
            </div>
          </div>
        </div>

        {/* Main Dashboard */}
        <AdminCallDashboard />
        
        {/* Additional Admin Features */}
        <div className="mt-8 grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">AI Call Service</span>
                <span className="text-sm text-green-600 font-medium">🟢 Online</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Voice Recognition</span>
                <span className="text-sm text-green-600 font-medium">🟢 Active</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Recording System</span>
                <span className="text-sm text-green-600 font-medium">🟢 Recording</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Database</span>
                <span className="text-sm text-green-600 font-medium">🟢 Connected</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => window.location.reload()}
              >
                🔄 Refresh Dashboard
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => toast({
                  title: "Export Started",
                  description: "Downloading call data...",
                  duration: 3000
                })}
              >
                📊 Export Call Data
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => navigate('/admin/settings')}
              >
                ⚙️ System Settings
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default AdminCalls;