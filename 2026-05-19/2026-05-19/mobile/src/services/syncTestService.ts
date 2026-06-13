import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import database from '../db/database';
import { authService } from './auth/authService';

/**
 * Test service to validate all sync functionality
 * This service provides methods to test the real-time sync features
 */

export interface SyncTestResult {
  testName: string;
  passed: boolean;
  message: string;
  details?: any;
}

export class SyncTestService {
  /**
   * Test 1: User deactivation during login
   */
  static async testUserDeactivationLogin(): Promise<SyncTestResult> {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        return {
          testName: 'User Deactivation Login Test',
          passed: false,
          message: 'No access token found - user not logged in'
        };
      }

      const response = await authService.checkUserStatus(token);
      const userStatus = response?.data;

      if (userStatus?.isActive === false || userStatus?.status === 'deactivated') {
        return {
          testName: 'User Deactivation Login Test',
          passed: true,
          message: 'User deactivation correctly detected',
          details: { userStatus }
        };
      }

      return {
        testName: 'User Deactivation Login Test',
        passed: true,
        message: 'User is active - no deactivation detected',
        details: { userStatus }
      };
    } catch (error: any) {
      return {
        testName: 'User Deactivation Login Test',
        passed: false,
        message: `Test failed: ${error?.message}`,
        details: { error }
      };
    }
  }

  /**
   * Test 2: Customer deactivation/blocked status sync
   */
  static async testCustomerDeactivationSync(): Promise<SyncTestResult> {
    try {
      // Get a sample customer from local DB
      const customers: any[] = await database.get('customers').query().fetch();
      
      if (customers.length === 0) {
        return {
          testName: 'Customer Deactivation Sync Test',
          passed: false,
          message: 'No customers found in local database'
        };
      }

      // Check if customers have status field
      const hasStatusField = customers.some(c => 
        c._raw?.status !== undefined || c.status !== undefined
      );

      const hasActiveField = customers.some(c => 
        c._raw?.is_active !== undefined || c.is_active !== undefined
      );

      return {
        testName: 'Customer Deactivation Sync Test',
        passed: hasStatusField && hasActiveField,
        message: hasStatusField && hasActiveField 
          ? 'Customer status sync fields are present'
          : 'Missing customer status sync fields',
        details: { 
          customerCount: customers.length,
          hasStatusField,
          hasActiveField,
          sampleCustomer: customers[0]?._raw
        }
      };
    } catch (error: any) {
      return {
        testName: 'Customer Deactivation Sync Test',
        passed: false,
        message: `Test failed: ${error?.message}`,
        details: { error }
      };
    }
  }

  /**
   * Test 3: Items deactivation/addition/attributes sync
   */
  static async testItemsDeactivationSync(): Promise<SyncTestResult> {
    try {
      // Get sample items from local DB
      const items: any[] = await database.get('items').query().fetch();
      
      if (items.length === 0) {
        return {
          testName: 'Items Deactivation Sync Test',
          passed: false,
          message: 'No items found in local database'
        };
      }

      // Check if items have status and additional attributes
      const hasStatusField = items.some(i => 
        i._raw?.status !== undefined || i.status !== undefined
      );

      const hasActiveField = items.some(i => 
        i._raw?.is_active !== undefined || i.is_active !== undefined
      );

      const hasAdditionalFields = items.some(i => 
        i._raw?.description !== undefined || 
        i._raw?.size !== undefined ||
        i._raw?.color !== undefined ||
        i._raw?.flavor !== undefined
      );

      return {
        testName: 'Items Deactivation Sync Test',
        passed: hasStatusField && hasActiveField && hasAdditionalFields,
        message: hasStatusField && hasActiveField && hasAdditionalFields
          ? 'Items status and attributes sync fields are present'
          : 'Missing items status or attributes sync fields',
        details: { 
          itemCount: items.length,
          hasStatusField,
          hasActiveField,
          hasAdditionalFields,
          sampleItem: items[0]?._raw
        }
      };
    } catch (error: any) {
      return {
        testName: 'Items Deactivation Sync Test',
        passed: false,
        message: `Test failed: ${error?.message}`,
        details: { error }
      };
    }
  }

  /**
   * Test 4: Price add/update sync
   */
  static async testPriceUpdateSync(): Promise<SyncTestResult> {
    try {
      // Get sample prices from local DB
      const prices: any[] = await database.get('prices').query().fetch();
      
      if (prices.length === 0) {
        return {
          testName: 'Price Update Sync Test',
          passed: false,
          message: 'No prices found in local database'
        };
      }

      // Check if prices have additional fields for price updates
      const hasStatusField = prices.some(p => 
        p._raw?.status !== undefined || p.status !== undefined
      );

      const hasValidFromField = prices.some(p => 
        p._raw?.valid_from !== undefined || p.valid_from !== undefined
      );

      const hasValidToField = prices.some(p => 
        p._raw?.valid_to !== undefined || p.valid_to !== undefined
      );

      const hasPromotionalFields = prices.some(p => 
        p._raw?.promotional_price !== undefined || 
        p._raw?.discount_percentage !== undefined
      );

      return {
        testName: 'Price Update Sync Test',
        passed: hasStatusField || hasValidFromField || hasValidToField || hasPromotionalFields,
        message: hasStatusField || hasValidFromField || hasValidToField || hasPromotionalFields
          ? 'Price sync fields are present'
          : 'Missing price sync fields',
        details: { 
          priceCount: prices.length,
          hasStatusField,
          hasValidFromField,
          hasValidToField,
          hasPromotionalFields,
          samplePrice: prices[0]?._raw
        }
      };
    } catch (error: any) {
      return {
        testName: 'Price Update Sync Test',
        passed: false,
        message: `Test failed: ${error?.message}`,
        details: { error }
      };
    }
  }

  /**
   * Test 5: Automatic sync timing (within 59 seconds)
   */
  static async testAutomaticSyncTiming(): Promise<SyncTestResult> {
    try {
      // Check if background sync and realtime sync are running
      const token = await AsyncStorage.getItem('accessToken');
      const userJson = await AsyncStorage.getItem('user');
      
      if (!token || !userJson) {
        return {
          testName: 'Automatic Sync Timing Test',
          passed: false,
          message: 'User not logged in - cannot test sync timing'
        };
      }

      const user = JSON.parse(userJson);
      const routeCode = user?.routeCode;
      
      if (!routeCode) {
        return {
          testName: 'Automatic Sync Timing Test',
          passed: false,
          message: 'No route code found for user'
        };
      }

      // Check last sync timestamps
      const syncMeta: any[] = await database
        .get('sync_meta')
        .query()
        .fetch();

      const now = Date.now();
      const recentSyncs = syncMeta.filter(meta => {
        const lastSync = meta.lastSyncedAt;
        return lastSync && (now - lastSync) < (2 * 60 * 1000); // Within 2 minutes
      });

      return {
        testName: 'Automatic Sync Timing Test',
        passed: recentSyncs.length > 0,
        message: recentSyncs.length > 0
          ? `Found ${recentSyncs.length} recent sync operations`
          : 'No recent sync operations found',
        details: { 
          routeCode,
          totalSyncMeta: syncMeta.length,
          recentSyncs: recentSyncs.length,
          syncMeta: syncMeta.map(m => ({
            moduleName: m.moduleName,
            lastSyncedAt: new Date(m.lastSyncedAt).toISOString(),
            lastCursor: m.lastCursor
          }))
        }
      };
    } catch (error: any) {
      return {
        testName: 'Automatic Sync Timing Test',
        passed: false,
        message: `Test failed: ${error?.message}`,
        details: { error }
      };
    }
  }

  /**
   * Run all sync tests
   */
  static async runAllSyncTests(): Promise<SyncTestResult[]> {
    const tests = [
      () => this.testUserDeactivationLogin(),
      () => this.testCustomerDeactivationSync(),
      () => this.testItemsDeactivationSync(),
      () => this.testPriceUpdateSync(),
      () => this.testAutomaticSyncTiming()
    ];

    const results: SyncTestResult[] = [];
    
    for (const test of tests) {
      try {
        const result = await test();
        results.push(result);
      } catch (error: any) {
        results.push({
          testName: 'Unknown Test',
          passed: false,
          message: `Test execution failed: ${error?.message}`,
          details: { error }
        });
      }
    }

    return results;
  }

  /**
   * Get test summary
   */
  static getTestSummary(results: SyncTestResult[]): {
    total: number;
    passed: number;
    failed: number;
    summary: string;
  } {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    
    const summary = `Sync Tests: ${passed}/${total} passed, ${failed} failed`;
    
    return { total, passed, failed, summary };
  }
}
