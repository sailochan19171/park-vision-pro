import { Q } from '@nozbe/watermelondb';

export interface PriceInfo {
  price: number;
  mrp: number | null;
  setPrice: number | null;
}

const GT = 'GT';

// Normalize a region / list code for comparison: trim + lowercase. The web
// portal sometimes stores "Telangana", the customer master is imported as
// " telangana ", and a CSV bulk-load may write "TELANGANA" — without
// normalization the override rows match nothing and the user keeps seeing
// the base GT price. Server-side priceResolver only does strict equality
// (it runs against a single canonical Postgres dataset where the trigger
// keeps casing consistent), but on the device the master comes from
// multiple sources so we're defensive here.
const norm = (s: string | null | undefined): string =>
  (s ?? '').toString().trim().toLowerCase();

// Build a per-item effective-price map for a customer on `priceList` in
// `regionCode`, applying region-preferred precedence with a GT fallback:
//   (priceList, region) → (priceList, base) → (GT, region) → (GT, base)
// Rows for a *different* region are ignored (a regional override only applies
// to its own region). Mirrors the server-side resolver (priceResolver.ts).
export async function buildPriceMap(
  database: any,
  priceList: string | null | undefined,
  regionCode: string | null | undefined,
): Promise<Map<string, PriceInfo>> {
  const normList = norm(priceList);
  const normRegion = norm(regionCode);
  const normGT = norm(GT);

  // Restrict the DB read to GT + the customer's chain list. We pass the
  // raw `priceList` value here (not the normalized one) because the
  // WatermelonDB `price_list` column stores the canonical mixed-case
  // string; equality is fine at this stage. The normalized comparison
  // happens below per-row.
  const lists = priceList && normList !== normGT ? [priceList, GT] : [GT];

  const rows: any[] = await database
    .get('prices')
    .query(Q.where('price_list', Q.oneOf(lists)), Q.where('is_active', true))
    .fetch();

  // Lower score = higher priority.
  const scoreOf = (r: any): number | null => {
    const rRegionRaw: string | null = r._raw.region_code ?? null;
    const rRegion = norm(rRegionRaw);
    // A row with a non-null region_code is a regional override. If we
    // have a customer region, skip rows tagged for a different region.
    // If we don't have a customer region but the row IS regional,
    // skip it (it can't legitimately apply to a region-less customer).
    if (rRegionRaw !== null) {
      if (!normRegion) return null;
      if (rRegion !== normRegion) return null;
    }
    const rList = norm(r._raw.price_list);
    const listRank = rList === normList ? 0 : 1; // chain list beats GT
    const regionRank = rRegionRaw !== null ? 0 : 1; // region match beats base
    return listRank * 2 + regionRank;
  };

  const best = new Map<string, { score: number; info: PriceInfo }>();
  for (const r of rows) {
    const score = scoreOf(r);
    if (score === null) continue;
    const itemCode = r._raw.item_code as string;
    const current = best.get(itemCode);
    if (!current || score < current.score) {
      best.set(itemCode, {
        score,
        info: { price: r.price, mrp: r._raw?.mrp ?? null, setPrice: r._raw?.set_price ?? null },
      });
    }
  }

  const result = new Map<string, PriceInfo>();
  for (const [itemCode, { info }] of best) result.set(itemCode, info);
  return result;
}
