"""External tools available to the LangGraph agent.

Keep every tool in this file small and independently testable.  The first tool
is web search; RAG and memory will be added only after this is stable.
"""

import json

from dotenv import load_dotenv
from langchain_core.tools import tool
from langchain_tavily import TavilySearch


load_dotenv()


tavily_search = TavilySearch(
    max_results=3,
    topic="general",
    search_depth="basic",
)


@tool
def search_web(query: str) -> str:
    """Search the live web for current facts, news, prices, and recent events."""
    results = tavily_search.invoke({"query": query})
    return json.dumps(results, ensure_ascii=False)


WEB_TOOLS = [search_web]
