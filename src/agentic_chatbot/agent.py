"""LangGraph workflow for normal chat.

The graph currently has one model node. A tools node can be added later without
changing the FastAPI routes or the database layer.
"""

from collections.abc import Iterable, Iterator
from functools import lru_cache
from typing import Any

from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from .tools import WEB_TOOLS


SYSTEM_PROMPT = """You are a helpful and concise AI assistant.

Use the web-search tool only when a question needs current, recent, or live
information: news, prices, current leaders, new releases, or recent events.
For normal questions, answer directly without searching. When you use search,
base your answer on its results and mention the relevant sources.
"""


def extract_text(content: object) -> str:
    """Return displayable text from a LangChain message chunk."""
    if isinstance(content, str):
        return content

    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for item in content:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict) and isinstance(item.get("text"), str):
            parts.append(item["text"])

    return "".join(parts)


def create_chat_node(model: ChatGoogleGenerativeAI):
    """Create the LangGraph node that asks Gemini for the next response."""

    def respond(state: MessagesState) -> dict[str, list[AIMessage]]:
        messages = [SystemMessage(content=SYSTEM_PROMPT), *state["messages"]]
        response = model.bind_tools(WEB_TOOLS).invoke(messages)
        return {"messages": [response]}

    return respond


@lru_cache(maxsize=2)
def get_agent(model_name: str) -> Any:
    """Build and cache one lightweight graph for each selected model."""
    model = ChatGoogleGenerativeAI(
        model=model_name,
        temperature=0.3,
        streaming=True,
    )

    workflow = StateGraph(MessagesState)
    workflow.add_node("respond", create_chat_node(model))
    workflow.add_node("tools", ToolNode(WEB_TOOLS))
    workflow.add_edge(START, "respond")
    workflow.add_conditional_edges("respond", tools_condition)
    workflow.add_edge("tools", "respond")

    return workflow.compile()


def stream_agent_events(
    messages: Iterable[BaseMessage],
    model_name: str,
) -> Iterator[tuple[str, str]]:
    """Run the graph and yield UI-safe status and assistant-token events."""
    agent = get_agent(model_name)
    search_status_sent = False

    for chunk, metadata in agent.stream(
        {"messages": list(messages)},
        stream_mode="messages",
    ):
        node_name = metadata.get("langgraph_node")

        if node_name == "tools" and not search_status_sent:
            search_status_sent = True
            yield "status", "Searching the web..."

        if isinstance(chunk, ToolMessage):
            continue

        if not isinstance(chunk, (AIMessage, AIMessageChunk)):
            continue

        if getattr(chunk, "tool_calls", None):
            continue

        additional_data = getattr(chunk, "additional_kwargs", {}) or {}
        if additional_data.get("tool_calls"):
            continue

        text = extract_text(chunk.content)
        if text:
            yield "token", text
