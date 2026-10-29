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
- **PDF Export:** Integrated Pandoc support for professional PDF generation.
- **Site Sync:** Direct integration with Docusaurus for public documentation.

### 3. Customer Portal API (`/portal-api`)
A FastAPI backend that ensures customers only access documentation for products they have purchased.
- **Entitlement Check:** Verifies product access before listing or serving files.
- **Secure Delivery:** Serves build artifacts directly from the secure build directory.

## 💻 Getting Started

### Prerequisites
- Python 3.10+
- Node.js & npm (for the docs site)
- Pandoc & WeasyPrint (for PDF export)

### Installation
```bash
pip install -r requirements.txt # or use poetry install
```

### Basic Usage

**1. Generate all documents for a product:**
```bash
python3 documentation_platform/generator/main.py --product cdot-stations
```

**2. Generate and export to PDF:**
```bash
python3 documentation_platform/generator/main.py --product cdot-stations --pdf
```

**3. Sync to the Docusaurus website:**
```bash
python3 documentation_platform/generator/main.py --product cdot-stations --sync
```

**4. Run the Portal API:**
```bash
uvicorn documentation_platform.portal-api.main:app --reload
```

## 🗺 Roadmap
- [x] Phase 1: Documentation Engine (YAML $\rightarrow$ PDF/MD)
- [x] Phase 2: Documentation Website (Docusaurus Sync)
- [x] Phase 3: Customer Portal Integration (FastAPI + Entitlements)
- [ ] Phase 4: AI-Assisted Drafting (llama.cpp integration)
