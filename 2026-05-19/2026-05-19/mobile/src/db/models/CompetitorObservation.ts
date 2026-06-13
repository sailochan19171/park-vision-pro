import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class CompetitorObservation extends Model {
  static table = 'competitor_observations';

  @text('app_trx_id') appTrxId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @text('brand_name') brandName!: string;
  @text('product_name') productName!: string | null;
  @text('category') category!: string | null;
  @field('price') price!: number | null;
  @field('selling_price') sellingPrice!: number | null;
  @text('uom') uom!: string | null;
  @text('image_path') imagePath!: string | null;
  @text('notes') notes!: string | null;
  @field('observed_on') observedOn!: number;
  @field('geo_lat') geoLat!: number | null;
  @field('geo_lng') geoLng!: number | null;
  @field('is_synced') isSynced!: boolean;
}
