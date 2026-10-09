// Screen management
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'flex';
  document.getElementById('auth-error').textContent = '';
}

function showLogin() {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'flex';
  document.getElementById('auth-error').textContent = '';
}

function showError(msg) {
  document.getElementById('auth-error').textContent = msg;
}

// Auth
async function register() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const inviteCode = document.getElementById('reg-invite').value.trim();

  if (!username || !password || !inviteCode) {
    return showError('Fill in all fields');
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, inviteCode })
    });
    const data = await res.json();

    if (!res.ok) {
      return showError(data.error);
    }

    enterDashboard(data.user, 0);
  } catch (err) {
    showError('Connection error');
  }
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    return showError('Enter your username and password');
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      return showError(data.error);
    }

    enterDashboard(data.user, data.dailyBonus);
  } catch (err) {
    showError('Connection error');
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  showScreen('auth-screen');
}

function enterDashboard(user, dailyBonus) {
  currentBananas = user.bananas;
  currentUserId = user.id;
  isOwnerUser = user.isOwner;
  document.getElementById('display-username').textContent = user.username;
  document.getElementById('display-bananas').textContent = '🍌 ' + user.bananas.toLocaleString();

  // Show admin tab for owner
  if (user.isOwner) {
    document.getElementById('admin-tab').style.display = 'inline-block';
  }

  if (dailyBonus > 0) {
    document.getElementById('bonus-amount').textContent = dailyBonus.toLocaleString();
    document.getElementById('daily-bonus-banner').style.display = 'block';
    setTimeout(() => {
      document.getElementById('daily-bonus-banner').style.display = 'none';
    }, 5000);
  } else {
    document.getElementById('daily-bonus-banner').style.display = 'none';
  }

  showScreen('dashboard-screen');
  loadPacks();
}

// Tabs
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[onclick="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');

  // Clear chat unread badge when switching to chat
  if (tab === 'chat') {
    chatUnreadCount = 0;
    updateChatBadge();
  }

  if (tab === 'shop') loadPacks();
  if (tab === 'inventory') loadInventory();
  if (tab === 'craft') loadCrafting();
  if (tab === 'trade') loadTrading();
  if (tab === 'chat') loadChat();
  if (tab === 'games') loadGames();
  if (tab === 'leaderboard') loadLeaderboard();
  if (tab === 'admin') loadAdmin();
}

// Rarity display helpers
const RARITY_LABELS = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  chroma_shiny: 'Chroma ✨',
  chroma_rainbow: 'Chroma 🌈',
  mystical: 'Mystical',
  bananarang: 'Bananarang',
  astronomical: 'Astronomical'
};

const RARITY_EMOJIS = {
  common: '⬜',
  rare: '🔵',
  epic: '🟣',
  legendary: '🟡',
  chroma_shiny: '✨',
  chroma_rainbow: '🌈',
  mystical: '🔴',
  bananarang: '🍌',
  astronomical: '⭐'
};

// Shop
let currentBananas = 0;

async function loadPacks() {
  try {
    const res = await fetch('/api/packs');
    if (!res.ok) return;
    const packs = await res.json();

    const grid = document.getElementById('packs-grid');
    const icons = { 'Standard Pack': '📦', 'Premium Pack': '💎', 'Ultra Pack': '🔥' };
    const classes = { 'Standard Pack': 'standard', 'Premium Pack': 'premium', 'Ultra Pack': 'ultra' };

    grid.innerHTML = packs.map(pack => {
      const canAfford = currentBananas >= pack.cost;
      return `
        <div class="pack-card ${classes[pack.name] || ''} ${canAfford ? '' : 'disabled'}"
             onclick="${canAfford ? `openPackUI(${pack.id})` : ''}">
          <div class="pack-icon">${icons[pack.name] || '📦'}</div>
          <div class="pack-name">${pack.name}</div>
          <div class="pack-cost">🍌 ${pack.cost.toLocaleString()}</div>
          <div class="pack-max">Up to ${RARITY_LABELS[pack.max_rarity]}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load packs', err);
  }
}

let pendingReveal = null;

async function openPackUI(packId) {
  const overlay = document.getElementById('pack-overlay');
  const openingText = document.getElementById('pack-opening-text');
  const swipePrompt = document.getElementById('swipe-prompt');
  const swipeCard = document.getElementById('swipe-card');
  const revealCard = document.getElementById('reveal-card');
  const closeBtn = document.getElementById('reveal-close');

  // Reset state
  overlay.style.display = 'flex';
  openingText.style.display = 'block';
  openingText.textContent = 'Opening...';
  openingText.style.animation = '';
  swipePrompt.style.display = 'none';
  revealCard.style.display = 'none';
  closeBtn.style.display = 'none';
  swipeCard.classList.remove('swiped', 'swiping');
  swipeCard.style.transform = '';

  try {
    const res = await fetch(`/api/packs/${packId}/open`, { method: 'POST' });
    const data = await res.json();

    if (!res.ok) {
      openingText.textContent = data.error;
      openingText.style.animation = 'none';
      closeBtn.style.display = 'inline-block';
      return;
    }

    // Update banana count
    currentBananas = data.newBalance;
    document.getElementById('display-bananas').textContent = '🍌 ' + currentBananas.toLocaleString();

    // Store result for after swipe
    pendingReveal = data;

    // Short pause then show swipe card
    await new Promise(r => setTimeout(r, 600));
    openingText.style.display = 'none';
    swipePrompt.style.display = 'flex';

  } catch (err) {
    openingText.textContent = 'Connection error';
    openingText.style.animation = 'none';
    closeBtn.style.display = 'inline-block';
  }
}

function showRevealCard() {
  if (!pendingReveal) return;
  const data = pendingReveal;
  pendingReveal = null;

  const swipePrompt = document.getElementById('swipe-prompt');
  const revealCard = document.getElementById('reveal-card');
  const closeBtn = document.getElementById('reveal-close');

  // Hide swipe, show reveal after a beat
  setTimeout(() => {
    swipePrompt.style.display = 'none';
    revealCard.style.display = 'block';
    revealCard.className = 'reveal-card glow-' + data.character.rarity;

    document.getElementById('reveal-rarity').textContent = RARITY_LABELS[data.character.rarity] || data.character.rarity;
    document.getElementById('reveal-rarity').className = 'reveal-rarity rarity-' + data.character.rarity;

    const revealImg = document.getElementById('reveal-img');
    const revealEmoji = document.getElementById('reveal-emoji');
    if (data.character.image_path) {
      revealImg.src = data.character.image_path;
      revealImg.alt = data.character.name;
      revealImg.style.display = 'block';
      revealEmoji.style.display = 'none';
    } else {
      revealImg.style.display = 'none';
      revealEmoji.style.display = 'block';
      revealEmoji.textContent = RARITY_EMOJIS[data.character.rarity] || '❓';
    }

    document.getElementById('reveal-name').textContent = data.character.name;

    // Show potassium level
    let potassiumEl = revealCard.querySelector('.reveal-potassium');
    if (!potassiumEl) {
      potassiumEl = document.createElement('div');
      potassiumEl.className = 'reveal-potassium';
      revealCard.querySelector('.reveal-name').insertAdjacentElement('afterend', potassiumEl);
    }
    if (data.character.potassium_level) {
      potassiumEl.textContent = `🧪 Potassium: ${data.character.potassium_level}`;
      potassiumEl.style.display = 'block';
    } else {
      potassiumEl.style.display = 'none';
    }

    // Add mascot for rare pulls
    const oldMascot = revealCard.querySelector('.reveal-mascot');
    if (oldMascot) oldMascot.remove();
    const rarePulls = ['legendary', 'chroma_shiny', 'chroma_rainbow', 'mystical', 'bananarang', 'astronomical'];
    if (rarePulls.includes(data.character.rarity)) {
      const mascotImg = document.createElement('img');
      mascotImg.src = '/img/mascot/banana-excited.svg';
      mascotImg.alt = '';
      mascotImg.className = 'reveal-mascot';
      mascotImg.draggable = false;
      revealCard.appendChild(mascotImg);
    }

    closeBtn.style.display = 'inline-block';
  }, 350);
}

// Swipe handling
(function initSwipe() {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  function getSwipeCard() {
    return document.getElementById('swipe-card');
  }

  function onStart(e) {
    const card = getSwipeCard();
    if (!card || card.classList.contains('swiped')) return;
    isDragging = true;
    card.classList.add('swiping');
    const point = e.touches ? e.touches[0] : e;
    startY = point.clientY;
    currentY = startY;
  }

  function onMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const card = getSwipeCard();
    if (!card) return;
    const point = e.touches ? e.touches[0] : e;
    currentY = point.clientY;
    const deltaY = currentY - startY;
    // Only allow upward swipe
    if (deltaY < 0) {
      const rotation = deltaY * 0.03;
      card.style.transform = `translateY(${deltaY}px) rotate(${rotation}deg)`;
    }
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    const card = getSwipeCard();
    if (!card) return;
    card.classList.remove('swiping');

    const deltaY = currentY - startY;

    // Threshold: swipe up at least 80px
    if (deltaY < -80) {
      card.classList.add('swiped');
      card.style.transform = '';
      showRevealCard();
    } else {
      // Snap back
      card.style.transform = '';
    }
  }

  document.addEventListener('touchstart', e => {
    if (e.target.closest('.swipe-card')) onStart(e);
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (isDragging) onMove(e);
  }, { passive: false });

  document.addEventListener('touchend', onEnd);

  // Mouse fallback for desktop testing
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.swipe-card')) onStart(e);
  });
  document.addEventListener('mousemove', e => {
    if (isDragging) onMove(e);
  });
  document.addEventListener('mouseup', onEnd);
})();

function closeReveal() {
  document.getElementById('pack-overlay').style.display = 'none';
  document.getElementById('pack-opening-text').style.animation = '';
  loadPacks(); // Refresh affordability
}

// Inventory
async function loadInventory() {
  try {
    const res = await fetch('/api/inventory');
    if (!res.ok) return;
    const data = await res.json();

    // Stats
    const statsEl = document.getElementById('inventory-stats');
    statsEl.innerHTML = `
      <div class="stat-box">
        <div class="stat-number">${data.stats.totalUnique}</div>
        <div class="stat-label">Unique</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${data.stats.totalCount}</div>
        <div class="stat-label">Total</div>
      </div>
      ${data.stats.rarestOwned ? `
      <div class="stat-box">
        <div class="stat-number">${RARITY_EMOJIS[data.stats.rarestOwned.rarity] || '?'}</div>
        <div class="stat-label">Rarest: ${data.stats.rarestOwned.name}</div>
      </div>` : ''}
    `;

    // Grid
    const gridEl = document.getElementById('inventory-grid');
    const emptyEl = document.getElementById('inventory-empty');
    if (data.items.length === 0) {
      gridEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    gridEl.innerHTML = data.items.map(item => `
      <div class="inv-card rarity-${item.rarity}">
        ${item.count > 1 ? `<div class="inv-count">x${item.count}</div>` : ''}
        ${item.potassium_level ? `<div class="inv-potassium" title="Potassium Level">🧪${item.potassium_level}</div>` : ''}
        ${item.image_path
          ? `<img class="inv-img" src="${item.image_path}" alt="${item.name}">`
          : `<div class="inv-emoji">${RARITY_EMOJIS[item.rarity] || '❓'}</div>`}
        <div class="inv-name">${item.name}</div>
        <div class="inv-rarity rarity-${item.rarity}">${RARITY_LABELS[item.rarity] || item.rarity}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load inventory', err);
  }
}

// ===== CHAT =====
let socket = null;
let currentRoom = 'main';
let isOwnerUser = false;
let currentTab = 'shop';
let chatUnreadCount = 0;

function initChat() {
  if (socket) return;
  socket = io();

  socket.on('chat', (data) => {
    // Track unread if not on chat tab
    if (currentTab !== 'chat') {
      chatUnreadCount++;
      updateChatBadge();
    }
    if (data.room !== currentRoom) return;
    appendChatMessage(data);
  });

  socket.on('system', (data) => {
    const el = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg system-msg';
    div.textContent = data.message;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  });

  socket.on('character_share', (data) => {
    const el = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg share-msg';
    const badgeHtml = (data.badges || []).map(b =>
      `<span class="msg-badge" style="background:${b.color};color:#000;">${b.name}</span>`
    ).join('');
    div.innerHTML = `
      <span class="msg-user ${data.isOwner ? 'msg-owner' : ''}">${data.username}</span>
      ${badgeHtml}
      shared: ${RARITY_EMOJIS[data.character.rarity]} <span class="rarity-${data.character.rarity}" style="font-weight:600;">${data.character.name}</span>
    `;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  });

  socket.on('online_users', (users) => {
    document.getElementById('online-count').textContent = `${users.length} online`;
  });

  // Receive chat history when joining/switching rooms
  socket.on('chat:history', (messages) => {
    const el = document.getElementById('chat-messages');
    // Only populate if currently empty (don't duplicate on re-request)
    if (el.children.length === 0 && messages.length > 0) {
      messages.forEach(msg => appendChatMessage(msg));
    }
  });

  // Global challenge notification (works on any tab)
  socket.on('war:incoming', (data) => {
    warChallengerId = data.challengerId;
    // Always show global toast regardless of tab
    showChallengeToast(data.challengerName);
    // If on Games tab, also show the full modal
    if (currentTab === 'games') {
      document.getElementById('war-challenger-name').textContent = data.challengerName;
      document.getElementById('war-incoming').style.display = 'flex';
    }
  });
}

function updateChatBadge() {
  const chatTab = document.querySelector('.tab[onclick="switchTab(\'chat\')"]');
  if (!chatTab) return;
  let badge = chatTab.querySelector('.tab-badge');
  if (chatUnreadCount > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tab-badge';
      chatTab.appendChild(badge);
    }
    badge.textContent = chatUnreadCount > 99 ? '99+' : chatUnreadCount;
  } else {
    if (badge) badge.remove();
  }
}

function showChallengeToast(challengerName) {
  // Remove any existing toast
  const existing = document.getElementById('war-challenge-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'war-challenge-toast';
  toast.className = 'war-challenge-toast';
  toast.innerHTML = `
    <div class="war-toast-inner">
      <span class="war-toast-icon">⚔️</span>
      <span class="war-toast-text"><strong>${escapeHtml(challengerName)}</strong> challenges you!</span>
      <div class="war-toast-actions">
        <button class="btn-accept" onclick="warAcceptFromToast()">Accept</button>
        <button class="btn-decline" onclick="warDeclineFromToast()">Decline</button>
      </div>
    </div>
  `;
  document.body.appendChild(toast);

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    const t = document.getElementById('war-challenge-toast');
    if (t) t.remove();
  }, 30000);
}

function warAcceptFromToast() {
  const toast = document.getElementById('war-challenge-toast');
  if (toast) toast.remove();
  if (!warChallengerId || !socket) return;
  socket.emit('war:accept', { challengerId: warChallengerId });
  warChallengerId = null;
  // Hide the games-tab modal too
  document.getElementById('war-incoming').style.display = 'none';
}

function warDeclineFromToast() {
  const toast = document.getElementById('war-challenge-toast');
  if (toast) toast.remove();
  if (!warChallengerId || !socket) return;
  socket.emit('war:decline', { challengerId: warChallengerId });
  warChallengerId = null;
  document.getElementById('war-incoming').style.display = 'none';
}

function appendChatMessage(data) {
  const el = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  const badgeHtml = (data.badges || []).map(b =>
    `<span class="msg-badge" style="background:${b.color};color:#000;">${b.name}</span>`
  ).join('');
  div.innerHTML = `
    <span class="msg-user ${data.isOwner ? 'msg-owner' : ''}">${data.username}</span>
    ${badgeHtml}
    <span class="msg-text">${escapeHtml(data.message)}</span>
  `;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg || !socket) return;
  socket.emit('message', { message: msg, room: currentRoom });
  input.value = '';
}

function switchRoom(room) {
  currentRoom = room;
  document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.room-btn[onclick="switchRoom('${room}')"]`).classList.add('active');
  document.getElementById('chat-messages').innerHTML = '';
  // Request history for the new room
  if (socket) socket.emit('chat:get_history', { room });
}

function loadChat() {
  initChat();
  if (socket) {
    socket.emit('get_online');
    // Load message history if chat is empty
    const el = document.getElementById('chat-messages');
    if (el.children.length === 0) {
      socket.emit('chat:get_history', { room: currentRoom });
    }
  }
  if (isOwnerUser) {
    document.getElementById('admin-room-btn').style.display = 'inline-block';
  }
}

// ===== ADMIN =====
async function loadAdmin() {
  loadAdminUsers();
  loadAdminBadges();
}

async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) return;
    const users = await res.json();

    // Populate banana user select
    const bananaSelect = document.getElementById('admin-banana-user');
    const badgeUserSelect = document.getElementById('admin-badge-user');
    const opts = users.map(u => `<option value="${u.id}">${u.username} (🍌${u.bananas})</option>`).join('');
    bananaSelect.innerHTML = '<option value="">Select player...</option>' + opts;
    badgeUserSelect.innerHTML = '<option value="">Select player...</option>' + opts;

    // Users list
    const listEl = document.getElementById('admin-users-list');
    listEl.innerHTML = users.map(u => `
      <div class="admin-user-row">
        <div class="admin-user-info">
          <strong>${u.username}</strong> ${u.is_owner ? '👑' : ''}
          <span class="banana-inline">🍌 ${u.bananas.toLocaleString()}</span>
          ${u.banned ? ' <span style="color:#ef4444;">BANNED</span>' : ''}
          ${u.muted ? ' <span style="color:#f59e0b;">MUTED</span>' : ''}
        </div>
        ${!u.is_owner ? `
        <div class="admin-user-actions">
          <button onclick="adminToggleMute(${u.id}, ${u.muted ? 0 : 1})">${u.muted ? 'Unmute' : 'Mute'}</button>
          <button onclick="adminToggleBan(${u.id}, ${u.banned ? 0 : 1})" style="background:${u.banned ? '#10b981' : '#ef4444'};color:#fff;">${u.banned ? 'Unban' : 'Ban'}</button>
        </div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load admin users', err);
  }
}

async function loadAdminBadges() {
  try {
    const res = await fetch('/api/admin/badges');
    if (!res.ok) return;
    const badges = await res.json();
    const select = document.getElementById('admin-badge-select');
    select.innerHTML = '<option value="">Select badge...</option>' +
      badges.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  } catch (err) {}
}

async function adminSetBananas() {
  const userId = document.getElementById('admin-banana-user').value;
  const amount = parseInt(document.getElementById('admin-banana-amount').value);
  if (!userId || isNaN(amount)) return alert('Select a player and enter an amount');

  const res = await fetch('/api/admin/bananas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: parseInt(userId), amount })
  });
  const data = await res.json();
  if (res.ok) {
    alert(`${data.user.username} now has 🍌 ${data.user.bananas.toLocaleString()}`);
    loadAdminUsers();
    // Update own display if self
    if (parseInt(userId) === currentUserId) {
      currentBananas = data.user.bananas;
      document.getElementById('display-bananas').textContent = '🍌 ' + currentBananas.toLocaleString();
    }
  } else {
    alert(data.error);
  }
}

async function adminCreateInvite() {
  const code = document.getElementById('admin-invite-input').value.trim();
  const assignedTo = document.getElementById('admin-invite-name').value.trim();
  if (!code) return;
  if (!assignedTo) return alert('Enter the real name of who this code is for');

  const res = await fetch('/api/admin/invite-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes: [code], assignedTo })
  });
  const data = await res.json();
  if (res.ok) {
    document.getElementById('admin-invite-result').textContent = `Created: ${data.created.join(', ')} (for ${assignedTo})`;
    document.getElementById('admin-invite-input').value = '';
    document.getElementById('admin-invite-name').value = '';
  } else {
    alert(data.error);
  }
}

async function adminCreateBadge() {
  const name = document.getElementById('admin-badge-name').value.trim();
  const color = document.getElementById('admin-badge-color').value;
  if (!name) return;

  const res = await fetch('/api/admin/badges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color })
  });
  if (res.ok) {
    document.getElementById('admin-badge-name').value = '';
    loadAdminBadges();
    alert('Badge created!');
  }
}

async function adminAssignBadge() {
  const userId = document.getElementById('admin-badge-user').value;
  const badgeId = document.getElementById('admin-badge-select').value;
  if (!userId || !badgeId) return alert('Select a player and a badge');

  const res = await fetch('/api/admin/badges/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: parseInt(userId), badgeId: parseInt(badgeId) })
  });
  if (res.ok) alert('Badge assigned!');
}

async function adminToggleMute(userId, muted) {
  await fetch('/api/admin/mute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, muted })
  });
  loadAdminUsers();
}

async function adminToggleBan(userId, banned) {
  if (banned && !confirm('Ban this player?')) return;
  await fetch('/api/admin/ban', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, banned })
  });
  loadAdminUsers();
}

// ===== LEADERBOARD =====
async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) return;
    const data = await res.json();

    const el = document.getElementById('leaderboard-list');
    if (data.length === 0) {
      el.innerHTML = '<p style="color:#888;">No players yet.</p>';
      return;
    }

    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

    el.innerHTML = data.map(entry => {
      const hasWarRecord = entry.warWins > 0 || entry.warLosses > 0 || entry.warDraws > 0;
      const warText = hasWarRecord
        ? ` · ⚔️ ${entry.warWins}W-${entry.warLosses}L${entry.warDraws > 0 ? '-' + entry.warDraws + 'D' : ''}`
        : '';
      return `
        <div class="lb-row lb-rank-${entry.rank <= 3 ? entry.rank : 'other'}">
          <div class="lb-rank">${medals[entry.rank] || '#' + entry.rank}</div>
          <div class="lb-info">
            <div class="lb-username">${entry.username} ${entry.isOwner ? '👑' : ''}</div>
            <div class="lb-stats">${entry.totalUnique} unique · ${entry.totalCount} total${entry.rarestTier ? ' · Rarest: ' + (RARITY_LABELS[entry.rarestTier] || entry.rarestTier) : ''}${warText}</div>
          </div>
          <div>
            <div class="lb-score">${entry.score.toLocaleString()}</div>
            <div class="lb-score-label">score</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load leaderboard', err);
  }
}

let currentUserId = null;

// ===== CRAFTING =====
async function loadCrafting(keepResult) {
  try {
    const res = await fetch('/api/crafting/available');
    if (!res.ok) return;
    const recipes = await res.json();

    const el = document.getElementById('craft-recipes');
    el.innerHTML = recipes.map(r => `
      <div class="craft-card">
        <div class="craft-info">
          <span class="craft-from rarity-${r.from}">${r.count}x ${RARITY_LABELS[r.from] || r.from}</span>
          <span class="craft-count">Have: ${r.have}</span>
        </div>
        <div class="craft-arrow">⬇</div>
        <div class="craft-info">
          <span class="craft-to rarity-${r.to}">1x ${RARITY_LABELS[r.to] || r.to}</span>
        </div>
        <button class="craft-btn" ${r.canCraft > 0 ? '' : 'disabled'} onclick="doCraft('${r.from}')">
          ${r.canCraft > 0 ? 'Craft' : 'Not enough'}
        </button>
      </div>
    `).join('');

    if (!keepResult) {
      document.getElementById('craft-result').style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load crafting', err);
  }
}

async function doCraft(fromRarity) {
  try {
    const res = await fetch('/api/crafting/craft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromRarity })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }

    const resultEl = document.getElementById('craft-result');
    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      <div class="craft-result-title">🎉 You crafted a new character!</div>
      ${data.result.image_path
        ? `<img src="${data.result.image_path}" alt="${data.result.name}" class="craft-result-img">`
        : `<div style="font-size:3rem;margin:0.75rem 0;">${RARITY_EMOJIS[data.result.rarity] || '❓'}</div>`}
      <div class="rarity-${data.result.rarity}" style="font-weight:700;font-size:1.1rem;">${data.result.name}</div>
      <div class="rarity-${data.result.rarity}" style="font-size:0.85rem;text-transform:uppercase;font-weight:800;letter-spacing:1px;margin-top:0.25rem;">${RARITY_LABELS[data.result.rarity]}</div>
      <div style="color:#888;font-size:0.75rem;margin-top:0.5rem;">Used ${data.consumed.count} ${RARITY_LABELS[data.consumed.rarity]} cards</div>
    `;

    resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Refresh recipe counts but keep the result card visible
    loadCrafting(true);
  } catch (err) {
    alert('Crafting failed');
  }
}

// ===== TRADING =====
async function loadTrading() {
  loadTradeForm();
  loadPendingTrades();
}

async function loadTradeForm() {
  try {
    // Load users
    const usersRes = await fetch('/api/trades/users');
    if (usersRes.ok) {
      const users = await usersRes.json();
      const partnerSelect = document.getElementById('trade-partner');
      partnerSelect.innerHTML = '<option value="">Select player...</option>' +
        users.map(u => `<option value="${u.id}">${u.username}${u.is_owner ? ' 👑' : ''}</option>`).join('');

      partnerSelect.onchange = () => loadPartnerInventory(partnerSelect.value);
    }

    // Load own inventory for offer selection
    const invRes = await fetch('/api/inventory');
    if (invRes.ok) {
      const data = await invRes.json();
      const offerSelect = document.getElementById('trade-offer');
      offerSelect.innerHTML = '<option value="">Your character to offer...</option>' +
        data.items.map(i => `<option value="${i.id}">${i.name} (${RARITY_LABELS[i.rarity]}) x${i.count}</option>`).join('');
    }
  } catch (err) {
    console.error('Failed to load trade form', err);
  }
}

async function loadPartnerInventory(userId) {
  const requestSelect = document.getElementById('trade-request');
  requestSelect.innerHTML = '<option value="">Request back (optional)...</option>';

  if (!userId) return;

  try {
    const res = await fetch(`/api/inventory/user/${userId}`);
    if (res.ok) {
      const data = await res.json();
      requestSelect.innerHTML = '<option value="">Request back (optional)...</option>' +
        data.items.map(i => `<option value="${i.id}">${i.name} (${RARITY_LABELS[i.rarity]})</option>`).join('');
    }
  } catch (err) {
    console.error('Failed to load partner inventory', err);
  }
}

async function sendTradeOffer() {
  const toUserId = document.getElementById('trade-partner').value;
  const offerCharacterId = document.getElementById('trade-offer').value;
  const requestCharacterId = document.getElementById('trade-request').value;
  const errorEl = document.getElementById('trade-error');

  if (!toUserId || !offerCharacterId) {
    errorEl.textContent = 'Select a player and a character to offer';
    return;
  }

  try {
    const res = await fetch('/api/trades/offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toUserId: parseInt(toUserId),
        offerCharacterId: parseInt(offerCharacterId),
        requestCharacterId: requestCharacterId ? parseInt(requestCharacterId) : null
      })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error;
      return;
    }

    errorEl.textContent = '';
    loadPendingTrades();
    // Reset form
    document.getElementById('trade-partner').value = '';
    document.getElementById('trade-offer').value = '';
    document.getElementById('trade-request').innerHTML = '<option value="">Request back (optional)...</option>';
  } catch (err) {
    errorEl.textContent = 'Connection error';
  }
}

async function loadPendingTrades() {
  try {
    const res = await fetch('/api/trades/pending');
    if (!res.ok) return;
    const data = await res.json();

    // Incoming
    const inEl = document.getElementById('incoming-trades');
    if (data.incoming.length === 0) {
      inEl.innerHTML = '<p class="no-trades">No incoming offers</p>';
    } else {
      inEl.innerHTML = data.incoming.map(t => `
        <div class="trade-item">
          <div class="trade-details">
            <p><strong>${t.from_username}</strong> offers:</p>
            <p>${RARITY_EMOJIS[t.offer_rarity]} <span class="rarity-${t.offer_rarity}">${t.offer_name}</span></p>
            ${t.request_name ? `<p>Wants: ${RARITY_EMOJIS[t.request_rarity]} <span class="rarity-${t.request_rarity}">${t.request_name}</span></p>` : '<p style="color:#888;">Gift (no request)</p>'}
          </div>
          <div class="trade-actions">
            <button class="btn-accept" onclick="respondTrade(${t.id}, 'accept')">Accept</button>
            <button class="btn-decline" onclick="respondTrade(${t.id}, 'decline')">Decline</button>
          </div>
        </div>
      `).join('');
    }

    // Outgoing
    const outEl = document.getElementById('outgoing-trades');
    if (data.outgoing.length === 0) {
      outEl.innerHTML = '<p class="no-trades">No pending offers</p>';
    } else {
      outEl.innerHTML = data.outgoing.map(t => `
        <div class="trade-item">
          <div class="trade-details">
            <p>To: <strong>${t.to_username}</strong></p>
            <p>Offering: ${RARITY_EMOJIS[t.offer_rarity]} <span class="rarity-${t.offer_rarity}">${t.offer_name}</span></p>
            ${t.request_name ? `<p>Requesting: ${RARITY_EMOJIS[t.request_rarity]} <span class="rarity-${t.request_rarity}">${t.request_name}</span></p>` : '<p style="color:#888;">Gift</p>'}
          </div>
          <div class="trade-actions">
            <button class="btn-cancel" onclick="respondTrade(${t.id}, 'cancel')">Cancel</button>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load trades', err);
  }
}

async function respondTrade(tradeId, action) {
  try {
    const res = await fetch(`/api/trades/${tradeId}/${action}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }
    loadPendingTrades();
    loadTradeForm();
  } catch (err) {
    alert('Trade action failed');
  }
}

// ===== POTASSIUM WAR =====
let warChallengerId = null;
let warInitialized = false;

function loadGames() {
  // Make sure socket + war listeners are set up
  if (!socket) initChat();
  if (!warInitialized) initWarListeners();

  // Request online players list
  socket.emit('get_online');

  // Load roulette
  loadRoulette();
}

function initWarListeners() {
  if (!socket || warInitialized) return;
  warInitialized = true;

  // Receive online player list (reuse chat's online list)
  socket.on('online_users', (users) => {
    renderWarPlayers(users);
  });

  // Challenge sent confirmation
  socket.on('war:sent', (data) => {
    const statusEl = document.getElementById('war-online-players');
    const existingStatus = statusEl.querySelector('.war-status');
    if (existingStatus) existingStatus.remove();
    const div = document.createElement('div');
    div.className = 'war-status';
    div.textContent = `⚔️ Challenge sent to ${data.targetName}... waiting for response`;
    statusEl.prepend(div);
  });

  // Challenge declined
  socket.on('war:declined', (data) => {
    const statusEl = document.getElementById('war-online-players');
    const existingStatus = statusEl.querySelector('.war-status');
    if (existingStatus) existingStatus.remove();
    const div = document.createElement('div');
    div.className = 'war-status';
    div.textContent = `${data.username} declined your challenge.`;
    statusEl.prepend(div);
    setTimeout(() => div.remove(), 4000);
  });

  // Challenge expired
  socket.on('war:expired', () => {
    const statusEl = document.getElementById('war-online-players');
    const existingStatus = statusEl.querySelector('.war-status');
    if (existingStatus) existingStatus.textContent = 'Challenge expired.';
    setTimeout(() => {
      const s = statusEl.querySelector('.war-status');
      if (s) s.remove();
    }, 3000);
  });

  // Battle result
  socket.on('war:result', (data) => {
    document.getElementById('war-incoming').style.display = 'none';
    showWarResult(data);
    // Refresh banana count
    fetch('/api/auth/me').then(r => r.json()).then(u => {
      document.getElementById('display-bananas').textContent = `🍌 ${u.bananas.toLocaleString()}`;
    }).catch(() => {});
  });

  // Error
  socket.on('war:error', (data) => {
    alert(data.message);
  });
}

async function renderWarPlayers(users) {
  const container = document.getElementById('war-online-players');
  // Preserve any status message
  const existingStatus = container.querySelector('.war-status');

  if (users.length === 0) {
    container.innerHTML = '<p style="color:#484f58;font-style:italic;">No one is online right now.</p>';
    return;
  }

  const currentUser = document.getElementById('display-username').textContent;

  // Fetch h2h records for all opponents
  const h2hRecords = {};
  const opponents = users.filter(u => u.username !== currentUser);
  await Promise.all(opponents.map(async (u) => {
    try {
      const res = await fetch(`/api/war/h2h/${u.userId}`);
      if (res.ok) h2hRecords[u.userId] = await res.json();
    } catch(e) {}
  }));

  let html = users.map(u => {
    const isSelf = u.username === currentUser;
    const h2h = h2hRecords[u.userId];
    const h2hText = h2h && (h2h.wins + h2h.losses + h2h.draws > 0)
      ? `<span class="war-h2h">${h2h.wins}W-${h2h.losses}L${h2h.draws > 0 ? '-' + h2h.draws + 'D' : ''}</span>`
      : '';
    return `
      <div class="war-player-row ${isSelf ? 'war-self-row' : ''}">
        <span class="war-player-name">
          ${u.username}${u.isOwner ? '<span class="owner-tag">👑</span>' : ''}
          ${h2hText}
        </span>
        ${isSelf
          ? ''
          : `<button class="war-challenge-btn" onclick="warChallenge(${u.userId})">⚔️ Challenge</button>`
        }
      </div>
    `;
  }).join('');

  container.innerHTML = html;
  if (existingStatus) container.prepend(existingStatus);
}

function warChallenge(userId) {
  if (!socket) return;
  socket.emit('war:challenge', { targetId: userId });
}

function warAccept() {
  if (!warChallengerId || !socket) return;
  socket.emit('war:accept', { challengerId: warChallengerId });
  document.getElementById('war-incoming').style.display = 'none';
  warChallengerId = null;
}

function warDecline() {
  if (!warChallengerId || !socket) return;
  socket.emit('war:decline', { challengerId: warChallengerId });
  document.getElementById('war-incoming').style.display = 'none';
  warChallengerId = null;
}

async function showWarResult(data) {
  const overlay = document.getElementById('war-result');

  // Title
  const titleEl = document.getElementById('war-result-title');
  if (data.isDraw) {
    titleEl.textContent = '⚔️ DRAW!';
    titleEl.style.color = '#7d8590';
  } else {
    titleEl.textContent = `🏆 ${data.winnerName} WINS!`;
    titleEl.style.color = '#f5c542';
  }

  // Player 1 (challenger)
  document.getElementById('war-p1-name').textContent = data.challenger.username;
  renderWarCards('war-p1-cards', data.challenger.cards);
  const p1TotalEl = document.getElementById('war-p1-total');
  p1TotalEl.textContent = `🧪 ${data.challenger.total}`;
  p1TotalEl.className = 'war-total' +
    (data.winnerId === data.challenger.userId ? ' winner' : '') +
    (data.winnerId && data.winnerId !== data.challenger.userId ? ' loser' : '');

  // Player 2 (defender)
  document.getElementById('war-p2-name').textContent = data.defender.username;
  renderWarCards('war-p2-cards', data.defender.cards);
  const p2TotalEl = document.getElementById('war-p2-total');
  p2TotalEl.textContent = `🧪 ${data.defender.total}`;
  p2TotalEl.className = 'war-total' +
    (data.winnerId === data.defender.userId ? ' winner' : '') +
    (data.winnerId && data.winnerId !== data.defender.userId ? ' loser' : '');

  // Prize text
  const prizeEl = document.getElementById('war-result-prize');
  if (data.isDraw) {
    prizeEl.textContent = 'No payout — it\'s a draw!';
    prizeEl.style.color = '#7d8590';
  } else {
    prizeEl.textContent = `🍌 ${data.winnerName} earns ${data.prize} Bananas!`;
    prizeEl.style.color = '#f5c542';
  }

  // Fetch and show h2h record
  const opponentId = data.challenger.userId === currentUserId ? data.defender.userId : data.challenger.userId;
  let h2hEl = document.getElementById('war-result-h2h');
  if (!h2hEl) {
    h2hEl = document.createElement('p');
    h2hEl.id = 'war-result-h2h';
    h2hEl.className = 'war-result-h2h';
    prizeEl.insertAdjacentElement('afterend', h2hEl);
  }
  try {
    const res = await fetch(`/api/war/h2h/${opponentId}`);
    if (res.ok) {
      const h2h = await res.json();
      if (h2h.wins + h2h.losses + h2h.draws > 0) {
        h2hEl.textContent = `Head-to-head: ${h2h.wins}W - ${h2h.losses}L${h2h.draws > 0 ? ' - ' + h2h.draws + 'D' : ''}`;
        h2hEl.style.display = 'block';
      } else {
        h2hEl.style.display = 'none';
      }
    }
  } catch(e) {
    h2hEl.style.display = 'none';
  }

  overlay.style.display = 'flex';

  // Remove challenge toast if still showing
  const toast = document.getElementById('war-challenge-toast');
  if (toast) toast.remove();
}

function renderWarCards(containerId, cards) {
  const container = document.getElementById(containerId);
  container.innerHTML = cards.map(card => `
    <div class="war-card rarity-${card.rarity}">
      ${card.image_path
        ? `<img class="war-card-img" src="${card.image_path}" alt="${card.name}">`
        : `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">${RARITY_EMOJIS[card.rarity] || '❓'}</div>`
      }
      <div class="war-card-info">
        <div class="war-card-name">${card.name}</div>
        <div class="war-card-potassium">🧪 ${card.potassium_level}</div>
      </div>
    </div>
  `).join('');
}

function closeWarResult() {
  document.getElementById('war-result').style.display = 'none';
}

// ===== BANANA ROULETTE =====
let rouletteSlots = [];
let rouletteCardValues = {};
let rouletteSpinning = false;
let rouletteWagerType = 'bananas';

async function loadRoulette() {
  // Fetch slot config
  try {
    const res = await fetch('/api/roulette/slots');
    if (!res.ok) return;
    const data = await res.json();
    rouletteSlots = data.slots;
    rouletteCardValues = data.cardValues;
    renderRouletteWheel();
  } catch (e) {}

  // Load history
  loadRouletteHistory();

  // Load wagerable cards
  loadRouletteCards();

  // Clamp slider to current balance
  const slider = document.getElementById('roulette-slider');
  const maxWager = Math.min(2000, currentBananas);
  slider.max = Math.max(100, maxWager);
  if (parseInt(slider.value) > maxWager) {
    slider.value = Math.max(100, maxWager);
    updateRouletteSlider();
  }
}

function renderRouletteWheel() {
  const wheel = document.getElementById('roulette-wheel');
  if (!wheel || rouletteSlots.length === 0) return;

  // Build the wheel with repeated slots for visual spin
  // 7 unique slots, repeat enough times for a good spin animation
  const repeats = 8;
  let html = '';
  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < rouletteSlots.length; i++) {
      const s = rouletteSlots[i];
      const mult = s.multiplier === 0 ? 'BUST' : s.multiplier + '×';
      html += `<div class="roulette-slot roulette-slot-${i}" data-index="${i}">
        <div class="roulette-slot-emoji">${s.emoji}</div>
        <div class="roulette-slot-mult">${mult}</div>
      </div>`;
    }
  }
  wheel.innerHTML = html;

  // Reset position
  wheel.style.transition = 'none';
  wheel.style.transform = 'translateX(0)';
}

function setRouletteWagerType(type) {
  rouletteWagerType = type;
  document.querySelectorAll('.roulette-wager-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.roulette-wager-tab[onclick="setRouletteWagerType('${type}')"]`).classList.add('active');

  document.getElementById('roulette-banana-wager').style.display = type === 'bananas' ? 'block' : 'none';
  document.getElementById('roulette-card-wager').style.display = type === 'card' ? 'block' : 'none';
}

function updateRouletteSlider() {
  const val = document.getElementById('roulette-slider').value;
  document.getElementById('roulette-amount-display').textContent = '🍌 ' + parseInt(val).toLocaleString();
  document.getElementById('roulette-amount-input').value = val;
}

function syncRouletteInput() {
  let val = parseInt(document.getElementById('roulette-amount-input').value);
  if (isNaN(val)) val = 100;
  val = Math.max(100, Math.min(2000, val));
  val = Math.round(val / 100) * 100;
  document.getElementById('roulette-amount-input').value = val;
  document.getElementById('roulette-slider').value = val;
  document.getElementById('roulette-amount-display').textContent = '🍌 ' + val.toLocaleString();
}

async function loadRouletteCards() {
  try {
    const res = await fetch('/api/roulette/cards');
    if (!res.ok) return;
    const cards = await res.json();
    const select = document.getElementById('roulette-card-select');
    select.innerHTML = '<option value="">Pick a card to wager...</option>';
    cards.forEach(c => {
      const val = rouletteCardValues[c.rarity] || 0;
      select.innerHTML += `<option value="${c.inventoryId}" data-rarity="${c.rarity}" data-value="${val}">
        ${RARITY_EMOJIS[c.rarity] || ''} ${c.name} (×${c.count}) — worth 🍌${val.toLocaleString()}
      </option>`;
    });

    select.onchange = () => {
      const opt = select.selectedOptions[0];
      const valueDiv = document.getElementById('roulette-card-value');
      if (opt && opt.value) {
        valueDiv.textContent = `Card value: 🍌 ${parseInt(opt.dataset.value).toLocaleString()}`;
      } else {
        valueDiv.textContent = '';
      }
    };
  } catch (e) {}
}

async function spinRoulette() {
  if (rouletteSpinning) return;
  rouletteSpinning = true;

  const btn = document.getElementById('roulette-spin-btn');
  btn.disabled = true;
  btn.textContent = 'Spinning...';
  document.getElementById('roulette-result').style.display = 'none';

  // Build request body
  const body = { wagerType: rouletteWagerType };
  if (rouletteWagerType === 'bananas') {
    body.bananaAmount = parseInt(document.getElementById('roulette-amount-input').value);
  } else {
    body.inventoryId = parseInt(document.getElementById('roulette-card-select').value);
  }

  try {
    const res = await fetch('/api/roulette/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Spin failed.');
      btn.disabled = false;
      btn.textContent = 'SPIN!';
      rouletteSpinning = false;
      return;
    }

    // Animate the wheel
    animateRouletteWheel(data.slotIndex, () => {
      // Show result
      showRouletteResult(data);

      // Update banana display
      currentBananas = data.bananas;
      document.getElementById('display-bananas').textContent = '🍌 ' + currentBananas.toLocaleString();

      // Update mascot
      const mascot = document.getElementById('roulette-mascot');
      if (data.net > 0) {
        mascot.src = '/img/mascot/banana-excited.svg';
      } else if (data.net < 0) {
        mascot.src = '/img/mascot/banana-sad.svg';
      } else {
        mascot.src = '/img/mascot/banana-happy.svg';
      }

      // Refresh history and cards
      loadRouletteHistory();
      loadRouletteCards();

      // Update slider max
      const slider = document.getElementById('roulette-slider');
      const maxWager = Math.min(2000, currentBananas);
      slider.max = Math.max(100, maxWager);
      if (parseInt(slider.value) > maxWager) {
        slider.value = Math.max(100, maxWager);
        updateRouletteSlider();
      }

      btn.disabled = false;
      btn.textContent = 'SPIN!';
      rouletteSpinning = false;
    });
  } catch (e) {
    alert('Spin failed. Try again.');
    btn.disabled = false;
    btn.textContent = 'SPIN!';
    rouletteSpinning = false;
  }
}

function animateRouletteWheel(targetIndex, callback) {
  const wheel = document.getElementById('roulette-wheel');
  const slotWidth = 90; // matches CSS
  const numSlots = rouletteSlots.length; // 7

  // We want to spin through several full rotations then land on target
  const fullRotations = 5;
  const totalSlots = fullRotations * numSlots + targetIndex;

  // Center the winning slot under the pointer
  const offset = totalSlots * slotWidth + slotWidth / 2;
  const containerCenter = wheel.parentElement.offsetWidth / 2;
  const finalPos = offset - containerCenter;

  // Reset position first
  wheel.style.transition = 'none';
  wheel.style.transform = 'translateX(0)';

  // Force reflow
  wheel.offsetHeight;

  // Animate
  wheel.style.transition = 'transform 4s cubic-bezier(0.15, 0.85, 0.35, 1)';
  wheel.style.transform = `translateX(-${finalPos}px)`;

  setTimeout(callback, 4200);
}

function showRouletteResult(data) {
  const resultDiv = document.getElementById('roulette-result');
  document.getElementById('roulette-result-emoji').textContent = data.slot.emoji;
  document.getElementById('roulette-result-name').textContent = data.slot.name;

  const payoutEl = document.getElementById('roulette-result-payout');
  if (data.net > 0) {
    payoutEl.textContent = `+${data.payout.toLocaleString()} Bananas! (${data.slot.multiplier}× your wager)`;
    payoutEl.className = 'roulette-result-payout win';
  } else if (data.net === 0) {
    payoutEl.textContent = `Push — you get your ${data.wagerValue.toLocaleString()} back`;
    payoutEl.className = 'roulette-result-payout push';
  } else {
    const lost = data.wagerValue - data.payout;
    if (data.payout === 0) {
      payoutEl.textContent = `Bust! Lost ${data.wagerValue.toLocaleString()} Bananas`;
    } else {
      payoutEl.textContent = `Got back ${data.payout.toLocaleString()} — lost ${lost.toLocaleString()} net`;
    }
    payoutEl.className = 'roulette-result-payout loss';
  }

  resultDiv.style.display = 'block';
}

async function loadRouletteHistory() {
  try {
    const res = await fetch('/api/roulette/history');
    if (!res.ok) return;
    const rows = await res.json();
    const list = document.getElementById('roulette-history-list');

    if (rows.length === 0) {
      list.innerHTML = '<p style="color:#484f58;font-style:italic;">No spins yet.</p>';
      return;
    }

    list.innerHTML = rows.map(r => {
      const net = r.payout - r.wager_value;
      const netClass = net > 0 ? 'win' : net < 0 ? 'loss' : 'push';
      const netText = net > 0 ? `+${net.toLocaleString()}` : net === 0 ? '±0' : net.toLocaleString();
      const wagerText = r.wager_type === 'card'
        ? `${RARITY_EMOJIS[r.card_rarity] || ''} ${r.card_name}`
        : `🍌 ${r.wager_value.toLocaleString()}`;
      return `<div class="roulette-history-row">
        <span class="roulette-history-slot">${r.slot_name} (${r.multiplier}×)</span>
        <span class="roulette-history-wager">${wagerText}</span>
        <span class="roulette-history-net ${netClass}">${netText}</span>
      </div>`;
    }).join('');
  } catch (e) {}
}

// Check if already logged in on page load
async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const user = await res.json();
      enterDashboard(user, 0);
    }
  } catch (err) {
    // Not logged in, stay on auth screen
  }
}

checkSession();
