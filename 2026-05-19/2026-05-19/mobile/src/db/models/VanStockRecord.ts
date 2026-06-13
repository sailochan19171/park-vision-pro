import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class VanStockRecord extends Model {
  static table = 'van_stock_records';
  @field('app_trx_id') appTrxId!: string;
  @field('user_code') userCode!: string;
  @field('item_code') itemCode!: string;
  @field('loaded_qty') loadedQty!: number;
  @field('sold_qty') soldQty!: number;
  @field('balance_qty') balanceQty!: number;
  @field('stock_date') stockDate!: string;
  @field('is_synced') isSynced!: boolean;
}
