import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class StoreCheckItem extends Model {
  static table = 'store_check_items';

  @text('store_check_id') storeCheckId!: string;
  @text('item_code') itemCode!: string;
  @text('item_name') itemName!: string;
  @text('category_name') categoryName!: string | null;
  @text('brand_name') brandName!: string | null;
  @field('shelf_quantity') shelfQuantity!: number;
  @field('store_quantity') storeQuantity!: number;
  @field('is_available') isAvailable!: boolean;
  @text('reason') reason!: string | null;
}
