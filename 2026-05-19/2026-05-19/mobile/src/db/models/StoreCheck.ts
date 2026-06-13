import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class StoreCheck extends Model {
  static table = 'store_checks';

  @text('app_id') appId!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('customer_name') customerName!: string | null;
  @text('visit_code') visitCode!: string | null;
  @field('check_date') checkDate!: number;
  @field('total_count') totalCount!: number;
  @field('food_count') foodCount!: number;
  @field('non_food_count') nonFoodCount!: number;
  @field('status') status!: number;
  @field('is_synced') isSynced!: boolean;
}
