import {ltv, monthlyAmount, project, projectScenarios, summarize, toMajor, type SubscriptionLike} from './projection';

const NOW = 1_800_000_000;
const DAY = 86400;

const monthly = (amount: number) => ({unit_amount: amount, recurring: {interval: 'month' as const, interval_count: 1}});

function sub(overrides: Partial<SubscriptionLike> & {amount?: number}): SubscriptionLike {
  const {amount = 14900, ...rest} = overrides;
  return {
    status: 'active',
    currency: 'usd',
    created: NOW - 365 * DAY,
    ended_at: null,
    items: {data: [{price: monthly(amount), quantity: 1}]},
    ...rest,
  };
}

describe('monthlyAmount', () => {
  it('normalises yearly, weekly and multi-month prices', () => {
    expect(monthlyAmount({unit_amount: 12000, recurring: {interval: 'year', interval_count: 1}})).toBe(1000);
    expect(monthlyAmount({unit_amount: 1200, recurring: {interval: 'week', interval_count: 1}})).toBeCloseTo(5200);
    expect(monthlyAmount({unit_amount: 30000, recurring: {interval: 'month', interval_count: 3}})).toBe(10000);
    expect(monthlyAmount(monthly(3900), 2)).toBe(7800);
  });

  it('skips metered and tiered prices', () => {
    expect(monthlyAmount({unit_amount: 100, recurring: {interval: 'month', interval_count: 1, usage_type: 'metered'}})).toBeNull();
    expect(monthlyAmount({unit_amount: null, recurring: {interval: 'month', interval_count: 1}})).toBeNull();
  });
});

describe('summarize', () => {
  it('derives MRR, new MRR and churn from the last 90 days', () => {
    const s = summarize(
      [
        sub({}),
        sub({status: 'past_due'}),
        sub({created: NOW - 10 * DAY}),
        sub({status: 'canceled', ended_at: NOW - 5 * DAY}),
        sub({status: 'canceled', ended_at: NOW - 200 * DAY}),
        sub({status: 'trialing'}),
      ],
      NOW,
    );
    expect(s.currentMrr).toBe(3 * 14900);
    expect(s.activeCount).toBe(3);
    expect(s.newMrrPerMonth).toBeCloseTo(14900 / 3);
    expect(s.churnedMrrPerMonth).toBeCloseTo(14900 / 3);
    expect(s.churnRate).toBeCloseTo(14900 / 3 / (3 * 14900 + 14900 / 3));
    expect(s.arpa).toBe(14900);
  });

  it('leaves subscriptions with no monthly amount out of the count and the average', () => {
    const tiered: SubscriptionLike = sub({
      items: {data: [{price: {unit_amount: null, recurring: {interval: 'month', interval_count: 1}}, quantity: 12}]},
    });
    const s = summarize([sub({}), tiered, sub({amount: 0})], NOW);
    expect(s.currentMrr).toBe(14900);
    expect(s.activeCount).toBe(1);
    expect(s.arpa).toBe(14900);
    expect(s.skippedItems).toBe(1);
  });

  it('uses the largest currency and reports the others', () => {
    const s = summarize([sub({}), sub({currency: 'eur', amount: 100})], NOW);
    expect(s.currency).toBe('usd');
    expect(s.currentMrr).toBe(14900);
    expect(s.otherCurrencySubs).toBe(1);
  });

  it('handles an account with no subscriptions', () => {
    const s = summarize([], NOW);
    expect(s).toMatchObject({currentMrr: 0, activeCount: 0, churnRate: 0, arpa: 0});
  });
});

describe('project', () => {
  it('applies churn then adds growing new MRR each month', () => {
    const mrr = project({startMrr: 1000, newMrrPerMonth: 100, churnRate: 0.1, newMrrGrowth: 0.5, months: 2});
    expect(mrr).toEqual([1000, 1000, 1050]);
  });

  it('orders scenarios Downside < Base < Upside', () => {
    const s = projectScenarios({startMrr: 10000, newMrrPerMonth: 1000, churnRate: 0.05, newMrrGrowth: 0, months: 12});
    expect(s.Downside[12]).toBeLessThan(s.Base[12]);
    expect(s.Base[12]).toBeLessThan(s.Upside[12]);
  });
});

describe('helpers', () => {
  it('computes LTV only when there is churn', () => {
    expect(ltv(14900, 0.05)).toBeCloseTo(298000);
    expect(ltv(14900, 0)).toBeNull();
  });

  it('converts minor units', () => {
    expect(toMajor(14900, 'usd')).toBe(149);
    expect(toMajor(500, 'jpy')).toBe(500);
  });
});
