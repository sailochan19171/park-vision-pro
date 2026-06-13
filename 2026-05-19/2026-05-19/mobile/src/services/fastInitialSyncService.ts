import { MasterDataDownloadService } from './masterDataDownloadService';
import { incrementalSync, markInitialSyncCompleted } from './syncService';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Fast Initial Sync Service
 * Uses SQLite file download for first-time sync, then incremental sync for updates
 */

export class FastInitialSyncService {
  /**
   * Perform initial sync with master data download
   */
  static async performInitialSync(
    onProgress?: (message: string, progress?: number) => void
  ): Promise<void> {
    try {
      onProgress?.('Checking master data status...');
      
      const status = await MasterDataDownloadService.getDownloadStatus();
      console.log('[FastSync] Master data status:', status);

      if (status.needsDownload || !status.hasMasterData) {
        // Download master data file
        onProgress?.('Downloading master data...', 0);
        
        const downloadPath = await MasterDataDownloadService.downloadMasterData(
          (progress) => {
            onProgress?.(`Downloading master data... ${progress.percentage}%`, progress.percentage);
          }
        );

        onProgress?.('Installing master data...', 90);
        
        // Replace database with master data
        await MasterDataDownloadService.replaceWithMasterData();
        
        onProgress?.('Finalizing setup...', 95);
        
        // Clean up
        await MasterDataDownloadService.cleanup();
        
        onProgress?.('Master data sync completed!', 100);

        // Stamp BOTH the generic and per-user flags. Without the per-user
        // stamp, syncService.needsInitialSync() returns true on every
        // re-login and AppNavigator re-shows InitialSyncScreen even though
        // the local DB is already populated.
        await markInitialSyncCompleted();
        await AsyncStorage.setItem('sync_type', 'master_data');

      } else {
        onProgress?.('Master data already up to date', 100);
        await markInitialSyncCompleted();
      }
    } catch (error: any) {
      console.error('[FastSync] Initial sync failed:', error);
      throw new Error(`Initial sync failed: ${error?.message}`);
    }
  }

  /**
   * Check if initial sync is needed
   */
  static async needsInitialSync(): Promise<boolean> {
    try {
      const initialSyncCompleted = await AsyncStorage.getItem('initialSyncCompleted');
      const syncType = await AsyncStorage.getItem('sync_type');
      
      // If never completed, need initial sync
      if (!initialSyncCompleted) {
        console.log('[FastSync] Initial sync never completed');
        return true;
      }

      // If completed with master data, check if new version available
      if (syncType === 'master_data') {
        const needsDownload = await MasterDataDownloadService.needsMasterDataDownload();
        console.log('[FastSync] Master data download needed:', needsDownload);
        return needsDownload;
      }

      // Fallback to regular sync check
      return false;
    } catch (error) {
      console.error('[FastSync] Check initial sync failed:', error);
      return true;
    }
  }

  /**
   * Perform fast sync (master data + incremental)
   */
  static async performFastSync(
    routeCode: string,
    onProgress?: (message: string, progress?: number) => void
  ): Promise<void> {
    const MAX_RETRIES = 2;
    let retryCount = 0;
    
    while (retryCount < MAX_RETRIES) {
      try {
        const needsInitial = await this.needsInitialSync();

        if (needsInitial) {
          onProgress?.('Starting fast initial sync...');
          await this.performInitialSync(onProgress);
        }

        // Always run incremental sync for latest changes
        onProgress?.('Syncing latest changes...');
        await incrementalSync(routeCode);

        // Stamp the per-user "fully synced" flag every time fast sync
        // completes — not just inside performInitialSync. Without this,
        // when performInitialSync is skipped (because the generic
        // initialSyncCompleted flag is already set from a prior run),
        // the per-user flag never gets written and syncService's
        // needsInitialSync() returns true on every re-login, re-showing
        // the InitialSyncScreen even though there's nothing to do.
        await markInitialSyncCompleted();

        onProgress?.('Fast sync completed!', 100);
        return; // Success, exit retry loop
      } catch (error: any) {
        console.error(`[FastSync] Sync attempt ${retryCount + 1} failed:`, error);
        retryCount++;
        
        if (retryCount >= MAX_RETRIES) {
          console.error('[FastSync] Max retries reached, giving up');
          throw new Error(`Fast sync failed after ${MAX_RETRIES} attempts: ${error?.message}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  /**
   * Reset initial sync flag (for testing/debugging)
   */
  static async resetInitialSync(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        'initialSyncCompleted',
        'sync_type',
        'master_data_version',
        'master_data_last_sync'
      ]);
      console.log('[FastSync] Initial sync flags reset');
    } catch (error) {
      console.error('[FastSync] Reset failed:', error);
    }
  }

  /**
   * Get sync status information
   */
  static async getSyncStatus(): Promise<{
    initialSyncCompleted: boolean;
    syncType: string | null;
    masterDataVersion: string | null;
    lastSync: string | null;
  }> {
    try {
      const initialSyncCompleted = await AsyncStorage.getItem('initialSyncCompleted') === 'true';
      const syncType = await AsyncStorage.getItem('sync_type');
      const masterDataVersion = await MasterDataDownloadService.getCurrentMasterVersion();
      const lastSync = await AsyncStorage.getItem('master_data_last_sync');

      return {
        initialSyncCompleted,
        syncType,
        masterDataVersion,
        lastSync
      };
    } catch (error) {
      console.error('[FastSync] Get status failed:', error);
      return {
        initialSyncCompleted: false,
        syncType: null,
        masterDataVersion: null,
        lastSync: null
      };
    }
  }
}
