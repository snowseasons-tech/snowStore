import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import builder

def row(cat, title, price, url=None, **kw):
    return {"category": cat, "title": title, "price": price, "url": url or title, "vram_gb": None, "ram_gb": None, **kw}

ROWS = [
    row("gpu", "NVIDIA Tesla V100 32GB PCIe", 919, vram_gb=32),
    row("gpu", "NVIDIA Tesla T4 16GB", 650, vram_gb=16),
    row("gpu", "A100 SXM4 80GB", 16800, vram_gb=80),
    row("server", "Dell PowerEdge R740xd", 713),
    row("server", "HPE ProLiant DL380 Gen10 8-Port - Custom Configurator", 2736),
    row("ram", "Samsung 32GB DDR4 RDIMM ECC", 209, ram_gb=32),
    row("ram", "Micron 64GB DDR4 LRDIMM ECC", 449, ram_gb=64),
    row("storage", "WD Ultrastar 3.84TB NVMe", 689),
    row("storage", "Dell 3.84TB SAS SSD", 345),
    row("minipc", "Beelink GTR9 Pro", 4199, ram_gb=128),
    row("server", "Supermicro SYS-4029GP-TRT 8x Quadro P5000", 5352),
]

def test_assembled_math_and_filters():
    o = builder.build_options(ROWS, 48, top=10)
    asm = [x for x in o if x["kind"] == "assembled"]
    best = asm[0]
    # 2x V100 (64GB) = 1838 + R740 713 + RAM 2x32 = 418 + NVMe 689 (SAS excluded)
    assert best["vram"] == 64 and best["total"] == 1838 + 713 + 418 + 689
    assert not any("SXM" in p for x in asm for p in x["parts"])      # SXM needs a baseboard
    assert not any("Configurator" in p for x in asm for p in x["parts"])

def test_slot_limit_and_turnkey():
    o = builder.build_options(ROWS, 128, top=10)
    assert not any(x["kind"] == "assembled" for x in o)               # 8x T4 > 3 slots on available hosts
    kinds = {x["parts"][0].split()[0] for x in o}
    assert "server" in kinds and "minipc" not in kinds                 # 128*0.75 < 128... minipc gives 96 only

def test_minipc_unified_memory():
    o = builder.build_options(ROWS, 96, top=10)
    assert any(x["parts"][0].startswith("minipc") and x["vram"] == 96 for x in o)

def test_missing_parts_yield_nothing():
    assert builder.build_options([r for r in ROWS if r["category"] != "ram"], 24) == [
        x for x in builder.build_options([r for r in ROWS if r["category"] != "ram"], 24) if x["kind"] != "assembled"]


def test_new_hosts_and_xd_exclusion():
    rows = [row("gpu", "NVIDIA Tesla V100 32GB PCIe", 919, vram_gb=32),
            row("server", "Dell PowerEdge R730xd 24x2.5 Server", 300),
            row("server", "Dell PER730-2.5-12HDD Poweredge R730 8x2.5 CTO server", 520),
            row("server", "Dell PowerEdge T640", 2544),
            row("ram", "32GB DDR4 RDIMM ECC", 209, ram_gb=32),
            row("storage", "3.84TB NVMe", 689)]
    two = builder.build_options(rows, 64, top=5)[0]                    # 2 GPUs: R730 ok, xd must be ignored
    assert two["items"][0]["unit_price"] == 520
    four = builder.build_options(rows, 128, top=5)[0]                  # 4 GPUs: only the T640 tower fits
    assert four["items"][0]["unit_price"] == 2544 and four["items"][1]["qty"] == 4

def test_bom_export(tmp_path):
    plans = [(48, builder.build_options(ROWS, 48, top=2))]
    csv_path, md_path = tmp_path / "b.csv", tmp_path / "b.md"
    builder.write_bom(csv_path, plans); builder.write_bom(md_path, plans)
    import csv
    rows = list(csv.DictReader(open(csv_path)))
    first = [r for r in rows if r["build"] == "48GB-#1"]
    assert [r["role"] for r in first] == ["host", "gpu", "ram", "nvme", "TOTAL"]
    parts_sum = sum(float(r["line_total"]) for r in first if r["role"] != "TOTAL")
    assert parts_sum == float(first[-1]["line_total"]) == plans[0][1][0]["total"]
    assert float(first[1]["unit_price"]) * int(first[1]["qty"]) == float(first[1]["line_total"])
    md = md_path.read_text()
    assert "## 48GB-#1" in md and "**Total**" in md


def test_parts_are_never_hosts():
    rows = [row("gpu", "NVIDIA Tesla V100 32GB PCIe", 919, vram_gb=32),
            row("server", "Dell 0Y26KX PowerEdge R730 1100W Power Supply", 24.99),
            row("server", "Dell PowerEdge R740 GPU Riser 2", 120),
            row("ram", "32GB DDR4 RDIMM ECC", 209, ram_gb=32),
            row("storage", "3.84TB NVMe", 689)]
    assert builder.build_options(rows, 32) == []                      # no real chassis -> no build


def test_host_filter():
    rows = [row("gpu", "NVIDIA Tesla V100 32GB PCIe", 919, vram_gb=32),
            row("server", "Dell PER730-2.5-8HDD PowerEdge R730 8x2.5 Server", 300),
            row("server", "Dell PowerEdge T640", 2544),
            row("ram", "32GB DDR4 RDIMM ECC", 209, ram_gb=32), row("storage", "3.84TB NVMe", 689)]
    assert builder.build_options(rows, 32)[0]["items"][0]["unit_price"] == 300
    assert builder.build_options(rows, 32, only_host="t640")[0]["items"][0]["unit_price"] == 2544
    assert builder.build_options(rows + [row("minipc", "Beelink", 100, ram_gb=128)], 32, only_host="dl380") == []  # no turnkey with a host filter
