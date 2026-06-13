import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class CompetitorBrand extends Model {
  static table = 'competitor_brands';

  @field('server_id') serverId!: number;
  @text('brand_code') brandCode!: string;
  @text('brand_name') brandName!: string;
  @text('company') company!: string | null;
  @text('category_code') categoryCode!: string | null;
  @text('category_name') categoryName!: string | null;
  @text('competitor_brand_code') competitorBrandCode!: string | null;
  @text('competitor_brand_name') competitorBrandName!: string | null;
}
