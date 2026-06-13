import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Price extends Model {
  static table = 'prices';

  @field('server_id') serverId!: number;
  @text('item_code') itemCode!: string;
  @text('price_list') priceList!: string;
  @text('region_code') regionCode!: string | null;
  @field('price') price!: number;
  @field('mrp') mrp!: number | null;
  @field('set_price') setPrice!: number | null;
  @text('currency_code') currencyCode!: string;
  @field('is_active') isActive!: boolean;
  @text('status') status!: string | null;
  @text('valid_from') validFrom!: string | null;
  @text('valid_to') validTo!: string | null;
  @field('min_quantity') minQuantity!: number | null;
  @field('max_quantity') maxQuantity!: number | null;
  @field('discount_percentage') discountPercentage!: number | null;
  @field('promotional_price') promotionalPrice!: number | null;
  @field('server_updated_at') serverUpdatedAt!: number | null;
}
