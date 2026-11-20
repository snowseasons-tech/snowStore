#!/usr/bin/env python3
"""Pull recent Stripe charges into the BI dataset (read-only).

Usage:  STRIPE_API_KEY=rk_... python3 stripe_sync.py --days 365

Only issues GET requests (/v1/charges, /v1/invoices, /v1/products). Use a restricted key with read
access to Charges, Invoices and Products, not a full secret key. The pulled rows replace the current
dataset (the previous files go to data/archive/), so re-running never double-counts.

Money always comes from charges. Invoices and products only supply product names, so a subscription
renewal is still one charge with a real product name, not an extra row.
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
MAX_PAGES = 500  # guard against runaway loops, not a practical limit

# Stripe amounts for these currencies are already whole units, not cents.
ZERO_DECIMAL = {"bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"}


class StripeError(Exception):
    pass


def _paged(api_key: str, path: str, params: dict, base: str) -> list[dict]:
    """Every object from a Stripe list endpoint, newest first, following pagination."""
    items, starting_after = [], None
    for _ in range(MAX_PAGES):
        query = dict(params, limit=PAGE_LIMIT)
        if starting_after:
            query["starting_after"] = starting_after
        url = base.rstrip("/") + path + "?" + urllib.parse.urlencode(query)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"}, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                page = json.load(res)
        except urllib.error.HTTPError as e:
            e.close()
            if e.code == 401:
                raise StripeError("Stripe rejected the key (401). Check STRIPE_API_KEY.") from e
            if e.code == 429:
                time.sleep(2)
                raise StripeError("Stripe rate limit hit (429). Try again in a minute.") from e
            raise StripeError(f"Stripe returned HTTP {e.code} for {path}") from e
        except (OSError, ValueError) as e:
            raise StripeError(f"Could not reach Stripe: {e}") from e
        data = page.get("data") or []
        items.extend(data)
        if not page.get("has_more") or not data:
            return items
        starting_after = data[-1]["id"]
    raise StripeError("Stopped after MAX_PAGES; narrow --days")


def fetch_charges(api_key: str, since: datetime, base: str = API_BASE) -> list[dict]:
    return _paged(api_key, "/v1/charges", {"created[gte]": int(since.timestamp())}, base)


def fetch_invoice_products(api_key: str, since: datetime, base: str = API_BASE) -> dict[str, str]:
    """Map invoice id -> product id, taken from the invoice's largest line. Invoices only feed names."""
    mapping = {}
    for inv in _paged(api_key, "/v1/invoices", {"created[gte]": int(since.timestamp())}, base):
        best, best_amount = None, -1
        for line in (inv.get("lines") or {}).get("data", []):
            price = line.get("price") or {}
            product = price.get("product") or (line.get("plan") or {}).get("product")
            if isinstance(product, dict):  # expanded object, not the id
                product = product.get("id")
            if product and (line.get("amount") or 0) > best_amount:
                best, best_amount = product, line.get("amount") or 0
        if best:
            mapping[inv["id"]] = best
    return mapping


def fetch_product_names(api_key: str, base: str = API_BASE) -> dict[str, str]:
    return {p["id"]: p.get("name") or "" for p in _paged(api_key, "/v1/products", {}, base) if p.get("id")}


def to_major(amount: int, currency: str) -> Decimal:
    value = Decimal(amount)
    return value if currency.lower() in ZERO_DECIMAL else value / 100


def product_for(charge: dict, invoice_products: dict, product_names: dict) -> str:
    """Charge metadata first, then the invoice's product name, then the charge description."""
    meta = (charge.get("metadata") or {}).get("product")
    if meta:
        return meta
    invoice = charge.get("invoice")
    if isinstance(invoice, dict):
        invoice = invoice.get("id")
    product_id = invoice_products.get(invoice) if invoice else None
    if product_id and product_names.get(product_id):
        return product_names[product_id]
    return charge.get("description") or "Unlabelled"


def charges_to_csv(charges: list[dict], invoice_products: dict | None = None, product_names: dict | None = None) -> str:
    """Write the canonical layout bi.py reads: date,product,amount,currency,customer,status,refunded."""
    invoice_products = invoice_products or {}
    product_names = product_names or {}
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["date", "product", "amount", "currency", "customer", "status", "refunded"])
    for c in charges:
        cur = (c.get("currency") or "usd").lower()
        day = datetime.fromtimestamp(c["created"], tz=timezone.utc).date().isoformat()
        customer = c.get("customer") or ""
        if isinstance(customer, dict):  # expanded object, not the id
            customer = customer.get("id") or ""
        w.writerow([
            day,
            product_for(c, invoice_products, product_names),
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
        print("This is a full secret key. Use a restricted key (rk_...) with read access to Charges, "
              "Invoices and Products. Set STRIPE_ALLOW_SECRET_KEY=1 to override.", file=sys.stderr)
        return 2
    from pathlib import Path
    import server  # the same archive-and-replace path the upload uses

    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    try:
        charges = fetch_charges(key, since)
        invoice_products = fetch_invoice_products(key, since)
        product_names = fetch_product_names(key)
    except StripeError as e:
        print(str(e), file=sys.stderr)
        return 1
    text = charges_to_csv(charges, invoice_products, product_names)
    dataset = server.Dataset(data_dir=Path(__file__).resolve().parent / "data")
    try:
        count = dataset.replace_with(text)
    except ValueError as e:
        print(f"No rows to import: {e}", file=sys.stderr)
        return 1
    named = sum(1 for c in charges if product_for(c, invoice_products, product_names) != "Unlabelled")
    print(f"Imported {count} charges from the last {args.days} days ({named} with a product name). Previous files are in data/archive.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
