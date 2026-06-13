# Sync Strategy — Farmley SFA v2 Mobile

## Overview

The app works **offline-first**. All data is saved locally in WatermelonDB first, then synced to the server when conditions allow. Day End triggers a final push of all unsynced records.

---

## Sync Triggers

| Trigger | What Happens |
|---------|-------------|
| **Start Day** | Checks server reachability, pulls latest master data |
| **Background (every 15 min)** | Incremental pull + push of unsynced records |
| **Day End Submit** | Push ALL unsynced records across all 20 entity types |
| **Manual (Settings)** | User can force a full sync from Settings screen |

---

## Low Battery Handling

| Battery Level | Behavior |
|--------------|----------|
| **>= 20%** | Normal operation, all syncs allowed |
| **< 20%** | Start Day blocked — user must charge before starting |
| **< 10%** | Background sync should be paused to conserve battery |
| **Charging** | All syncs proceed normally regardless of level |

### Implementation
- Start Day screen reads battery from `/sys/class/power_supply/battery/capacity`
- If < 20%, the Attendance button is disabled
- Background sync should check battery before running

---

## Low Network / Offline Handling

| Condition | Behavior |
|-----------|----------|
| **No network** | All data saved locally. Sync queued for later. No data loss. |
| **Slow network (>5s latency)** | Timeout set to 30s per request. Retry with exponential backoff. |
| **Intermittent network** | Retry up to 2 times with 800ms base delay (doubles each attempt) |
| **Server down (502/503/504)** | Treated as retryable. Same retry logic applies. |
| **Auth expired (401)** | Auto-refresh token. If refresh fails, user must re-login. |

### Retry Logic
```
Attempt 0: Immediate
Attempt 1: 800ms + random jitter
Attempt 2: 1600ms + random jitter
Then: FAIL — record stays unsynced, will retry next background sync
```

### Retryable Errors
- `Network Error` / `ERR_NETWORK`
- `ECONNABORTED` / `ECONNRESET` / `ETIMEDOUT`
- HTTP 408, 502, 503, 504
- No response received

---

## Sync Architecture

### Single-Request Batch Push
All entities are sent in **one HTTP request** to `/sync/push`:

```
POST /api/v1/sync/push
{
  "changes": {
    "orders": { "created": [...] },
    "attendance": { "created": [...] },
    "customer_visits": { "created": [...] },
    ... (up to 20 entity types)
  }
}
```

**Why single request:**
- 1 request instead of 18+ separate calls
- Reduces total network time from ~30s to ~2-3s
- Single retry scope — all or nothing
- Server processes all entities in one transaction

### Deduplication
- Every record has a unique `appTrxId` (UUID generated on device)
- Server uses `upload_dedup` table to detect duplicates
- If the same `appTrxId` is pushed again, server returns `status: "duplicate"` — no double-counting
- This makes retries safe — push the same data multiple times without side effects

### Conflict Resolution
- **Last-write-wins** for most entities
- Server is the source of truth for master data (customers, items, prices)
- Mobile is the source of truth for transaction data (orders, visits, checks)

---

## Day End Sync Flow

```
1. User taps "Submit" on End of Day screen
2. App reads ALL unsynced records from local DB (parallel queries)
3. Builds payload for entities that have data
4. Sends single POST /sync/push with all changes
5. Server processes and returns per-entity results
6. App marks successful records as is_synced = true
7. Shows summary: X success, Y failed
8. If failures: records stay unsynced, will retry on next sync
9. Day is marked as ended in AsyncStorage
```

### If Day End Sync Fails Completely
- Records are NOT lost — they remain in local DB with `is_synced = false`
- Next day's background sync will pick them up
- User can also retry by going to End of Day again
- Data is never deleted from local DB until successfully synced

---

## Start Day Pre-Requisite Checks

| Check | What It Verifies | Pass Criteria |
|-------|-----------------|---------------|
| **Synchronization** | Server is reachable | GET /sync/status returns any response |
| **Connectivity** | Network latency | Server responds within 8 seconds |
| **Network** | Internet available | Google generate_204 or server reachable |
| **Location** | GPS permission granted | Android FINE_LOCATION permission allowed |
| **Battery** | Sufficient charge | Battery >= 20% |

All 5 checks must pass before user can mark attendance and start the day.

---

## Entity Types Synced (20 total)

| # | Entity | Table | ID Field |
|---|--------|-------|----------|
| 1 | Orders | orders | appTrxId |
| 2 | Order Lines | order_lines | (child of orders) |
| 3 | Attendance | attendance_records | id |
| 4 | Customer Visits | customer_visits | id |
| 5 | Store Checks | store_checks | appId |
| 6 | Store Check Items | store_check_items | (child of store_checks) |
| 7 | Planogram Executions | planogram_executions | appTrxId |
| 8 | Expiry Checks | expiry_checks | appTrxId |
| 9 | Competitor Observations | competitor_observations | appTrxId |
| 10 | Opening Stocks | opening_stocks | appTrxId |
| 11 | Physical Stocks | physical_stocks | appTrxId |
| 12 | OSOI Photos | osoi_photos | appTrxId |
| 13 | Product Samplings | product_samplings | appTrxId |
| 14 | PO Captures | po_captures | appTrxId |
| 15 | PO Capture Items | po_capture_items | (child of po_captures) |
| 16 | Initiative Executions | initiative_executions | appTrxId |
| 17 | Permanent Display Checks | permanent_display_checks | appTrxId |
| 18 | Survey Responses | survey_responses | appTrxId |
| 19 | Prospects | prospects | appTrxId |
| 20 | Collections | collections | appTrxId |
| 21 | Van Stock Records | van_stock_records | appTrxId |
| 22 | Price Checks | price_checks | appTrxId |
| 23 | Approvals | approval_records | appTrxId |

---

## Timeouts

| Operation | Timeout |
|-----------|---------|
| Normal API calls | 30 seconds |
| Sync push (batch) | 30 seconds |
| Start Day checks | 8 seconds |
| Network check (Google) | 5 seconds |
| Token refresh | 10 seconds |

---

## Known Limitations

1. **FusedLocationProvider crash** — `react-native-geolocation-service` has a native incompatibility with the current `play-services-location` version. GPS calls via `getCurrentPosition()` crash the app. Workaround: only check permission, don't call GPS in Start Day or photo capture screens. Location is captured during customer check-in via a different code path.

2. **No image upload** — Photos are stored as local file URIs. The sync only pushes the path string, not the actual image binary. Image upload to cloud storage is a future enhancement.

3. **No partial retry** — If the batch push fails, all entities in that request fail. Individual entity retry is not supported in the current batch approach.
