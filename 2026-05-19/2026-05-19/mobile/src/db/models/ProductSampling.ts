import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class ProductSampling extends Model {
  static table = 'product_samplings';

  @text('app_trx_id') appTrxId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @text('item_code') itemCode!: string;
  @text('item_name') itemName!: string | null;
  @field('quantity_sampled') quantitySampled!: number;
  @text('uom') uom!: string;
  @text('consumer_feedback') consumerFeedback!: string | null;
  @field('selling_price') sellingPrice!: number | null;
  @field('units_sold') unitsSold!: number | null;
  @field('customers_approached') customersApproached!: number | null;
  @field('sampled_on') sampledOn!: number;
  @text('photo_path') photoPath!: string | null;
  @field('geo_lat') geoLat!: number | null;
  @field('geo_lng') geoLng!: number | null;
  @field('is_synced') isSynced!: boolean;
}
