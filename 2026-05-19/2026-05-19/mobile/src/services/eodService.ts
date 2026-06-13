import { AppState, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pushSync } from './syncService';
import database from '../db/database';
import { Q } from '@nozbe/watermelondb';
import useAuthStore from '../store/auth';
import api from '../api/client';

/**
 * End of Day (EOD) Service
 * Automatically processes EOD after 15 hours and handles auto-checkout
 */

interface EODConfig {
  enabled: boolean;
  autoCheckoutTime: string; // Format: "HH:mm"
  warningTime: string; // Format: "HH:mm" - warning before EOD
  enableAutoCheckout: boolean;
  enableNotifications: boolean;
}

interface EODStatus {
  lastProcessedDate: string | null;
  nextEODTime: string | null;
  pendingCheckouts: any[];
  isProcessing: boolean;
  autoEODOccurred: boolean;
  autoEODTimestamp: string | null;
}

export class EODService {
  private static readonly EOD_CONFIG_KEY = 'eod_config';
  private static readonly EOD_STATUS_KEY = 'eod_status';
  private static readonly LAST_EOD_CHECK_KEY = 'last_eod_check';
  
  private static eodIntervalId: ReturnType<typeof setInterval> | null = null;
  private static appStateSub: { remove: () => void } | null = null;

  /**
   * Initialize EOD service
   */
  static async initialize(): Promise<void> {
    try {
      console.log('[EOD] Initializing EOD service');
      
      // Load EOD configuration
      const config = await this.getEODConfig();
      if (!config.enabled) {
        console.log('[EOD] EOD service disabled');
        return;
      }

      // Start EOD monitoring
      this.startEODMonitoring();
      
      console.log('[EOD] EOD service initialized successfully');
    } catch (error) {
      console.error('[EOD] Initialization failed:', error);
    }
  }

  /**
   * Start EOD monitoring service
   */
  private static startEODMonitoring(): void {
    // Stop any existing monitoring
    this.stopEODMonitoring();

    // Check EOD status immediately
    this.checkEODStatus();

    // Set up interval to check every minute
    this.eodIntervalId = setInterval(() => {
      this.checkEODStatus();
    }, 60 * 1000); // Check every minute

    // Listen for app state changes
    this.appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Check EOD when app comes to foreground
        setTimeout(() => this.checkEODStatus(), 1000);
      }
    });
  }

  /**
   * Stop EOD monitoring service
   */
  static stopEODMonitoring(): void {
    if (this.eodIntervalId) {
      clearInterval(this.eodIntervalId);
      this.eodIntervalId = null;
    }
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = null;
    }
    console.log('[EOD] EOD monitoring stopped');
  }

  /**
   * Check EOD status and process if needed
   */
  static async checkEODStatus(): Promise<void> {
    try {
      const now = new Date();
      const currentTime = this.formatTime(now.getHours(), now.getMinutes());
      const currentDate = this.formatDate(now);
      
      const config = await this.getEODConfig();
      const status = await this.getEODStatus();
      
      // Check if we need to process EOD (15-hour cycle or specific time)
      const shouldProcessEOD = await this.shouldProcessEOD(now, config, status);
      
      if (shouldProcessEOD) {
        console.log('[EOD] Processing EOD for:', currentDate);
        await this.processEOD();
      } else {
        // Update next EOD time display
        await this.updateNextEODTime(config, now);
      }

      // Store last check time
      await AsyncStorage.setItem(this.LAST_EOD_CHECK_KEY, Date.now().toString());
    } catch (error) {
      console.error('[EOD] Check status failed:', error);
    }
  }

  /**
   * Determine if EOD should be processed
   */
  static async shouldProcessEOD(
    now: Date, 
    config: EODConfig, 
    status: EODStatus
  ): Promise<boolean> {
    const currentDate = this.formatDate(now);
    const currentTime = this.formatTime(now.getHours(), now.getMinutes());
    
    // Check if 15 hours have passed since last EOD
    if (status.lastProcessedDate) {
      const lastEOD = new Date(status.lastProcessedDate);
      const hoursSinceEOD = (now.getTime() - lastEOD.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceEOD >= 15) {
        console.log('[EOD] 15 hours passed since last EOD');
        return true;
      }
    }
    
    // Check if current time has passed EOD time
    if (config.autoCheckoutTime && currentTime >= config.autoCheckoutTime) {
      // Only process if we haven't already processed today
      if (status.lastProcessedDate !== currentDate) {
        console.log('[EOD] EOD time reached:', currentTime);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Process End of Day
   */
  static async processEOD(): Promise<void> {
    try {
      const status = await this.getEODStatus();
      status.isProcessing = true;
      await this.saveEODStatus(status);

      console.log('[EOD] Starting EOD process...');

      // 1. Auto-checkout all pending visits
      if (status.pendingCheckouts && status.pendingCheckouts.length > 0) {
        await this.autoCheckoutPendingVisits(status.pendingCheckouts);
      }

      // 2. Push all pending data to server
      await this.pushAllPendingData();

      // 3. Update EOD status
      const now = new Date();
      status.lastProcessedDate = this.formatDate(now);
      status.isProcessing = false;
      status.pendingCheckouts = [];
      status.autoEODOccurred = true;
      status.autoEODTimestamp = now.toISOString();
      
      await this.saveEODStatus(status);
      
      // 4. Log EOD activity to web portal backend
      await this.logEODActivity(status, now);
      
      // 5. Show completion notification
      this.showEODNotification();

      console.log('[EOD] EOD process completed successfully');
    } catch (error) {
      console.error('[EOD] Process EOD failed:', error);
      
      // Update status to show processing failed
      const status = await this.getEODStatus();
      status.isProcessing = false;
      await this.saveEODStatus(status);
      
      throw error;
    }
  }

  /**
   * Auto-checkout pending customer visits
   */
  static async autoCheckoutPendingVisits(pendingVisits: any[]): Promise<void> {
    try {
      console.log(`[EOD] Auto-checking out ${pendingVisits.length} visits`);
      
      for (const visit of pendingVisits) {
        try {
          // Update visit record in local database
          const visits = await database.get('customer_visits').query(
            Q.where('id', visit.id)
          ).fetch();
          
          if (visits.length > 0) {
            await database.write(async () => {
              await visits[0].update(record => {
                record.checkoutTime = new Date().toISOString();
                record.durationMins = this.calculateDuration(visit.checkinTime);
                record.status = 'auto_checkout';
              });
            });
          }
        } catch (error) {
          console.error(`[EOD] Failed to auto-checkout visit ${visit.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[EOD] Auto-checkout failed:', error);
    }
  }

  /**
   * Push all pending data to server
   */
  static async pushAllPendingData(): Promise<void> {
    // Don't pre-gate on NetInfo. On Android 10/11/13 (Vivo Y50, older
    // OneUI) NetInfo's isInternetReachable flag is derived from the
    // OS's Google probe, which is routinely blocked by carrier APNs
    // and store Wi-Fi captive portals — so it lies "no internet" even
    // on solid connections. The only authoritative test is "did the
    // push actually go through". Let pushSync() be that test.
    try {
      console.log('[EOD] Pushing all pending data...');
      await pushSync();
      console.log('[EOD] All pending data pushed successfully');
    } catch (error: any) {
      console.error('[EOD] Failed to push pending data:', error);
      const msg = String(error?.message ?? '');
      const isNetwork =
        error?.code === 'ERR_NETWORK' ||
        error?.code === 'ECONNABORTED' ||
        error?.code === 'ETIMEDOUT' ||
        msg === 'Network Error' ||
        /network|timeout/i.test(msg);
      if (isNetwork) {
        Alert.alert(
          'Sync Failed',
          'Unable to reach the server. Your data is safe — it will sync automatically once the connection is restored.',
          [{ text: 'OK', style: 'default' }]
        );
      }
      throw error;
    }
  }

  /**
   * Show EOD completion notification
   */
  static showEODNotification(): void {
    if (Platform.OS === 'ios') {
      // iOS notification would need additional setup
      console.log('[EOD] EOD completed - iOS notification would be shown here');
    } else {
      // For Android, you could integrate with local notifications
      console.log('[EOD] EOD completed - Android notification would be shown here');
    }
  }

  /**
   * Get EOD configuration
   */
  static async getEODConfig(): Promise<EODConfig> {
    try {
      const configJson = await AsyncStorage.getItem(this.EOD_CONFIG_KEY);
      if (configJson) {
        return JSON.parse(configJson);
      }
      
      // Default configuration
      return {
        enabled: true,
        autoCheckoutTime: '20:00', // 8:00 PM
        warningTime: '19:45', // 7:45 PM
        enableAutoCheckout: true,
        enableNotifications: true,
      };
    } catch (error) {
      console.error('[EOD] Get config failed:', error);
      return {
        enabled: true,
        autoCheckoutTime: '20:00',
        warningTime: '19:45',
        enableAutoCheckout: true,
        enableNotifications: true,
      };
    }
  }

  /**
   * Save EOD configuration
   */
  static async saveEODConfig(config: EODConfig): Promise<void> {
    try {
      await AsyncStorage.setItem(this.EOD_CONFIG_KEY, JSON.stringify(config));
      console.log('[EOD] EOD configuration saved');
    } catch (error) {
      console.error('[EOD] Save config failed:', error);
    }
  }

  /**
   * Get EOD status
   */
  static async getEODStatus(): Promise<EODStatus> {
    try {
      const statusJson = await AsyncStorage.getItem(this.EOD_STATUS_KEY);
      if (statusJson) {
        return JSON.parse(statusJson);
      }
      
      return {
        lastProcessedDate: null,
        nextEODTime: null,
        pendingCheckouts: [],
        isProcessing: false,
        autoEODOccurred: false,
        autoEODTimestamp: null,
      };
    } catch (error) {
      console.error('[EOD] Get status failed:', error);
      return {
        lastProcessedDate: null,
        nextEODTime: null,
        pendingCheckouts: [],
        isProcessing: false,
        autoEODOccurred: false,
        autoEODTimestamp: null,
      };
    }
  }

  /**
   * Save EOD status
   */
  static async saveEODStatus(status: EODStatus): Promise<void> {
    try {
      await AsyncStorage.setItem(this.EOD_STATUS_KEY, JSON.stringify(status));
    } catch (error) {
      console.error('[EOD] Save status failed:', error);
    }
  }

  /**
   * Update next EOD time for display
   */
  static async updateNextEODTime(config: EODConfig, now: Date): Promise<void> {
    try {
      const status = await this.getEODStatus();
      const currentTime = this.formatTime(now.getHours(), now.getMinutes());
      
      // Calculate next EOD time
      let nextEODTime: string | null = null;
      
      if (config.autoCheckoutTime && currentTime < config.autoCheckoutTime) {
        nextEODTime = config.autoCheckoutTime;
      } else {
        // Next day's EOD time
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        nextEODTime = config.autoCheckoutTime;
      }
      
      status.nextEODTime = nextEODTime;
      await this.saveEODStatus(status);
    } catch (error) {
      console.error('[EOD] Update next EOD time failed:', error);
    }
  }

  /**
   * Get pending customer visits for EOD
   */
  static async getPendingVisits(): Promise<any[]> {
    try {
      const visits = await database.get('customer_visits').query(
        Q.where('status', 'checked_in'),
        Q.and(
          Q.where('checkoutTime', null)
        )
      ).fetch();
      
      return visits;
    } catch (error) {
      console.error('[EOD] Get pending visits failed:', error);
      return [];
    }
  }

  /**
   * Format time as HH:mm string
   */
  private static formatTime(hours: number, minutes: number): string {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Format date as YYYY-MM-DD string
   */
  private static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Calculate duration in minutes
   */
  private static calculateDuration(checkinTime: string): number {
    try {
      const checkin = new Date(checkinTime);
      const now = new Date();
      return Math.floor((now.getTime() - checkin.getTime()) / (1000 * 60));
    } catch (error) {
      console.error('[EOD] Calculate duration failed:', error);
      return 0;
    }
  }

  /**
   * Manual trigger EOD process
   */
  static async triggerManualEOD(): Promise<void> {
    try {
      console.log('[EOD] Manual EOD trigger requested');
      await this.processEOD();
    } catch (error) {
      console.error('[EOD] Manual EOD failed:', error);
      throw error;
    }
  }

  /**
   * Check if EOD processing is currently active
   */
  static async isEODProcessing(): Promise<boolean> {
    try {
      const status = await this.getEODStatus();
      return status.isProcessing;
    } catch (error) {
      console.error('[EOD] Check processing status failed:', error);
      return false;
    }
  }

  /**
   * Get EOD summary for display
   */
  static async getEODSummary(): Promise<{
    lastProcessedDate: string | null;
    nextEODTime: string | null;
    pendingVisitsCount: number;
    hoursSinceLastEOD: number;
  }> {
    try {
      const status = await this.getEODStatus();
      const pendingVisits = await this.getPendingVisits();
      
      let hoursSinceLastEOD = 0;
      if (status.lastProcessedDate) {
        const lastEOD = new Date(status.lastProcessedDate);
        const now = new Date();
        hoursSinceLastEOD = (now.getTime() - lastEOD.getTime()) / (1000 * 60 * 60);
      }
      
      return {
        lastProcessedDate: status.lastProcessedDate,
        nextEODTime: status.nextEODTime,
        pendingVisitsCount: pendingVisits.length,
        hoursSinceLastEOD,
      };
    } catch (error) {
      console.error('[EOD] Get summary failed:', error);
      return {
        lastProcessedDate: null,
        nextEODTime: null,
        pendingVisitsCount: 0,
        hoursSinceLastEOD: 0,
      };
    }
  }

  /**
   * Check if auto EOD occurred and needs redirect
   */
  static async checkAutoEODRedirect(): Promise<boolean> {
    try {
      const status = await this.getEODStatus();
      
      if (status.autoEODOccurred && status.autoEODTimestamp) {
        const autoEODTime = new Date(status.autoEODTimestamp);
        const now = new Date();
        
        // Check if auto EOD occurred within last 15 hours
        const hoursSinceEOD = (now.getTime() - autoEODTime.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceEOD <= 15) {
          console.log('[EOD] Auto EOD redirect needed - EOD occurred', hoursSinceEOD, 'hours ago');
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('[EOD] Check auto EOD redirect failed:', error);
      return false;
    }
  }

  /**
   * Log EOD activity to web portal backend
   */
  static async logEODActivity(status: EODStatus, timestamp: Date): Promise<void> {
    try {
      const user = useAuthStore.getState().user;
      if (!user) {
        console.warn('[EOD] No user found for activity logging');
        return;
      }

      const activityData = {
        userId: user.id,
        activityType: 'EOD_PROCESSING',
        activityTimestamp: timestamp.toISOString(),
        details: {
          lastProcessedDate: status.lastProcessedDate,
          autoEODOccurred: status.autoEODOccurred,
          autoEODTimestamp: status.autoEODTimestamp,
          pendingCheckoutsCount: status.pendingCheckouts?.length || 0,
          processingTime: timestamp.toISOString()
        }
      };

      // Send activity log to backend
      await api.post('/api/activity-logs', activityData);
      console.log('[EOD] Activity logged to web portal:', activityData);
    } catch (error) {
      console.error('[EOD] Failed to log EOD activity:', error);
      // Don't throw error - logging failure shouldn't break EOD process
    }
  }

  /**
   * Clear auto EOD redirect flag (called after redirect)
   */
  static async clearAutoEODRedirect(): Promise<void> {
    try {
      const status = await this.getEODStatus();
      status.autoEODOccurred = false;
      status.autoEODTimestamp = null;
      await this.saveEODStatus(status);
      console.log('[EOD] Auto EOD redirect flag cleared');
    } catch (error) {
      console.error('[EOD] Clear auto EOD redirect failed:', error);
    }
  }

  /**
   * Check if user is currently checked in to a store
   */
  static async isUserCurrentlyCheckedIn(): Promise<boolean> {
    try {
      const visits = await database.get('customer_visits').query(
        Q.where('status', 'checked_in')
      ).fetch();
      
      return visits.length > 0;
    } catch (error) {
      console.error('[EOD] Check current check-in status failed:', error);
      return false;
    }
  }

  /**
   * Get current active visit details
   */
  static async getCurrentActiveVisit(): Promise<any | null> {
    try {
      const visits = await database.get('customer_visits').query(
        Q.where('status', 'checked_in')
      ).fetch();
      
      return visits.length > 0 ? visits[0] : null;
    } catch (error) {
      console.error('[EOD] Get current active visit failed:', error);
      return null;
    }
  }

  /**
   * Cleanup EOD service
   */
  static cleanup(): void {
    this.stopEODMonitoring();
    console.log('[EOD] EOD service cleaned up');
  }
}
