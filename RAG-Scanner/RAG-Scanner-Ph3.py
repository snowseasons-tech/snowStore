import os
from typing import List, Optional
from pydantic import BaseModel, Field
from openai import OpenAI

# ---------------------------------------------------------------------------
# 1. Output Schema Definition (Pydantic for strict JSON validation)
# ---------------------------------------------------------------------------

class LineItem(BaseModel):
    description: str = Field(description="Description of the service or product")
    quantity: float = Field(description="Quantity ordered or billed")
    unit_price: float = Field(description="Price per single unit")
    total_price: float = Field(description="Total price for this line item")

class Citation(BaseModel):
    chunk_id: str = Field(description="The exact chunk ID used as evidence")
    page_number: int = Field(description="Page number where the data was found")

class InvoiceExtractionResponse(BaseModel):
    invoice_number: Optional[str] = Field(None, description="The unique invoice identifier (e.g. INV-99023)")
    vendor_name: Optional[str] = Field(None, description="Name of the vendor or supplier")
    invoice_date: Optional[str] = Field(None, description="Date the invoice was issued")
    payment_terms: Optional[str] = Field(None, description="Payment terms (e.g. Net 30)")
    line_items: List[LineItem] = Field(default_factory=list, description="Extracted line items")
    total_amount: Optional[float] = Field(None, description="Total invoice amount")
    citations: List[Citation] = Field(default_factory=list, description="Citations supporting the extracted fields")
    confidence_score: float = Field(description="Confidence score from 0.0 to 1.0 based on context clarity")

# ---------------------------------------------------------------------------
# 2. Structured Extraction Engine
# ---------------------------------------------------------------------------

class StructuredExtractionEngine:
    """Extracts schema-validated JSON from retrieved RAG context chunks."""

    def __init__(self, api_key: Optional[str] = None, model_name: str = "gpt-4o"):
        self.client = OpenAI(api_key=api_key or os.environ.get("OPENAI_API_KEY"))
        self.model_name = model_name

    def extract(self, query: str, retrieved_chunks: List[Any]) -> InvoiceExtractionResponse:
        """Sends context chunks and query to the LLM and enforces Pydantic schema output."""
        
        # Format context for prompt injection
        context_str = ""
        for chunk in retrieved_chunks:
            context_str += f"\n--- [Chunk ID: {chunk.chunk_id} | Page: {chunk.metadata.get('page_number')}] ---\n{chunk.content}\n"

        system_prompt = (
            "You are an expert financial document processing assistant. "
            "Extract structured data from the provided document context chunks accurately. "
            "You must cite the chunk ID and page number for every extracted field to ensure verifiability. "
            "If a field is missing from the context, return null."
        )

        user_prompt = (
            f"User Query / Extraction Task: {query}\n\n"
            f"Retrieved Document Context:\n{context_str}"
        )

        # Using OpenAI's structured outputs via Pydantic model definition
        completion = self.client.beta.chat.completions.parse(
            model=self.model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format=InvoiceExtractionResponse,
            temperature=0.0
        )

        return completion.choices[0].message.parsed

# ---------------------------------------------------------------------------
# 3. Execution Pipeline Test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Mock retrieved search results from Stage 2
    from dataclasses import dataclass

    @dataclass
    class MockSearchResult:
        chunk_id: str
        content: str
        metadata: dict
        score: float

    mock_chunks = [
        MockSearchResult(
            chunk_id="inv_99023.pdf_p1_c1",
            content="Invoice Number: INV-99023. Date: 2026-10-15. Vendor: Acme Corp. Payment Terms: Net 30 days.",
            metadata={"page_number": 1},
            score=0.95
        ),
        MockSearchResult(
            chunk_id="inv_99023.pdf_p1_t1",
            content="| Description | Qty | Price |\n| --- | --- | --- |\n| Cloud Server Hosting | 2 | $1,200.00 |\n| Managed Security | 1 | $450.00 |",
            metadata={"page_number": 1},
            score=0.92
        )
    ]

    # Initialize engine (requires OPENAI_API_KEY environment variable set)
    # extractor = StructuredExtractionEngine()
    # result = extractor.extract("Extract invoice details and line items", mock_chunks)
    # print(result.model_dump_json(indent=2))
    print("Structured Extraction Engine ready.")
