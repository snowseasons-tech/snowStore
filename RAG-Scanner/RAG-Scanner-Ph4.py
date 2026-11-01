import asyncio
import json
from typing import AsyncGenerator
from fastapi import FastAPI, UploadFile, File, BackgroundTask
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

app = FastAPI(title="Enterprise RAG Document Scanner & Application Processor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory document storage mock
DOCUMENT_STORE = {}

class QueryRequest(BaseModel):
    document_id: str
    query: str

async def generate_rag_stream(doc_id: str, query: str) -> AsyncGenerator[str, None]:
    """Simulates real-time LLM token streaming with citations via Server-Sent Events (SSE)."""
    # 1. Send initial context retrieval event
    yield json.dumps({
        "event": "retrieval_complete",
        "retrieved_chunks": [
            {
                "chunk_id": f"{doc_id}_p1_c1",
                "page_number": 1,
                "bbox": {"x1": 50, "y1": 100, "x2": 450, "y2": 180},
                "content": "Invoice Number: INV-99023. Vendor: Acme Corp. Date: 2026-10-15."
            },
            {
                "chunk_id": f"{doc_id}_p1_t1",
                "page_number": 1,
                "bbox": {"x1": 50, "y1": 200, "x2": 550, "y2": 380},
                "content": "Line Items: Cloud Server Hosting ($1,200.00), Managed Security ($450.00)"
            }
        ]
    })
    await asyncio.sleep(0.5)

    # 2. Stream answer tokens
    response_tokens = [
        "Based ", "on ", "page ", "1 ", "of ", "invoice ", "**INV-99023**,\n\n",
        "- **Vendor**: Acme Corp\n",
        "- **Invoice Date**: October 15, 2026\n",
        "- **Total Hosting Fee**: $1,200.00\n",
        "- **Total Managed Security**: $450.00\n\n",
        "**Citation**: Extracted from [Chunk: inv_99023_p1_t1, Page 1]."
    ]

    for token in response_tokens:
        yield json.dumps({"event": "token", "data": token})
        await asyncio.sleep(0.08)

    # 3. Stream final validation payload
    yield json.dumps({
        "event": "done",
        "status": "validated",
        "confidence": 0.98
    })

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """Handles document ingestion and returns processing status."""
    doc_id = f"doc_{file.filename.split('.')[0]}"
    DOCUMENT_STORE[doc_id] = file.filename
    return {"status": "success", "document_id": doc_id, "message": "File indexed successfully."}

@app.post("/api/query/stream")
async def stream_query(request: QueryRequest):
    """Streams RAG generation using Server-Sent Events."""
    return EventSourceResponse(generate_rag_stream(request.document_id, request.query))

# ---------------------------------------------------------------------------
# Frontend Viewer Served Directly
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def serve_viewer():
    return """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RAG Document Scanner & Visual Bounding Box Inspector</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex flex-col font-sans">
  
  <header class="border-b border-slate-800 p-4 bg-slate-950 flex justify-between items-center">
    <h1 class="text-lg font-bold text-sky-400">⚡ Enterprise RAG Scanner & Visual Inspector</h1>
    <span class="text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-full">FastAPI + SSE Connected</span>
  </header>

  <div class="flex-1 grid grid-cols-2 gap-4 p-4">
    <!-- Left Column: Interactive Document Canvas Viewer -->
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col relative">
      <div class="flex justify-between items-center mb-3">
        <h2 class="text-sm font-semibold text-slate-300">📄 Document Viewer (Page 1)</h2>
        <span class="text-xs text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded">Active Bounding Boxes</span>
      </div>
      
      <!-- Simulated Document Page with Overlay Bounding Boxes -->
      <div id="document-canvas" class="relative bg-white text-slate-900 rounded-lg p-6 shadow-inner min-h-[500px] overflow-hidden">
        <div class="text-xs font-mono text-slate-400 border-b pb-2 mb-4">INVOICE: INV-99023</div>
        <div class="space-y-4 font-mono text-xs text-slate-700">
          <p><strong>Vendor:</strong> Acme Corporation</p>
          <p><strong>Date:</strong> 2026-10-15</p>
          <p><strong>Payment Terms:</strong> Net 30 Days</p>
          <div class="border text-slate-800 mt-6 p-2">
            <div class="font-bold border-b pb-1 mb-1">LINE ITEMS</div>
            <div>Cloud Server Hosting x2 - $1,200.00</div>
            <div>Managed Security x1 - $450.00</div>
          </div>
        </div>

        <!-- Dynamic Overlay Bounding Box Layer -->
        <div id="bbox-layer" class="absolute inset-0 pointer-events-none"></div>
      </div>
    </div>

    <!-- Right Column: Streamed Query Results -->
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col">
      <div class="mb-3">
        <label class="text-xs text-slate-400 mb-1 block">RAG Query Prompt</label>
        <div class="flex gap-2">
          <input id="query-input" type="text" value="Extract line items and pricing for invoice INV-99023" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500">
          <button onclick="runQuery()" class="bg-sky-600 hover:bg-sky-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition-all">Submit</button>
        </div>
      </div>

      <div class="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-y-auto font-mono text-xs text-slate-200" id="output-stream">
        <span class="text-slate-500">Awaiting query execution...</span>
      </div>
    </div>
  </div>

  <script>
    async function runQuery() {
      const outputDiv = document.getElementById('output-stream');
      const bboxLayer = document.getElementById('bbox-layer');
      const query = document.getElementById('query-input').value;

      outputDiv.innerHTML = '<span class="text-amber-400">Initiating hybrid search & streaming...</span>\\n\\n';
      bboxLayer.innerHTML = '';

      const response = await fetch('/api/query/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: 'doc_inv_99023', query: query })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.replace('data: ', ''));
              
              if (payload.event === 'retrieval_complete') {
                // Highlight chunk bounding boxes on document canvas
                payload.retrieved_chunks.forEach(chunk => {
                  const box = document.createElement('div');
                  box.className = 'absolute border-2 border-sky-500 bg-sky-500/20 rounded pointer-events-auto transition-all hover:bg-sky-500/40 cursor-pointer';
                  box.style.left = chunk.bbox.x1 + 'px';
                  box.style.top = chunk.bbox.y1 + 'px';
                  box.style.width = (chunk.bbox.x2 - chunk.bbox.x1) + 'px';
                  box.style.height = (chunk.bbox.y2 - chunk.bbox.y1) + 'px';
                  box.title = `Chunk ID: ${chunk.chunk_id}`;
                  bboxLayer.appendChild(box);
                });
              } else if (payload.event === 'token') {
                outputDiv.innerHTML += payload.data;
              } else if (payload.event === 'done') {
                outputDiv.innerHTML += `\\n\\n<span class="text-emerald-400">[Completed | Confidence: ${payload.confidence}]</span>`;
              }
            } catch (e) {}
          }
        }
      }
    }
  </script>
</body>
</html>
    """

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
