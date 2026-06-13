import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Initiative extends Model {
  static table = 'initiatives';

  @text('server_id') serverId!: string;
  @text('title') title!: string;
  @text('description') description!: string | null;
  @text('initiative_type') initiativeType!: string;
  @text('start_date') startDate!: string;
  @text('end_date') endDate!: string;
  @text('target_channel') targetChannel!: string | null;
  @field('is_active') isActive!: boolean;
  @text('image_path') imagePath!: string | null;
  @field('server_updated_at') serverUpdatedAt!: number;
}
