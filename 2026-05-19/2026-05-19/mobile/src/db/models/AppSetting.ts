import { Model } from '@nozbe/watermelondb';
import { text } from '@nozbe/watermelondb/decorators';

export default class AppSetting extends Model {
  static table = 'app_settings';

  @text('server_id') serverId!: string;
  @text('key') key!: string;
  @text('value') value!: string;
}
