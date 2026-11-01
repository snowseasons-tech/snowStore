from datetime import datetime
from typing import Any, Dict, List, Optional
import pdfplumber
from pydantic import BaseModel, Field
from langchain_text_splitters import RecursiveCharacterTextSplitter

# ---------------------------------------------------------------------------
# 1. Schema Definitions (Pydantic)
# ---------------------------------------------------------------------------

class TableData(BaseModel):
    headers: List[str]
    rows: List[List[Optional[str]]]

class ExtractedPage(BaseModel):
    page_number: int
    text: str
    tables: List[TableData]

class DocumentMetadata(BaseModel):
    file_name: str
    total_pages: int
    processed_at: str

class ExtractedDocument(BaseModel):
    metadata: DocumentMetadata
    pages: List[ExtractedPage]

class ChunkMetadata(BaseModel):
    file_name: str
    page_number: int
    chunk_index: int
    content_type: str  # "text" or "table"
    section_title: Optional[str] = None

class Chunk(BaseModel):
    chunk_id: str
    content: str
    metadata: ChunkMetadata

# ---------------------------------------------------------------------------
# 2. Document Parsing Module
# ---------------------------------------------------------------------------

class LayoutAwareParser:
    """Parses digital PDFs extracting text layout and tabular structure."""

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path

    def parse(self) -> ExtractedDocument:
        pages_output: List[ExtractedPage] = []
        file_name = self.pdf_path.split("/")[-1]

        with pdfplumber.open(self.pdf_path) as pdf:
            for index, page in enumerate(pdf.pages):
                page_num = index + 1

                # Extract plain text with layout preservation
                raw_text = page.extract_text(layout=True) or ""

                # Extract structural tables
                extracted_tables = page.extract_tables()
                tables_data: List[TableData] = []

                for table in extracted_tables:
                    if not table or len(table) < 2:
                        continue
                    # Assume first row contains headers
                    headers = [str(cell or "").strip() for cell in table[0]]
                    rows = [[str(cell or "").strip() for cell in row] for row in table[1:]]
                    tables_data.append(TableData(headers=headers, rows=rows))

                pages_output.append(
                    ExtractedPage(
                        page_number=page_num,
                        text=raw_text.strip(),
                        tables=tables_data
                    )
                )

            metadata = DocumentMetadata(
                file_name=file_name,
                total_pages=len(pdf.pages),
                processed_at=datetime.utcnow().isoformat()
            )

        return ExtractedDocument(metadata=metadata, pages=pages_output)

# ---------------------------------------------------------------------------
# 3. Hybrid Semantic Chunking Engine
# ---------------------------------------------------------------------------

class StructuralChunker:
    """Chunks text and tables with parent metadata tracking."""

    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", " ", ""]
        )

    def _table_to_markdown(self, table: TableData) -> str:
        """Converts a parsed table into a structured Markdown format for LLM context."""
        if not table.headers:
            return ""
        
        header_str = "| " + " | ".join(table.headers) + " |"
        separator_str = "| " + " | ".join(["---"] * len(table.headers)) + " |"
        rows_str = "\n".join(["| " + " | ".join(row) + " |" for row in table.rows])
        
        return f"{header_str}\n{separator_str}\n{rows_str}"

    def chunk_document(self, doc: ExtractedDocument) -> List[Chunk]:
        chunks: List[Chunk] = []
        global_chunk_count = 0

        for page in doc.pages:
            # 1. Chunk Text Sections
            if page.text:
                split_texts = self.text_splitter.split_text(page.text)
                for text_segment in split_texts:
                    global_chunk_count += 1
                    chunks.append(
                        Chunk(
                            chunk_id=f"{doc.metadata.file_name}_p{page.page_number}_c{global_chunk_count}",
                            content=text_segment,
                            metadata=ChunkMetadata(
                                file_name=doc.metadata.file_name,
                                page_number=page.page_number,
                                chunk_index=global_chunk_count,
                                content_type="text"
                            )
                        )
                    )

            # 2. Chunk Tables (Keep tables contiguous in markdown format)
            for table_idx, table in enumerate(page.tables):
                markdown_table = self._table_to_markdown(table)
                if not markdown_table.strip():
                    continue

                global_chunk_count += 1
                chunks.append(
                    Chunk(
                        chunk_id=f"{doc.metadata.file_name}_p{page.page_number}_t{table_idx+1}",
                        content=markdown_table,
                        metadata=ChunkMetadata(
                            file_name=doc.metadata.file_name,
                            page_number=page.page_number,
                            chunk_index=global_chunk_count,
                            content_type="table"
                        )
                    )
                )

        return chunks

# ---------------------------------------------------------------------------
# 4. Pipeline Execution Example
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Example usage:
    # parser = LayoutAwareParser("sample_invoice.pdf")
    # parsed_doc = parser.parse()
    # chunker = StructuralChunker(chunk_size=400, chunk_overlap=40)
    # processed_chunks = chunker.chunk_document(parsed_doc)
    
    # Print JSON output payload structure
    print("Parsing & Chunking Engine ready.")
