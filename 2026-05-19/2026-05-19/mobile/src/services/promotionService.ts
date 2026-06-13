import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Promotion {
  id: string;
  name: string;
  type: 'percentage' | 'flat' | 'buy_x_get_y' | 'volume';
  discountPct?: number;
  discountFlat?: number;
  buyQty?: number;
  freeQty?: number;
  minQty?: number;
  itemCodes?: string[]; // empty = all items
  customerGroups?: string[]; // empty = all customers
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface AppliedPromo {
  promoId: string;
  promoName: string;
  type: string;
  discountAmount: number;
  freeItems?: { itemCode: string; qty: number }[];
}

const PROMO_KEY = 'active_promotions';

// Default promotions for demo
const DEFAULT_PROMOS: Promotion[] = [
  {
    id: 'P001', name: '10% Off All Nuts', type: 'percentage', discountPct: 10,
    itemCodes: [], customerGroups: [],
    startDate: '2026-01-01', endDate: '2026-12-31', isActive: true,
  },
  {
    id: 'P002', name: 'Buy 5 Get 1 Free', type: 'buy_x_get_y', buyQty: 5, freeQty: 1,
    itemCodes: [], customerGroups: [],
    startDate: '2026-01-01', endDate: '2026-12-31', isActive: true,
  },
  {
    id: 'P003', name: 'AED 5 Off on 10+ Qty', type: 'volume', discountFlat: 5, minQty: 10,
    itemCodes: [], customerGroups: [],
    startDate: '2026-01-01', endDate: '2026-12-31', isActive: true,
  },
];

export async function getActivePromotions(): Promise<Promotion[]> {
  try {
    const stored = await AsyncStorage.getItem(PROMO_KEY);
    if (stored) return JSON.parse(stored);
    // Seed defaults
    await AsyncStorage.setItem(PROMO_KEY, JSON.stringify(DEFAULT_PROMOS));
    return DEFAULT_PROMOS;
  } catch {
    return DEFAULT_PROMOS;
  }
}

export function applyPromotions(
  itemCode: string,
  qty: number,
  unitPrice: number,
  promotions: Promotion[],
): AppliedPromo[] {
  const today = new Date().toISOString().split('T')[0];
  const applied: AppliedPromo[] = [];

  for (const promo of promotions) {
    if (!promo.isActive) continue;
    if (promo.startDate > today || promo.endDate < today) continue;
    if (promo.itemCodes && promo.itemCodes.length > 0 && !promo.itemCodes.includes(itemCode)) continue;

    switch (promo.type) {
      case 'percentage':
        if (promo.discountPct) {
          const discount = (qty * unitPrice * promo.discountPct) / 100;
          applied.push({ promoId: promo.id, promoName: promo.name, type: 'percentage', discountAmount: discount });
        }
        break;
      case 'flat':
        if (promo.discountFlat) {
          applied.push({ promoId: promo.id, promoName: promo.name, type: 'flat', discountAmount: promo.discountFlat });
        }
        break;
      case 'buy_x_get_y':
        if (promo.buyQty && promo.freeQty && qty >= promo.buyQty) {
          const freeUnits = Math.floor(qty / promo.buyQty) * promo.freeQty;
          const discount = freeUnits * unitPrice;
          applied.push({
            promoId: promo.id, promoName: promo.name, type: 'buy_x_get_y',
            discountAmount: discount,
            freeItems: [{ itemCode, qty: freeUnits }],
          });
        }
        break;
      case 'volume':
        if (promo.minQty && qty >= promo.minQty && promo.discountFlat) {
          applied.push({ promoId: promo.id, promoName: promo.name, type: 'volume', discountAmount: promo.discountFlat });
        }
        break;
    }
  }

  return applied;
}

export function calculateLineTotal(qty: number, unitPrice: number, taxPct: number, promos: AppliedPromo[]): {
  subtotal: number; discount: number; taxable: number; tax: number; total: number;
} {
  const subtotal = qty * unitPrice;
  const discount = promos.reduce((s, p) => s + p.discountAmount, 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = (taxable * taxPct) / 100;
  const total = taxable + tax;
  return { subtotal, discount, taxable, tax, total };
}
