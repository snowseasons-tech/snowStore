// Pure MRR maths, kept apart from the view so it can be unit tested without Stripe.
// Mirrors the Monthly sheet of the SaaS Financial Engine workbook: flat monthly churn,
// new MRR that grows at a fixed monthly rate, and Base / Upside / Downside scenarios.

export type PriceLike = {
  unit_amount: number | null;
  recurring: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
    usage_type?: 'licensed' | 'metered';
  } | null;
};

export type SubscriptionLike = {
  status: string;
  currency: string;
  created: number;
  ended_at: number | null;
  items: {data: Array<{price: PriceLike; quantity?: number | null}>};
};

export type Summary = {
  currency: string;
  currentMrr: number;
  activeCount: number;
  newMrrPerMonth: number;
  churnedMrrPerMonth: number;
  churnRate: number;
  arpa: number;
  // Items whose price can't be turned into a monthly figure (metered or tiered prices).
  skippedItems: number;
  // Subscriptions billed in a currency other than the main one; left out of every figure.
  otherCurrencySubs: number;
};

export type Scenario = 'Base' | 'Upside' | 'Downside';

export type ProjectionInputs = {
  startMrr: number;
  newMrrPerMonth: number;
  churnRate: number;
  newMrrGrowth: number;
  months: number;
};

const DAY = 86400;
export const WINDOW_DAYS = 90;
const WINDOW_MONTHS = WINDOW_DAYS / 30;

const PER_MONTH: Record<string, number> = {day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12};

// Same multipliers as the workbook's Scenarios sheet.
const SCENARIOS: Record<Scenario, {newMrr: number; churn: number}> = {
  Base: {newMrr: 1, churn: 1},
  Upside: {newMrr: 1.25, churn: 0.75},
  Downside: {newMrr: 0.75, churn: 1.25},
};

// Monthly amount in minor units (cents), or null when the price has no fixed per-unit amount.
export function monthlyAmount(price: PriceLike, quantity = 1): number | null {
  const r = price.recurring;
  if (!r || r.usage_type === 'metered' || price.unit_amount == null) return null;
  return (price.unit_amount * quantity * PER_MONTH[r.interval]) / r.interval_count;
}

function subscriptionMrr(sub: SubscriptionLike): {mrr: number; skipped: number} {
  let mrr = 0;
  let skipped = 0;
  for (const item of sub.items.data) {
    const amount = monthlyAmount(item.price, item.quantity ?? 1);
    if (amount == null) skipped++;
    else mrr += amount;
  }
  return {mrr, skipped};
}

// Active and past-due subscriptions count toward MRR; trials don't until they convert.
const isLive = (sub: SubscriptionLike) => sub.status === 'active' || sub.status === 'past_due';

export function summarize(subs: SubscriptionLike[], now: number): Summary {
  const live = subs.filter(isLive);
  const byCurrency = new Map<string, number>();
  for (const sub of live) {
    byCurrency.set(sub.currency, (byCurrency.get(sub.currency) ?? 0) + subscriptionMrr(sub).mrr);
  }
  const currency = [...byCurrency].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'usd';

  const since = now - WINDOW_DAYS * DAY;
  let currentMrr = 0;
  let activeCount = 0;
  let newMrr = 0;
  let churnedMrr = 0;
  let skippedItems = 0;
  let otherCurrencySubs = 0;

  for (const sub of subs) {
    if (sub.currency !== currency) {
      if (isLive(sub)) otherCurrencySubs++;
      continue;
    }
    const {mrr, skipped} = subscriptionMrr(sub);
    if (isLive(sub)) {
      currentMrr += mrr;
      activeCount++;
      skippedItems += skipped;
    }
    if (sub.created >= since && (isLive(sub) || sub.status === 'canceled')) newMrr += mrr;
    if (sub.status === 'canceled' && sub.ended_at != null && sub.ended_at >= since) churnedMrr += mrr;
  }

  const newMrrPerMonth = newMrr / WINDOW_MONTHS;
  const churnedMrrPerMonth = churnedMrr / WINDOW_MONTHS;
  // Churned MRR over the MRR the month started with (today's MRR plus what left).
  const base = currentMrr + churnedMrrPerMonth;

  return {
    currency,
    currentMrr,
    activeCount,
    newMrrPerMonth,
    churnedMrrPerMonth,
    churnRate: base > 0 ? churnedMrrPerMonth / base : 0,
    arpa: activeCount > 0 ? currentMrr / activeCount : 0,
    skippedItems,
    otherCurrencySubs,
  };
}

// MRR for month 0 (today) through month `months`.
export function project(inputs: ProjectionInputs): number[] {
  const mrr = [inputs.startMrr];
  for (let t = 1; t <= inputs.months; t++) {
    const added = inputs.newMrrPerMonth * Math.pow(1 + inputs.newMrrGrowth, t - 1);
    mrr.push(mrr[t - 1] * (1 - inputs.churnRate) + added);
  }
  return mrr;
}

export function projectScenarios(inputs: ProjectionInputs): Record<Scenario, number[]> {
  const out = {} as Record<Scenario, number[]>;
  for (const [name, m] of Object.entries(SCENARIOS) as Array<[Scenario, {newMrr: number; churn: number}]>) {
    out[name] = project({
      ...inputs,
      newMrrPerMonth: inputs.newMrrPerMonth * m.newMrr,
      churnRate: Math.min(1, inputs.churnRate * m.churn),
    });
  }
  return out;
}

// Lifetime value per account: average revenue per account over monthly churn.
export function ltv(arpa: number, churnRate: number): number | null {
  return churnRate > 0 ? arpa / churnRate : null;
}

const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);

// Stripe amounts are in minor units; charts and labels want major units.
export function toMajor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency) ? amount : amount / 100;
}
