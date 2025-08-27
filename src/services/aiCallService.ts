import { io, Socket } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export interface CallSession {
  sessionId: string;
  customerPhone: string;
  customerName?: string;
  startTime: Date;
  status: 'initiated' | 'active' | 'completed' | 'failed';
  conversationHistory: Array<{
    timestamp: Date;
    speaker: 'customer' | 'ai_agent';
    message: string;
  }>;
}

export interface CallRecording {
  sessionId: string;
  customerPhone: string;
  customerName?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  status: string;
  conversationHistory: Array<{
    timestamp: string;
    speaker: string;
    message: string;
  }>;
  summary?: string;
}

export interface CallStatistics {
  totalCalls: number;
  todayCalls: number;
  averageDuration: number;
  callsThisWeek: number;
}

class AICallService {
  private socket: Socket | null = null;
  private currentSession: CallSession | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;

  constructor() {
    this.initializeSocket();
  }

  // Initialize Socket.IO connection for real-time features
  private initializeSocket() {
    try {
      this.socket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
      });

      this.socket.on('connect', () => {
        console.log('🔌 Connected to AI Call Service');
      });

      this.socket.on('disconnect', () => {
        console.log('🔌 Disconnected from AI Call Service');
      });

      this.socket.on('call-status-changed', (data) => {
        console.log('📞 Call status changed:', data);
        // Handle real-time call status updates
      });

      this.socket.on('call-conversation-update', (data) => {
        console.log('💬 Conversation update:', data);
        // Handle real-time conversation updates
      });

    } catch (error) {
      console.error('❌ Failed to initialize socket connection:', error);
    }
  }

  // Initialize a new AI call session
  async initializeCall(customerPhone: string, customerName?: string): Promise<{ success: boolean; sessionId?: string; message: string }> {
    try {
      console.log(`📞 Initializing AI call for ${customerPhone}`);

      const response = await fetch(`${API_BASE_URL}/api/ai-call/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerPhone,
          customerName
        })
      });

      const result = await response.json();

      if (result.success) {
        this.currentSession = {
          sessionId: result.sessionId,
          customerPhone,
          customerName,
          startTime: new Date(),
          status: 'initiated',
          conversationHistory: []
        };

        // Join the call room for real-time updates
        if (this.socket) {
          this.socket.emit('join-call-room', result.sessionId);
        }
      }

      return result;

    } catch (error) {
      console.error('❌ Error initializing call:', error);
      return {
        success: false,
        message: 'Failed to initialize call. Please try again.'
      };
    }
  }

  // Send a text message to the AI agent and get response
  async sendMessage(message: string): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
      if (!this.currentSession) {
        throw new Error('No active call session');
      }

      console.log(`💬 Sending message: "${message}"`);

      const response = await fetch(`${API_BASE_URL}/api/ai-call/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          sessionId: this.currentSession.sessionId
        })
      });

      const result = await response.json();

      if (result.success) {
        // Update local conversation history
        this.currentSession.conversationHistory.push(
          {
            timestamp: new Date(),
            speaker: 'customer',
            message: message
          },
          {
            timestamp: new Date(),
            speaker: 'ai_agent',
            message: result.response
          }
        );
      }

      return result;

    } catch (error) {
      console.error('❌ Error sending message:', error);
      return {
        success: false,
        error: 'Failed to send message. Please try again.'
      };
    }
  }

  // Start voice recording
  async startVoiceRecording(): Promise<{ success: boolean; message: string }> {
    try {
      if (this.isRecording) {
        return { success: false, message: 'Recording is already in progress' };
      }

      // Request microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Initialize MediaRecorder
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];
      this.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        console.log('🎤 Voice recording stopped, processing...');
        await this.processVoiceRecording();
      };

      this.mediaRecorder.start();
      console.log('🎤 Voice recording started');

      return {
        success: true,
        message: 'Voice recording started. Speak now...'
      };

    } catch (error) {
      console.error('❌ Error starting voice recording:', error);
      return {
        success: false,
        message: 'Failed to start voice recording. Please check microphone permissions.'
      };
    }
  }

  // Stop voice recording and process it
  async stopVoiceRecording(): Promise<{ success: boolean; message: string; transcription?: string; aiResponse?: string }> {
    try {
      if (!this.isRecording || !this.mediaRecorder) {
        return { success: false, message: 'No active recording to stop' };
      }

      this.mediaRecorder.stop();
      this.isRecording = false;

      // Stop all tracks to release microphone
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());

      return {
        success: true,
        message: 'Recording stopped. Processing your voice...'
      };

    } catch (error) {
      console.error('❌ Error stopping voice recording:', error);
      return {
        success: false,
        message: 'Failed to stop voice recording'
      };
    }
  }

  // Process recorded voice audio
  private async processVoiceRecording(): Promise<void> {
    try {
      if (!this.currentSession || this.audioChunks.length === 0) {
        return;
      }

      // Create audio blob from recorded chunks
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      
      // Create form data for upload
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('sessionId', this.currentSession.sessionId);

      console.log('🎤 Sending audio for speech-to-text processing...');

      // Send to backend for speech-to-text processing
      const response = await fetch(`${API_BASE_URL}/api/ai-call/speech-to-text`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success && result.transcription) {
        console.log(`🎤 Transcription: "${result.transcription}"`);
        
        // Send transcribed text to AI agent
        const aiResponse = await this.sendMessage(result.transcription);
        
        if (aiResponse.success && aiResponse.response) {
          // Convert AI response to speech
          await this.playAIResponse(aiResponse.response);
        }
      }

    } catch (error) {
      console.error('❌ Error processing voice recording:', error);
    }
  }

  // Convert AI response to speech and play it
  async playAIResponse(text: string): Promise<void> {
    try {
      if (!this.currentSession) {
        return;
      }

      console.log('🔊 Converting AI response to speech...');

      const response = await fetch(`${API_BASE_URL}/api/ai-call/text-to-speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          sessionId: this.currentSession.sessionId
        })
      });

      const result = await response.json();

      if (result.success && result.audioUrl) {
        console.log('🔊 AI audio generated, playing...');
        
        // Create audio element and play
        const audio = new Audio(`${API_BASE_URL}${result.audioUrl}`);
        
        // Set audio properties for better playback
        audio.volume = 0.8;
        audio.preload = 'auto';
        
        // Handle audio events
        audio.onloadstart = () => {
          console.log('🔊 Starting to load audio...');
        };
        
        audio.oncanplay = () => {
          console.log('🔊 Audio ready, playing AI response...');
          audio.play().catch(e => {
            console.error('❌ Error playing audio:', e);
            // Fallback to speech synthesis if available
            this.fallbackToSpeechSynthesis(text);
          });
        };

        audio.onplay = () => {
          console.log('✅ AI response audio playing');
        };

        audio.onended = () => {
          console.log('✅ AI response audio finished');
        };

        audio.onerror = (error) => {
          console.error('❌ Error loading/playing AI audio:', error);
          // Fallback to browser speech synthesis
          this.fallbackToSpeechSynthesis(text);
        };

        // Try to load and play the audio
        audio.load();
        
      } else {
        console.warn('⚠️ No audio URL received, using speech synthesis fallback');
        this.fallbackToSpeechSynthesis(text);
      }

    } catch (error) {
      console.error('❌ Error converting to speech:', error);
      // Fallback to browser speech synthesis
      this.fallbackToSpeechSynthesis(text);
    }
  }

  // Fallback to browser speech synthesis API
  private fallbackToSpeechSynthesis(text: string): void {
    try {
      if ('speechSynthesis' in window) {
        console.log('🔊 Using browser speech synthesis as fallback...');
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        utterance.lang = 'en-US';
        
        // Try to use a good quality voice
        const voices = speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice => 
          voice.lang.startsWith('en') && 
          (voice.name.includes('Google') || voice.name.includes('Microsoft'))
        );
        
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        utterance.onstart = () => {
          console.log('🔊 Browser speech synthesis started');
        };

        utterance.onend = () => {
          console.log('✅ Browser speech synthesis ended');
        };

        utterance.onerror = (error) => {
          console.error('❌ Speech synthesis error:', error);
        };

        speechSynthesis.speak(utterance);
        
      } else {
        console.warn('⚠️ Speech synthesis not supported in this browser');
      }
    } catch (error) {
      console.error('❌ Error in speech synthesis fallback:', error);
    }
  }

  // End the current call session
  async endCall(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.currentSession) {
        return { success: false, message: 'No active call to end' };
      }

      const callDuration = Math.round((new Date().getTime() - this.currentSession.startTime.getTime()) / 1000);

      console.log(`📞 Ending call session ${this.currentSession.sessionId}`);

      const response = await fetch(`${API_BASE_URL}/api/ai-call/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.currentSession.sessionId,
          callDuration
        })
      });

      const result = await response.json();

      // Reset current session
      this.currentSession = null;

      return result;

    } catch (error) {
      console.error('❌ Error ending call:', error);
      return {
        success: false,
        message: 'Failed to end call properly'
      };
    }
  }

  // Get current call status
  getCurrentSession(): CallSession | null {
    return this.currentSession;
  }

  // Check if there's an active call
  isCallActive(): boolean {
    return this.currentSession !== null;
  }

  // Admin Dashboard Methods

  // Get all call recordings (Admin only)
  async getCallRecordings(): Promise<{ success: boolean; recordings?: CallRecording[]; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/call-recordings`);
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('❌ Error fetching call recordings:', error);
      return {
        success: false,
        error: 'Failed to fetch call recordings'
      };
    }
  }

  // Get specific call recording (Admin only)
  async getCallRecording(sessionId: string): Promise<{ success: boolean; recording?: CallRecording; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/call-recording/${sessionId}`);
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('❌ Error fetching call recording:', error);
      return {
        success: false,
        error: 'Failed to fetch call recording'
      };
    }
  }

  // Get call statistics (Admin only)
  async getCallStatistics(): Promise<{ success: boolean; statistics?: CallStatistics; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/call-statistics`);
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('❌ Error fetching call statistics:', error);
      return {
        success: false,
        error: 'Failed to fetch call statistics'
      };
    }
  }

  // Listen for real-time admin updates
  onAdminUpdate(eventName: string, callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on(eventName, callback);
    }
  }

  // Remove admin update listeners
  offAdminUpdate(eventName: string, callback?: (data: any) => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(eventName, callback);
      } else {
        this.socket.off(eventName);
      }
    }
  }

  // Initiate a real phone call via Asterisk AMI
  async initiatePhoneCall(phoneNumber: string): Promise<{ success: boolean; sessionId?: string; message: string }> {
    try {
      console.log(`📞 Initiating phone call to ${phoneNumber}`);

      const response = await fetch(`${API_BASE_URL}/api/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: phoneNumber
        })
      });

      const result = await response.json();
      return result;

    } catch (error) {
      console.error('❌ Error initiating phone call:', error);
      return {
        success: false,
        message: 'Failed to initiate phone call. Please try again.'
      };
    }
  }

  // Disconnect socket connection
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const aiCallService = new AICallService();