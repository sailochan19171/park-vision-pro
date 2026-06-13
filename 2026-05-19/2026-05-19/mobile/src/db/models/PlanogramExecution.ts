import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class PlanogramExecution extends Model {
  static table = 'planogram_executions';

  @text('app_trx_id') appTrxId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @text('category_code') categoryCode!: string | null;
  @field('performed_on') performedOn!: number;
  @field('is_followed') isFollowed!: boolean;
  @text('pre_image') preImage!: string | null;
  @text('post_image') postImage!: string | null;
  @text('notes') notes!: string | null;
  @field('geo_lat') geoLat!: number | null;
  @field('geo_lng') geoLng!: number | null;
  @text('approval_status') approvalStatus!: string | null;
  @text('approved_by') approvedBy!: string | null;
  @field('approved_on') approvedOn!: number | null;
  @field('is_synced') isSynced!: boolean;
}
