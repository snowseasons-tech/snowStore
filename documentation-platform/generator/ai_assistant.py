import os
import requests
import yaml
from pathlib import Path
from typing import List, Dict

class AIDocAssistant:
    """
    Interface for AI-assisted documentation drafting using llama.cpp / OpenAI API.
    """
    def __init__(self, api_url: str = "http://localhost:8080/v1", api_key: str = "no-key"):
        self.api_url = api_url
        self.api_key = api_key

    def collect_context(self, product_id: str) -> str:
        """
        Gathers 'ground truth' data from the registry and project files.
        """
        context = []

        # 1. Get Product Registry Data
        product_file = Path(f"documentation-platform/products/{product_id}/product.yaml")
        if product_file.exists():
            with open(product_file, 'r') as f:
                context.append(f"Product Definition:\n{f.read()}")

        # 2. Look for a technical README in the product folder
        readme_file = Path(f"documentation-platform/products/{product_id}/README.md")
        if readme_file.exists():
            with open(readme_file, 'r') as f:
                context.append(f"Technical Notes:\n{f.read()}")

        return "\n\n---\n\n".join(context)

    def generate_draft(self, product_id: str, doc_type: str, existing_content: str = "") -> str:
        """
        Sends context to the LLM to generate a documentation draft.
        """
        context = self.collect_context(product_id)

        prompt = f"""
You are an expert Technical Writer for Snow Seasons Tech.
Your goal is to create a professional, clear, and helpful {doc_type} based on the provided technical context.

STRICT RULES:
1. ONLY use information provided in the context.
2. DO NOT fabricate features or endpoints.
3. Use a professional, welcoming, and concise tone.
4. Output in clean Markdown format.

TECHNICAL CONTEXT:
{context}

{f"EXISTING DRAFT (to be improved):\n{existing_content}" if existing_content else ""}

Please write the complete {doc_type} now:
"""

        try:
            response = requests.post(
                f"{self.api_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": "gpt-3.5-turbo", # llama.cpp usually ignores this and uses the loaded model
                    "messages": [{"role": "system", "content": "You are a professional technical writer."},
                                 {"role": "user", "content": prompt}],
                    "temperature": 0.3
                },
                timeout=60
            )
            response.raise_for_status()
            return response.json()['choices'][0]['message']['content']
        except Exception as e:
            return f"Error connecting to AI service: {e}\n(Ensure llama.cpp server is running at {self.api_url})"
