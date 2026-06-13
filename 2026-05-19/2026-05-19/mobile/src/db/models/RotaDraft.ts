import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class RotaDraft extends Model {
  static table = 'rota_drafts';
  @field('app_trx_id') appTrxId!: string;
  @field('user_code') userCode!: string;
  @field('activity_name') activityName!: string;
  @field('rota_date') rotaDate!: string;
  @field('start_time') startTime!: string;
  @field('end_time') endTime!: string;
  @field('created_by') createdBy!: string;
  @field('is_synced') isSynced!: boolean;
}
