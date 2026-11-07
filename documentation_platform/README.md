# Snow Seasons Tech Documentation Platform

A professional "Docs-as-Code" pipeline for automating the creation, maintenance, and delivery of SaaS product documentation.

## 🚀 Overview

This platform transforms a structured product registry into professional sales and customer documents, and serves them through an authenticated API for the customer portal.

### The Pipeline
`Product Registry (YAML)` $\rightarrow$ `Generator (Jinja2)` $\rightarrow$ `Artifacts (MD/PDF)` $\rightarrow$ `Portal API (FastAPI)` $\rightarrow$ `Customer`

## 🛠 Components

### 1. Product Registry (`/products`)
Every product is defined by a YAML file containing its name, version, features, and documentation requirements. This is the single source of truth.

### 2. Documentation Engine (`/generator`)
A Python-based engine that renders Markdown templates.
- **Templates:** Located in `/templates`, using Jinja2 for dynamic content.
- **PDF Export:** Built in with `fpdf2`. Pandoc and WeasyPrint are not needed.
- **Docs site:** The Docusaurus site lives in `docs-site/`. Generated files are not copied into it automatically. `.github/workflows/deploy-docs.yml` builds and publishes the site when files under `docs-site/` or `generator/` change.

### 3. Customer Portal API (`/portal_api`)
A FastAPI backend that ensures customers only access documentation for products they have purchased.
- **Entitlement Check:** Verifies product access before listing or serving files.
- **Secure Delivery:** Serves build artifacts directly from the secure build directory.
- Try the [offline entitlements demo](portal_api/entitlements-demo.html) to simulate grant, check, and revoke actions in memory.

## 💻 Getting Started

### Prerequisites
- Python 3.10+
- Node.js & npm (for the docs site only)

### Installation
The generator and the portal API have different dependencies. There is no `requirements.txt`, so install them directly:
```bash
python3 -m pip install pyyaml jinja2 pydantic fpdf2                       # generator
python3 -m pip install fastapi uvicorn psycopg2-binary requests stripe    # portal API
```
Set `DATABASE_URL` to your PostgreSQL connection string before starting the portal API.

### Basic Usage
Run these from the `documentation_platform/` folder. The generator finds `products/` relative to the current folder.

**1. Generate Markdown and PDF for a product** (written to `./build/<product>`):
```bash
cd documentation_platform
python3 -m generator.main --product cdot-stations
```

**2. Generate Markdown only, into the repository's `build/` folder:**
```bash
cd documentation_platform
python3 -m generator.main --product cdot-stations --format markdown --out ../build
```

**3. Run the Portal API:**
```bash
cd documentation_platform
uvicorn portal_api.main:app --reload
```

## 🗺 Roadmap
- [x] Phase 1: Documentation Engine (YAML $\rightarrow$ PDF/MD)
- [x] Phase 2: Documentation Website (Docusaurus)
- [x] Phase 3: Customer Portal Integration (FastAPI + Entitlements)
- [ ] Phase 4: AI-Assisted Drafting (llama.cpp integration)
