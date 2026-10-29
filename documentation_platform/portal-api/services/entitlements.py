from dataclasses import dataclass
from typing import List, Optional

@dataclass
class ProductEntitlement:
    product_id: str
    has_access: bool
    subscription_tier: str  # e.g., 'free', 'pro', 'enterprise'

class EntitlementService:
    """
    Mock service for determining if a customer has access to a specific product.
    In production, this would query a PostgreSQL database or Stripe API.
    """
    def __init__(self):
        # Mock database of user entitlements
        self._mock_db = {
            "user_123": {
                "cdot-stations": ProductEntitlement("cdot-stations", True, "pro"),
                "mailhub": ProductEntitlement("mailhub", False, "none"),
            }
        }

    async def check_access(self, user_id: str, product_id: str) -> Optional[ProductEntitlement]:
        user_data = self._mock_db.get(user_id)
        if not user_data:
            return None
        return user_data.get(product_id)
