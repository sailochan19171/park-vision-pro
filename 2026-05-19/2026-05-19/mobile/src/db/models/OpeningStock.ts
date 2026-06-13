import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class OpeningStock extends Model {
  static table = 'opening_stocks';

  @text('app_trx_id') appTrxId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @text('item_code') itemCode!: string;
  @text('item_name') itemName!: string | null;
  @text('category') category!: string | null;
  @text('brand') brand!: string | null;
  @field('quantity') quantity!: number;
  @text('uom') uom!: string;
  @text('stock_date') stockDate!: string;
  @field('is_synced') isSynced!: boolean;
}
