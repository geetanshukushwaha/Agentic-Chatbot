const messagesContainer = document.querySelector("#messages");
const conversationsList = document.querySelector("#conversations");
const conversationContextMenu = document.querySelector("#conversation-context-menu");
const deleteConversationAction = document.querySelector("#delete-conversation-action");
const appShell = document.querySelector(".app-shell");
const sidebarToggleButton = document.querySelector("#sidebar-toggle");
const sidebarCloseButton = document.querySelector("#sidebar-close");
const sidebarBackdrop = document.querySelector("#sidebar-backdrop");
const mobileViewport = window.matchMedia("(max-width: 767px)");
const messageInput = document.querySelector("#message");
const sendButton = document.querySelector("#send");
const errorAlert = document.querySelector("#error");
const statusText = document.querySelector("#status");
const composer = document.querySelector("#composer");
const newChatButton = document.querySelector("#new-chat");

let activeConversationId = localStorage.getItem("conversation_id");
let sidebarOpen = false;
let contextConversation = null;


function closeConversationContextMenu(restoreFocus = false) {
  const target = contextConversation?.target;
  conversationContextMenu.hidden = true;
  contextConversation = null;

  if (restoreFocus) {
    target?.focus();
  }
}


function openConversationContextMenu(conversation, target, x, y) {
  contextConversation = { conversation, target };
  conversationContextMenu.hidden = false;

  const left = Math.max(
    8,
    Math.min(x, window.innerWidth - conversationContextMenu.offsetWidth - 8),
  );
  const top = Math.max(
    8,
    Math.min(y, window.innerHeight - conversationContextMenu.offsetHeight - 8),
  );

  conversationContextMenu.style.left = `${left}px`;
  conversationContextMenu.style.top = `${top}px`;
  deleteConversationAction.focus();
}


function setSidebarOpen(open) {
  sidebarOpen = open;
  const isMobile = mobileViewport.matches;

  document.body.classList.toggle("sidebar-open", isMobile && open);
  appShell.classList.toggle("sidebar-collapsed", !isMobile && !open);

  const label = open
    ? (isMobile ? "Close sidebar" : "Hide sidebar")
    : "Show sidebar";
  sidebarToggleButton.setAttribute("aria-label", label);
  sidebarToggleButton.setAttribute("title", label);
  sidebarToggleButton.setAttribute("aria-expanded", String(open));
}


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


function renderMessageContent(bubble, text, role) {
  if (role === "assistant") {
    bubble.dataset.rawText = text;

    if (window.marked && window.DOMPurify) {
      bubble.innerHTML = window.DOMPurify.sanitize(window.marked.parse(text));
      return;
    }
  }

  bubble.textContent = text;
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
  renderMessageContent(bubble, text, role);

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
  closeConversationContextMenu();
  const response = await fetchApi("/api/conversations");
  const { conversations } = await response.json();

  conversationsList.replaceChildren();

  for (const conversation of conversations) {
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.textContent = conversation.title;
    selectButton.className = [
      "list-group-item",
      "list-group-item-action",
      conversation.id === activeConversationId ? "active" : "",
    ].join(" ");
    selectButton.setAttribute("aria-haspopup", "menu");
    selectButton.setAttribute("aria-controls", "conversation-context-menu");
    selectButton.setAttribute("aria-keyshortcuts", "Shift+F10");

    selectButton.addEventListener("click", () => loadConversation(conversation.id));

    selectButton.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openConversationContextMenu(
        conversation,
        selectButton,
        event.clientX,
        event.clientY,
      );
    });

    selectButton.addEventListener("keydown", (event) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
        return;
      }

      event.preventDefault();
      const bounds = selectButton.getBoundingClientRect();
      openConversationContextMenu(
        conversation,
        selectButton,
        bounds.left,
        bounds.bottom,
      );
    });

    conversationsList.append(selectButton);
  }

  return conversations;
}


function showWelcomeMessage() {
  const welcome = document.createElement("div");
  welcome.id = "welcome";
  welcome.className = "welcome-message";

  const message = document.createElement("p");
  message.textContent = "How can I help?";
  welcome.append(message);
  messagesContainer.replaceChildren(welcome);
}


async function deleteConversation(conversationId, title) {
  if (!window.confirm(`Delete "${title}" and its messages? This cannot be undone.`)) {
    return;
  }

  clearError();

  try {
    await fetchApi(`/api/conversations/${conversationId}`, { method: "DELETE" });
    const deletedActiveConversation = conversationId === activeConversationId;
    const conversations = await loadConversations();

    if (!deletedActiveConversation) {
      return;
    }

    activeConversationId = null;
    localStorage.removeItem("conversation_id");

    if (conversations.length > 0) {
      await loadConversation(conversations[0].id);
    } else {
      showWelcomeMessage();
    }
  } catch (error) {
    showError(error.message);
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

  if (mobileViewport.matches && sidebarOpen) {
    setSidebarOpen(false);
    sidebarToggleButton.focus();
  }
}


function handleSseEvent(eventBlock, assistantBubble) {
  let eventName;
  const data = [];

  for (const line of eventBlock.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const field = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1).replace(/^ /, "");

    if (field === "event") {
      eventName = value;
    } else if (field === "data") {
      data.push(value);
    }
  }

  if (!eventName || data.length === 0) {
    return;
  }

  const payload = JSON.parse(data.join("\n"));

  if (eventName === "token") {
    setStatus("Writing response...");
    const rawText = (assistantBubble.dataset.rawText || "") + payload.text;
    renderMessageContent(assistantBubble, rawText, "assistant");
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
    buffer = buffer.replace(/\r\n/g, "\n");
    const eventBlocks = buffer.split("\n\n");
    buffer = eventBlocks.pop() || "";

    for (const eventBlock of eventBlocks) {
      handleSseEvent(eventBlock, assistantBubble);
    }
  }

  buffer += decoder.decode();
  buffer = buffer.replace(/\r\n/g, "\n");

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

    if (!assistantBubble.dataset.rawText) {
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
  newChatButton.disabled = true;

  try {
    await createConversation();
    if (mobileViewport.matches) {
      setSidebarOpen(false);
    }
    messageInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    newChatButton.disabled = false;
  }
});

sidebarToggleButton.addEventListener("click", () => {
  setSidebarOpen(!sidebarOpen);
  if (mobileViewport.matches && sidebarOpen) {
    sidebarCloseButton.focus();
  }
});

sidebarCloseButton.addEventListener("click", () => {
  setSidebarOpen(false);
  sidebarToggleButton.focus();
});

sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !conversationContextMenu.hidden) {
    event.preventDefault();
    closeConversationContextMenu(true);
    return;
  }

  if (event.key === "Escape" && mobileViewport.matches && sidebarOpen) {
    setSidebarOpen(false);
    sidebarToggleButton.focus();
  }
});

document.addEventListener("click", (event) => {
  if (!conversationContextMenu.hidden && !conversationContextMenu.contains(event.target)) {
    closeConversationContextMenu();
  }
});

deleteConversationAction.addEventListener("click", () => {
  const selectedConversation = contextConversation?.conversation;
  closeConversationContextMenu();

  if (selectedConversation) {
    void deleteConversation(selectedConversation.id, selectedConversation.title);
  }
});

window.addEventListener("resize", () => closeConversationContextMenu());

mobileViewport.addEventListener("change", () => {
  setSidebarOpen(!mobileViewport.matches);
});

setSidebarOpen(!mobileViewport.matches);

composer.addEventListener("submit", sendMessage);
messageInput.addEventListener("keydown", handleComposerKeydown);

initializeApp();
