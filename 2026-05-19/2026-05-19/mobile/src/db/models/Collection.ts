import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Collection extends Model {
  static table = 'collections';
  @field('app_trx_id') appTrxId!: string;
  @field('user_code') userCode!: string;
  @field('customer_code') customerCode!: string;
  @field('amount') amount!: number;
  @field('payment_mode') paymentMode!: string;
  @field('reference_number') referenceNumber!: string;
  @field('collection_date') collectionDate!: string;
  @field('notes') notes!: string;
  @field('is_synced') isSynced!: boolean;
}
