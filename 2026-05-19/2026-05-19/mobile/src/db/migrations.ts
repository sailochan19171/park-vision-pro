import { schemaMigrations, addColumns, createTable, unsafeExecuteSql } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'store_checks',
          columns: [
            { name: 'app_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'customer_name', type: 'string', isOptional: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'check_date', type: 'number' },
            { name: 'total_count', type: 'number' },
            { name: 'food_count', type: 'number' },
            { name: 'non_food_count', type: 'number' },
            { name: 'status', type: 'number' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'store_check_items',
          columns: [
            { name: 'store_check_id', type: 'string', isIndexed: true },
            { name: 'item_code', type: 'string' },
            { name: 'item_name', type: 'string' },
            { name: 'category_name', type: 'string', isOptional: true },
            { name: 'brand_name', type: 'string', isOptional: true },
            { name: 'shelf_quantity', type: 'number' },
            { name: 'store_quantity', type: 'number' },
            { name: 'is_available', type: 'boolean' },
            { name: 'reason', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'planogram_executions',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'category_code', type: 'string', isOptional: true },
            { name: 'performed_on', type: 'number' },
            { name: 'is_followed', type: 'boolean' },
            { name: 'pre_image', type: 'string', isOptional: true },
            { name: 'post_image', type: 'string', isOptional: true },
            { name: 'notes', type: 'string', isOptional: true },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'selling_skus',
          columns: [
            { name: 'item_code', type: 'string', isIndexed: true },
            { name: 'group_type', type: 'string', isOptional: true },
            { name: 'group_code', type: 'string', isIndexed: true },
            { name: 'is_core_sku', type: 'boolean' },
            { name: 'min_qty', type: 'number', isOptional: true },
            { name: 'max_qty', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'items',
          columns: [
            { name: 'image_path', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        createTable({
          name: 'expiry_checks',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'item_code', type: 'string' },
            { name: 'item_name', type: 'string', isOptional: true },
            { name: 'category', type: 'string', isOptional: true },
            { name: 'quantity', type: 'number' },
            { name: 'uom', type: 'string' },
            { name: 'expiry_date', type: 'string' },
            { name: 'visited_date', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'competitor_brands',
          columns: [
            { name: 'server_id', type: 'number' },
            { name: 'brand_code', type: 'string', isIndexed: true },
            { name: 'brand_name', type: 'string' },
            { name: 'company', type: 'string', isOptional: true },
            { name: 'category_code', type: 'string', isOptional: true },
            { name: 'category_name', type: 'string', isOptional: true },
            { name: 'competitor_brand_code', type: 'string', isOptional: true },
            { name: 'competitor_brand_name', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'competitor_observations',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'brand_name', type: 'string' },
            { name: 'product_name', type: 'string', isOptional: true },
            { name: 'category', type: 'string', isOptional: true },
            { name: 'price', type: 'number', isOptional: true },
            { name: 'image_path', type: 'string', isOptional: true },
            { name: 'notes', type: 'string', isOptional: true },
            { name: 'observed_on', type: 'number' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'opening_stocks',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'item_code', type: 'string' },
            { name: 'item_name', type: 'string', isOptional: true },
            { name: 'category', type: 'string', isOptional: true },
            { name: 'brand', type: 'string', isOptional: true },
            { name: 'quantity', type: 'number' },
            { name: 'uom', type: 'string' },
            { name: 'stock_date', type: 'string' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'physical_stocks',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'item_code', type: 'string' },
            { name: 'item_name', type: 'string', isOptional: true },
            { name: 'category', type: 'string', isOptional: true },
            { name: 'brand', type: 'string', isOptional: true },
            { name: 'system_qty', type: 'number' },
            { name: 'physical_qty', type: 'number' },
            { name: 'uom', type: 'string' },
            { name: 'stock_date', type: 'string' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'osoi_photos',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'asset_type', type: 'string' },
            { name: 'image_path', type: 'string' },
            { name: 'geo_lat', type: 'number', isOptional: true },
            { name: 'geo_lng', type: 'number', isOptional: true },
            { name: 'captured_on', type: 'number' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'po_captures',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'po_number', type: 'string' },
            { name: 'image_path', type: 'string', isOptional: true },
            { name: 'total_amount', type: 'number' },
            { name: 'captured_on', type: 'number' },
            { name: 'status', type: 'number' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'po_capture_items',
          columns: [
            { name: 'po_capture_id', type: 'string', isIndexed: true },
            { name: 'item_code', type: 'string' },
            { name: 'item_name', type: 'string', isOptional: true },
            { name: 'quantity', type: 'number' },
            { name: 'price', type: 'number' },
            { name: 'uom', type: 'string' },
          ],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        createTable({
          name: 'initiatives',
          columns: [
            { name: 'server_id', type: 'string', isIndexed: true },
            { name: 'title', type: 'string' },
            { name: 'description', type: 'string', isOptional: true },
            { name: 'initiative_type', type: 'string' },
            { name: 'start_date', type: 'string' },
            { name: 'end_date', type: 'string' },
            { name: 'target_channel', type: 'string', isOptional: true },
            { name: 'is_active', type: 'boolean' },
            { name: 'image_path', type: 'string', isOptional: true },
            { name: 'server_updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'initiative_executions',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'initiative_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'executed_on', type: 'number' },
            { name: 'notes', type: 'string', isOptional: true },
            { name: 'photo_path', type: 'string', isOptional: true },
            { name: 'status', type: 'string' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'product_samplings',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'item_code', type: 'string' },
            { name: 'item_name', type: 'string', isOptional: true },
            { name: 'quantity_sampled', type: 'number' },
            { name: 'uom', type: 'string' },
            { name: 'consumer_feedback', type: 'string', isOptional: true },
            { name: 'sampled_on', type: 'number' },
            { name: 'photo_path', type: 'string', isOptional: true },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'permanent_displays',
          columns: [
            { name: 'server_id', type: 'string', isIndexed: true },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'display_type', type: 'string' },
            { name: 'location_description', type: 'string', isOptional: true },
            { name: 'standard_image_path', type: 'string', isOptional: true },
            { name: 'is_active', type: 'boolean' },
            { name: 'server_updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'permanent_display_checks',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'display_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'is_compliant', type: 'boolean' },
            { name: 'issue_description', type: 'string', isOptional: true },
            { name: 'photo_path', type: 'string', isOptional: true },
            { name: 'checked_on', type: 'number' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'surveys',
          columns: [
            { name: 'server_id', type: 'string', isIndexed: true },
            { name: 'title', type: 'string' },
            { name: 'description', type: 'string', isOptional: true },
            { name: 'target_channel', type: 'string', isOptional: true },
            { name: 'start_date', type: 'string' },
            { name: 'end_date', type: 'string' },
            { name: 'is_active', type: 'boolean' },
            { name: 'questions_json', type: 'string' },
            { name: 'server_updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'survey_responses',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'survey_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'visit_code', type: 'string', isOptional: true },
            { name: 'answers_json', type: 'string' },
            { name: 'completed_on', type: 'number' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'prospects',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'server_id', type: 'string', isOptional: true },
            { name: 'user_code', type: 'string' },
            { name: 'prospect_name', type: 'string' },
            { name: 'contact_name', type: 'string', isOptional: true },
            { name: 'phone', type: 'string', isOptional: true },
            { name: 'address', type: 'string', isOptional: true },
            { name: 'city', type: 'string', isOptional: true },
            { name: 'channel_type', type: 'string', isOptional: true },
            { name: 'geo_lat', type: 'number', isOptional: true },
            { name: 'geo_lng', type: 'number', isOptional: true },
            { name: 'photo_path', type: 'string', isOptional: true },
            { name: 'status', type: 'string' },
            { name: 'notes', type: 'string', isOptional: true },
            { name: 'created_on', type: 'number' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        createTable({
          name: 'collections',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'amount', type: 'number' },
            { name: 'payment_mode', type: 'string' },
            { name: 'reference_number', type: 'string', isOptional: true },
            { name: 'collection_date', type: 'string' },
            { name: 'notes', type: 'string', isOptional: true },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'van_stock_records',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'item_code', type: 'string', isIndexed: true },
            { name: 'loaded_qty', type: 'number' },
            { name: 'sold_qty', type: 'number' },
            { name: 'balance_qty', type: 'number' },
            { name: 'stock_date', type: 'string' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'price_checks',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string' },
            { name: 'customer_code', type: 'string', isIndexed: true },
            { name: 'item_code', type: 'string' },
            { name: 'expected_price', type: 'number' },
            { name: 'actual_price', type: 'number' },
            { name: 'is_compliant', type: 'boolean' },
            { name: 'check_date', type: 'string' },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'approval_records',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'request_type', type: 'string' },
            { name: 'reference_code', type: 'string', isOptional: true },
            { name: 'requester_code', type: 'string' },
            { name: 'approver_code', type: 'string', isOptional: true },
            { name: 'amount', type: 'number', isOptional: true },
            { name: 'status', type: 'string' },
            { name: 'notes', type: 'string', isOptional: true },
            { name: 'resolved_at', type: 'number', isOptional: true },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'customer_visits',
          columns: [
            { name: 'checkin_image', type: 'string', isOptional: true },
            { name: 'checkout_lat', type: 'number', isOptional: true },
            { name: 'checkout_lng', type: 'number', isOptional: true },
            { name: 'checkout_image', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 9,
      steps: [
        addColumns({
          table: 'customer_visits',
          columns: [
            { name: 'checkin_type', type: 'string', isOptional: true },
            { name: 'checkout_type', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 10,
      steps: [
        addColumns({
          table: 'attendance_records',
          columns: [
            { name: 'attendance_type', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // Add indexes on hot columns to stop full-table scans once the local
      // offline queue grows. WatermelonDB's addColumns can't add an index to
      // an existing column, so we fall back to raw SQL — CREATE INDEX IF NOT
      // EXISTS is safe to re-run.
      toVersion: 11,
      steps: [
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_orders_user_code ON orders(user_code);
          CREATE INDEX IF NOT EXISTS idx_orders_trx_date ON orders(trx_date);
          CREATE INDEX IF NOT EXISTS idx_orders_is_synced ON orders(is_synced);
          CREATE INDEX IF NOT EXISTS idx_customer_visits_user_code ON customer_visits(user_code);
          CREATE INDEX IF NOT EXISTS idx_customer_visits_checkin_time ON customer_visits(checkin_time);
          CREATE INDEX IF NOT EXISTS idx_customer_visits_is_synced ON customer_visits(is_synced);
          CREATE INDEX IF NOT EXISTS idx_store_checks_user_code ON store_checks(user_code);
          CREATE INDEX IF NOT EXISTS idx_store_checks_check_date ON store_checks(check_date);
          CREATE INDEX IF NOT EXISTS idx_store_checks_is_synced ON store_checks(is_synced);
          CREATE INDEX IF NOT EXISTS idx_attendance_records_user_code ON attendance_records(user_code);
          CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(attendance_date);
          CREATE INDEX IF NOT EXISTS idx_attendance_records_is_synced ON attendance_records(is_synced);
          CREATE INDEX IF NOT EXISTS idx_opening_stocks_user_code ON opening_stocks(user_code);
          CREATE INDEX IF NOT EXISTS idx_opening_stocks_is_synced ON opening_stocks(is_synced);
          CREATE INDEX IF NOT EXISTS idx_physical_stocks_user_code ON physical_stocks(user_code);
          CREATE INDEX IF NOT EXISTS idx_physical_stocks_is_synced ON physical_stocks(is_synced);
          CREATE INDEX IF NOT EXISTS idx_osoi_photos_user_code ON osoi_photos(user_code);
          CREATE INDEX IF NOT EXISTS idx_osoi_photos_is_synced ON osoi_photos(is_synced);
          CREATE INDEX IF NOT EXISTS idx_po_captures_user_code ON po_captures(user_code);
          CREATE INDEX IF NOT EXISTS idx_po_captures_is_synced ON po_captures(is_synced);
          CREATE INDEX IF NOT EXISTS idx_planogram_executions_user_code ON planogram_executions(user_code);
          CREATE INDEX IF NOT EXISTS idx_planogram_executions_is_synced ON planogram_executions(is_synced);
          CREATE INDEX IF NOT EXISTS idx_expiry_checks_user_code ON expiry_checks(user_code);
          CREATE INDEX IF NOT EXISTS idx_expiry_checks_is_synced ON expiry_checks(is_synced);
          CREATE INDEX IF NOT EXISTS idx_competitor_observations_user_code ON competitor_observations(user_code);
          CREATE INDEX IF NOT EXISTS idx_competitor_observations_is_synced ON competitor_observations(is_synced);
        `),
      ],
    },
    {
      toVersion: 12,
      steps: [
        createTable({
          name: 'rota_drafts',
          columns: [
            { name: 'app_trx_id', type: 'string', isIndexed: true },
            { name: 'user_code', type: 'string', isIndexed: true },
            { name: 'activity_name', type: 'string' },
            { name: 'rota_date', type: 'string', isIndexed: true },
            { name: 'start_time', type: 'string', isOptional: true },
            { name: 'end_time', type: 'string', isOptional: true },
            { name: 'created_by', type: 'string' },
            { name: 'is_synced', type: 'boolean', isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 13,
      steps: [
        addColumns({
          table: 'po_captures',
          columns: [
            { name: 'geo_lat', type: 'number', isOptional: true },
            { name: 'geo_lng', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 14,
      steps: [
        addColumns({
          table: 'physical_stocks',
          columns: [
            { name: 'image_path', type: 'string', isOptional: true },
            { name: 'captured_on', type: 'number', isOptional: true },
            { name: 'geo_lat', type: 'number', isOptional: true },
            { name: 'geo_lng', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 15,
      steps: [
        createTable({
          name: 'planogram_setups',
          columns: [
            { name: 'server_id', type: 'number', isIndexed: true },
            { name: 'selection_type', type: 'string', isIndexed: true },
            { name: 'selection_value', type: 'string', isIndexed: true },
            { name: 'category_code', type: 'string' },
            { name: 'category_name', type: 'string', isOptional: true },
            { name: 'share_of_shelf_cm', type: 'number' },
            { name: 'suggested_image', type: 'string', isOptional: true },
            { name: 'instructions', type: 'string', isOptional: true },
            { name: 'is_active', type: 'boolean' },
            { name: 'server_updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 16,
      steps: [
        addColumns({
          table: 'competitor_observations',
          columns: [
            { name: 'selling_price', type: 'number', isOptional: true },
            { name: 'uom', type: 'string', isOptional: true },
            { name: 'geo_lat', type: 'number', isOptional: true },
            { name: 'geo_lng', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 17,
      steps: [
        addColumns({
          table: 'product_samplings',
          columns: [
            { name: 'selling_price', type: 'number', isOptional: true },
            { name: 'units_sold', type: 'number', isOptional: true },
            { name: 'customers_approached', type: 'number', isOptional: true },
            { name: 'geo_lat', type: 'number', isOptional: true },
            { name: 'geo_lng', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 18,
      steps: [
        addColumns({
          table: 'planogram_executions',
          columns: [
            { name: 'geo_lat', type: 'number', isOptional: true },
            { name: 'geo_lng', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 19,
      steps: [
        addColumns({
          table: 'osoi_photos',
          columns: [
            { name: 'approval_status', type: 'string', isOptional: true },
            { name: 'approved_by', type: 'string', isOptional: true },
            { name: 'approved_on', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'planogram_executions',
          columns: [
            { name: 'approval_status', type: 'string', isOptional: true },
            { name: 'approved_by', type: 'string', isOptional: true },
            { name: 'approved_on', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 20,
      steps: [
        createTable({
          name: 'app_settings',
          columns: [
            { name: 'server_id', type: 'string' },
            { name: 'key', type: 'string', isIndexed: true },
            { name: 'value', type: 'string' },
          ],
        }),
      ],
    },
    {
      toVersion: 21,
      steps: [
        // region_code distinguishes base prices (NULL) from regional overrides
        // so they no longer collide on one record id during sync.
        addColumns({
          table: 'prices',
          columns: [
            { name: 'region_code', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    {
      // v22: prices regional/promo columns + asset_type on planogram_setups.
      // These two column sets were briefly authored as two SEPARATE v22
      // migrations (an invalid duplicate that crashed startup) and are merged
      // here into a single v22 migration. schema.ts already defines both.
      toVersion: 22,
      steps: [
        addColumns({
          table: 'prices',
          columns: [
            { name: 'status', type: 'string', isOptional: true },
            { name: 'valid_from', type: 'string', isOptional: true },
            { name: 'valid_to', type: 'string', isOptional: true },
            { name: 'min_quantity', type: 'number', isOptional: true },
            { name: 'max_quantity', type: 'number', isOptional: true },
            { name: 'discount_percentage', type: 'number', isOptional: true },
            { name: 'promotional_price', type: 'number', isOptional: true },
            { name: 'server_updated_at', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'planogram_setups',
          columns: [
            { name: 'asset_type', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
  ],
});

