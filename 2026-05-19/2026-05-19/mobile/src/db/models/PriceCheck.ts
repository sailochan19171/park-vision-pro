import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class PriceCheck extends Model {
  static table = 'price_checks';
  @field('app_trx_id') appTrxId!: string;
  @field('user_code') userCode!: string;
  @field('customer_code') customerCode!: string;
  @field('item_code') itemCode!: string;
  @field('expected_price') expectedPrice!: number;
  @field('actual_price') actualPrice!: number;
  @field('is_compliant') isCompliant!: boolean;
  @field('check_date') checkDate!: string;
  @field('is_synced') isSynced!: boolean;
}
