import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class OsoiPhoto extends Model {
  static table = 'osoi_photos';

  @text('app_trx_id') appTrxId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @text('asset_type') assetType!: string;
  @text('image_path') imagePath!: string;
  @field('geo_lat') geoLat!: number | null;
  @field('geo_lng') geoLng!: number | null;
  @field('captured_on') capturedOn!: number;
  @text('approval_status') approvalStatus!: string | null;
  @text('approved_by') approvedBy!: string | null;
  @field('approved_on') approvedOn!: number | null;
  @field('is_synced') isSynced!: boolean;
}
