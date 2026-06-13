import { Model } from '@nozbe/watermelondb';
import { field, text, children } from '@nozbe/watermelondb/decorators';
import type { Query } from '@nozbe/watermelondb';
import type PoCaptureItem from './PoCaptureItem';

export default class PoCapture extends Model {
  static table = 'po_captures';

  static associations = {
    po_capture_items: { type: 'has_many' as const, foreignKey: 'po_capture_id' },
  };

  @text('app_trx_id') appTrxId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @text('po_number') poNumber!: string;
  @text('image_path') imagePath!: string | null;
  @field('total_amount') totalAmount!: number;
  @field('captured_on') capturedOn!: number;
  @field('geo_lat') geoLat!: number | null;
  @field('geo_lng') geoLng!: number | null;
  @field('status') status!: number;
  @field('is_synced') isSynced!: boolean;

  @children('po_capture_items') poCaptureItems!: Query<PoCaptureItem>;
}
