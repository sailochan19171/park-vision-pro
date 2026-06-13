import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class ExpiryCheck extends Model {
  static table = 'expiry_checks';

  @text('app_trx_id') appTrxId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @text('item_code') itemCode!: string;
  @text('item_name') itemName!: string | null;
  @text('category') category!: string | null;
  @field('quantity') quantity!: number;
  @text('uom') uom!: string;
  @text('expiry_date') expiryDate!: string;
  @text('visited_date') visitedDate!: string;
  @text('status') status!: string;
  @field('is_synced') isSynced!: boolean;
}
