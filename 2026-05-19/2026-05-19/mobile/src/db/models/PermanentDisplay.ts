import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class PermanentDisplay extends Model {
  static table = 'permanent_displays';

  @text('server_id') serverId!: string;
  @text('customer_code') customerCode!: string;
  @text('display_type') displayType!: string;
  @text('location_description') locationDescription!: string | null;
  @text('standard_image_path') standardImagePath!: string | null;
  @field('is_active') isActive!: boolean;
  @field('server_updated_at') serverUpdatedAt!: number;
}
