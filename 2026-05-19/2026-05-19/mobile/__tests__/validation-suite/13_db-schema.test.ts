/**
 * VALIDATION #13: Database Schema
 * Validates: db/schema.ts, db/database.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCHEMA = readFileSync(resolve(__dirname, '../../src/db/schema.ts'), 'utf-8');
const DATABASE = readFileSync(resolve(__dirname, '../../src/db/database.ts'), 'utf-8');

describe('VALIDATION #13: Database Schema', () => {
  describe('All required tables exist', () => {
    const requiredTables = [
      'customers', 'items', 'prices', 'journey_plan_customers',
      'orders', 'order_lines', 'attendance_records', 'customer_visits',
      'store_checks', 'store_check_items', 'planogram_executions',
      'selling_skus', 'sync_meta',
      'expiry_checks', 'competitor_brands', 'competitor_observations',
      'opening_stocks', 'physical_stocks', 'osoi_photos',
      'po_captures', 'po_capture_items',
      'initiatives', 'initiative_executions',
      'product_samplings', 'permanent_displays', 'permanent_display_checks',
      'surveys', 'survey_responses', 'prospects',
      'collections', 'van_stock_records', 'price_checks', 'approval_records',
    ];

    for (const table of requiredTables) {
      it(`should define "${table}" table`, () => {
        expect(SCHEMA).toContain(`name: '${table}'`);
      });
    }
  });

  describe('Key columns on customers table', () => {
    it('should have code column indexed', () => {
      const block = SCHEMA.match(/name: 'customers'[\s\S]*?name: 'code'[\s\S]*?isIndexed: true/);
      expect(block).not.toBeNull();
    });

    it('should have name column', () => {
      expect(SCHEMA).toContain("name: 'name', type: 'string'");
    });

    it('should have latitude column', () => {
      expect(SCHEMA).toContain("name: 'latitude'");
    });

    it('should have longitude column', () => {
      expect(SCHEMA).toContain("name: 'longitude'");
    });

    it('should have is_active column', () => {
      expect(SCHEMA).toContain("name: 'is_active', type: 'boolean'");
    });
  });

  describe('Key columns on orders table', () => {
    it('should have app_trx_id indexed', () => {
      // app_trx_id appears on orders with isIndexed
      const ordersBlock = SCHEMA.match(/name: 'orders'[\s\S]*?name: 'app_trx_id'[\s\S]*?isIndexed: true/);
      expect(ordersBlock).not.toBeNull();
    });

    it('should have customer_code indexed', () => {
      expect(SCHEMA).toContain("name: 'customer_code', type: 'string', isIndexed: true");
    });

    it('should have total_amount column', () => {
      expect(SCHEMA).toContain("name: 'total_amount', type: 'number'");
    });

    it('should have is_synced column', () => {
      expect(SCHEMA).toContain("name: 'is_synced', type: 'boolean'");
    });
  });

  describe('Key columns on customer_visits table', () => {
    it('should have visit_code indexed', () => {
      const block = SCHEMA.match(/name: 'customer_visits'[\s\S]*?name: 'visit_code'[\s\S]*?isIndexed: true/);
      expect(block).not.toBeNull();
    });

    it('should have checkin_time column', () => {
      expect(SCHEMA).toContain("name: 'checkin_time', type: 'number'");
    });

    it('should have checkout_time column', () => {
      expect(SCHEMA).toContain("name: 'checkout_time'");
    });

    it('should have checkin_image column', () => {
      expect(SCHEMA).toContain("name: 'checkin_image'");
    });

    it('should have checkout_image column', () => {
      expect(SCHEMA).toContain("name: 'checkout_image'");
    });

    it('should have status column', () => {
      expect(SCHEMA).toContain("name: 'status', type: 'string'");
    });
  });

  describe('Indexes on frequently queried columns', () => {
    it('should index items.code', () => {
      const block = SCHEMA.match(/name: 'items'[\s\S]*?name: 'code'[\s\S]*?isIndexed: true/);
      expect(block).not.toBeNull();
    });

    it('should index prices.item_code', () => {
      expect(SCHEMA).toContain("name: 'item_code', type: 'string', isIndexed: true");
    });

    it('should index prices.price_list', () => {
      expect(SCHEMA).toContain("name: 'price_list', type: 'string', isIndexed: true");
    });

    it('should index journey_plan_customers.customer_code', () => {
      const block = SCHEMA.match(/name: 'journey_plan_customers'[\s\S]*?name: 'customer_code'[\s\S]*?isIndexed: true/);
      expect(block).not.toBeNull();
    });

    it('should index journey_plan_customers.route_code', () => {
      const block = SCHEMA.match(/name: 'journey_plan_customers'[\s\S]*?name: 'route_code'[\s\S]*?isIndexed: true/);
      expect(block).not.toBeNull();
    });

    it('should index selling_skus.item_code', () => {
      const block = SCHEMA.match(/name: 'selling_skus'[\s\S]*?name: 'item_code'[\s\S]*?isIndexed: true/);
      expect(block).not.toBeNull();
    });

    it('should index sync_meta.module_name', () => {
      const block = SCHEMA.match(/name: 'sync_meta'[\s\S]*?name: 'module_name'[\s\S]*?isIndexed: true/);
      expect(block).not.toBeNull();
    });
  });

  describe('WatermelonDB adapter setup', () => {
    it('should import SQLiteAdapter', () => {
      expect(DATABASE).toContain("import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'");
    });

    it('should import schema', () => {
      expect(DATABASE).toContain("import { schema } from './schema'");
    });

    it('should import migrations', () => {
      expect(DATABASE).toContain("import { migrations } from './migrations'");
    });

    it('should enable JSI for performance', () => {
      expect(DATABASE).toContain('jsi: true');
    });

    it('should have onSetUpError handler', () => {
      expect(DATABASE).toContain('onSetUpError');
    });

    it('should create Database with adapter and modelClasses', () => {
      expect(DATABASE).toContain('const database = new Database');
      expect(DATABASE).toContain('adapter');
      expect(DATABASE).toContain('modelClasses');
    });

    it('should export database as default', () => {
      expect(DATABASE).toContain('export default database');
    });
  });

  describe('Model classes registered in database', () => {
    const requiredModels = [
      'Customer', 'Item', 'Price', 'JourneyPlanCustomer',
      'Order', 'OrderLine', 'StoreCheck', 'StoreCheckItem',
      'PlanogramExecution', 'Attendance', 'CustomerVisit',
      'SyncMeta', 'SellingSku',
      'ExpiryCheck', 'CompetitorBrand', 'CompetitorObservation',
      'OpeningStock', 'PhysicalStock', 'OsoiPhoto',
      'PoCapture', 'PoCaptureItem',
      'Initiative', 'InitiativeExecution', 'ProductSampling',
      'PermanentDisplay', 'PermanentDisplayCheck',
      'Survey', 'SurveyResponse', 'Prospect',
      'Collection', 'VanStockRecord', 'PriceCheck', 'ApprovalRecord',
    ];

    for (const model of requiredModels) {
      it(`should register ${model} model`, () => {
        expect(DATABASE).toContain(model);
      });
    }
  });

  describe('Schema versioning', () => {
    it('should have schema version defined', () => {
      expect(SCHEMA).toContain('version:');
    });

    it('should use appSchema wrapper', () => {
      expect(SCHEMA).toContain("import { appSchema, tableSchema }");
      expect(SCHEMA).toContain('appSchema({');
    });
  });
});
