from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import FileResponse
from pathlib import Path
from typing import List
import os

# In a real scenario, we would import load_product from the generator
# For the API, we'll use a similar logic to check entitlements
from generator.registry import load_product, ProductRegistry

app = FastAPI(title="Snow Seasons Tech Documentation API")

# Simulated Auth: In production, this would be an OIDC/JWT provider
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Simulated User Database (User -> Entitlements)
USER_ENTITLEMENTS = {
    "user_123": ["cdot_stations_access", "mailhub_access"],
    "user_456": ["cdot_stations_access"],
}

def get_current_user(token: str = Depends(oauth2_scheme)):
    # Mock authentication: token is treated as the username for this demo
    return token

def check_entitlement(user: str, product_id: str):
    # Load product to find the required entitlement
    try:
        reg = load_product(product_id)
        required = reg.product.access.entitlement
        user_perms = USER_ENTITLEMENTS.get(user, [])
        if required not in user_perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail=f"Missing entitlement: {required}"
            )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Product not found")

@app.get("/products")
async def list_available_products(user: str = Depends(get_current_user)):
    """List products the user is entitled to access."""
    all_products = [d for d in Path("products").iterdir() if d.is_dir()]
    accessible = []
    
    for p_dir in all_products:
        p_id = p_dir.name
        try:
            reg = load_product(p_id)
            required = reg.product.access.entitlement
            if required in USER_ENTITLEMENTS.get(user, []):
                accessible.append({
                    "id": p_id,
                    "name": reg.product.name,
                    "version": reg.product.version
                })
        except Exception:
            continue
            
    return accessible

@app.get("/products/{product_id}/docs")
async def list_product_docs(product_id: str, user: str = Depends(get_current_user)):
    """List available documents for a specific product."""
    check_entitlement(user, product_id)
    reg = load_product(product_id)
    return {
        "product": reg.product.name,
        "documents": reg.product.documentation.generate
    }

@app.get("/products/{product_id}/download/{doc_id}")
async def download_doc(product_id: str, doc_id: str, user: str = Depends(get_current_user)):
    """Securely download a PDF document."""
    check_entitlement(user, product_id)
    
    # Map doc_id (snake_case) to file (kebab-case)
    filename = f"{doc_id.replace('_', '-')}.pdf"
    file_path = Path(f"build/{product_id}/{filename}")
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document file not generated yet")
        
    return FileResponse(
        path=file_path, 
        filename=filename, 
        media_type='application/pdf'
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
