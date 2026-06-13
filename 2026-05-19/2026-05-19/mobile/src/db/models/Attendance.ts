import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Attendance extends Model {
  static table = 'attendance_records';

  @text('user_code') userCode!: string;
  @field('is_present') isPresent!: boolean;
  @text('selfie_path') selfiePath!: string | null;
  @text('attendance_date') attendanceDate!: string;
  @field('geo_lat') geoLat!: number | null;
  @field('geo_lng') geoLng!: number | null;
  @field('is_synced') isSynced!: boolean;
}
