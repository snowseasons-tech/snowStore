import os
import psycopg2
from psycopg2.extras import RealDictCursor

class DatabaseService:
    """
    Handles connections to the PostgreSQL database.
    """
    def __init__(self):
        self.conn_str = os.getenv("DATABASE_URL")
        if not self.conn_str:
            raise RuntimeError("DATABASE_URL environment variable must be set")

    def get_connection(self):
        return psycopg2.connect(self.conn_str, cursor_factory=RealDictCursor)

class EntitlementService:
    """
    Real implementation of product access control via PostgreSQL.
    """
    def __init__(self, db: DatabaseService):
        self.db = db

    async def check_access(self, user_id: str, product_id: str):
        """
        Queries the entitlements table to verify access.
        """
        conn = self.db.get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT product_id, subscription_tier FROM entitlements WHERE user_id = %s AND product_id = %s",
                    (user_id, product_id)
                )
                result = cur.fetchone()
                if result:
                    return {
                        "product_id": result['product_id'],
                        "has_access": True,
                        "subscription_tier": result['subscription_tier']
                    }
                return {"has_access": False}
        finally:
            conn.close()

    async def grant_access(self, user_id: str, product_id: str, tier: str = "standard", stripe_sub_id: str = None):
        """
        Grants access to a product (Upsert).
        """
        conn = self.db.get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO entitlements (user_id, product_id, subscription_tier, stripe_subscription_id)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_id, product_id)
                    DO UPDATE SET subscription_tier = EXCLUDED.subscription_tier,
                                  stripe_subscription_id = EXCLUDED.stripe_subscription_id;
                    """,
                    (user_id, product_id, tier, stripe_sub_id)
                )
                conn.commit()
        finally:
            conn.close()

    async def revoke_access(self, user_id: str, product_id: str):
        """
        Removes access to a product.
        """
        conn = self.db.get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM entitlements WHERE user_id = %s AND product_id = %s",
                    (user_id, product_id)
                )
                conn.commit()
        finally:
            conn.close()
