import { Q } from '@nozbe/watermelondb';
import database from '../../db/database';
import api from '../../api/client';

/**
 * Service for Attendance and Customer Visits.
 * Mirrors the 'visits' microservice on the backend.
 */
export const visitService = {
  async getUnsyncedAttendance() {
    return database.get('attendance_records').query(Q.where('is_synced', false)).fetch();
  },

  async getUnsyncedVisits() {
    return database.get('customer_visits').query(Q.where('is_synced', false)).fetch();
  },

  async markAttendanceSynced(ids: string[]) {
    if (ids.length === 0) return;
    await database.write(async () => {
      const records = await database.get('attendance_records').query(Q.where('id', Q.oneOf(ids))).fetch();
      for (const rec of records) {
        await rec.update((r: any) => { r.isSynced = true; });
      }
    });
  },

  async markVisitsSynced(ids: string[]) {
    if (ids.length === 0) return;
    await database.write(async () => {
      const records = await database.get('customer_visits').query(Q.where('id', Q.oneOf(ids))).fetch();
      for (const rec of records) {
        await rec.update((r: any) => { r.isSynced = true; });
      }
    });
  }
};
