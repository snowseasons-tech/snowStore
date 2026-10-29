from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pathlib import Path
from typing import List
from .services.entitlements import EntitlementService, ProductEntitlement

app = FastAPI(title="Snow Seasons Tech Documentation API")
entitlement_service = EntitlementService()

# Mock Auth Dependency
async def get_current_user(token: str = "mock_token"):
    # In production, this would validate a JWT token
    return "user_123"

@app.get("/docs/{product_id}")
async def list_product_docs(
    product_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Lists available documents for a product, checking entitlements.
    """
    entitlement = await entitlement_service.check_access(user_id, product_id)

    if not entitlement or not entitlement.has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No active subscription for {product_id}"
        )

    # Look for documents in the build directory
    docs_dir = Path(f"build/{product_id}")
    if not docs_dir.exists():
        raise HTTPException(status_code=404, detail="Documentation not found")

    files = [f.name for f in docs_dir.glob("*.md")] + [f.name for f in docs_dir.glob("*.pdf")]

    return {
        "product": product_id,
        "access_level": entitlement.subscription_tier,
        "documents": files
    }

@app.get("/docs/{product_id}/download/{filename}")
async def download_doc(
    product_id: str,
    filename: str,
    user_id: str = Depends(get_current_user)
):
    """
    Serves a specific document file after verifying access.
    """
    entitlement = await entitlement_service.check_access(user_id, product_id)

    if not entitlement or not entitlement.has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    file_path = Path(f"build/{product_id}") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path=file_path, filename=filename)
