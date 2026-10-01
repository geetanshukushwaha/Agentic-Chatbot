const messagesContainer = document.querySelector("#messages");
const conversationsList = document.querySelector("#conversations");
const messageInput = document.querySelector("#message");
const sendButton = document.querySelector("#send");
const errorAlert = document.querySelector("#error");
const statusText = document.querySelector("#status");
const composer = document.querySelector("#composer");
const newChatButton = document.querySelector("#new-chat");

let activeConversationId = localStorage.getItem("conversation_id");


function showError(message) {
  errorAlert.textContent = message;
  errorAlert.classList.remove("d-none");
}


function clearError() {
  errorAlert.classList.add("d-none");
}


function setStatus(message) {
  statusText.textContent = message;
}


function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


function addMessageBubble(role, text = "") {
  document.querySelector("#welcome")?.remove();

  const row = document.createElement("div");
  row.className = `d-flex mb-3 ${role === "user" ? "justify-content-end" : ""}`;

  const bubble = document.createElement("div");
  bubble.className = [
    "message-bubble",
    "rounded-3",
    "p-3",
    role === "user" ? "bg-primary text-white" : "bg-white border",
  ].join(" ");
  bubble.textContent = text;

  row.append(bubble);
  messagesContainer.append(row);
  scrollToBottom();

  return bubble;
}


async function fetchApi(url, options = {}) {
  const response = await fetch(url, options);

  if (response.ok) {
    return response;
  }

  const body = await response.json().catch(() => ({}));
  throw new Error(body.detail || "Request failed.");
}


async function loadConversations() {
  const response = await fetchApi("/api/conversations");
  const { conversations } = await response.json();

  conversationsList.replaceChildren();

  for (const conversation of conversations) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = conversation.title;
    button.className = [
      "list-group-item",
      "list-group-item-action",
      "text-truncate",
      conversation.id === activeConversationId ? "active" : "",
    ].join(" ");

    button.addEventListener("click", () => loadConversation(conversation.id));
    conversationsList.append(button);
  }
}


async function createConversation() {
  const response = await fetchApi("/api/conversations", { method: "POST" });
  const conversation = await response.json();

  activeConversationId = conversation.id;
  localStorage.setItem("conversation_id", activeConversationId);
  messagesContainer.replaceChildren();

  await loadConversations();
}


async function loadConversation(conversationId) {
  const response = await fetchApi(`/api/conversations/${conversationId}`);
  const { messages } = await response.json();

  activeConversationId = conversationId;
  localStorage.setItem("conversation_id", activeConversationId);
  messagesContainer.replaceChildren();

  for (const message of messages) {
    addMessageBubble(message.role, message.content);
  }

  await loadConversations();
}


function handleSseEvent(eventBlock, assistantBubble) {
  const eventName = eventBlock.match(/^event: (.+)$/m)?.[1];
  const rawData = eventBlock.match(/^data: (.+)$/m)?.[1];

  if (!eventName || !rawData) {
    return;
  }

  const payload = JSON.parse(rawData);

  if (eventName === "token") {
    setStatus("Writing response...");
    assistantBubble.textContent += payload.text;
    scrollToBottom();
  }

  if (eventName === "status") {
    setStatus(payload.message);
  }

  if (eventName === "error") {
    showError(payload.message);
    setStatus("Ready");
  }
}


async function streamAssistantReply(userMessage, assistantBubble) {
  const response = await fetchApi(
    `/api/conversations/${activeConversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage }),
    },
  );

  if (!response.body) {
    throw new Error("Your browser does not support streaming responses.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const eventBlocks = buffer.split("\n\n");
    buffer = eventBlocks.pop() || "";

    for (const eventBlock of eventBlocks) {
      handleSseEvent(eventBlock, assistantBubble);
    }
  }

  if (buffer) {
    handleSseEvent(buffer, assistantBubble);
  }
}


async function sendMessage(event) {
  event.preventDefault();

  const userMessage = messageInput.value.trim();
  if (!userMessage || sendButton.disabled) {
    return;
  }

  clearError();
  setStatus("Thinking...");

  try {
    if (!activeConversationId) {
      await createConversation();
    }

    addMessageBubble("user", userMessage);
    messageInput.value = "";
    sendButton.disabled = true;

    const assistantBubble = addMessageBubble("assistant");
    await streamAssistantReply(userMessage, assistantBubble);

    if (!assistantBubble.textContent) {
      assistantBubble.parentElement?.remove();
    }

    await loadConversations();
  } catch (error) {
    showError(error.message);
  } finally {
    sendButton.disabled = false;
    setStatus("Ready");
    messageInput.focus();
  }
}


function handleComposerKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
}


async function initializeApp() {
  try {
    await loadConversations();

    if (activeConversationId) {
      await loadConversation(activeConversationId);
    }
  } catch (error) {
    showError(error.message);
  }
}


newChatButton.addEventListener("click", async () => {
  clearError();
  await createConversation();
  messageInput.focus();
});

composer.addEventListener("submit", sendMessage);
messageInput.addEventListener("keydown", handleComposerKeydown);

initializeApp();
