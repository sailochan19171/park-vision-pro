import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Prospect extends Model {
  static table = 'prospects';

  @text('app_trx_id') appTrxId!: string;
  @text('server_id') serverId!: string | null;
  @text('user_code') userCode!: string;
  @text('prospect_name') prospectName!: string;
  @text('contact_name') contactName!: string | null;
  @text('phone') phone!: string | null;
  @text('address') address!: string | null;
  @text('city') city!: string | null;
  @text('channel_type') channelType!: string | null;
  @field('geo_lat') geoLat!: number | null;
  @field('geo_lng') geoLng!: number | null;
  @text('photo_path') photoPath!: string | null;
  @text('status') status!: string;
  @text('notes') notes!: string | null;
  @field('created_on') createdOn!: number;
  @field('is_synced') isSynced!: boolean;
}
