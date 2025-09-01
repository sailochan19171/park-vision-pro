// Lightweight client-side event tracker used by pages.
// Safe no-ops in development; integrates with GTM if available.

type Category =
  | 'barrier-gates'
  | 'pedestrian-gates'
  | 'parking-management'
  | 'access-control'
  | 'general'
  | string;

interface Meta {
  route?: string;
  [key: string]: unknown;
}

function pushToDataLayer(event: string, payload: Record<string, unknown>) {
  try {
    const w = window as any;
    if (w && Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event, ...payload });
    }
  } catch {
    // ignore
  }
}

export function trackCategoryView(category: Category, meta: Meta = {}) {
  try {
    console.debug('[trackCategoryView]', { category, ...meta });
    pushToDataLayer('category_view', { category, ...meta });
  } catch {
    // no-op
  }
}

export function trackProductClick(category: Category, productName: string, meta: Meta = {}) {
  try {
    console.debug('[trackProductClick]', { category, productName, ...meta });
    pushToDataLayer('product_click', { category, productName, ...meta });
  } catch {
    // no-op
  }
}