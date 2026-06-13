import { Q } from '@nozbe/watermelondb';
import database from '../../db/database';
import api from '../../api/client';

/**
 * Service for Order-related operations.
 * Mirrors the 'orders' microservice on the backend.
 */
export const orderService = {
  /**
   * Sync orders from local DB to server.
   * This is called during the push sync process.
   */
  async getUnsyncedOrders() {
    return database
      .get('orders')
      .query(Q.where('is_synced', false))
      .fetch();
  },

  /**
   * Mark orders as synced based on server results.
   */
  async markAsSynced(trxCodes: string[]) {
    if (trxCodes.length === 0) return;
    await database.write(async () => {
      const records = await database
        .get('orders')
        .query(Q.where('trx_code', Q.oneOf(trxCodes)))
        .fetch();
      for (const rec of records) {
        await rec.update((r: any) => {
          r.isSynced = true;
        });
      }
    });
  },

  /**
   * Build the payload for pushing orders to the /sync/push endpoint.
   */
  async buildPushPayload(orders: any[]) {
    const created = [];
    for (const o of orders) {
      const lines = await o.lines.fetch();
      created.push({
        appTrxId: o.appTrxId,
        customerCode: o.customerCode,
        trxDate: new Date(o.trxDate).toISOString(),
        deliveryDate: o.deliveryDate,
        tripDate: o.tripDate,
        routeCode: o.routeCode,
        visitCode: o.visitCode,
        journeyCode: o.journeyCode,
        geoLat: o.geoLat,
        geoLng: o.geoLng,
        lines: lines.map((l: any) => ({
          itemCode: l.itemCode,
          quantity: l.quantity,
          uom: l.uom || 'EA',
          priceUsed: l.priceUsed,
        })),
      });
    }
    return created;
  }
};
