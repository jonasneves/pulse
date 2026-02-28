// ── State ─────────────────────────────────────────────────────────────────
let activeTab     = 'github';
let focusedItem   = null;
let githubData    = null;
let huggingfaceData = null;
let messages      = [];
let abortCtrl     = null;

const MODEL       = 'claude-sonnet-4-6';
const LOCAL_PROXY = 'http://127.0.0.1:7337/claude';
const PROXY_KEY   = 'pulse-use-proxy';

// ── Elements ──────────────────────────────────────────────────────────────
const cardList       = document.getElementById('card-list');
const chatMessages   = document.getElementById('chat-messages');
const chatInput      = document.getElementById('chat-input');
const chatSend       = document.getElementById('chat-send');
const chatAbort      = document.getElementById('chat-abort');
const itemContext    = document.getElementById('item-context');
const itemContextTxt = document.getElementById('item-context-text');
const updatedLabel   = document.getElementById('updated-label');
const toastContainer = document.getElementById('toast-container');

// ── Proxy detection ───────────────────────────────────────────────────────
function useProxy() {
  return localStorage.getItem(PROXY_KEY) === 'true';
}

async function checkProxy() {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2000);
    await fetch(LOCAL_PROXY, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

function initProxyBadge() {
  const badge  = document.getElementById('proxy-badge');
  const label  = document.getElementById('proxy-label');

  function render(active) {
    badge.classList.toggle('active', active);
    label.textContent = active ? 'Claude Code (on)' : 'Claude Code';
  }

  checkProxy().then(available => {
    if (!available) return;
    badge.hidden = false;
    render(useProxy());
    badge.addEventListener('click', () => {
      const next = !useProxy();
      localStorage.setItem(PROXY_KEY, String(next));
      render(next);
      showToast(next ? 'Using Claude Code proxy' : 'Using direct API');
    });
  });
}

// ── Session persistence ───────────────────────────────────────────────────
const SESSION_KEY = 'pulse-session';

function autoSave() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ messages, savedAt: new Date().toISOString() }));
  } catch {}
}

function restoreMessages(saved) {
  messages = saved;
  const banner = document.createElement('div');
  banner.className = 'session-restore-banner';
  banner.textContent = '— restored —';
  chatMessages.appendChild(banner);
  for (const msg of saved) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      appendMessage('user', msg.content);
    } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const textBlock = msg.content.find(c => c.type === 'text');
      if (textBlock?.text) appendMessage('assistant', textBlock.text);
    }
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function tryRestoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.messages?.length) restoreMessages(data.messages);
    }
  } catch {}
}

// ── API key management ────────────────────────────────────────────────────
const KEY_STORE = 'pulse-api-key';

function getApiKey()    { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } }
function setApiKey(key) { try { localStorage.setItem(KEY_STORE, key); } catch {} }

function initApiKeyPanel() {
  const panel   = document.getElementById('api-key-panel');
  const toggle  = document.getElementById('api-key-toggle');
  const input   = document.getElementById('api-key-input');
  const saveBtn = document.getElementById('api-key-save');

  function setOpen(open) {
    if (open) panel.dataset.open = '';
    else      delete panel.dataset.open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  function updateStatus() {
    if (getApiKey()) panel.dataset.hasKey = '';
    else             delete panel.dataset.hasKey;
  }

  updateStatus();
  // Open by default only if no key yet
  setOpen(!getApiKey());

  toggle.addEventListener('click', () => setOpen(!panel.hasAttribute('data-open')));

  saveBtn.addEventListener('click', () => {
    const key = input.value.trim();
    if (!key.startsWith('sk-ant-')) {
      showToast('Key should start with sk-ant-', 'error');
      return;
    }
    setApiKey(key);
    input.value = '';
    updateStatus();
    setOpen(false);
    showToast('API key saved');
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveBtn.click();
  });
}

// ── Theme toggle ──────────────────────────────────────────────────────────
document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  const isDark  = current === 'dark' || (!current && !window.matchMedia('(prefers-color-scheme: light)').matches);
  const next    = isDark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('pulse-theme', next); } catch {}
});

// ── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab === activeTab) return;
    activeTab = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
      b.setAttribute('aria-selected', b.dataset.tab === activeTab);
    });

    clearFocus();
    renderCurrentTab();
    updateTimestamp();
  });
});

// ── Data loading ──────────────────────────────────────────────────────────
async function loadData() {
  const [gh, hf] = await Promise.allSettled([
    fetch('data/github.json').then(r => r.ok ? r.json() : null),
    fetch('data/huggingface.json').then(r => r.ok ? r.json() : null),
  ]);

  if (gh.status === 'fulfilled') githubData = gh.value;
  if (hf.status === 'fulfilled') huggingfaceData = hf.value;

  renderCurrentTab();
  updateTimestamp();
}

function updateTimestamp() {
  const data = activeTab === 'github' ? githubData : huggingfaceData;
  if (data?.updated) {
    const d = new Date(data.updated);
    updatedLabel.textContent = `updated ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    updatedLabel.textContent = '';
  }
}

// ── Card rendering ────────────────────────────────────────────────────────
function renderCurrentTab() {
  if (activeTab === 'github') {
    renderGitHubCards(githubData, cardList, handleCardSelect);
  } else {
    renderHFCards(huggingfaceData, cardList, handleCardSelect);
  }
}

function handleCardSelect(cardEl, item) {
  const isActive = cardEl.classList.contains('active');

  // Deselect all cards
  document.querySelectorAll('#card-list [data-rank]').forEach(c => c.classList.remove('active'));

  if (isActive) {
    clearFocus();
    return;
  }

  cardEl.classList.add('active');
  focusedItem = item;

  const label = activeTab === 'github'
    ? (item.fullName || item.name)
    : item.id;
  itemContextTxt.textContent = label;
  itemContext.hidden = false;

  chatInput.focus();
}

function clearFocus() {
  focusedItem = null;
  itemContext.hidden = true;
  document.querySelectorAll('#card-list [data-rank]').forEach(c => c.classList.remove('active'));
}

document.getElementById('item-context-clear').addEventListener('click', clearFocus);

// ── Markdown rendering ────────────────────────────────────────────────────
function escapeHtmlChat(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMd(text) {
  if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
    marked.use({
      renderer: {
        link(token) {
          const href = escapeHtmlChat(token.href || '');
          const title = token.title ? ` title="${escapeHtmlChat(token.title)}"` : '';
          const inner = this.parser ? this.parser.parseInline(token.tokens) : (token.text || href);
          return `<a href="${href}"${title} target="_blank" rel="noopener noreferrer">${inner}</a>`;
        },
        image(token) {
          return token.text ? `[${escapeHtmlChat(token.text)}]` : '';
        },
      },
    });
    return DOMPurify.sanitize(marked.parse(text), { ADD_ATTR: ['target', 'rel'] });
  }
  return text.split(/\n{2,}/).map(p => `<p>${escapeHtmlChat(p)}</p>`).join('');
}

// ── Chat messages ─────────────────────────────────────────────────────────
function appendMessage(role, content, streaming = false) {
  const wrapper = document.createElement('div');
  wrapper.className = `chat-msg chat-msg-${role}`;

  const label = document.createElement('div');
  label.className = 'chat-msg-label';
  label.textContent = role === 'user' ? 'you' : 'claude';

  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble' + (streaming ? ' chat-cursor' : '');

  if (role === 'user') {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = renderMd(content);
  }

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return bubble;
}

function updateBubble(bubble, text, streaming = false) {
  bubble.innerHTML = renderMd(text);
  if (streaming) bubble.classList.add('chat-cursor');
  else           bubble.classList.remove('chat-cursor');
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ` ${type}` : '');
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── SSE parser ────────────────────────────────────────────────────────────
async function* parseSSE(body) {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', currentEvent = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('event: '))      { currentEvent = line.slice(7).trim(); }
      else if (line.startsWith('data: ') && currentEvent) {
        const raw = line.slice(6);
        if (raw === '[DONE]') return;
        try { yield { event: currentEvent, data: JSON.parse(raw) }; } catch {}
        currentEvent = null;
      }
    }
  }
}

// ── API call ──────────────────────────────────────────────────────────────
async function callAPI(msgs, signal) {
  const system  = buildSystem({ tab: activeTab, focused: focusedItem, githubData, huggingfaceData });
  const payload = { model: MODEL, max_tokens: 2048, stream: true, system, tools: TOOLS, messages: msgs };

  let res;
  if (useProxy()) {
    res = await fetch(LOCAL_PROXY, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    const key = getApiKey();
    if (!key) throw new Error('No API key — click the banner above to add one.');
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: {
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.body;
}

// ── Suggestions collapse helpers ──────────────────────────────────────────
function collapseSuggestions() {
  const wrap = document.getElementById('suggestions-wrap');
  if (!wrap.hidden) {
    delete wrap.dataset.open;
    wrap.querySelector('#suggestions-toggle')?.setAttribute('aria-expanded', 'false');
  }
}

// ── Conversation turn ─────────────────────────────────────────────────────
let turnDepth = 0;

async function runTurn() {
  turnDepth++;
  const bubble = appendMessage('assistant', '', true);
  let   text   = '';

  abortCtrl = new AbortController();
  chatSend.disabled = true;
  chatAbort.hidden  = false;

  try {
    const body = await callAPI(messages, abortCtrl.signal);
    const contentBlocks = []; // accumulate for final assistant message

    let currentBlock = null;
    let toolUses     = [];

    for await (const { event, data } of parseSSE(body)) {
      if (event === 'content_block_start') {
        currentBlock = { type: data.content_block.type, id: data.content_block.id, text: '', inputJson: '' };
        if (data.content_block.type === 'tool_use') {
          currentBlock.name = data.content_block.name;
        }
      }
      else if (event === 'content_block_delta') {
        if (!currentBlock) continue;
        if (data.delta.type === 'text_delta') {
          currentBlock.text += data.delta.text;
          text = contentBlocks.filter(b => b.type === 'text').map(b => b.text).join('') + currentBlock.text;
          updateBubble(bubble, text, true);
        } else if (data.delta.type === 'input_json_delta') {
          currentBlock.inputJson += data.delta.partial_json;
        }
      }
      else if (event === 'content_block_stop') {
        if (currentBlock) {
          contentBlocks.push(currentBlock);
          if (currentBlock.type === 'tool_use') toolUses.push(currentBlock);
          currentBlock = null;
        }
      }
      else if (event === 'message_stop') {
        break;
      }
    }

    // Finalize text
    text = contentBlocks.filter(b => b.type === 'text').map(b => b.text).join('');
    updateBubble(bubble, text || '\u200b', false);

    // Build assistant message for history
    const assistantContent = contentBlocks
      .filter(b => b.type === 'text' || b.type === 'tool_use')
      .map(b => {
        if (b.type === 'text') return { type: 'text', text: b.text };
        let input = {};
        try { input = JSON.parse(b.inputJson || '{}'); } catch {}
        return { type: 'tool_use', id: b.id, name: b.name, input };
      });

    messages.push({ role: 'assistant', content: assistantContent });

    // Execute tools and continue if needed
    if (toolUses.length > 0) {
      const toolResults = toolUses.map(tu => {
        let input = {};
        try { input = JSON.parse(tu.inputJson || '{}'); } catch {}
        const result = executeTool(tu.name, input);
        return { type: 'tool_result', tool_use_id: tu.id, content: result };
      });

      messages.push({ role: 'user', content: toolResults });

      // Continue conversation after tool use (no new user bubble)
      await runTurn();
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      updateBubble(bubble, text || '*(stopped)*', false);
      messages.push({ role: 'assistant', content: [{ type: 'text', text: text || '(stopped)' }] });
    } else {
      updateBubble(bubble, `**Error:** ${err.message}`, false);
      messages.push({ role: 'assistant', content: [{ type: 'text', text: `Error: ${err.message}` }] });
      showToast(err.message, 'error');
    }
  } finally {
    turnDepth--;
    abortCtrl         = null;
    chatSend.disabled = false;
    chatAbort.hidden  = true;
    if (turnDepth === 0) autoSave();
  }
}

// ── Send message ──────────────────────────────────────────────────────────
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || chatSend.disabled) return;

  // Build user content — include focused item context if any
  let userText = text;
  if (focusedItem) {
    const label = activeTab === 'github'
      ? focusedItem.fullName
      : focusedItem.id;
    userText = `[Regarding: ${label}]\n${text}`;
  }

  chatInput.value = '';
  chatInput.style.height = '';
  collapseSuggestions();

  appendMessage('user', text); // show clean text in UI
  messages.push({ role: 'user', content: userText });

  await runTurn();
}

chatSend.addEventListener('click', sendMessage);

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Esc × 2 to clear chat
let escCount = 0;
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    escCount++;
    if (escCount >= 2) {
      messages = [];
      chatMessages.innerHTML = '';
      const wrap = document.getElementById('suggestions-wrap');
      wrap.hidden = true;
      delete wrap.dataset.open;
      try { localStorage.removeItem(SESSION_KEY); } catch {}
      escCount = 0;
    }
    setTimeout(() => { escCount = 0; }, 800);
  } else {
    escCount = 0;
  }
});

// Auto-resize textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
});

chatAbort.addEventListener('click', () => {
  abortCtrl?.abort();
});

document.getElementById('suggestions-toggle').addEventListener('click', () => {
  const wrap = document.getElementById('suggestions-wrap');
  const isOpen = wrap.hasAttribute('data-open');
  if (isOpen) {
    delete wrap.dataset.open;
    document.getElementById('suggestions-toggle').setAttribute('aria-expanded', 'false');
  } else {
    wrap.dataset.open = '';
    document.getElementById('suggestions-toggle').setAttribute('aria-expanded', 'true');
  }
});

// ── Init ──────────────────────────────────────────────────────────────────
initApiKeyPanel();
initProxyBadge();
tryRestoreSession();
loadData();
