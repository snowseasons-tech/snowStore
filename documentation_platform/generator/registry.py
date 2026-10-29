import yaml
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel, Field

class BillingInfo(BaseModel):
    provider: str
    pricing_source: str
    product_id: Optional[str] = None

class AccessInfo(BaseModel):
    authentication_required: bool
    entitlement: str

class ProductDocConfig(BaseModel):
    generate: List[str]

class SupportInfo(BaseModel):
    level: str

class ProductMetadata(BaseModel):
    id: str
    name: str
    company: str
    category: str
    status: str
    version: str
    description: str
    features: List[str]
    documentation: ProductDocConfig
    billing: BillingInfo
    access: AccessInfo
    support: SupportInfo

class ProductRegistry(BaseModel):
    product: ProductMetadata

def load_product(product_id: str) -> ProductRegistry:
    path = Path(f"products/{product_id}/product.yaml")
    if not path.exists():
        raise FileNotFoundError(f"Product definition not found for {product_id} at {path}")
    
    with open(path, 'r') as f:
        data = yaml.safe_load(f)
        return ProductRegistry(**data)

if __name__ == "__main__":
    try:
        p = load_product("cdot-stations")
        print(f"Successfully loaded product: {p.product.name} (v{p.product.version})")
        print(f"Features: {', '.join(p.product.features)}")
        print(f"Support Level: {p.product.support.level}")
    except Exception as e:
        print(f"Error: {e}")
