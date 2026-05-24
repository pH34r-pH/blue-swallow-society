// Blue Swallow Society - Cyberpunk Interface Controller

const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

// Hard-coded passcode for local testing (should be pulled from VM backend)
const CORRECT_PASSCODE = "blue-swallow";

// State
let isAuthenticated = false;
const chatHistory = [];

// ===== LOGIN FLOW =====

function initLoginFlow() {
  const loginBtn = $("loginBtn");
  const passcodeInput = $("passcodeInput");
  
  if (loginBtn) {
    loginBtn.addEventListener("click", handleLogin);
    passcodeInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleLogin();
    });
  }
}

async function handleLogin() {
  const passcodeInput = $("passcodeInput");
  const errorDiv = $("terminalError");
  let passcode = passcodeInput ? passcodeInput.value : "";

  if (!passcode) {
    showError(errorDiv, "PASSCODE REQUIRED");
    return;
  }

  // T017: Input sanitization — strip HTML tags and enforce max length
  passcode = passcode.replace(/<[^>]*>/g, "").slice(0, 128);

  // Simulate API call to validate passcode against VM
  try {
    const isValid = await validatePasscode(passcode);
    
    if (isValid) {
      isAuthenticated = true;
      unlockInterface();
    } else {
      showError(errorDiv, "ACCESS DENIED - INVALID CREDENTIALS");
      passcodeInput.value = "";
    }
  } catch (err) {
    showError(errorDiv, `AUTHENTICATION ERROR: ${err.message}`);
  }
}

async function validatePasscode(passcode) {
  // In production, this would call /api/validate-passcode on the backend
  // For local testing, we simulate it
  try {
    const response = await fetch("/api/validate-passcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode })
    });
    
    const data = await response.json();
    return data.ok === true;
  } catch (err) {
    // Fallback to local validation for development
    return passcode === CORRECT_PASSCODE;
  }
}

function showError(errorDiv, message) {
  if (errorDiv) {
    errorDiv.textContent = `> ERROR: ${message}`;
    errorDiv.classList.add("show");
  }
}

function unlockInterface() {
  const terminalScreen = $("terminalScreen");
  const mainInterface = $("mainInterface");
  
  if (terminalScreen) terminalScreen.classList.remove("active");
  if (mainInterface) mainInterface.classList.add("active");
  
  initTabSystem();
  initAgenticChat();
}

// ===== TAB SYSTEM =====

function initTabSystem() {
  const tabBtns = $$(".tab-btn");
  const tabContents = $$(".tab-content");

  tabBtns.forEach((btn, index) => {
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", "false");
    btn.setAttribute("tabindex", "-1");
    btn.setAttribute("aria-controls", `${btn.getAttribute("data-tab")}-tab`);

    btn.addEventListener("click", () => {
      activateTab(index, tabBtns, tabContents);
    });

    // T022: Keyboard navigation — arrow keys cycle tabs, Home/End jump
    btn.addEventListener("keydown", (e) => {
      let nextIndex = index;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        nextIndex = (index + 1) % tabBtns.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        nextIndex = (index - 1 + tabBtns.length) % tabBtns.length;
      } else if (e.key === "Home") {
        nextIndex = 0;
      } else if (e.key === "End") {
        nextIndex = tabBtns.length - 1;
      } else {
        return;
      }
      e.preventDefault();
      activateTab(nextIndex, tabBtns, tabContents);
      tabBtns[nextIndex].focus();
    });
  });

  // Set up tabpanel roles
  tabContents.forEach((panel) => {
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("tabindex", "0");
  });

  // Setup logout
  const logoutBtn = $("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
}

function activateTab(index, tabBtns, tabContents) {
  tabBtns.forEach((b, i) => {
    const isActive = i === index;
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-selected", String(isActive));
    b.setAttribute("tabindex", isActive ? "0" : "-1");
  });

  tabContents.forEach((c, i) => {
    c.classList.toggle("active", i === index);
    c.setAttribute("aria-hidden", String(i !== index));
  });
}

function handleLogout() {
  isAuthenticated = false;
  chatHistory.length = 0;
  
  const terminalScreen = $("terminalScreen");
  const mainInterface = $("mainInterface");
  const passcodeInput = $("passcodeInput");
  const errorDiv = $("terminalError");
  
  if (terminalScreen) terminalScreen.classList.add("active");
  if (mainInterface) mainInterface.classList.remove("active");
  if (passcodeInput) passcodeInput.value = "";
  if (errorDiv) errorDiv.classList.remove("show");
}

// ===== AGENTIC CHAT =====

function initAgenticChat() {
  const chatInput = $("chatInput");
  const sendBtn = $("sendBtn");
  
  if (sendBtn) {
    sendBtn.addEventListener("click", handleSendMessage);
  }
  
  if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleSendMessage();
    });
  }
  
  // Add welcome message
  addChatMessage("SYSTEM", "// AGENTIC NETWORK INITIALIZED //\n// Ready for input //");
}

async function handleSendMessage() {
  const chatInput = $("chatInput");
  const message = chatInput ? chatInput.value.trim() : "";
  
  if (!message) return;
  
  // Add user message to chat
  addChatMessage("USER", message);
  if (chatInput) chatInput.value = "";
  
  // Simulate sending to backend
  const response = await getAgentResponse(message);
  addChatMessage("AGENT", response);
}

async function getAgentResponse(prompt) {
  // In production, call /api/agent with the prompt
  try {
    const response = await fetch(`/api/agent?prompt=${encodeURIComponent(prompt)}`);
    const data = await response.json();
    
    if (data.ok) {
      return data.message || "No response";
    } else {
      return `// ERROR: ${data.error || "Unknown error"}`;
    }
  } catch (err) {
    return `// TRANSMISSION ERROR: ${err.message}`;
  }
}

function addChatMessage(sender, text) {
  const messagesDiv = $("chatMessages");
  if (!messagesDiv) return;

  const msgEl = document.createElement("div");
  msgEl.className = `chat-message ${sender.toLowerCase()}`;

  const timestamp = new Date().toLocaleTimeString();

  // T037: Safe DOM construction — never use innerHTML with user input
  const timeDiv = document.createElement("div");
  timeDiv.style.opacity = "0.6";
  timeDiv.style.fontSize = "0.8em";
  timeDiv.textContent = `[${timestamp}]`;

  const textDiv = document.createElement("div");
  textDiv.textContent = text;

  msgEl.appendChild(timeDiv);
  msgEl.appendChild(textDiv);

  messagesDiv.appendChild(msgEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  chatHistory.push({ sender, text, timestamp });
}

// ===== INITIALIZATION =====

function init() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    initLoginFlow();
  }
}

init();
