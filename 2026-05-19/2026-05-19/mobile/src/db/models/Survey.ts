import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Survey extends Model {
  static table = 'surveys';

  @text('server_id') serverId!: string;
  @text('title') title!: string;
  @text('description') description!: string | null;
  @text('target_channel') targetChannel!: string | null;
  @text('start_date') startDate!: string;
  @text('end_date') endDate!: string;
  @field('is_active') isActive!: boolean;
  @text('questions_json') questionsJson!: string;
  @field('server_updated_at') serverUpdatedAt!: number;
}
