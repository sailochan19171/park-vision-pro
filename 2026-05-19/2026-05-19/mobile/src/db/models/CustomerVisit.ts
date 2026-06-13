import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class CustomerVisit extends Model {
  static table = 'customer_visits';

  @text('visit_code') visitCode!: string;
  @text('user_code') userCode!: string;
  @text('customer_code') customerCode!: string;
  @text('customer_name') customerName!: string | null;
  @field('checkin_time') checkinTime!: number;
  @field('checkout_time') checkoutTime!: number | null;
  @field('checkin_lat') checkinLat!: number | null;
  @field('checkin_lng') checkinLng!: number | null;
  @text('checkin_image') checkinImage!: string | null;
  @field('checkout_lat') checkoutLat!: number | null;
  @field('checkout_lng') checkoutLng!: number | null;
  @text('checkout_image') checkoutImage!: string | null;
  @field('duration_mins') durationMins!: number | null;
  @text('status') status!: string;
  @field('is_synced') isSynced!: boolean;
}
