import requests
import json
import uuid
import random
from pathlib import Path

# Configuration
API_URL = "http://localhost:8081"
WEBHOOK_URL = f"{API_URL}/webhooks/stripe"

# Mock Data
PRODUCTS = ['cdot-stations', 'mailhub', 'lead-intelligence', 'autoblogger', 'autoscheduler']
USERS = ['user_123', 'user_456', 'user_789']

def simulate_stripe_event(event_type, data):
    """
    Sends a mock Stripe event to the Portal API webhook.
    Note: This bypasses signature verification for local testing.
    """
    payload = {
        "id": f"evt_{uuid.uuid4().hex[:12]}",
        "type": event_type,
        "data": {
            "object": data
        }
    }

    print(f"🚀 Sending {event_type} event...")
    try:
        # We send it as a regular POST because the API's mock mode
        # (if configured) or local tests often skip signature checks.
        response = requests.post(WEBHOOK_URL, json=payload)
        print(f"Response: {response.status_code} - {response.text}")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Error sending webhook: {e}")
        return False

def test_full_lifecycle():
    """
    Tests the full flow: Purchase -> Access granted -> Revocation.
    """
    user = random.choice(USERS)
    product = random.choice(PRODUCTS)

    print(f"--- Testing Lifecycle for {user} and {product} ---")

    # 1. Simulate Checkout Completed
    print("\nStep 1: Simulating Purchase...")
    purchase_data = {
        "customer_details": {"email": user},
        "metadata": {"product_id": product},
        "subscription": "sub_test_123"
    }
    if simulate_stripe_event("checkout.session.completed", purchase_data):
        print("✅ Purchase event processed.")

    # 2. Verify API Access
    print("\nStep 2: Verifying API Access...")
    try:
        # Call the real API to see if the user now has access
        resp = requests.get(f"{API_URL}/docs/{product}?token=mock_token")
        if resp.status_code == 200:
            print(f"✅ Access confirmed! Tier: {resp.json().get('access_level')}")
        else:
            print(f"❌ Access denied: {resp.status_code}")
    except Exception as e:
        print(f"❌ API Error: {e}")

    # 3. Simulate Subscription Deletion
    print("\nStep 3: Simulating Cancellation...")
    cancel_data = {
        "customer": "cus_test_123",
        "metadata": {"user_id": user, "product_id": product}
    }
    if simulate_stripe_event("customer.subscription.deleted", cancel_data):
        print("✅ Cancellation event processed.")

    # 4. Verify Access Revoked
    print("\nStep 4: Verifying Access Revocation...")
    try:
        resp = requests.get(f"{API_URL}/docs/{product}?token=mock_token")
        if resp.status_code == 403:
            print("✅ Access correctly revoked.")
        else:
            print(f"❌ Access still exists: {resp.status_code}")
    except Exception as e:
        print(f"❌ API Error: {e}")

if __name__ == "__main__":
    print("Starting Stripe Webhook Integration Test...\n")
    test_full_lifecycle()
