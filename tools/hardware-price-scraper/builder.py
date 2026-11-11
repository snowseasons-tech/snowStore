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

# host keyword (matched in lowercased title) -> (max double-width GPUs, note)
HOSTS = [
    ("r740", 3, "Dell R740/R740xd 2U; GPU risers + 1100W+ PSUs needed, price may be a base chassis"),
    ("dl380 gen10", 3, "HPE DL380 Gen10 2U; GPU riser/power kit needed, price may be a base chassis"),
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


def host_for(rows, gpu_count: int):
    best = None
    for key, slots, note in HOSTS:
        if slots < gpu_count:
            continue
        c = cheapest([r for r in rows if r["category"] == "server" and key in re.sub(r"\s+", " ", r["title"].lower())
                      and not re.search(r"configurator", r["title"], re.I)])
        if c and (best is None or c["price"] < best["part"]["price"]):
            best = {"part": c, "note": note}
    return best


def build_options(rows, target_vram: int, top: int = 3):
    ram_need = max(64, target_vram)
    nvme = cheapest([r for r in rows if r["category"] == "storage" and "nvme" in r["title"].lower()])
    options = []

    # 1) Assemble: host + n x GPU + RAM + NVMe
    for g in (r for r in rows if r["category"] == "gpu" and r.get("vram_gb") and "sxm" not in r["title"].lower()):
        n = math.ceil(target_vram / g["vram_gb"])
        host, ram = host_for(rows, n), pick_ram(rows, ram_need)
        if n > 8 or not host or not ram or not nvme:
            continue
        total = host["part"]["price"] + n * g["price"] + ram["cost"] + nvme["price"]
        options.append({
            "kind": "assembled", "total": total, "vram": n * g["vram_gb"],
            "parts": [f"host  ${host['part']['price']:>9,.0f}  {host['part']['title'][:58]}",
                      f"gpus  ${n * g['price']:>9,.0f}  {n}x {g['title'][:52]}",
                      f"ram   ${ram['cost']:>9,.0f}  {ram['label']}",
                      f"nvme  ${nvme['price']:>9,.0f}  {nvme['title'][:58]}"],
            "notes": [host["note"]] + (["passive card: needs server airflow"] if "passive" in g["title"].lower() or "tesla" in g["title"].lower() else []),
            "urls": [host["part"]["url"], g["url"], nvme["url"]],
        })

    # 2) Turnkey: servers that ship with 8 GPUs (title says "8x Quadro P5000" = 8 x 16GB)
    for r in rows:
        if r["category"] == "server" and re.search(r"8x quadro p5000", r["title"], re.I) and target_vram <= 128:
            options.append({"kind": "turnkey", "total": r["price"], "vram": 128,
                            "parts": [f"server ${r['price']:>9,.0f}  {r['title'][:60]}"],
                            "notes": ["ships with 8x Quadro P5000 (16GB each); older GPUs, but RAM/SSD included"],
                            "urls": [r["url"]]})

    # 3) Turnkey: unified-memory mini PCs
    for r in rows:
        if r["category"] == "minipc" and r.get("ram_gb"):
            vram = int(r["ram_gb"] * UNIFIED_GPU_SHARE)
            if vram >= target_vram:
                options.append({"kind": "turnkey", "total": r["price"], "vram": vram,
                                "parts": [f"minipc ${r['price']:>8,.0f}  {r['title'][:60]}"],
                                "notes": [f"{r['ram_gb']}GB unified memory; ~{vram}GB usable as VRAM; slower memory bandwidth than discrete GPUs"],
                                "urls": [r["url"]]})

    options.sort(key=lambda o: o["total"])
    return options[:top]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--targets", type=int, nargs="+", default=list(TARGETS), help="VRAM targets in GB")
    ap.add_argument("--budget", type=float, help="hide builds above this total")
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--days", type=int, default=7, help="ignore prices older than this")
    ap.add_argument("--db", type=Path, default=HERE / "output" / "history.db")
    a = ap.parse_args()
    if not a.db.exists():
        sys.exit("No history.db yet: run scraper.py first.")
    rows = latest_rows(a.db, a.days)
    if not rows:
        sys.exit(f"No prices from the last {a.days} days: run scraper.py first.")
    for t in a.targets:
        opts = [o for o in build_options(rows, t, a.top * 3) if not a.budget or o["total"] <= a.budget][:a.top]
        print(f"\n=== {t}GB VRAM ({TARGETS.get(t, 'custom target')}) ===")
        if not opts:
            print("  no buildable option from current data")
        for i, o in enumerate(opts, 1):
            print(f"  #{i} ${o['total']:,.0f}  ({o['vram']}GB VRAM, ${o['total'] / o['vram']:.0f}/GB, {o['kind']})")
            for line in o["parts"]:
                print("       " + line)
            for n in o["notes"]:
                print(f"       ! {n}")
    print("\nPrices are listing prices as of the last scrape; confirm compatibility, power and stock with the seller.")


if __name__ == "__main__":
    main()
