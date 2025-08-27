import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { useToast } from '../hooks/use-toast';
import { aiCallService } from '../services/aiCallService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from './ui/dialog';
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Loader2,
  User,
  Clock
} from 'lucide-react';

interface RealTimeCallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CallStatus {
  sessionId?: string;
  phoneNumber?: string;
  status: 'idle' | 'initiating' | 'ringing' | 'connected' | 'ended' | 'failed';
  startTime?: Date;
  duration?: number;
}

const RealTimeCallModal = ({ isOpen, onClose }: RealTimeCallModalProps) => {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callStatus, setCallStatus] = useState<CallStatus>({ status: 'idle' });
  const [isProcessing, setIsProcessing] = useState(false);

  // Listen for call status updates
  useEffect(() => {
    const handleCallStatus = (data: { sessionId?: string; phoneNumber?: string; status: string }) => {
      setCallStatus(prev => ({
        ...prev,
        sessionId: data.sessionId,
        phoneNumber: data.phoneNumber,
        status: data.status === 'initiated' ? 'ringing' : data.status as CallStatus['status']
      }));
    };

    // Listen for real-time call status updates
    aiCallService.onAdminUpdate('call-status-changed', handleCallStatus);

    return () => {
      aiCallService.offAdminUpdate('call-status-changed', handleCallStatus);
    };
  }, []);

  // Format phone number
  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
    }
    return phone;
  };

  // Handle call initiation
  const handleInitiateCall = async () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Phone Number Required",
        description: "Please enter your phone number to receive a call from our agent.",
        variant: "destructive"
      });
      return;
    }

    // Basic phone validation
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid 10-digit phone number.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setCallStatus({ status: 'initiating', phoneNumber });

    try {
      const result = await aiCallService.initiatePhoneCall(phoneNumber);
      
      if (result.success) {
        toast({
          title: "Call Initiated! 📞",
          description: `Our agent will call you at ${formatPhoneNumber(phoneNumber)} within 30 seconds.`,
          duration: 5000
        });
        
        setCallStatus({
          sessionId: result.sessionId,
          phoneNumber,
          status: 'ringing',
          startTime: new Date()
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error('❌ Failed to initiate call:', error);
      toast({
        title: "Call Failed",
        description: error.message || "Failed to initiate call. Please try again.",
        variant: "destructive"
      });
      setCallStatus({ status: 'failed', phoneNumber });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle call end
  const handleEndCall = () => {
    setCallStatus({ status: 'ended' });
    setTimeout(() => {
      resetCall();
    }, 2000);
  };

  // Reset call state
  const resetCall = () => {
    setCallStatus({ status: 'idle' });
    setPhoneNumber('');
    onClose();
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get current duration
  const getCurrentDuration = () => {
    if (!callStatus.startTime) return '00:00';
    const duration = Math.floor((new Date().getTime() - callStatus.startTime.getTime()) / 1000);
    return formatDuration(duration);
  };

  return (
    <Dialog open={isOpen} onOpenChange={resetCall}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-full">
              <Phone className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {callStatus.status === 'idle' ? '📞 Talk to AI Expert' : 'Call Status'}
              </DialogTitle>
              <DialogDescription>
                {callStatus.status === 'idle' 
                  ? 'Get instant answers from our parking solutions expert'
                  : 'Real-time call with our AI agent'
                }
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {callStatus.status === 'idle' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">🚀 How it works:</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Enter your phone number</li>
                  <li>• Our AI expert will call you instantly</li>
                  <li>• Get real-time answers about parking solutions</li>
                  <li>• No waiting, no chatbots - real conversation</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Phone Number *</label>
                <Input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isProcessing}
                  className="text-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  We'll call you within 30 seconds
                </p>
              </div>

              <Button
                onClick={handleInitiateCall}
                disabled={isProcessing || !phoneNumber.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 py-3 text-lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Initiating Call...
                  </>
                ) : (
                  <>
                    <PhoneCall className="h-4 w-4 mr-2" />
                    Call Me Now
                  </>
                )}
              </Button>
            </div>
          )}

          {callStatus.status === 'initiating' && (
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
              <div>
                <p className="font-semibold">Initiating call...</p>
                <p className="text-sm text-gray-600">
                  Connecting to {formatPhoneNumber(callStatus.phoneNumber || '')}
                </p>
              </div>
            </div>
          )}

          {callStatus.status === 'ringing' && (
            <div className="text-center space-y-4">
              <div className="relative">
                <Phone className="h-12 w-12 mx-auto text-green-600 animate-pulse" />
                <div className="absolute inset-0 animate-ping">
                  <Phone className="h-12 w-12 mx-auto text-green-400 opacity-75" />
                </div>
              </div>
              <div>
                <p className="font-semibold text-lg">Ringing...</p>
                <p className="text-sm text-gray-600">
                  Your phone should be ringing now
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {formatPhoneNumber(callStatus.phoneNumber || '')}
                </p>
              </div>
            </div>
          )}

          {callStatus.status === 'connected' && (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                <User className="h-8 w-8 text-green-600" />
                <Badge variant="default" className="bg-green-600">
                  Connected
                </Badge>
              </div>
              <div>
                <p className="font-semibold">Call Connected</p>
                <p className="text-sm text-gray-600">
                  Duration: {getCurrentDuration()}
                </p>
              </div>
            </div>
          )}

          {callStatus.status === 'failed' && (
            <div className="text-center space-y-4">
              <PhoneOff className="h-12 w-12 mx-auto text-red-600" />
              <div>
                <p className="font-semibold text-red-600">Call Failed</p>
                <p className="text-sm text-gray-600">
                  Unable to connect. Please try again.
                </p>
              </div>
              <Button
                onClick={() => setCallStatus({ status: 'idle' })}
                variant="outline"
              >
                Try Again
              </Button>
            </div>
          )}

          {callStatus.status === 'ended' && (
            <div className="text-center space-y-4">
              <PhoneOff className="h-12 w-12 mx-auto text-gray-600" />
              <div>
                <p className="font-semibold">Call Ended</p>
                <p className="text-sm text-gray-600">
                  Thank you for your time!
                </p>
              </div>
            </div>
          )}
        </div>

        {callStatus.status !== 'idle' && callStatus.status !== 'ended' && (
          <div className="flex justify-center pt-4">
            <Button
              onClick={handleEndCall}
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
            >
              <PhoneOff className="h-4 w-4 mr-2" />
              End Call
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RealTimeCallModal;
