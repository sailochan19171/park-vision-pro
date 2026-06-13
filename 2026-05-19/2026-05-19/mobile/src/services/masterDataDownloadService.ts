import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import RNFS from 'react-native-fs';
import database from '../db/database';

/**
 * Master Data Download Service
 * Downloads pre-built SQLite file for fast initial sync
 */

interface MasterDataVersion {
  version: string;
  downloadUrl: string;
  checksum: string;
  fileSize: number;
  lastModified: string;
}

interface DownloadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export class MasterDataDownloadService {
  private static readonly MASTER_DB_PATH = Platform.OS === 'android' 
    ? '/data/data/com.farmley.sfa/databases/farmley_master.db' 
    : `${RNFS.documentDirectory}farmley_master.db`;
  
  private static readonly BACKUP_PATH = Platform.OS === 'android'
    ? '/data/data/com.farmley.sfa/databases/farmley_master_backup.db'
    : `${RNFS.documentDirectory}farmley_master_backup.db`;

  /**
   * Check if master data file exists and is valid
   */
  static async masterDataExists(): Promise<boolean> {
    try {
      const exists = await RNFS.exists(this.MASTER_DB_PATH);
      if (!exists) return false;
      
      const stats = await RNFS.stat(this.MASTER_DB_PATH);
      return stats.size > 1000; // Basic sanity check
    } catch (error) {
      console.warn('[MasterData] Check exists failed:', error);
      return false;
    }
  }

  /**
   * Get current master data version info
   */
  static async getCurrentMasterVersion(): Promise<string | null> {
    try {
      const version = await AsyncStorage.getItem('master_data_version');
      return version;
    } catch (error) {
      console.warn('[MasterData] Get version failed:', error);
      return null;
    }
  }

  /**
   * Check if master data needs to be downloaded
   */
  static async needsMasterDataDownload(): Promise<boolean> {
    try {
      const currentVersion = await this.getCurrentMasterVersion();
      const exists = await this.masterDataExists();
      
      if (!exists || !currentVersion) {
        return true;
      }

      // Get latest version from server
      const response = await api.get('/sync/master-data/version');
      const serverVersion: MasterDataVersion = response.data;

      return serverVersion.version !== currentVersion;
    } catch (error) {
      console.warn('[MasterData] Check download needed failed:', error);
      return true; // Default to download on error
    }
  }

  /**
   * Download master data file
   */
  static async downloadMasterData(
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string> {
    try {
      // Get download info from server
      const response = await api.get('/sync/master-data/version');
      const masterInfo: MasterDataVersion = response.data;

      console.log('[MasterData] Downloading version:', masterInfo.version);

      // Create backup of existing file
      if (await this.masterDataExists()) {
        try {
          await RNFS.moveFile(this.MASTER_DB_PATH, this.BACKUP_PATH);
          console.log('[MasterData] Backup created');
        } catch (error) {
          console.warn('[MasterData] Backup failed:', error);
        }
      }

      // Download with progress tracking
      const downloadResult = await RNFS.downloadFile({
        fromUrl: masterInfo.downloadUrl,
        toFile: this.MASTER_DB_PATH,
        progress: (res) => {
          const progress: DownloadProgress = {
            loaded: res.bytesWritten,
            total: res.contentLength,
            percentage: Math.round((res.bytesWritten / res.contentLength) * 100)
          };
          onProgress?.(progress);
          console.log(`[MasterData] Download progress: ${progress.percentage}%`);
        },
        progressDivider: 1,
      });

      console.log('[MasterData] Download completed:', downloadResult);

      // Verify download
      const isValid = await this.verifyDownload(masterInfo);
      if (!isValid) {
        throw new Error('Download verification failed');
      }

      // Save version info
      await AsyncStorage.setItem('master_data_version', masterInfo.version);
      await AsyncStorage.setItem('master_data_last_sync', Date.now().toString());

      return this.MASTER_DB_PATH;
    } catch (error) {
      console.error('[MasterData] Download failed:', error);
      
      // Restore backup if download failed
      try {
        const backupExists = await RNFS.exists(this.BACKUP_PATH);
        if (backupExists) {
          await RNFS.moveFile(this.BACKUP_PATH, this.MASTER_DB_PATH);
          console.log('[MasterData] Backup restored');
        }
      } catch (restoreError) {
        console.error('[MasterData] Backup restore failed:', restoreError);
      }

      throw error;
    }
  }

  /**
   * Verify downloaded file integrity
   */
  static async verifyDownload(masterInfo: MasterDataVersion): Promise<boolean> {
    try {
      const stats = await FileSystem.stat(this.MASTER_DB_PATH);
      
      // Check file size
      if (Math.abs(stats.size - masterInfo.fileSize) > 1000) {
        console.warn('[MasterData] File size mismatch');
        return false;
      }

      // Basic SQLite file header check
      const fileContent = await RNFS.readFile(this.MASTER_DB_PATH, 'base64');
      const header = fileContent.substring(0, 16);
      
      // SQLite files start with "SQLite format 3"
      if (!header.includes('U2FsaXRlIGZvcm1hdA==')) {
        console.warn('[MasterData] Invalid SQLite file format');
        return false;
      }

      return true;
    } catch (error) {
      console.error('[MasterData] Verification failed:', error);
      return false;
    }
  }

  /**
   * Replace current database with master data
   */
  static async replaceWithMasterData(): Promise<void> {
    try {
      console.log('[MasterData] Replacing database with master data');

      // Close current database connection
      await database.write(async () => {
        // Clear all tables except user-specific data
        const tablesToClear = [
          'customers', 'items', 'prices', 'journey_plan_customers',
          'competitor_brands', 'planogram_setups', 'initiatives',
          'surveys', 'permanent_displays'
        ];

        for (const tableName of tablesToClear) {
          try {
            const table = database.get(tableName);
            await table.query().destroyAllPermanently();
            console.log(`[MasterData] Cleared table: ${tableName}`);
          } catch (error) {
            console.warn(`[MasterData] Failed to clear table ${tableName}:`, error);
          }
        }
      });

      // Import data from master database
      await this.importFromMasterDatabase();

      console.log('[MasterData] Database replacement completed');
    } catch (error) {
      console.error('[MasterData] Database replacement failed:', error);
      throw error;
    }
  }

  /**
   * Import data from master database
   */
  static async importFromMasterDatabase(): Promise<void> {
    try {
      // This would involve reading from the downloaded SQLite file
      // and inserting into the current database
      // For now, we'll use the existing sync mechanisms
      // but this is where you'd implement direct SQLite file import
      
      console.log('[MasterData] Importing from master database');
      
      // Trigger a fast sync using the new master data
      // In a full implementation, this would be direct SQLite import
      // which would be much faster than API-based sync
      
    } catch (error) {
      console.error('[MasterData] Import failed:', error);
      throw error;
    }
  }

  /**
   * Get master data download status
   */
  static async getDownloadStatus(): Promise<{
    hasMasterData: boolean;
    version: string | null;
    lastSync: string | null;
    needsDownload: boolean;
  }> {
    try {
      const hasMasterData = await this.masterDataExists();
      const version = await this.getCurrentMasterVersion();
      const lastSync = await AsyncStorage.getItem('master_data_last_sync');
      const needsDownload = await this.needsMasterDataDownload();

      return {
        hasMasterData,
        version,
        lastSync,
        needsDownload
      };
    } catch (error) {
      console.error('[MasterData] Get status failed:', error);
      return {
        hasMasterData: false,
        version: null,
        lastSync: null,
        needsDownload: true
      };
    }
  }

  /**
   * Clean up old master data files
   */
  static async cleanup(): Promise<void> {
    try {
      const backupExists = await RNFS.exists(this.BACKUP_PATH);
      if (backupExists) {
        await RNFS.unlink(this.BACKUP_PATH);
        console.log('[MasterData] Cleanup: removed backup file');
      }
    } catch (error) {
      console.warn('[MasterData] Cleanup failed:', error);
    }
  }
}
