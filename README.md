# ca-mcp

ConnectAuz product assistant — a local chat app that answers questions about [ConnectAuz](https://www.connectauz.com.au) products by combining a local LLM (Ollama) with an MCP knowledge server.

## Architecture

```
┌────────────┐    HTTP    ┌─────────────┐    HTTP    ┌──────────────┐
│  frontend  │ ─────────▶ │   backend   │ ─────────▶ │  mcp-server  │
│  (static)  │            │  (Express)  │            │  (Express)   │
└────────────┘            └──────┬──────┘            └──────────────┘
                                 │
                                 ▼
                          ┌─────────────┐
                          │   Ollama    │
                          │  (local)    │
                          └─────────────┘
```

- [frontend/](frontend/) — static HTML/JS chat UI ([index.html](frontend/index.html), [chat.js](frontend/chat.js)).
- [backend/](backend/) — Express orchestrator on `:3000`. Receives chat messages, calls Ollama, parses tool-call JSON from the model, invokes MCP tools, loops until the model produces a final answer.
- [mcp-server/](mcp-server/) — Express MCP server on `:3001` exposing the product catalog ([products.json](mcp-server/src/data/products.json)) via an MCP tool surface (`list_products`, `get_product`, `search_products`, `list_categories`, `products_by_category`).

## Run with Docker Compose

_Note: With the default model (`gemma4:latest`), the image requires **10 GB of disk space** and will use at least **12 GB of RAM** to load and run effectively. Ensure your Docker environment is configured with sufficient resources. Update the `OLLAMA_MODEL` in `model.env` if you want to use a smaller model. Update `docker-compose.yml` if you want to [enable GPU support](https://docs.ollama.com/docker)._

```bash
docker-compose --env-file model.env up --build -d
```

On first run, the backend may fail until Ollama finishes pulling the model. Check logs with `docker-compose logs -f ollama` and wait for the "llama runner started" message. Ollama will persist the model locally in `.docker-compose/ollama/data`, so subsequent runs should be faster.

## Run locally without Docker

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.com) running locally with a model pulled (default: `gemma4:latest`)

### Setup

Install dependencies in each service:

```bash
cd backend && npm install
cd ../mcp-server && npm install
```

### Run

Start each service in its own terminal:

```bash
# terminal 1 — MCP server (port 3001)
cd mcp-server && npm run dev

# terminal 2 — backend (port 3000)
cd backend && npm run dev

# terminal 3 — frontend (any static server)
cd frontend && python3 -m http.server 8080
```

Open http://localhost:8080.

### Build

```bash
cd backend && npm run build && npm start
cd mcp-server && npm run build && npm start
```

## Configuration

Backend env vars:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Backend HTTP port |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `gemma4:latest` | Model name |
| `MCP_BASE_URL` | `http://localhost:3001` | MCP server endpoint |
| `LOG_LEVEL` | `debug` | Pino log level |

MCP server env vars: `PORT` (default `3001`), `LOG_LEVEL`.

## API

Backend:
- `GET  /health` — liveness
- `GET  /api/chat/config` — resolved Ollama + MCP config
- `POST /api/chat` — body `{ messages: [{role, content}, ...] }`

MCP server:
- `GET  /info` — server metadata + endpoint map
- `GET  /mcp/tools` — tool definitions
- `POST /mcp/invoke` — body `{ tool, arguments }`
- `GET  /products`, `/products/:id`, `/products/search?q=`, `/products/categories`