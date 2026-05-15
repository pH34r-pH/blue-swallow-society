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
  const passcode = passcodeInput ? passcodeInput.value : "";
  
  if (!passcode) {
    showError(errorDiv, "PASSCODE REQUIRED");
    return;
  }
  
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
    console.log("Using local validation (no backend)");
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
  
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");
      
      // Remove active class from all
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));
      
      // Add active class to clicked tab and content
      btn.classList.add("active");
      const tabContent = $(`${tabName}-tab`);
      if (tabContent) tabContent.classList.add("active");
    });
  });
  
  // Setup logout
  const logoutBtn = $("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
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
  msgEl.innerHTML = `<div style="opacity: 0.6; font-size: 0.8em;">[${timestamp}]</div><div>${text}</div>`;
  
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
