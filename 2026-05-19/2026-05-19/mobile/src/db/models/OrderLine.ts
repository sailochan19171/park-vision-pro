import { Model } from '@nozbe/watermelondb';
import { field, text, immutableRelation } from '@nozbe/watermelondb/decorators';
import type { Relation } from '@nozbe/watermelondb';
import type Order from './Order';

export default class OrderLine extends Model {
  static table = 'order_lines';

  static associations = {
    orders: { type: 'belongs_to' as const, key: 'order_id' },
  };

  @immutableRelation('orders', 'order_id') order!: Relation<Order>;
  @field('line_no') lineNo!: number;
  @text('item_code') itemCode!: string;
  @text('item_name') itemName!: string | null;
  @field('quantity') quantity!: number;
  @field('price_used') priceUsed!: number;
  @field('tax_pct') taxPct!: number;
  @text('uom') uom!: string;
}
