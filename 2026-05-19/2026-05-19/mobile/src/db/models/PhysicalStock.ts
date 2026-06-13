import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class PhysicalStock extends Model {
  static table = 'physical_stocks';

  @text('app_trx_id') appTrxId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @text('item_code') itemCode!: string;
  @text('item_name') itemName!: string | null;
  @text('category') category!: string | null;
  @text('brand') brand!: string | null;
  @field('system_qty') systemQty!: number;
  @field('physical_qty') physicalQty!: number;
  @text('uom') uom!: string;
  @text('stock_date') stockDate!: string;
  @text('image_path') imagePath!: string | null;
  @field('captured_on') capturedOn!: number | null;
  @field('geo_lat') geoLat!: number | null;
  @field('geo_lng') geoLng!: number | null;
  @field('is_synced') isSynced!: boolean;
}
