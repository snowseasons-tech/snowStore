#!/usr/bin/env python3
"""Write fictional sales to sample/sales_sample.csv so the dashboard runs before real data exists.

Every product name, customer and amount here is made up. The file is in Stripe charge-export
column names, so it also tests the importer's header mapping.
"""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent / "sample" / "sales_sample.csv"
PRODUCTS = [("Starter Kit", 19.00, 0.45), ("Pro Bundle", 49.00, 0.25), ("Monthly Membership", 21.75, 0.25), ("Setup Service", 150.00, 0.05)]
END = date(2026, 11, 18)
DAYS = 120


def main() -> None:
    rng = random.Random(42)
    customers = [f"sample-customer-{i:03d}@example.com" for i in range(1, 61)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for offset in range(DAYS):
        day = END - timedelta(days=DAYS - 1 - offset)
        season = 1.0 + 0.6 * (day.month in (11, 12))  # a gentle late-year lift
        for _ in range(rng.randint(0, 4)):
            name, price, _w = rng.choices(PRODUCTS, weights=[p[2] for p in PRODUCTS])[0]
            status = "failed" if rng.random() < 0.04 else "succeeded"
            refund = round(price, 2) if (status == "succeeded" and rng.random() < 0.03) else 0.0
            rows.append({
                "Created date (UTC)": f"{day.isoformat()} {rng.randint(0, 23):02d}:{rng.randint(0, 59):02d}:00",
                "Description": name,
                "Amount": round(price * season, 2) if rng.random() > 0.1 else price,
                "Currency": "usd",
                "Customer ID": rng.choice(customers),
                "Status": status,
                "Amount Refunded": refund,
            })
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} fictional rows to {OUT}")


if __name__ == "__main__":
    main()
