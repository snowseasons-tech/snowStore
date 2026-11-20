#!/usr/bin/env python3
"""Pull recent Stripe charges into the BI dataset (read-only).

Usage:  STRIPE_API_KEY=rk_... python3 stripe_sync.py --days 365

Only issues GET requests to /v1/charges. Use a restricted key with read access to Charges, not a
full secret key. The pulled rows replace the current dataset (the previous files go to data/archive/),
so re-running never double-counts. Customer ids are hashed by bi.py on import; nothing else
identifying is written.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal

API_BASE = os.environ.get("STRIPE_API_BASE", "https://api.stripe.com")
PAGE_LIMIT = 100
MAX_PAGES = 500  # 50,000 charges: a guard against runaway loops, not a practical limit

# Stripe amounts for these currencies are already whole units, not cents.
ZERO_DECIMAL = {"bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"}


class StripeError(Exception):
    pass


def fetch_charges(api_key: str, since: datetime, base: str = API_BASE) -> list[dict]:
    """All charges created at or after `since`, newest first, following pagination."""
    charges, starting_after = [], None
    for _ in range(MAX_PAGES):
        params = {"limit": PAGE_LIMIT, "created[gte]": int(since.timestamp())}
        if starting_after:
            params["starting_after"] = starting_after
        url = base.rstrip("/") + "/v1/charges?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"}, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                page = json.load(res)
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise StripeError("Stripe rejected the key (401). Check STRIPE_API_KEY.") from e
            if e.code == 429:
                time.sleep(2)
                raise StripeError("Stripe rate limit hit (429). Try again in a minute.") from e
            raise StripeError(f"Stripe returned HTTP {e.code}") from e
        except (OSError, ValueError) as e:
            raise StripeError(f"Could not reach Stripe: {e}") from e
        data = page.get("data") or []
        charges.extend(data)
        if not page.get("has_more") or not data:
            return charges
        starting_after = data[-1]["id"]
    raise StripeError("Stopped after MAX_PAGES; narrow --days")


def to_major(amount: int, currency: str) -> Decimal:
    value = Decimal(amount)
    return value if currency.lower() in ZERO_DECIMAL else value / 100


def charges_to_csv(charges: list[dict]) -> str:
    """Write the canonical layout bi.py reads: date,product,amount,currency,customer,status,refunded."""
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["date", "product", "amount", "currency", "customer", "status", "refunded"])
    for c in charges:
        cur = (c.get("currency") or "usd").lower()
        day = datetime.fromtimestamp(c["created"], tz=timezone.utc).date().isoformat()
        product = (c.get("metadata") or {}).get("product") or c.get("description") or "Unlabelled"
        customer = c.get("customer") or ""
        if isinstance(customer, dict):  # expanded object, not the id
            customer = customer.get("id") or ""
        w.writerow([
            day,
            product,
            str(to_major(c["amount"], cur)),
            cur,
            customer,
            c.get("status") or "",
            str(to_major(c.get("amount_refunded") or 0, cur)),
        ])
    return out.getvalue()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Pull recent Stripe charges into the BI dataset (read-only)")
    p.add_argument("--days", type=int, default=365, help="how far back to pull (default 365)")
    args = p.parse_args(argv)
    key = os.environ.get("STRIPE_API_KEY", "").strip()
    if not key:
        print("Set STRIPE_API_KEY to a restricted read-only key first.", file=sys.stderr)
        return 2
    if key.startswith("sk_live") and not os.environ.get("STRIPE_ALLOW_SECRET_KEY"):
        print("This is a full secret key. Use a restricted key (rk_...) with read access to Charges. "
              "Set STRIPE_ALLOW_SECRET_KEY=1 to override.", file=sys.stderr)
        return 2
    from pathlib import Path
    import server  # the same archive-and-replace path the upload uses

    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    try:
        charges = fetch_charges(key, since)
    except StripeError as e:
        print(str(e), file=sys.stderr)
        return 1
    text = charges_to_csv(charges)
    dataset = server.Dataset(data_dir=Path(__file__).resolve().parent / "data")
    try:
        count = dataset.replace_with(text)
    except ValueError as e:
        print(f"No rows to import: {e}", file=sys.stderr)
        return 1
    print(f"Imported {count} charges from the last {args.days} days. Previous files are in data/archive.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
