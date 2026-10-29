import json
from pathlib import Path
from typing import Dict, List, Any

class SourceAnalyzer:
    """
    Extracts ground-truth technical data from various project sources
    to provide high-fidelity context for AI documentation drafting.
    """
    def __init__(self, product_id: str):
        self.product_id = product_id
        self.product_path = Path(f"documentation-platform/products/{product_id}")

    def analyze_openapi_spec(self, spec_path: Path) -> str:
        """
        Parses an OpenAPI/Swagger JSON file and extracts a concise summary
        of endpoints, methods, and purposes.
        """
        if not spec_path.exists():
            return "No OpenAPI specification found."

        try:
            with open(spec_path, 'r') as f:
                spec = json.load(f)

            paths = spec.get('paths', {})
            summary = ["### API Endpoints:"]

            for path, methods in paths.items():
                for method, details in methods.items():
                    if method.lower() in ['get', 'post', 'put', 'delete', 'patch']:
                        desc = details.get('summary') or details.get('description') or "No description"
                        summary.append(f"- {method.upper()} {path}: {desc}")

            return "\n".join(summary) if len(summary) > 1 else "API spec found but no valid endpoints identified."
        except Exception as e:
            return f"Error parsing OpenAPI spec: {e}"

    def analyze_technical_notes(self) -> str:
        """
        Scans for README.md or technical docs within the product directory.
        """
        notes = []
        # Look for a README in the product folder
        readme = self.product_path / "README.md"
        if readme.exists():
            with open(readme, 'r') as f:
                notes.append(f"TECHNICAL README:\n{f.read()}")

        # Look for any .txt or .md files in a 'technical' subfolder
        tech_dir = self.product_path / "technical"
        if tech_dir.exists():
            for doc in tech_dir.glob("*.md"):
                with open(doc, 'r') as f:
                    notes.append(f"TECHNICAL DOC ({doc.name}):\n{f.read()}")

        return "\n\n".join(notes) if notes else "No additional technical notes found."

    def get_full_context(self, openapi_path: Path = None) -> Dict[str, str]:
        """
        Aggregates all available technical truth for the product.
        """
        return {
            "openapi": self.analyze_openapi_spec(openapi_path) if openapi_path else "Not provided",
            "technical_notes": self.analyze_technical_notes()
        }
