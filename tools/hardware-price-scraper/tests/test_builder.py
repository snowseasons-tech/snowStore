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
