import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class SyncMeta extends Model {
  static table = 'sync_meta';

  @text('module_name') moduleName!: string;
  @text('last_cursor') lastCursor!: string | null;
  @field('last_synced_at') lastSyncedAt!: number;
}
