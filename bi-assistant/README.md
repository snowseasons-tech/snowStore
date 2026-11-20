# SnowStore BI Assistant

A local business-intelligence dashboard for the SnowStore, with an AI assistant that runs on your own
machine through [Ollama](https://ollama.com). It turns a sales export into KPIs, a daily revenue chart,
product mix, and plain-language flags. You can then ask questions in English ("Why did revenue fall
this month?") or generate a weekly brief.

- **Private by design.** Sales data stays on this machine. Customer emails are hashed when the file is
  imported, and the model only sees computed totals, never individual rows or identities.
- **No cloud AI.** The model runs in Ollama on `127.0.0.1`.
- **No dependencies.** Python 3 standard library only, and a single HTML page with no CDN calls.

## Quick start

```bash
# 1. Install a model once (any Ollama chat model works; qwen2.5:7b is the default)
ollama pull qwen2.5:7b

# 2. Start the app
cd bi-assistant
python3 server.py            # http://127.0.0.1:8765
```

With no data loaded, the app shows **fictional sample data** (`sample/sales_sample.csv`, made by
`make_sample.py`) and a banner says so. Upload your own export to replace it.

### Options

| Flag | Default | Meaning |
|---|---|---|
| `--port` | `8765` | Port to listen on |
| `--model` | `qwen2.5:7b`, or `BI_MODEL` env | Ollama model. `gemma3:4b` is faster on modest hardware |
| `--ollama` | `http://127.0.0.1:11434`, or `OLLAMA_HOST` env | Ollama base URL |

The server only binds to `127.0.0.1` and refuses requests whose `Host` header is not localhost.

## Getting your data in

Use **Upload CSV** in the header. The new file replaces the current dataset, and the previous file is
moved to `data/archive/`, so nothing is counted twice.

Two layouts are accepted, and column names are matched case-insensitively:

| Field | Accepted column names |
|---|---|
| date (required) | `date`, `Created date (UTC)`, `created`, `order date` |
| amount (required) | `amount`, `total`, `gross` |
| product | `product`, `Description`, `item`, `plan` |
| currency | `currency` |
| customer | `customer`, `Customer ID`, `customer email`, `email` |
| status | `status`, e.g. `succeeded`, `paid`, `failed`, `pending` |
| refunded | `refunded`, `Amount Refunded` |

A **Stripe charges export** works as is (Dashboard → Payments → Export). Amounts are read in major
units, so `49.00` means $49. Rows that can't be read are skipped and listed in the page under
"Rows skipped during import". Rows with a status other than succeeded/paid/complete count as failed
or pending.

Files you put in `data/` by hand are loaded at startup. Only `*.csv` files at the top of `data/` are
read.

## What the app computes

- **KPIs** for the chosen window: net revenue (gross minus refunds), orders, average order, payment
  success rate, refund rate, unique customers, new vs repeat customers.
- **Comparison** with the same-length window just before it.
- **Flags** (rules in `bi.py: signals`): revenue moves of 20% or more, success below 95%, refunds
  above 5% of gross, one product above half of revenue, unusually strong days, several currencies
  mixed in one total.
- **Assistant**: receives the computed metrics for the selected window as JSON, answers using only
  those figures, and says so when the data can't answer the question.

The window defaults to the last 7/30/90/365 days ending on your newest sale, not on today. A stale
export therefore still shows its most recent period.

## Files

| File | Purpose |
|---|---|
| `server.py` | HTTP server, routes, upload handling, Host check |
| `bi.py` | CSV import, hashing, metrics, flags (stdlib only, no network) |
| `assistant.py` | Ollama client, system prompt, context limits |
| `index.html` | Dashboard page (one file, works offline, responsive) |
| `make_sample.py` | Writes the fictional sample data |
| `sample/sales_sample.csv` | Fictional sample, committed |
| `test_bi.py` | 26 unit and endpoint tests |
| `data/` | Your real exports and archive. **Git-ignored; never commit it** |

## API

| Method and path | Body or query | Returns |
|---|---|---|
| `GET /api/status` | | row count, sample flag, import warnings, Ollama status |
| `GET /api/metrics` | `days=7/30/90/365` or `start=&end=` (YYYY-MM-DD) | current and previous window, growth, flags |
| `POST /api/ask` | JSON `{question, days}` | `{answer, model, window}` |
| `POST /api/brief` | JSON `{days}` | `{answer, model, window}` |
| `POST /api/upload` | raw CSV, `Content-Type: text/csv`, max 5 MB | `{rows, message}` |

Requests with the wrong content type or a non-local `Host` header are refused. If Ollama is down, the
dashboard still works and the assistant returns a clear error.

## Tests

```bash
cd bi-assistant
python3 -m unittest -v test_bi.py
```

The tests cover CSV parsing (both layouts, bad rows, BOM, money formats), customer hashing, every
metric, the flags, the HTTP routes (including host checks, bad windows, upload validation and
archiving), and the Ollama error path. The model is faked in these tests. Live answers were checked
by hand against `qwen2.5:7b`.

## Known limits

- **CSV only.** There's no live Stripe or Upstash sync yet. Export from Stripe and upload. A
  read-only Stripe pull would be the natural next step.
- **Speed.** On this machine a `qwen2.5:7b` answer takes about a minute. The first answer after startup
  is slowest. `gemma3:4b` is faster if you need quicker replies.
- **Model accuracy.** The model is told to quote only the supplied figures. It has still mislabelled a
  metric once in testing, so check any number before acting on it. The metric names were made explicit
  for this reason (e.g. `share_of_gross`).
- **Currency.** Totals mix currencies when a window has more than one. The dashboard warns, but it
  doesn't convert.
- **Sample data is fictional.** Its product names and amounts are made up. Nothing in it reflects
  real sales.
