import RNFS from 'react-native-fs';
import database from '../db/database';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKUP_DIR = `${RNFS.ExternalDirectoryPath}/FarmleySFABackup`;
const MASTER_DATA_BACKUP_FILE = `${BACKUP_DIR}/master_data_backup.json`;
const BACKUP_METADATA_FILE = `${BACKUP_DIR}/backup_metadata.json`;

// Master data tables that should survive clear data
const MASTER_DATA_TABLES = [
  'customers',
  'items',
  'prices',
  'journey_plan_customers',
  'competitor_brands',
  'selling_skus',
  'initiatives',
  'surveys',
  'planogram_setups',
];

interface BackupMetadata {
  lastBackupAt: number;
  userCode: string;
  version: number;
}

interface MasterDataBackup {
  customers: any[];
  items: any[];
  prices: any[];
  journey_plan_customers: any[];
  competitor_brands: any[];
  selling_skus: any[];
  initiatives: any[];
  surveys: any[];
  planogram_setups: any[];
  backedUpAt: number;
  userCode: string;
}

/**
 * Ensure backup directory exists
 */
async function ensureBackupDir(): Promise<void> {
  const exists = await RNFS.exists(BACKUP_DIR);
  if (!exists) {
    await RNFS.mkdir(BACKUP_DIR);
  }
}

/**
 * Export master data to external storage backup
 */
export async function backupMasterData(): Promise<boolean> {
  try {
    await ensureBackupDir();

    // Get current user
    const userJson = await AsyncStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const userCode = user?.code || 'unknown';

    console.log('[MasterDataBackup] Starting backup for user:', userCode);

    const backup: MasterDataBackup = {
      customers: [],
      items: [],
      prices: [],
      journey_plan_customers: [],
      competitor_brands: [],
      selling_skus: [],
      initiatives: [],
      surveys: [],
      planogram_setups: [],
      backedUpAt: Date.now(),
      userCode,
    };

    // Export customers
    try {
      const customers = await database.get('customers').query().fetch();
      backup.customers = customers.map(c => c._raw);
      console.log(`[MasterDataBackup] Exported ${backup.customers.length} customers`);
    } catch (e) {
      console.log('[MasterDataBackup] Error exporting customers:', e);
    }

    // Export items
    try {
      const items = await database.get('items').query().fetch();
      backup.items = items.map(i => i._raw);
      console.log(`[MasterDataBackup] Exported ${backup.items.length} items`);
    } catch (e) {
      console.log('[MasterDataBackup] Error exporting items:', e);
    }

    // Export prices
    try {
      const prices = await database.get('prices').query().fetch();
      backup.prices = prices.map(p => p._raw);
      console.log(`[MasterDataBackup] Exported ${backup.prices.length} prices`);
    } catch (e) {
      console.log('[MasterDataBackup] Error exporting prices:', e);
    }

    // Export journey plan customers
    try {
      const journeyCustomers = await database.get('journey_plan_customers').query().fetch();
      backup.journey_plan_customers = journeyCustomers.map(j => j._raw);
      console.log(`[MasterDataBackup] Exported ${backup.journey_plan_customers.length} journey customers`);
    } catch (e) {
      console.log('[MasterDataBackup] Error exporting journey customers:', e);
    }

    // Export competitor brands
    try {
      const competitorBrands = await database.get('competitor_brands').query().fetch();
      backup.competitor_brands = competitorBrands.map(c => c._raw);
      console.log(`[MasterDataBackup] Exported ${backup.competitor_brands.length} competitor brands`);
    } catch (e) {
      console.log('[MasterDataBackup] Error exporting competitor brands:', e);
    }

    // Export selling SKUs
    try {
      const sellingSkus = await database.get('selling_skus').query().fetch();
      backup.selling_skus = sellingSkus.map(s => s._raw);
      console.log(`[MasterDataBackup] Exported ${backup.selling_skus.length} selling SKUs`);
    } catch (e) {
      console.log('[MasterDataBackup] Error exporting selling SKUs:', e);
    }

    // Export initiatives
    try {
      const initiatives = await database.get('initiatives').query().fetch();
      backup.initiatives = initiatives.map(i => i._raw);
      console.log(`[MasterDataBackup] Exported ${backup.initiatives.length} initiatives`);
    } catch (e) {
      console.log('[MasterDataBackup] Error exporting initiatives:', e);
    }

    // Export surveys
    try {
      const surveys = await database.get('surveys').query().fetch();
      backup.surveys = surveys.map(s => s._raw);
      console.log(`[MasterDataBackup] Exported ${backup.surveys.length} surveys`);
    } catch (e) {
      console.log('[MasterDataBackup] Error exporting surveys:', e);
    }

    // Export planogram setups
    try {
      const planogramSetups = await database.get('planogram_setups').query().fetch();
      backup.planogram_setups = planogramSetups.map(p => p._raw);
      console.log(`[MasterDataBackup] Exported ${backup.planogram_setups.length} planogram setups`);
    } catch (e) {
      console.log('[MasterDataBackup] Error exporting planogram setups:', e);
    }

    // Write backup file
    const backupJson = JSON.stringify(backup, null, 2);
    await RNFS.writeFile(MASTER_DATA_BACKUP_FILE, backupJson, 'utf8');

    // Update metadata
    const metadata: BackupMetadata = {
      lastBackupAt: Date.now(),
      userCode,
      version: 1,
    };
    await RNFS.writeFile(BACKUP_METADATA_FILE, JSON.stringify(metadata), 'utf8');

    console.log('[MasterDataBackup] Backup completed successfully');
    return true;
  } catch (error) {
    console.error('[MasterDataBackup] Backup failed:', error);
    return false;
  }
}

/**
 * Check if backup exists
 */
export async function hasMasterDataBackup(): Promise<boolean> {
  try {
    const exists = await RNFS.exists(MASTER_DATA_BACKUP_FILE);
    return exists;
  } catch {
    return false;
  }
}

/**
 * Get backup metadata
 */
export async function getBackupMetadata(): Promise<BackupMetadata | null> {
  try {
    const exists = await RNFS.exists(BACKUP_METADATA_FILE);
    if (!exists) return null;

    const content = await RNFS.readFile(BACKUP_METADATA_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Restore master data from backup
 */
export async function restoreMasterData(): Promise<boolean> {
  try {
    const backupExists = await hasMasterDataBackup();
    if (!backupExists) {
      console.log('[MasterDataBackup] No backup found to restore');
      return false;
    }

    console.log('[MasterDataBackup] Starting restore...');

    const backupContent = await RNFS.readFile(MASTER_DATA_BACKUP_FILE, 'utf8');
    const backup: MasterDataBackup = JSON.parse(backupContent);

    // Get current user for validation
    const userJson = await AsyncStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;

    // Validate backup belongs to current user
    if (backup.userCode && backup.userCode !== user?.code) {
      console.log(`[MasterDataBackup] Backup user ${backup.userCode} doesn't match current user ${user?.code}`);
      // Still proceed but log the mismatch
    }

    let restoredCount = 0;

    await database.write(async () => {
      // Restore customers
      if (backup.customers?.length > 0) {
        try {
          const customerCollection = database.get('customers');
          for (const customerData of backup.customers) {
            try {
              await customerCollection.create((record: any) => {
                Object.assign(record, customerData);
              });
              restoredCount++;
            } catch (e) {
              // Record might already exist, skip
            }
          }
          console.log(`[MasterDataBackup] Restored ${backup.customers.length} customers`);
        } catch (e) {
          console.log('[MasterDataBackup] Error restoring customers:', e);
        }
      }

      // Restore items
      if (backup.items?.length > 0) {
        try {
          const itemCollection = database.get('items');
          for (const itemData of backup.items) {
            try {
              await itemCollection.create((record: any) => {
                Object.assign(record, itemData);
              });
              restoredCount++;
            } catch (e) {
              // Skip duplicates
            }
          }
          console.log(`[MasterDataBackup] Restored ${backup.items.length} items`);
        } catch (e) {
          console.log('[MasterDataBackup] Error restoring items:', e);
        }
      }

      // Restore prices
      if (backup.prices?.length > 0) {
        try {
          const priceCollection = database.get('prices');
          for (const priceData of backup.prices) {
            try {
              await priceCollection.create((record: any) => {
                Object.assign(record, priceData);
              });
              restoredCount++;
            } catch (e) {
              // Skip duplicates
            }
          }
          console.log(`[MasterDataBackup] Restored ${backup.prices.length} prices`);
        } catch (e) {
          console.log('[MasterDataBackup] Error restoring prices:', e);
        }
      }

      // Restore journey plan customers
      if (backup.journey_plan_customers?.length > 0) {
        try {
          const journeyCollection = database.get('journey_plan_customers');
          for (const journeyData of backup.journey_plan_customers) {
            try {
              await journeyCollection.create((record: any) => {
                Object.assign(record, journeyData);
              });
              restoredCount++;
            } catch (e) {
              // Skip duplicates
            }
          }
          console.log(`[MasterDataBackup] Restored ${backup.journey_plan_customers.length} journey customers`);
        } catch (e) {
          console.log('[MasterDataBackup] Error restoring journey customers:', e);
        }
      }

      // Restore competitor brands
      if (backup.competitor_brands?.length > 0) {
        try {
          const brandCollection = database.get('competitor_brands');
          for (const brandData of backup.competitor_brands) {
            try {
              await brandCollection.create((record: any) => {
                Object.assign(record, brandData);
              });
              restoredCount++;
            } catch (e) {
              // Skip duplicates
            }
          }
          console.log(`[MasterDataBackup] Restored ${backup.competitor_brands.length} competitor brands`);
        } catch (e) {
          console.log('[MasterDataBackup] Error restoring competitor brands:', e);
        }
      }

      // Restore selling SKUs
      if (backup.selling_skus?.length > 0) {
        try {
          const skuCollection = database.get('selling_skus');
          for (const skuData of backup.selling_skus) {
            try {
              await skuCollection.create((record: any) => {
                Object.assign(record, skuData);
              });
              restoredCount++;
            } catch (e) {
              // Skip duplicates
            }
          }
          console.log(`[MasterDataBackup] Restored ${backup.selling_skus.length} selling SKUs`);
        } catch (e) {
          console.log('[MasterDataBackup] Error restoring selling SKUs:', e);
        }
      }

      // Restore initiatives
      if (backup.initiatives?.length > 0) {
        try {
          const initiativeCollection = database.get('initiatives');
          for (const initiativeData of backup.initiatives) {
            try {
              await initiativeCollection.create((record: any) => {
                Object.assign(record, initiativeData);
              });
              restoredCount++;
            } catch (e) {
              // Skip duplicates
            }
          }
          console.log(`[MasterDataBackup] Restored ${backup.initiatives.length} initiatives`);
        } catch (e) {
          console.log('[MasterDataBackup] Error restoring initiatives:', e);
        }
      }

      // Restore surveys
      if (backup.surveys?.length > 0) {
        try {
          const surveyCollection = database.get('surveys');
          for (const surveyData of backup.surveys) {
            try {
              await surveyCollection.create((record: any) => {
                Object.assign(record, surveyData);
              });
              restoredCount++;
            } catch (e) {
              // Skip duplicates
            }
          }
          console.log(`[MasterDataBackup] Restored ${backup.surveys.length} surveys`);
        } catch (e) {
          console.log('[MasterDataBackup] Error restoring surveys:', e);
        }
      }

      // Restore planogram setups
      if (backup.planogram_setups?.length > 0) {
        try {
          const planogramCollection = database.get('planogram_setups');
          for (const planogramData of backup.planogram_setups) {
            try {
              await planogramCollection.create((record: any) => {
                Object.assign(record, planogramData);
              });
              restoredCount++;
            } catch (e) {
              // Skip duplicates
            }
          }
          console.log(`[MasterDataBackup] Restored ${backup.planogram_setups.length} planogram setups`);
        } catch (e) {
          console.log('[MasterDataBackup] Error restoring planogram setups:', e);
        }
      }
    });

    console.log(`[MasterDataBackup] Restore completed. Total records restored: ${restoredCount}`);
    return restoredCount > 0;
  } catch (error) {
    console.error('[MasterDataBackup] Restore failed:', error);
    return false;
  }
}

/**
 * Check if we need to restore data (called on app startup)
 */
export async function checkAndRestoreMasterData(): Promise<boolean> {
  try {
    // Check if backup exists
    const hasBackup = await hasMasterDataBackup();
    if (!hasBackup) {
      return false;
    }

    // Check if database is empty by checking customers
    let isDatabaseEmpty = false;
    try {
      const customers = await database.get('customers').query().fetch();
      if (customers.length === 0) {
        isDatabaseEmpty = true;
      }
    } catch {
      isDatabaseEmpty = true;
    }

    if (isDatabaseEmpty) {
      console.log('[MasterDataBackup] Database appears empty, restoring from backup...');
      return await restoreMasterData();
    }

    return false;
  } catch (error) {
    console.error('[MasterDataBackup] Error checking restore:', error);
    return false;
  }
}

/**
 * Delete backup (useful when user logs out)
 */
export async function deleteMasterDataBackup(): Promise<void> {
  try {
    await RNFS.unlink(MASTER_DATA_BACKUP_FILE).catch(() => {});
    await RNFS.unlink(BACKUP_METADATA_FILE).catch(() => {});
    console.log('[MasterDataBackup] Backup deleted');
  } catch (error) {
    console.error('[MasterDataBackup] Error deleting backup:', error);
  }
}
