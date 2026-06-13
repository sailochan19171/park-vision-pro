import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class PermanentDisplayCheck extends Model {
  static table = 'permanent_display_checks';

  @text('app_trx_id') appTrxId!: string;
  @text('display_id') displayId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @field('is_compliant') isCompliant!: boolean;
  @text('issue_description') issueDescription!: string | null;
  @text('photo_path') photoPath!: string | null;
  @field('checked_on') checkedOn!: number;
  @field('is_synced') isSynced!: boolean;
}
