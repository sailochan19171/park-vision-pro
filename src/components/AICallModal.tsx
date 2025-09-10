import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { useToast } from '../hooks/use-toast';
import { aiCallService, CallSession } from '../services/aiCallService';
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
  Mic,
  MicOff,
  MessageCircle,
  User,
  Bot,
  Loader2,
  PhoneOff,
  Volume2,
  Send
} from 'lucide-react';

interface AICallModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerPhone?: string;
  customerName?: string;
}

interface Message {
  id: string;
  speaker: 'customer' | 'ai_agent';
  message: string;
  timestamp: Date;
}

const AICallModal = ({ isOpen, onClose, customerPhone = '', customerName = '' }: AICallModalProps) => {
  const { toast } = useToast();
  const [currentSession, setCurrentSession] = useState<CallSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [callMode, setCallMode] = useState<'voice' | 'text'>('voice');
  const [phone, setPhone] = useState(customerPhone);
  const [name, setName] = useState(customerName);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout>();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle recording timer
  useEffect(() => {
    if (isRecording) {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      setRecordingTime(0);
    }

    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [isRecording]);

  // Initialize call session
  const handleStartCall = async () => {
    if (!phone.trim()) {
      toast({
        title: "Phone Number Required",
        description: "Please enter your phone number to start the call.",
        variant: "destructive"
      });
      return;
    }

    setIsConnecting(true);

    try {
      const result = await aiCallService.initializeCall(phone, name || undefined);

      if (result.success && result.sessionId) {
        const session = aiCallService.getCurrentSession();
        setCurrentSession(session);
        setIsCallActive(true);
        
        // Add welcome message
        const welcomeMessage: Message = {
          id: `msg_${Date.now()}`,
          speaker: 'ai_agent',
          message: `Hello ${name || 'there'}! I'm your AI assistant from VayAccess Parking Solutions. How can I help you with your parking solution needs today?`,
          timestamp: new Date()
        };
        
        setMessages([welcomeMessage]);

        toast({
          title: "Call Connected! ",
          description: "You're now connected with our AI parking solutions expert.",
          duration: 3000
        });

      } else {
        throw new Error(result.message);
      }

    } catch (error: any) {
      console.error('Failed to start call:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to our AI agent. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // Send text message
  const handleSendMessage = async () => {
    if (!textInput.trim() || !currentSession || isSendingMessage) {
      return;
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      speaker: 'customer',
      message: textInput.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setTextInput('');
    setIsSendingMessage(true);

    try {
      const result = await aiCallService.sendMessage(userMessage.message);

      if (result.success && result.response) {
        const aiMessage: Message = {
          id: `msg_${Date.now() + 1}`,
          speaker: 'ai_agent',
          message: result.response,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error(result.error || 'Failed to get response');
      }

    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast({
        title: "Message Failed",
        description: "Failed to send your message. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Start voice recording
  const handleStartRecording = async () => {
    if (!currentSession) return;

    try {
      const result = await aiCallService.startVoiceRecording();
      
      if (result.success) {
        setIsRecording(true);
        toast({
          title: "Recording Started ",
          description: "Speak now... I'm listening!",
          duration: 2000
        });
      } else {
        throw new Error(result.message);
      }

    } catch (error: any) {
      console.error('Failed to start recording:', error);
      toast({
        title: "Recording Failed",
        description: error.message || "Failed to start voice recording.",
        variant: "destructive"
      });
    }
  };

  // Stop voice recording
  const handleStopRecording = async () => {
    if (!isRecording) return;

    try {
      setIsRecording(false);
      
      const result = await aiCallService.stopVoiceRecording();
      
      toast({
        title: "Processing Voice... ",
        description: "Converting your speech and generating response...",
        duration: 3000
      });

    } catch (error: any) {
      console.error('Failed to stop recording:', error);
      toast({
        title: "Recording Error",
        description: "Failed to process your voice recording.",
        variant: "destructive"
      });
    }
  };

  // End call session
  const handleEndCall = async () => {
    if (!currentSession) return;

    try {
      const result = await aiCallService.endCall();
      
      if (result.success) {
        toast({
          title: "Call Ended",
          description: "Thank you for contacting VayAccess! Your conversation has been recorded for quality purposes.",
          duration: 5000
        });
        
        // Reset modal state
        setCurrentSession(null);
        setIsCallActive(false);
        setMessages([]);
        setIsRecording(false);
        setRecordingTime(0);
        
        // Close modal after a brief delay
        setTimeout(() => {
          onClose();
        }, 2000);
      }

    } catch (error: any) {
      console.error('Failed to end call:', error);
      toast({
        title: "Error",
        description: "There was an issue ending the call, but it has been logged.",
        variant: "destructive"
      });
    }
  };

  // Format recording time
  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle Enter key in text input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-full">
              <PhoneCall className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {isCallActive ? ' Connected with AI Agent' : ' AI Parking Solutions Expert'}
              </DialogTitle>
              <DialogDescription>
                {isCallActive 
                  ? 'Real-time conversation with our AI parking solutions expert'
                  : 'Get instant answers about parking solutions, products, and services'
                }
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {!isCallActive ? (
            // Call setup form
            <div className="space-y-6 py-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2"> What to Expect:</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Instant answers about our parking solutions</li>
                  <li>• Product recommendations based on your needs</li>
                  <li>• Free consultation scheduling</li>
                  <li>• Technical support and guidance</li>
                </ul>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Phone Number *</label>
                  <Input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isConnecting}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Name (Optional)</label>
                  <Input
                    type="text"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isConnecting}
                  />
                </div>
              </div>

              <Button
                onClick={handleStartCall}
                disabled={isConnecting || !phone.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 py-3"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting to AI Agent...
                  </>
                ) : (
                  <>
                    <PhoneCall className="h-4 w-4 mr-2" />
                    Start AI Call Session
                  </>
                )}
              </Button>
            </div>
          ) : (
            // Active call interface
            <div className="flex-1 flex flex-col">
              {/* Call status bar */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-green-800 font-medium">Connected</span>
                    <Badge variant="secondary">{currentSession?.sessionId?.split('_')[1]}</Badge>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant={callMode === 'voice' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCallMode('voice')}
                    >
                      <Mic className="h-4 w-4 mr-1" />
                      Voice
                    </Button>
                    <Button
                      variant={callMode === 'text' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCallMode('text')}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      Text
                    </Button>
                  </div>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 bg-gray-50 rounded-lg p-4 overflow-y-auto min-h-[300px] max-h-[400px]">
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-3 ${
                        msg.speaker === 'customer' ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      <div className={`p-2 rounded-full ${
                        msg.speaker === 'customer' 
                          ? 'bg-blue-100' 
                          : 'bg-green-100'
                      }`}>
                        {msg.speaker === 'customer' ? (
                          <User className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Bot className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                      
                      <div className={`flex-1 max-w-[80%] ${
                        msg.speaker === 'customer' ? 'text-right' : 'text-left'
                      }`}>
                        <div className={`inline-block p-3 rounded-lg ${
                          msg.speaker === 'customer'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-gray-200'
                        }`}>
                          <p className="text-sm leading-relaxed">{msg.message}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {msg.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {isSendingMessage && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">AI is thinking...</span>
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} />
              </div>

              {/* Input controls */}
              <div className="mt-4 space-y-3">
                {callMode === 'voice' ? (
                  // Voice controls
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      onClick={isRecording ? handleStopRecording : handleStartRecording}
                      size="lg"
                      className={`${
                        isRecording
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                      } rounded-full h-16 w-16`}
                    >
                      {isRecording ? (
                        <MicOff className="h-6 w-6" />
                      ) : (
                        <Mic className="h-6 w-6" />
                      )}
                    </Button>
                    
                    {isRecording && (
                      <div className="flex items-center gap-2 text-red-600">
                        <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
                        <span className="font-mono">{formatRecordingTime(recordingTime)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  // Text controls
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type your message about parking solutions..."
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={isSendingMessage}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!textInput.trim() || isSendingMessage}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isSendingMessage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}

                {/* End call button */}
                <div className="flex justify-center pt-2">
                  <Button
                    onClick={handleEndCall}
                    variant="destructive"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700"
                  >
                    <PhoneOff className="h-4 w-4 mr-2" />
                    End Call
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recording instructions */}
        {isCallActive && callMode === 'voice' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
            <div className="flex items-center gap-2 text-yellow-800 text-sm">
              <Volume2 className="h-4 w-4" />
              {isRecording 
                ? " Recording... Click the red button when you're done speaking"
                : " Click the microphone button and speak your question about parking solutions"
              }
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AICallModal;
