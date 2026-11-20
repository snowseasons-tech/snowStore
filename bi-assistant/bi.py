"""SnowStore BI metrics: load sales CSVs and compute the numbers the dashboard and assistant use.

Stdlib only, no network. Customer identifiers are hashed on import, so raw emails never reach
memory, the UI, or the model.
"""
from __future__ import annotations

import csv
import hashlib
import io
import statistics
from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

# Column names accepted for each field, lowercased. Stripe charge exports and the simple
# canonical format both map here, so either file can be dropped in.
ALIASES = {
    "date": ["date", "created date (utc)", "created", "created (utc)", "order date"],
    "product": ["product", "description", "item", "plan"],
    "amount": ["amount", "total", "gross"],
    "currency": ["currency"],
    "customer": ["customer", "customer id", "customer_id", "customer email", "email"],
    "status": ["status", "state"],
    "refunded": ["refunded", "amount refunded", "refund"],
}
# Statuses that count as money received. Anything else (failed, pending, open) is kept as a failure.
OK_STATUSES = {"", "succeeded", "paid", "complete", "completed"}


def _column_map(headers: list[str]) -> dict[str, str]:
    lowered = {h.strip().lower(): h for h in headers}
    found = {}
    for field, names in ALIASES.items():
        for name in names:
            if name in lowered:
                found[field] = lowered[name]
                break
    missing = [f for f in ("date", "amount") if f not in found]
    if missing:
        raise ValueError(f"CSV is missing required column(s): {', '.join(missing)}")
    return found


def _money(text: str) -> Decimal:
    cleaned = (text or "").replace("$", "").replace(",", "").strip() or "0"
    try:
        return Decimal(cleaned)
    except InvalidOperation as e:
        raise ValueError(f"bad amount {text!r}") from e


def _day(text: str) -> date:
    return date.fromisoformat((text or "").strip()[:10])


def hash_customer(value: str) -> str:
    """Stable, non-reversible id so repeat customers can be counted without storing who they are."""
    value = (value or "").strip().lower()
    return hashlib.sha256(value.encode()).hexdigest()[:12] if value else ""


def parse_csv(text: str) -> tuple[list[dict], list[str]]:
    """Return (sales rows, warnings). Bad rows are skipped and reported, not fatal."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")
    cols = _column_map(reader.fieldnames)
    rows, warnings = [], []
    for line_no, raw in enumerate(reader, start=2):
        try:
            status = (raw.get(cols["status"]) if "status" in cols else "") or ""
            status = status.strip().lower()
            rows.append({
                "date": _day(raw[cols["date"]]),
                "product": (raw.get(cols.get("product", ""), "") or "Unlabelled").strip() or "Unlabelled",
                "amount": _money(raw[cols["amount"]]),
                "currency": ((raw.get(cols["currency"]) if "currency" in cols else "") or "usd").strip().lower(),
                "customer": hash_customer(raw.get(cols["customer"], "") if "customer" in cols else ""),
                "ok": status in OK_STATUSES,
                "refunded": _money(raw.get(cols["refunded"], "") if "refunded" in cols else ""),
            })
        except (ValueError, KeyError) as e:
            warnings.append(f"line {line_no} skipped: {e}")
    return rows, warnings


def to_canonical_csv(rows: list[dict]) -> str:
    """Re-write parsed rows in the canonical layout, with customers already hashed.

    This is what gets saved to data/, so raw customer ids or emails from an upload or a Stripe pull
    never sit on disk.
    """
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["date", "product", "amount", "currency", "customer", "status", "refunded"])
    for r in rows:
        w.writerow([r["date"].isoformat(), r["product"], str(r["amount"]), r["currency"], r["customer"],
                    "succeeded" if r["ok"] else "failed", str(r["refunded"])])
    return out.getvalue()


def load_dir(path) -> tuple[list[dict], list[str]]:
    from pathlib import Path

    rows, warnings = [], []
    for f in sorted(Path(path).glob("*.csv")):
        try:
            r, w = parse_csv(f.read_text(encoding="utf-8-sig"))
            rows.extend(r)
            warnings.extend(f"{f.name}: {x}" for x in w)
        except ValueError as e:
            warnings.append(f"{f.name}: {e}")
    return rows, warnings


def window(rows: list[dict], start: date, end: date) -> list[dict]:
    return [r for r in rows if start <= r["date"] <= end]


def _f(d: Decimal) -> float:
    return round(float(d), 2)


def summarize(rows: list[dict], start: date, end: date, all_rows: list[dict] | None = None) -> dict:
    """Metrics for [start, end]. all_rows (full history) is needed to tell new from returning customers."""
    all_rows = all_rows if all_rows is not None else rows
    cur = window(rows, start, end)
    ok = [r for r in cur if r["ok"]]
    gross = sum((r["amount"] for r in ok), Decimal(0))
    refunds = sum((r["refunded"] for r in cur), Decimal(0))
    net = gross - refunds
    customers = Counter(r["customer"] for r in ok if r["customer"])
    first_seen: dict[str, date] = {}
    for r in all_rows:
        if r["ok"] and r["customer"]:
            first_seen[r["customer"]] = min(first_seen.get(r["customer"], r["date"]), r["date"])
    new_customers = [c for c in customers if first_seen.get(c) and first_seen[c] >= start]

    by_product: dict[str, dict] = defaultdict(lambda: {"orders": 0, "net": Decimal(0)})
    for r in ok:
        by_product[r["product"]]["orders"] += 1
        by_product[r["product"]]["net"] += r["amount"]
    products = []
    for name, v in sorted(by_product.items(), key=lambda kv: kv[1]["net"], reverse=True):
        share = float(v["net"] / gross) if gross else 0.0
        products.append({"product": name, "orders": v["orders"], "gross": _f(v["net"]), "share_of_gross": round(share, 4)})

    days = {start + timedelta(days=i): Decimal(0) for i in range((end - start).days + 1)}
    for r in ok:
        days[r["date"]] = days.get(r["date"], Decimal(0)) + r["amount"]
    for r in cur:
        days[r["date"]] = days.get(r["date"], Decimal(0)) - r["refunded"]
    daily = [{"date": d.isoformat(), "net": _f(days[d])} for d in sorted(days)]

    currencies = sorted({r["currency"] for r in cur})
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "currencies": currencies,
        "gross": _f(gross),
        "refunds": _f(refunds),
        "net": _f(net),
        "orders": len(ok),
        "failed_or_pending": len(cur) - len(ok),
        "success_rate": round(len(ok) / len(cur), 4) if cur else None,
        "refund_rate": round(float(refunds / gross), 4) if gross else None,
        "average_order": _f(gross / len(ok)) if ok else None,
        "unique_customers": len(customers),
        "new_customers": len(new_customers),
        "repeat_customers": sum(1 for n in customers.values() if n > 1),
        "products": products,
        "daily": daily,
    }


def compare(rows: list[dict], start: date, end: date) -> dict:
    """Current window vs the same-length window just before it."""
    length = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=length - 1)
    cur = summarize(rows, start, end)
    prev = summarize(rows, prev_start, prev_end)
    growth = None
    if prev["net"]:
        growth = round((cur["net"] - prev["net"]) / abs(prev["net"]), 4)
    return {"current": cur, "previous": prev, "net_growth": growth}


def signals(rows: list[dict], start: date, end: date) -> list[str]:
    """Plain-language flags a human should look at. Rules are simple on purpose: explainable and testable."""
    report = compare(rows, start, end)
    cur, prev = report["current"], report["previous"]
    out = []
    g = report["net_growth"]
    if g is not None and abs(g) >= 0.2:
        out.append(f"Net revenue {'up' if g > 0 else 'down'} {abs(g) * 100:.0f}% vs the previous period.")
    if cur["success_rate"] is not None and cur["success_rate"] < 0.95:
        out.append(f"Only {cur['success_rate'] * 100:.0f}% of attempts succeeded (failed or pending payments).")
    if cur["refund_rate"] and cur["refund_rate"] > 0.05:
        out.append(f"Refunds are {cur['refund_rate'] * 100:.1f}% of gross, above the 5% watch level.")
    if cur["products"] and cur["products"][0]["share_of_gross"] > 0.5 and len(cur["products"]) > 1:
        p = cur["products"][0]
        out.append(f"{p['product']} is {p["share_of_gross"] * 100:.0f}% of gross: revenue depends heavily on one product.")
    values = [d["net"] for d in cur["daily"]]
    if len(values) >= 7:
        mean, sd = statistics.mean(values), statistics.pstdev(values)
        if sd > 0:
            for d in cur["daily"]:
                if d["net"] - mean > 2.5 * sd:
                    out.append(f"Unusually strong day: {d['date']} brought in {d['net']:.2f}.")
    if len(cur["currencies"]) > 1:
        out.append(f"Several currencies in this window ({', '.join(cur['currencies'])}); totals mix them.")
    if cur["orders"] == 0 and prev["orders"] == 0:
        out.append("No successful orders in this window or the one before it.")
    return out


def default_window(rows: list[dict], days: int = 30) -> tuple[date, date]:
    """Last `days` days ending on the newest sale. Using the data's end, not today, avoids empty windows on stale exports."""
    if not rows:
        today = date.today()
        return today - timedelta(days=days - 1), today
    end = max(r["date"] for r in rows)
    return end - timedelta(days=days - 1), end
