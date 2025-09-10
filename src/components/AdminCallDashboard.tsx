import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { useToast } from '../hooks/use-toast';
import { aiCallService, CallRecording, CallStatistics } from '../services/aiCallService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Phone,
  User,
  Bot,
  Clock,
  Search,
  Eye,
  Download,
  Calendar,
  TrendingUp,
  Users,
  MessageCircle,
  Filter,
  RefreshCw,
  BarChart3
} from 'lucide-react';

interface CallDetailsModalProps {
  recording: CallRecording | null;
  isOpen: boolean;
  onClose: () => void;
}

const CallDetailsModal = ({ recording, isOpen, onClose }: CallDetailsModalProps) => {
  if (!recording) return null;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-blue-600" />
            Call Recording Details
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Call metadata */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-600">Customer Phone</label>
                <p className="text-lg font-semibold">{recording.customerPhone}</p>
              </div>
              {recording.customerName && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Customer Name</label>
                  <p className="text-lg font-semibold">{recording.customerName}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-600">Session ID</label>
                <p className="text-sm font-mono bg-gray-100 p-2 rounded">{recording.sessionId}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-600">Call Duration</label>
                <p className="text-lg font-semibold">
                  {recording.duration ? formatDuration(recording.duration) : 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Started</label>
                <p className="text-sm">{new Date(recording.startTime).toLocaleString()}</p>
              </div>
              {recording.endTime && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Ended</label>
                  <p className="text-sm">{new Date(recording.endTime).toLocaleString()}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-600">Status</label>
                <Badge 
                  variant={recording.status === 'completed' ? 'default' : 'secondary'}
                  className="ml-2"
                >
                  {recording.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* Call summary */}
          {recording.summary && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2"> Call Summary</h3>
              <p className="text-blue-800 leading-relaxed">{recording.summary}</p>
            </div>
          )}

          {/* Conversation history */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Full Conversation ({recording.conversationHistory.length} messages)
            </h3>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recording.conversationHistory.map((msg, index) => (
                <div
                  key={index}
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
                    <div className={`inline-block p-3 rounded-lg text-sm ${
                      msg.speaker === 'customer'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-200'
                    }`}>
                      <p className="leading-relaxed">{msg.message}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            onClick={() => {
              const dataStr = JSON.stringify(recording, null, 2);
              const dataBlob = new Blob([dataStr], { type: 'application/json' });
              const url = URL.createObjectURL(dataBlob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `call_recording_${recording.sessionId}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            Download JSON
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AdminCallDashboard = () => {
  const { toast } = useToast();
  const [recordings, setRecordings] = useState<CallRecording[]>([]);
  const [statistics, setStatistics] = useState<CallStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRecording, setSelectedRecording] = useState<CallRecording | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Load data on component mount
  useEffect(() => {
    loadDashboardData();
    
    // Set up real-time updates
    aiCallService.onAdminUpdate('new-call-initialized', handleNewCall);
    aiCallService.onAdminUpdate('call-ended', handleCallEnded);
    aiCallService.onAdminUpdate('call-conversation-update', handleConversationUpdate);

    return () => {
      aiCallService.offAdminUpdate('new-call-initialized');
      aiCallService.offAdminUpdate('call-ended');
      aiCallService.offAdminUpdate('call-conversation-update');
    };
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [recordingsResult, statsResult] = await Promise.all([
        aiCallService.getCallRecordings(),
        aiCallService.getCallStatistics()
      ]);

      if (recordingsResult.success) {
        setRecordings(recordingsResult.recordings || []);
      } else {
        throw new Error(recordingsResult.error);
      }

      if (statsResult.success) {
        setStatistics(statsResult.statistics || null);
      }

    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
      toast({
        title: "Load Error",
        description: error.message || "Failed to load call recordings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewCall = (data: any) => {
    console.log('New call initialized:', data);
    toast({
      title: "New Call Started ",
      description: `Customer ${data.customerPhone} started an AI call session`,
      duration: 5000
    });
  };

  const handleCallEnded = (data: any) => {
    console.log('Call ended:', data);
    toast({
      title: "Call Completed ",
      description: `Call session ${data.sessionId.split('_')[1]} has ended`,
      duration: 5000
    });
    
    // Refresh the recordings list
    loadDashboardData();
  };

  const handleConversationUpdate = (data: any) => {
    console.log('Conversation update:', data);
    // Could show real-time conversation updates here
  };

  const handleViewDetails = (recording: CallRecording) => {
    setSelectedRecording(recording);
    setIsDetailsModalOpen(true);
  };

  const handleRefresh = () => {
    loadDashboardData();
    toast({
      title: "Refreshed",
      description: "Dashboard data has been updated",
      duration: 2000
    });
  };

  // Filter recordings based on search and status
  const filteredRecordings = recordings.filter(recording => {
    const matchesSearch = searchTerm === '' || 
      recording.customerPhone.includes(searchTerm) ||
      recording.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      recording.sessionId.includes(searchTerm);
    
    const matchesStatus = filterStatus === 'all' || recording.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'active': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading call recordings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900"> AI Call Dashboard</h1>
          <p className="text-gray-600">Monitor and manage AI call agent interactions</p>
        </div>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-full">
                <Phone className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{statistics.totalCalls}</p>
                <p className="text-sm text-gray-600">Total Calls</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-full">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{statistics.todayCalls}</p>
                <p className="text-sm text-gray-600">Today's Calls</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-yellow-100 rounded-full">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatDuration(Math.round(statistics.averageDuration))}
                </p>
                <p className="text-sm text-gray-600">Avg Duration</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-full">
                <BarChart3 className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{statistics.callsThisWeek}</p>
                <p className="text-sm text-gray-600">This Week</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search by phone, name, or session ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="active">Active</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Recordings Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Messages</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecordings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  {searchTerm || filterStatus !== 'all' 
                    ? 'No recordings match your filters'
                    : 'No call recordings yet'
                  }
                </TableCell>
              </TableRow>
            ) : (
              filteredRecordings.map((recording) => (
                <TableRow key={recording.sessionId}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{recording.customerPhone}</p>
                      {recording.customerName && (
                        <p className="text-sm text-gray-600">{recording.customerName}</p>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      {recording.duration ? formatDuration(recording.duration) : 'N/A'}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <Badge className={getStatusColor(recording.status)}>
                      {recording.status}
                    </Badge>
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm">
                      <p>{new Date(recording.startTime).toLocaleDateString()}</p>
                      <p className="text-gray-500">
                        {new Date(recording.startTime).toLocaleTimeString()}
                      </p>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-gray-400" />
                      {recording.conversationHistory.length}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewDetails(recording)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Call Details Modal */}
      <CallDetailsModal
        recording={selectedRecording}
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedRecording(null);
        }}
      />
    </div>
  );
};

export default AdminCallDashboard;
