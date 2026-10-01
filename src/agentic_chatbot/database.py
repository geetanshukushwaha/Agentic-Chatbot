"""SQLite models and persistence helpers for conversations and messages."""

import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


load_dotenv()

DATA_DIR = Path(os.getenv("AGENTIC_CHATBOT_DATA_DIR", "data")).expanduser().resolve()
DATABASE_PATH = DATA_DIR / "chatbot.db"

DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    visitor_id: Mapped[str] = mapped_column(String(36), index=True)
    title: Mapped[str] = mapped_column(String(80), default="New chat")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        index=True,
    )

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id"),
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        index=True,
    )

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


def init_db() -> None:
    """Create the SQLite tables when the server starts for the first time."""
    Base.metadata.create_all(engine)


def create_conversation(visitor_id: str) -> Conversation:
    """Create an empty chat owned by one anonymous browser visitor."""
    conversation = Conversation(id=str(uuid4()), visitor_id=visitor_id)

    with SessionLocal() as db:
        db.add(conversation)
        db.commit()

    return conversation


def get_conversation(visitor_id: str, conversation_id: str) -> Conversation | None:
    """Return a conversation only when it belongs to the current visitor."""
    with SessionLocal() as db:
        conversation = db.get(Conversation, conversation_id)

    if conversation and conversation.visitor_id == visitor_id:
        return conversation

    return None


def list_conversations(visitor_id: str) -> list[Conversation]:
    """Return the current visitor's chats, most recently updated first."""
    with SessionLocal() as db:
        return list(
            db.query(Conversation)
            .filter(Conversation.visitor_id == visitor_id)
            .order_by(Conversation.updated_at.desc())
        )


def list_messages(
    conversation_id: str,
    limit: int | None = None,
) -> list[ChatMessage]:
    """Return messages oldest first; optionally keep only the newest N."""
    with SessionLocal() as db:
        query = db.query(ChatMessage).filter(
            ChatMessage.conversation_id == conversation_id
        )

        if limit is None:
            return list(query.order_by(ChatMessage.id).all())

        newest_first = query.order_by(ChatMessage.id.desc()).limit(limit).all()
        return list(reversed(newest_first))


def add_message(
    conversation_id: str,
    role: str,
    content: str,
) -> ChatMessage:
    """Save one message and update the conversation title and timestamp."""
    with SessionLocal() as db:
        conversation = db.get(Conversation, conversation_id)
        if conversation is None:
            raise LookupError("Conversation not found")

        if conversation.title == "New chat" and role == "user":
            clean_title = content.strip().replace("\n", " ")
            conversation.title = clean_title[:60] or "New chat"

        conversation.updated_at = utc_now()

        message = ChatMessage(
            conversation_id=conversation_id,
            role=role,
            content=content,
        )
        db.add(message)
        db.commit()

    return message
