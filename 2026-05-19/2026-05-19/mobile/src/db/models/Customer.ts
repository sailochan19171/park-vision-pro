import { Model } from '@nozbe/watermelondb';
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Customer extends Model {
  static table = 'customers';

  @text('server_id') serverId!: string;
  @text('code') code!: string;
  @text('name') name!: string;
  @text('address') address!: string | null;
  @text('city_code') cityCode!: string | null;
  @text('region_code') regionCode!: string | null;
  @text('channel_code') channelCode!: string | null;
  @text('customer_group') customerGroup!: string | null;
  @text('price_list') priceList!: string | null;
  @field('latitude') latitude!: number | null;
  @field('longitude') longitude!: number | null;
  @field('is_active') isActive!: boolean;
  @field('force_checkin_enabled') forceCheckinEnabled!: boolean | null;
  @field('force_checkout_enabled') forceCheckoutEnabled!: boolean | null;
  @field('server_updated_at') serverUpdatedAt!: number;
}
