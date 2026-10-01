# Agentic Chatbot

A lightweight AI chatbot built with FastAPI, LangGraph, Google Gemini, and Tavily. The app supports streamed responses, web search when needed, and persistent chat history stored in SQLite.

## Features

- FastAPI backend with a simple browser-based chat UI
- LangGraph orchestration for model/tool loops
- Google Gemini integration for chat generation
- Tavily-powered web search for live information
- Server-sent events (SSE) for streaming tokens to the frontend
- SQLite-backed conversations and message history
- Anonymous browser session tracking with cookies
- Health check and REST endpoints for conversation management

## Tech Stack

- Python 3.12
- FastAPI
- Jinja2 + HTML/CSS/JavaScript
- LangChain + LangGraph
- Google Gemini
- Tavily Search
- SQLAlchemy + SQLite
- Uvicorn

## Project Structure

- `src/agentic_chatbot/app.py` — FastAPI app, API routes, SSE response streaming, session handling
- `src/agentic_chatbot/agent.py` — LangGraph workflow and streaming logic for Gemini responses
- `src/agentic_chatbot/tools.py` — external web search tool definition
- `src/agentic_chatbot/database.py` — SQLite conversation persistence and message storage
- `src/agentic_chatbot/templates/` — frontend HTML templates
- `src/agentic_chatbot/static/` — CSS and JavaScript for the chat UI
- `uploads/`, `data/`, `chroma_db/` — local app data directories

## Architecture

The current flow is intentionally simple and effective:

1. User sends a message from the web UI.
2. The FastAPI app stores the user message in SQLite.
3. The LangGraph agent calls Gemini with recent conversation history.
4. If the model decides a live fact is needed, it invokes the Tavily search tool.
5. The tool result is fed back into the agent for a final answer.
6. The assistant response is streamed back to the browser with SSE.

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/geetanshukushwaha/Agentic-Chatbot.git
cd Agentic-Chatbot
```

### 2. Create and activate a virtual environment

Make sure Python 3.12 and `uv` are installed.

```bash
uv venv --python 3.12
```

Activate it:

Windows:

```powershell
.venv\Scripts\Activate.ps1
```

Linux/macOS:

```bash
source .venv/bin/activate
```

### 3. Install dependencies

```bash
uv sync
```

### 4. Configure environment variables

Create a `.env` file in the project root with the required keys:

```env
GEMINI_API_KEY=your_GEMINI_API_KEY
GEMINI_MODEL=gemini-3.1-flash-lite
TAVILY_API_KEY=your_tavily_key

# Optional, for LangSmith tracing
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_TRACING=true
LANGSMITH_PROJECT=agentic-chatbot

# Optional; defaults to ./data relative to the working directory
AGENTIC_CHATBOT_DATA_DIR=./data
```

> `GEMINI_API_KEY` is required for Google Gemini access and`TAVILY_API_KEY`for live web search.

### 5. Run the app

```bash
uv run agentic-chatbot
```

Open the app in your browser:

```text
http://localhost:8000
```

## API Overview

The application exposes a few simple endpoints:

- `GET /` — homepage UI
- `GET /health` — app health check
- `GET /api/conversations` — list conversations for the current visitor
- `POST /api/conversations` — create a new chat conversation
- `GET /api/conversations/{conversation_id}` — fetch conversation history
- `POST /api/conversations/{conversation_id}/messages` — send a message and stream the response

## Current Status

This project is in active development and already includes the core workflow needed for a working chat assistant:

- chat history persistence
- agentic model/tool orchestration
- web search enablement
- streaming chat responses
- local browser-based frontend

Planned improvements include richer memory, more modular service boundaries, stronger RAG features, and more production-oriented reliability improvements.

---

Built with Python, FastAPI, LangChain, and LangGraph.
