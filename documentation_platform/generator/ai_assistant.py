from dataclasses import dataclass
import requests
import yaml
from pathlib import Path
from typing import List, Optional, Dict, Any
from .source_analyzer import SourceAnalyzer
from .personas import PersonaRegistry

@dataclass
class AIContext:
    product_data: Dict[str, Any]
    technical_truth: str
    openapi_truth: str
    doc_type: str

class AIDocAssistant:
    """
    Interface for AI-assisted documentation drafting using llama.cpp / OpenAI API.
    """
    def __init__(self, api_url: str = "http://localhost:8080/v1", api_key: str = "no-key"):
        self.api_url = api_url
        self.api_key = api_key

    def collect_context(self, product_id: str, openapi_path: Path = None) -> AIContext:
        """
        Aggregates structured product data and unstructured technical truth.
        """
        # 1. Product Registry Data
        product_file = Path(f"documentation_platform/products/{product_id}/product.yaml")
        with open(product_file, 'r') as f:
            product_data = yaml.safe_load(f)['product']

        # 2. Deep Technical Analysis
        analyzer = SourceAnalyzer(product_id)
        context = analyzer.get_full_context(openapi_path=openapi_path)

        return AIContext(
            product_data=product_data,
            technical_truth=context['technical_notes'],
            openapi_truth=context['openapi'],
            doc_type="" # Filled during generation
        )

    def generate_draft(self, product_id: str, doc_type: str, openapi_path: Path = None, existing_content: str = "") -> str:
        """
        Sends a high-fidelity context window to the LLM to generate a draft.
        """
        ctx = self.collect_context(product_id, openapi_path)

        # Get specialized persona for this document type
        persona = PersonaRegistry.get_persona(doc_type)

        # Build a rich, structured prompt with Persona and Ground Truth
        prompt = f"""
You are acting as {persona.name} ({persona.role}).
Your tone is {persona.tone}.
Your primary focus is {persona.focus}.

--- STRICT CONSTRAINTS ---
{persona.constraints}
1. ONLY use information provided in the GROUND TRUTH sections below.
2. DO NOT fabricate features, endpoints, or capabilities.
3. If the technical truth is missing for a section, state "TBD" or omit the section.
4. Output in clean Markdown format.

--- GROUND TRUTH (PRODUCT REGISTRY) ---
Product: {ctx.product_data['name']}
Description: {ctx.product_data['description']}
Features: {', '.join(ctx.product_data['features'])}
Status: {ctx.product_data['status']}

--- TECHNICAL IMPLEMENTATION DETAILS ---
{ctx.technical_truth}

--- API SPECIFICATIONS ---
{ctx.openapi_truth}

{f"EXISTING DRAFT (to be improved):\n{existing_content}" if existing_content else ""}

Please write the complete {doc_type} now:
"""
        try:
            response = requests.post(
                f"{self.api_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": "gpt-3.5-turbo",
                    "messages": [
                        {"role": "system", "content": f"You are {persona.name}, {persona.role}. {persona.constraints}"},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.2
                },
                timeout=60
            )
            response.raise_for_status()
            return response.json()['choices'][0]['message']['content']
        except Exception as e:
            return f"Error connecting to AI service: {e}\n(Ensure llama.cpp server is running at {self.api_url})"
