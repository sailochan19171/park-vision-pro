import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class SellingSku extends Model {
  static table = 'selling_skus';

  @text('item_code') itemCode!: string;
  @text('group_type') groupType!: string | null;
  @text('group_code') groupCode!: string;
  @field('is_core_sku') isCoreSku!: boolean;
  @field('min_qty') minQty!: number | null;
  @field('max_qty') maxQty!: number | null;
}
