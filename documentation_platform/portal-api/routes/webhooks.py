import os
import json
import stripe
from fastapi import APIRouter, Request, HTTPException, status
from documentation_platform.portal-api.services.entitlements import EntitlementService
from documentation_//platform/portal-api/services/database import DatabaseService

router = APIRouter()
db_service = DatabaseService()
entitlement_service = EntitlementService(db_service)

# In production, these MUST be environment variables
STRIPE_API_KEY = os.getenv("STRIPE_API_KEY", "sk_test_...")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "whsec_...")

stripe.api_key = STRIPE_API_KEY

@router.post("/stripe")
async def stripe_webhook(request: Request):
    """
    Handles incoming webhooks from Stripe to synchronize product entitlements.
    Includes signature verification to prevent spoofing.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")

    try:
        # SECURE: Verify that the event actually came from Stripe
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        # Invalid payload
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        # Invalid signature
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")

    event_type = event['type']
    data_object = event['data']['object']

    if event_type == "checkout.session.completed":
        # Extract customer info and product ID
        customer_email = data_object.get("customer_details", {}).get("email")
        # The storefront MUST send 'product_id' in metadata during session creation
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
        # Revoke access when subscription ends
        user_id = data_object.get("metadata", {}).get("user_id")
        product_id = data_object.get("metadata", {}).get("product_id")

        if user_id and product_id:
            await entitlement_service.revoke_access(user_id, product_id)
            print(f"❌ Revoked access to {product_id} for {user_id}")

    return {"status": "success"}
