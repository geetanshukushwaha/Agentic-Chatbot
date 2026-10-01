"""FastAPI application for the chatbot UI and streaming chat API."""

import json
import logging
import os
from collections.abc import Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from pydantic import BaseModel, Field

from .agent import stream_agent_events
from .database import (
    ChatMessage,
    Conversation,
    add_message,
    create_conversation,
    get_conversation,
    init_db,
    list_conversations,
    list_messages,
)


load_dotenv()

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
VISITOR_COOKIE = "agentic_visitor"
MODEL_HISTORY_LIMIT = 16

logger = logging.getLogger(__name__)
PACKAGE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(PACKAGE_DIR / "templates"))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize local persistence before accepting requests."""
    init_db()
    yield


app = FastAPI(title="Agentic Chatbot", lifespan=lifespan)
app.mount(
    "/static",
    StaticFiles(directory=str(PACKAGE_DIR / "static")),
    name="static",
)


class MessageInput(BaseModel):
    message: str = Field(min_length=1, max_length=8_000)


def get_visitor_id(request: Request) -> tuple[str, bool]:
    """Return the anonymous browser ID and whether a cookie must be set."""
    visitor_id = request.cookies.get(VISITOR_COOKIE)
    if visitor_id:
        return visitor_id, False

    return str(uuid4()), True


def set_visitor_cookie(response: JSONResponse | HTMLResponse, visitor_id: str) -> None:
    response.set_cookie(
        key=VISITOR_COOKIE,
        value=visitor_id,
        httponly=True,
        samesite="lax",
    )


def serialize_conversation(conversation: Conversation) -> dict[str, str]:
    return {
        "id": conversation.id,
        "title": conversation.title,
        "updated_at": conversation.updated_at.isoformat(),
    }


def serialize_message(message: ChatMessage) -> dict[str, str]:
    return {
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at.isoformat(),
    }


def to_model_messages(messages: list[ChatMessage]) -> list[BaseMessage]:
    """Convert database records to the LangChain message objects Gemini expects."""
    return [
        HumanMessage(content=message.content)
        if message.role == "user"
        else AIMessage(content=message.content)
        for message in messages
    ]


def sse_event(event_name: str, payload: dict) -> str:
    """Encode one Server-Sent Event for the browser stream."""
    data = json.dumps(payload, ensure_ascii=False)
    return f"event: {event_name}\ndata: {data}\n\n"


def require_conversation(visitor_id: str, conversation_id: str) -> Conversation:
    """Raise 404 when a chat is missing or belongs to another browser."""
    conversation = get_conversation(visitor_id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation


def stream_assistant_response(
    conversation_id: str,
    model_messages: list[BaseMessage],
) -> Iterator[str]:
    """Generate SSE events and persist the completed assistant response."""
    answer_parts: list[str] = []

    try:
        for event_name, content in stream_agent_events(model_messages, MODEL_NAME):
            if event_name == "status":
                yield sse_event("status", {"message": content})
                continue

            answer_parts.append(content)
            yield sse_event("token", {"text": content})

        final_answer = "".join(answer_parts).strip()
        if final_answer:
            add_message(conversation_id, "assistant", final_answer)

        yield sse_event("done", {})

    except Exception:
        logger.exception("Chat generation failed")
        yield sse_event(
            "error",
            {"message": "The model could not respond. Please try again."},
        )


@app.get("/", response_class=HTMLResponse)
def home(request: Request) -> HTMLResponse:
    response = templates.TemplateResponse(request, "index.html")
    visitor_id, should_set_cookie = get_visitor_id(request)

    if should_set_cookie:
        set_visitor_cookie(response, visitor_id)

    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/conversations")
def get_conversations(request: Request) -> JSONResponse:
    visitor_id, should_set_cookie = get_visitor_id(request)
    conversations = list_conversations(visitor_id)

    response = JSONResponse(
        {"conversations": [serialize_conversation(item) for item in conversations]}
    )
    if should_set_cookie:
        set_visitor_cookie(response, visitor_id)

    return response


@app.post("/api/conversations", status_code=201)
def create_new_conversation(request: Request) -> JSONResponse:
    visitor_id, should_set_cookie = get_visitor_id(request)
    conversation = create_conversation(visitor_id)

    response = JSONResponse(serialize_conversation(conversation), status_code=201)
    if should_set_cookie:
        set_visitor_cookie(response, visitor_id)

    return response


@app.get("/api/conversations/{conversation_id}")
def get_conversation_history(conversation_id: str, request: Request) -> dict:
    visitor_id, _ = get_visitor_id(request)
    conversation = require_conversation(visitor_id, conversation_id)
    messages = list_messages(conversation.id)

    return {
        "conversation": serialize_conversation(conversation),
        "messages": [serialize_message(message) for message in messages],
    }


@app.post("/api/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: str,
    payload: MessageInput,
    request: Request,
) -> StreamingResponse:
    visitor_id, _ = get_visitor_id(request)
    require_conversation(visitor_id, conversation_id)

    user_message = payload.message.strip()
    if not user_message:
        raise HTTPException(status_code=422, detail="Message cannot be blank")

    add_message(conversation_id, "user", user_message)
    recent_messages = list_messages(conversation_id, limit=MODEL_HISTORY_LIMIT)
    model_messages = to_model_messages(recent_messages)

    return StreamingResponse(
        stream_assistant_response(conversation_id, model_messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def main() -> None:
    import uvicorn

    uvicorn.run("agentic_chatbot.app:app", host="127.0.0.1", port=8000, reload=True)
