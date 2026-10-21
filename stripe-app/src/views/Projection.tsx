import {useEffect, useMemo, useState} from 'react';
import type {ExtensionContextValue} from '@stripe/ui-extension-sdk/context';
import {createHttpClient, STRIPE_API_KEY} from '@stripe/ui-extension-sdk/http_client';
import {Banner, Box, ContextView, Divider, Inline, LineChart, Select, Spinner, TextField} from '@stripe/ui-extension-sdk/ui';
import Stripe from 'stripe';

import {
  ltv,
  projectScenarios,
  summarize,
  toMajor,
  WINDOW_DAYS,
  type Scenario,
  type SubscriptionLike,
  type Summary,
} from '../lib/projection';

const stripe = new Stripe(STRIPE_API_KEY, {
  httpClient: createHttpClient(),
  apiVersion: '2025-02-24.acacia',
});

// Caps keep a very large account from stalling the drawer; the banner says when one is hit.
const LIVE_CAP = 10000;
const CANCELED_CAP = 5000;

type Loaded = {summary: Summary; truncated: boolean};

async function loadSubscriptions(): Promise<Loaded> {
  const [active, pastDue, canceled] = await Promise.all([
    stripe.subscriptions.list({status: 'active', limit: 100}).autoPagingToArray({limit: LIVE_CAP}),
    stripe.subscriptions.list({status: 'past_due', limit: 100}).autoPagingToArray({limit: LIVE_CAP}),
    stripe.subscriptions.list({status: 'canceled', limit: 100}).autoPagingToArray({limit: CANCELED_CAP}),
  ]);
  const truncated = active.length >= LIVE_CAP || pastDue.length >= LIVE_CAP || canceled.length >= CANCELED_CAP;
  const subs = [...active, ...pastDue, ...canceled] as unknown as SubscriptionLike[];
  return {summary: summarize(subs, Math.floor(Date.now() / 1000)), truncated};
}

const HORIZONS = [12, 24, 36, 60];

const Projection = (_props: ExtensionContextValue) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(24);
  const [growthPct, setGrowthPct] = useState('0');
  const [churnPct, setChurnPct] = useState('');

  useEffect(() => {
    loadSubscriptions()
      .then(setLoaded)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const summary = loaded?.summary;
  const churnRate = churnPct.trim() === '' ? summary?.churnRate ?? 0 : clampPct(churnPct);
  const newMrrGrowth = clampPct(growthPct, -1);

  const scenarios = useMemo(
    () =>
      summary &&
      projectScenarios({
        startMrr: summary.currentMrr,
        newMrrPerMonth: summary.newMrrPerMonth,
        churnRate,
        newMrrGrowth,
        months,
      }),
    [summary, churnRate, newMrrGrowth, months],
  );

  if (error) {
    return (
      <ContextView title="SaaS Projection Engine">
        <Banner type="critical" title="Couldn't load subscriptions" description={error} />
      </ContextView>
    );
  }

  if (!summary || !scenarios) {
    return (
      <ContextView title="SaaS Projection Engine">
        <Box css={{stack: 'x', alignX: 'center', paddingY: 'xlarge'}}>
          <Spinner size="large" />
        </Box>
      </ContextView>
    );
  }

  const cur = summary.currency;
  const money = (minor: number) => formatMoney(toMajor(minor, cur), cur);
  const chartData = (Object.keys(scenarios) as Scenario[]).flatMap((scenario) =>
    scenarios[scenario].map((mrr, month) => ({month, mrr: toMajor(mrr, cur), scenario})),
  );
  const endMrr = scenarios.Base[months];
  const lifetime = ltv(summary.arpa, churnRate);

  return (
    <ContextView title="SaaS Projection Engine" description="MRR projection from your live subscriptions">
      <Box css={{stack: 'y', gap: 'large'}}>
        {summary.activeCount === 0 ? (
          <Banner
            title="No active subscriptions yet"
            description="The projection starts from zero MRR. It fills in once you have active subscriptions."
          />
        ) : null}
        {loaded.truncated || summary.skippedItems > 0 || summary.otherCurrencySubs > 0 ? (
          <Banner type="caution" title="Some data was left out" description={leftOutText(loaded.truncated, summary)} />
        ) : null}

        <Box css={{stack: 'y', gap: 'small'}}>
          <Metric label="Current MRR" value={money(summary.currentMrr)} />
          <Metric label="Current ARR" value={money(summary.currentMrr * 12)} />
          <Metric label="Active subscriptions" value={String(summary.activeCount)} />
          <Metric label="Avg revenue per account" value={money(summary.arpa)} />
          <Metric label={`New MRR / month (last ${WINDOW_DAYS} days)`} value={money(summary.newMrrPerMonth)} />
          <Metric label={`Monthly MRR churn (last ${WINDOW_DAYS} days)`} value={formatPct(summary.churnRate)} />
          <Metric label="Lifetime value" value={lifetime == null ? 'No churn yet' : money(lifetime)} />
        </Box>

        <Divider />

        <Box css={{stack: 'y', gap: 'medium'}}>
          <Select label="Horizon" value={String(months)} onChange={(e) => setMonths(Number(e.target.value))}>
            {HORIZONS.map((h) => (
              <option key={h} value={h}>
                {h} months
              </option>
            ))}
          </Select>
          <TextField
            label="New MRR growth per month (%)"
            description="How much faster new sales grow each month. 0 keeps them flat."
            type="number"
            value={growthPct}
            onChange={(e) => setGrowthPct(e.target.value)}
          />
          <TextField
            label="Monthly churn override (%)"
            description={`Leave blank to use your actual churn (${formatPct(summary.churnRate)}).`}
            type="number"
            value={churnPct}
            onChange={(e) => setChurnPct(e.target.value)}
          />
        </Box>

        <Box css={{stack: 'y', gap: 'small'}}>
          <Inline css={{font: 'heading'}}>Projected MRR</Inline>
          <LineChart
            data={chartData}
            x={{value: 'month', label: 'Month'}}
            y={{value: 'mrr', label: 'MRR', format: {currency: cur.toUpperCase() as 'USD'}}}
            color="scenario"
          />
          <Inline css={{color: 'secondary', font: 'caption'}}>
            Base case after {months} months: {money(endMrr)} MRR, {money(endMrr * 12)} ARR. Upside assumes 25% more new MRR
            and 25% less churn; Downside the reverse.
          </Inline>
        </Box>

        <Inline css={{color: 'secondary', font: 'caption'}}>
          Planning estimate only, not financial advice. Discounts, taxes, trials, and metered or tiered prices are not counted.
        </Inline>
      </Box>
    </ContextView>
  );
};

const Metric = ({label, value}: {label: string; value: string}) => (
  <Box css={{stack: 'x', distribute: 'space-between', gap: 'medium'}}>
    <Inline css={{color: 'secondary'}}>{label}</Inline>
    <Inline css={{fontWeight: 'semibold'}}>{value}</Inline>
  </Box>
);

// Percent text to a 0–1 rate; blanks and junk fall back to 0.
function clampPct(text: string, min = 0): number {
  const n = Number(text) / 100;
  return Number.isFinite(n) ? Math.min(1, Math.max(min, n)) : 0;
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0}).format(amount);
}

function leftOutText(truncated: boolean, s: Summary): string {
  const parts: string[] = [];
  if (truncated) parts.push('Only the most recent subscriptions were loaded.');
  if (s.skippedItems > 0) parts.push(`${s.skippedItems} metered or tiered price item(s) have no fixed monthly amount.`);
  if (s.otherCurrencySubs > 0) parts.push(`${s.otherCurrencySubs} subscription(s) bill in a currency other than ${s.currency.toUpperCase()}.`);
  return parts.join(' ');
}

export default Projection;
