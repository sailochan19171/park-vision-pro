import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class InitiativeExecution extends Model {
  static table = 'initiative_executions';

  @text('app_trx_id') appTrxId!: string;
  @text('initiative_id') initiativeId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @field('executed_on') executedOn!: number;
  @text('notes') notes!: string | null;
  @text('photo_path') photoPath!: string | null;
  @text('status') status!: string;
  @field('is_synced') isSynced!: boolean;
}
