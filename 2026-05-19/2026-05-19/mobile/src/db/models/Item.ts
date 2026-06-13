import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Item extends Model {
  static table = 'items';

  @text('server_id') serverId!: string;
  @text('code') code!: string;
  @text('name') name!: string;
  @text('brand') brand!: string | null;
  @text('category') category!: string | null;
  @text('division') division!: string | null;
  @text('base_uom') baseUom!: string;
  @text('tax_key') taxKey!: string | null;
  @text('image_path') imagePath!: string | null;
  @field('is_active') isActive!: boolean;
  @field('server_updated_at') serverUpdatedAt!: number;
}
