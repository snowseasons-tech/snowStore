import os
from fastapi import APIRouter, Request, Header, HTTPException, status
from documentation_platform.portal-api.services.entitlements import EntitlementService
from documentation_platform.portal-api.services.database import DatabaseService

router = APIRouter()
db_service = DatabaseService()
entitlement_service = EntitlementService(db_service)

# In production, this would be loaded from environment variables
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "whsec_test_secret")

@router.post("/stripe")
async def stripe_webhook(request: Request):
    """
    Handles incoming webhooks from Stripe to synchronize product entitlements.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")

    try:
        # In a real implementation, use stripe.Webhook.construct_event(
        #     payload, sig_header, STRIPE_WEBHOOK_SECRET
        # ) to verify the signature.
        import json
        event = json.loads(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {e}")

    event_type = event.get("type")
    data_object = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        # Extract customer info and product ID
        customer_email = data_object.get("customer_details", {}).get("email")
        # In a real scenario, we'd map the Stripe Price ID to our internal Product ID
        product_id = data_object.get("metadata", {}).get("product_id")
        stripe_sub_id = data_object.get("subscription")

        if customer_email and product_id:
            await entitlement_service.grant_access(
                user_id=customer_email,
                product_id=product_id,
                stripe_sub_id=stripe_sub_id
            )
            print(f"✅ Granted access to {product_id} for {customer_email}")

    elif event_type == "customer.subscription.deleted":
        customer_id = data_object.get("customer")
        # We would look up the email associated with this Stripe customer ID
        user_id = data_object.get("metadata", {}).get("user_id")
        product_id = data_object.get("metadata", {}).get("product_id")

        if user_id and product_id:
            await entitlement_service.revoke_access(user_id, product_id)
            print(f"❌ Revoked access to {product_id} for {user_id}")

    return {"status": "success"}
