import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class SurveyResponse extends Model {
  static table = 'survey_responses';

  @text('app_trx_id') appTrxId!: string;
  @text('survey_id') surveyId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('visit_code') visitCode!: string | null;
  @text('answers_json') answersJson!: string;
  @field('completed_on') completedOn!: number;
  @field('is_synced') isSynced!: boolean;
}
