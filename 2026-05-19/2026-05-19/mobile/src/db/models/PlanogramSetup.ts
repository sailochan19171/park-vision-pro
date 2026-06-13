import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class PlanogramSetup extends Model {
  static table = 'planogram_setups';

  @field('server_id') serverId!: number;
  @text('selection_type') selectionType!: string;
  @text('selection_value') selectionValue!: string;
  @text('category_code') categoryCode!: string;
  @text('category_name') categoryName!: string | null;
  @text('asset_type') assetType!: string | null;
  @field('share_of_shelf_cm') shareOfShelfCm!: number;
  @text('suggested_image') suggestedImage!: string | null;
  @text('instructions') instructions!: string | null;
  @field('is_active') isActive!: boolean;
  @field('server_updated_at') serverUpdatedAt!: number;
}
