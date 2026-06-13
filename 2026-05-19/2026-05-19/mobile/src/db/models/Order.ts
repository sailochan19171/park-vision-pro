import { Model } from '@nozbe/watermelondb';
import { field, text, children } from '@nozbe/watermelondb/decorators';
import type { Query } from '@nozbe/watermelondb';
import type OrderLine from './OrderLine';

export default class Order extends Model {
  static table = 'orders';

  static associations = {
    order_lines: { type: 'has_many' as const, foreignKey: 'order_id' },
  };

  @text('app_trx_id') appTrxId!: string;
  @text('server_trx_code') serverTrxCode!: string | null;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('customer_name') customerName!: string | null;
  @field('trx_date') trxDate!: number;
  @field('total_amount') totalAmount!: number;
  @field('lines_count') linesCount!: number;
  @field('status') status!: number;
  @text('route_code') routeCode!: string | null;
  @field('geo_lat') geoLat!: number | null;
  @field('geo_lng') geoLng!: number | null;
  @field('is_synced') isSynced!: boolean;

  @children('order_lines') orderLines!: Query<OrderLine>;
}
