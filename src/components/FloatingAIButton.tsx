import { useState } from 'react';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import AICallModal from './AICallModal';
import AIExpertModal from './AIExpertModal';
import { Bot, MessageCircle, Headphones } from 'lucide-react';

const FloatingAIButton = () => {
  const { toast } = useToast();
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isAIExpertModalOpen, setIsAIExpertModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleStartAICall = () => {
    setIsAIExpertModalOpen(true);  // Use AI Expert with Groq API
    setIsExpanded(false);
    
    // Track engagement
    toast({
      title: " Chat Started!",
      description: "Ask me about access control systems",
      duration: 2000
    });
  };

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="relative">
          {/* Tooltip popup */}
          {isExpanded && (
            <div className="absolute bottom-16 right-0 mb-2 bg-white rounded-lg shadow-lg border p-3 w-56 animate-in slide-in-from-bottom-2">
              <div className="text-center">
                <p className="text-sm text-gray-700 font-medium">Ask me about access control systems</p>
              </div>
            </div>
          )}

          {/* Main floating button */}
          <Button
            onClick={handleStartAICall}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setTimeout(() => setIsExpanded(false), 1500)}
            className="h-14 w-14 rounded-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-300 animate-pulse"
          >
            <MessageCircle className="h-6 w-6 text-white" />
          </Button>

          {/* AI notification dot */}
          <div className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
            <span className="text-xs text-white font-bold">AI</span>
          </div>
        </div>
      </div>

      {/* AI Expert Modal with Groq API */}
      <AIExpertModal
        isOpen={isAIExpertModalOpen}
        onClose={() => setIsAIExpertModalOpen(false)}
      />
      
      {/* Original AI Call Modal (for future paid version) */}
      <AICallModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
      />
    </>
  );
};

export default FloatingAIButton;
