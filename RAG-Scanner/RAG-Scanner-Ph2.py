import math
from typing import List, Dict, Any, Tuple
import numpy as np
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer, CrossEncoder
from rank_bm25 import BM25Okapi

# ---------------------------------------------------------------------------
# 1. Data Models
# ---------------------------------------------------------------------------

class SearchResult(BaseModel):
    chunk_id: str
    content: str
    metadata: Dict[str, Any]
    score: float

# ---------------------------------------------------------------------------
# 2. Hybrid Retrieval Engine (BM25 + Dense Vectors + RRF + Reranker)
# ---------------------------------------------------------------------------

class HybridSearchEngine:
    """Combines BM25 lexical search with dense vector similarity and re-ranking."""

    def __init__(
        self,
        dense_model_name: str = "all-MiniLM-L6-v2",
        reranker_model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    ):
        print(f"Loading Dense Embedding Model ({dense_model_name})...")
        self.dense_model = SentenceTransformer(dense_model_name)
        
        print(f"Loading Cross-Encoder Reranker ({reranker_model_name})...")
        self.reranker = CrossEncoder(reranker_model_name)
        
        self.bm25: BM25Okapi = None
        self.chunks: List[Dict[str, Any]] = []
        self.dense_embeddings: np.ndarray = None

    def index_chunks(self, chunks: List[Dict[str, Any]]) -> None:
        """Indexes processed chunks for both BM25 and vector search."""
        if not chunks:
            raise ValueError("Cannot index empty chunk list.")
        
        self.chunks = chunks
        corpus_texts = [c["content"] for c in chunks]

        # 1. Tokenize for BM25 Sparse Search
        tokenized_corpus = [text.lower().split(" ") for text in corpus_texts]
        self.bm25 = BM25Okapi(tokenized_corpus)

        # 2. Generate Dense Embeddings
        embeddings = self.dense_model.encode(corpus_texts, show_progress_bar=False, convert_to_numpy=True)
        # Normalize vectors for Cosine Similarity via Dot Product
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        self.dense_embeddings = embeddings / np.maximum(norms, 1e-10)

        print(f"Successfully indexed {len(chunks)} chunks into Hybrid Engine.")

    def _reciprocal_rank_fusion(
        self, 
        bm25_ranks: List[int], 
        vector_ranks: List[int], 
        k: int = 60
    ) -> List[Tuple[int, float]]:
        """Combines search ranks using Reciprocal Rank Fusion (RRF)."""
        rrf_scores: Dict[int, float] = {}

        for rank, doc_idx in enumerate(bm25_ranks):
            rrf_scores[doc_idx] = rrf_scores.get(doc_idx, 0.0) + (1.0 / (k + rank + 1))

        for rank, doc_idx in enumerate(vector_ranks):
            rrf_scores[doc_idx] = rrf_scores.get(doc_idx, 0.0) + (1.0 / (k + rank + 1))

        # Sort by highest RRF score
        sorted_rrf = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
        return sorted_rrf

    def search(self, query: str, top_k: int = 5, candidate_pool: int = 20) -> List[SearchResult]:
        """Performs hybrid retrieval with cross-encoder re-ranking."""
        if not self.chunks:
            raise RuntimeError("Engine not indexed. Call index_chunks() first.")

        # 1. Sparse BM25 Retrieval
        tokenized_query = query.lower().split(" ")
        bm25_scores = self.bm25.get_scores(tokenized_query)
        bm25_top_indices = np.argsort(bm25_scores)[::-1][:candidate_pool].tolist()

        # 2. Dense Vector Retrieval (Cosine Similarity)
        query_embedding = self.dense_model.encode([query], convert_to_numpy=True)
        query_norm = np.linalg.norm(query_embedding)
        query_embedding_norm = query_embedding / max(query_norm, 1e-10)

        vector_scores = np.dot(self.dense_embeddings, query_embedding_norm.T).flatten()
        vector_top_indices = np.argsort(vector_scores)[::-1][:candidate_pool].tolist()

        # 3. Combine with Reciprocal Rank Fusion (RRF)
        rrf_results = self._reciprocal_rank_fusion(bm25_top_indices, vector_top_indices)
        candidate_indices = [idx for idx, _ in rrf_results[:candidate_pool]]

        # 4. Cross-Encoder Re-Ranking
        pairs = [[query, self.chunks[idx]["content"]] for idx in candidate_indices]
        rerank_scores = self.reranker.predict(pairs)

        # Sort candidates by re-ranker scores
        reranked_pairs = sorted(
            zip(candidate_indices, rerank_scores), 
            key=lambda x: x[1], 
            reverse=True
        )[:top_k]

        # 5. Build Final Response Objects
        final_results = []
        for doc_idx, score in reranked_pairs:
            chunk = self.chunks[doc_idx]
            final_results.append(
                SearchResult(
                    chunk_id=chunk["chunk_id"],
                    content=chunk["content"],
                    metadata=chunk["metadata"],
                    score=float(score)
                )
            )

        return final_results

# ---------------------------------------------------------------------------
# 3. Execution Pipeline Test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Test Data from Parsing Stage
    sample_chunks = [
        {
            "chunk_id": "doc_p1_c1",
            "content": "Invoice Number: INV-99023. Date: 2026-10-15. Vendor: Acme Corp.",
            "metadata": {"file_name": "inv_99023.pdf", "page_number": 1, "content_type": "text"}
        },
        {
            "chunk_id": "doc_p1_t1",
            "content": "| Description | Qty | Price |\n| --- | --- | --- |\n| Cloud Server Hosting | 2 | $1,200.00 |\n| Managed Security | 1 | $450.00 |",
            "metadata": {"file_name": "inv_99023.pdf", "page_number": 1, "content_type": "table"}
        },
        {
            "chunk_id": "doc_p2_c1",
            "content": "Payment Terms: Net 30 days. Late payment incurs a 1.5% fee per month.",
            "metadata": {"file_name": "inv_99023.pdf", "page_number": 2, "content_type": "text"}
        }
    ]

    engine = HybridSearchEngine()
    engine.index_chunks(sample_chunks)

    query = "What is the total price for hosting on invoice INV-99023?"
    results = engine.search(query=query, top_k=2)

    print(f"\n--- Top Hybrid Results for Query: '{query}' ---")
    for r in results:
        print(f"[{r.chunk_id}] Score: {r.score:.4f} | Page {r.metadata['page_number']}")
        print(f"Content:\n{r.content}\n")
