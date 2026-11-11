#!/usr/bin/env python3
"""Piece together LLM-capable machines from the latest scraped prices.

Reads output/history.db (run scraper.py first) and, for each VRAM target, prices the
cheapest combos of: GPUs + a host that can hold them + ECC RAM + NVMe. Also lists
turnkey options (8-GPU servers, unified-memory mini PCs).

Compatibility is a coarse heuristic (slot counts in HOSTS below); treat results as a
shopping shortlist, not a guarantee. Always confirm risers, PSU and cooling with the seller.
"""
import argparse, math, re, sqlite3, sys, time
from pathlib import Path

HERE = Path(__file__).parent

# host regex (matched against the lowercased, whitespace-normalised title) ->
# (max double-width GPUs, note). Slot counts are conservative and come from vendor/reseller
# documentation; verify the exact config before buying.
HOSTS = [
    ("r740", 3, "Dell R740/R740xd 2U; GPU risers + 1100W+ PSUs needed, price may be a base chassis"),
    ("dl380 gen10", 3, "HPE DL380 Gen10 2U; GPU riser/power kit needed, price may be a base chassis"),
    (r"r730(?!\s?xd)", 2, "Dell R730 2U (the R730xd does NOT support internal GPUs); GPU riser kit + 1100W PSUs needed"),
    ("t640", 4, "Dell T640 tower, desktop-style; up to 4 double-width 300W GPUs, GPU config needs 30C ambient or below"),
    ("t630", 2, "Dell T630 tower; Dell cites up to 4x 300W accelerators but double-width support is unclear, so 2 assumed"),
]
TARGETS = {24: "13B FP16 or ~30B Q4", 48: "70B Q4", 96: "70B Q8 or ~120B Q4", 128: "180B-class Q4"}
DIMM_SIZES = (16, 32, 64)
UNIFIED_GPU_SHARE = 0.75  # share of unified RAM assignable as VRAM on Ryzen AI Max-class minis


def latest_rows(db_path: Path, days: int = 7):
    """Most recent observation per URL, ignoring anything older than `days`."""
    cutoff = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() - days * 86400))
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    rows = db.execute("""SELECT * FROM prices p WHERE ts >= ?
                         AND ts = (SELECT MAX(ts) FROM prices WHERE url = p.url)""", (cutoff,)).fetchall()
    seen, out = set(), []
    for r in map(dict, rows):
        if r["url"] not in seen and r["price"]:
            seen.add(r["url"])
            out.append(r)
    return out


def cheapest(rows):
    return min(rows, key=lambda r: r["price"], default=None)


def pick_ram(rows, need_gb: int):
    """Cheapest-per-GB DIMM, enough of them to reach need_gb."""
    dimms = [r for r in rows if r["category"] == "ram" and r.get("ram_gb") in DIMM_SIZES]
    best = min(dimms, key=lambda r: r["price"] / r["ram_gb"], default=None)
    if not best:
        return None
    n = math.ceil(need_gb / best["ram_gb"])
    return {"part": best, "count": n, "cost": n * best["price"], "label": f"{n}x {best['ram_gb']}GB DDR4 ECC"}


PART_WORDS = re.compile(r"power supply|\bpsu\b|riser|bezel|\brails?\b|backplane|heatsink|\bfans?\b|cable|controller|raid|nic\b", re.I)
MIN_HOST_PRICE = 250  # anything cheaper is a part, not a chassis


def host_for(rows, gpu_count: int, only: str | None = None):
    best = None
    for key, slots, note in HOSTS:
        if slots < gpu_count or (only and not re.search(only, key, re.I)):
            continue
        c = cheapest([r for r in rows if r["category"] == "server" and re.search(key, re.sub(r"\s+", " ", r["title"].lower()))
                      and r["price"] >= MIN_HOST_PRICE and not PART_WORDS.search(r["title"])
                      and not re.search(r"configurator", r["title"], re.I)])
        if c and (best is None or c["price"] < best["part"]["price"]):
            best = {"part": c, "note": note}
    return best


def item(role, part, qty=1, label=None):
    return {"role": role, "qty": qty, "part": label or part["title"], "unit_price": part["price"],
            "site": part.get("site", ""), "url": part["url"]}


def describe(o):
    """Human-readable lines for one build, derived from its items."""
    out = []
    for it in o["items"]:
        qty = f"{it['qty']}x " if it["qty"] > 1 else ""
        out.append(f"{it['role']:<6} ${it['qty'] * it['unit_price']:>9,.0f}  {qty}{it['part'][:56]}")
    return out


def build_options(rows, target_vram: int, top: int = 3, only_host: str | None = None):
    ram_need = max(64, target_vram)
    nvme = cheapest([r for r in rows if r["category"] == "storage" and "nvme" in r["title"].lower()])
    options = []

    def add(kind, vram, items, notes):
        o = {"kind": kind, "vram": vram, "items": items, "notes": notes,
             "total": sum(i["qty"] * i["unit_price"] for i in items)}
        o["parts"] = describe(o)
        options.append(o)

    # 1) Assemble: host + n x GPU + RAM + NVMe
    for g in (r for r in rows if r["category"] == "gpu" and r.get("vram_gb") and "sxm" not in r["title"].lower()):
        n = math.ceil(target_vram / g["vram_gb"])
        host, ram = host_for(rows, n, only_host), pick_ram(rows, ram_need)
        if n > 8 or not host or not ram or not nvme:
            continue
        add("assembled", n * g["vram_gb"],
            [item("host", host["part"]), item("gpu", g, n),
             item("ram", ram["part"], ram["count"], f"{ram['part']['ram_gb']}GB DDR4 ECC: {ram['part']['title']}"),
             item("nvme", nvme)],
            [host["note"]] + (["passive card: needs server airflow"] if "passive" in g["title"].lower() or "tesla" in g["title"].lower() else []))

    # 2) Turnkey: servers that ship with 8 GPUs (title says "8x Quadro P5000" = 8 x 16GB)
    for r in rows:
        if r["category"] == "server" and re.search(r"8x quadro p5000", r["title"], re.I) and target_vram <= 128:
            add("turnkey", 128, [item("server", r)],
                ["ships with 8x Quadro P5000 (16GB each); older GPUs, but RAM/SSD included"])

    # 3) Turnkey: unified-memory mini PCs
    for r in rows:
        if r["category"] == "minipc" and r.get("ram_gb"):
            vram = int(r["ram_gb"] * UNIFIED_GPU_SHARE)
            if vram >= target_vram:
                add("turnkey", vram, [item("minipc", r)],
                    [f"{r['ram_gb']}GB unified memory; ~{vram}GB usable as VRAM; slower memory bandwidth than discrete GPUs"])

    options.sort(key=lambda o: o["total"])
    return options[:top]


BOM_FIELDS = ["build", "target_vram_gb", "kind", "role", "qty", "part", "unit_price", "line_total", "site", "url"]


def bom_rows(plans):
    """plans: [(target_vram, [options])] -> flat BOM rows, with a TOTAL row closing each build."""
    out = []
    for target, opts in plans:
        for i, o in enumerate(opts, 1):
            bid = f"{target}GB-#{i}"
            for it in o["items"]:
                out.append({"build": bid, "target_vram_gb": target, "kind": o["kind"], "role": it["role"],
                            "qty": it["qty"], "part": it["part"], "unit_price": round(it["unit_price"], 2),
                            "line_total": round(it["qty"] * it["unit_price"], 2), "site": it["site"], "url": it["url"]})
            out.append({"build": bid, "target_vram_gb": target, "kind": o["kind"], "role": "TOTAL", "qty": "",
                        "part": f"{o['vram']}GB VRAM; " + "; ".join(o["notes"]), "unit_price": "",
                        "line_total": round(o["total"], 2), "site": "", "url": ""})
    return out


def write_bom(path: Path, plans):
    """CSV by default; .md writes one table per build. TOTAL rows close each build in the CSV."""
    rows = bom_rows(plans)
    if path.suffix.lower() == ".md":
        lines, cur = [f"# LLM build BOM ({time.strftime('%Y-%m-%d')})", ""], None
        for r in rows:
            if r["build"] != cur:
                cur = r["build"]
                lines += [f"## {cur} ({r['kind']})", "", "| Role | Qty | Part | Unit | Line | Source |", "|---|---|---|---|---|---|"]
            if r["role"] == "TOTAL":
                lines += [f"| **Total** | | {r['part']} | | **${r['line_total']:,.2f}** | |", ""]
            else:
                src = f"[{r['site'] or 'link'}]({r['url']})"
                lines.append(f"| {r['role']} | {r['qty']} | {r['part']} | ${r['unit_price']:,.2f} | ${r['line_total']:,.2f} | {src} |")
        path.write_text("\n".join(lines) + "\n")
    else:
        import csv
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=BOM_FIELDS)
            w.writeheader()
            w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--targets", type=int, nargs="+", default=list(TARGETS), help="VRAM targets in GB")
    ap.add_argument("--budget", type=float, help="hide builds above this total")
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--days", type=int, default=7, help="ignore prices older than this")
    ap.add_argument("--host", help="only use hosts whose key matches this regex, e.g. t640 (tower) or 'r7|dl380'")
    ap.add_argument("--bom", type=Path, help="export the shown builds as a bill of materials (.csv or .md)")
    ap.add_argument("--db", type=Path, default=HERE / "output" / "history.db")
    a = ap.parse_args()
    if not a.db.exists():
        sys.exit("No history.db yet: run scraper.py first.")
    rows = latest_rows(a.db, a.days)
    if not rows:
        sys.exit(f"No prices from the last {a.days} days: run scraper.py first.")
    plans = []
    for t in a.targets:
        opts = [o for o in build_options(rows, t, a.top * 3, a.host) if not a.budget or o["total"] <= a.budget][:a.top]
        plans.append((t, opts))
        print(f"\n=== {t}GB VRAM ({TARGETS.get(t, 'custom target')}) ===")
        if not opts:
            print("  no buildable option from current data")
        for i, o in enumerate(opts, 1):
            print(f"  #{i} ${o['total']:,.0f}  ({o['vram']}GB VRAM, ${o['total'] / o['vram']:.0f}/GB, {o['kind']})")
            for line in o["parts"]:
                print("       " + line)
            for n in o["notes"]:
                print(f"       ! {n}")
    if a.bom:
        write_bom(a.bom, plans)
        print(f"\nWrote BOM for {sum(len(o) for _, o in plans)} builds to {a.bom}")
    print("\nPrices are listing prices as of the last scrape; confirm compatibility, power and stock with the seller.")


if __name__ == "__main__":
    main()
