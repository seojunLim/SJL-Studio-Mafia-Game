(() => {
  const socket = io();

  const ROLE_MAP = {
    MAFIA: { name: '마피아', emoji: '🔪', cls: 'mafia' },
    DOCTOR: { name: '의사', emoji: '💉', cls: 'doctor' },
    POLICE: { name: '경찰', emoji: '🔍', cls: 'police' },
    CITIZEN: { name: '시민', emoji: '👤', cls: 'citizen' }
  };

  const PHASE_NAMES = {
    day_discussion: { icon: '☀️', name: '자유 토론' },
    day_vote: { icon: '⚖️', name: '투표' },
    day_defense: { icon: '🗣️', name: '최후 변론' },
    day_final_vote: { icon: '⚖️', name: '최종 투표' },
    night: { icon: '🌙', name: '밤' },
    starting: { icon: '🎬', name: '시작 중...' },
    ended: { icon: '🏁', name: '게임 종료' }
  };

  const RANK_TIERS = [
    { name: '브론즈', key: 'bronze', min: 0, max: 199, emoji: '🥉' },
    { name: '실버', key: 'silver', min: 200, max: 499, emoji: '🥈' },
    { name: '골드', key: 'gold', min: 500, max: 999, emoji: '🥇' },
    { name: '다이아', key: 'diamond', min: 1000, max: 1999, emoji: '💎' },
    { name: '마스터', key: 'master', min: 2000, max: Infinity, emoji: '👑' }
  ];

  function getRankTier(trophies) {
    return RANK_TIERS.find(t => trophies >= t.min && trophies <= t.max) || RANK_TIERS[0];
  }

  let state = {
    playerName: '',
    roomId: '',
    playerId: '',
    role: null,
    phase: 'waiting',
    isHost: false,
    players: [],
    day: 0,
    alive: true,
    myVote: null,
    profile: null,
    isRanked: false,
    isLoggedIn: false,
    roomSettings: { requiredPlayers: 4, mafiaCount: 1, includeDoctor: true, includePolice: true }
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#${id}`).classList.add('active');
  }

  function sanitize(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== AUTH SCREEN =====
  $('#tabLogin').addEventListener('click', () => {
    $('#tabLogin').classList.add('active');
    $('#tabRegister').classList.remove('active');
    $('#loginForm').style.display = 'flex';
    $('#registerForm').style.display = 'none';
    $('#authError').textContent = '';
  });

  $('#tabRegister').addEventListener('click', () => {
    $('#tabRegister').classList.add('active');
    $('#tabLogin').classList.remove('active');
    $('#registerForm').style.display = 'flex';
    $('#loginForm').style.display = 'none';
    $('#authError').textContent = '';
  });

  function showAuthError(msg) {
    $('#authError').textContent = msg;
    setTimeout(() => { $('#authError').textContent = ''; }, 3000);
  }

  $('#btnLogin').addEventListener('click', () => {
    const username = $('#loginUsername').value.trim();
    const password = $('#loginPassword').value;
    if (!username) return showAuthError('닉네임을 입력해주세요.');
    if (!password) return showAuthError('비밀번호를 입력해주세요.');

    socket.emit('login', { username, password }, (res) => {
      if (res.error) return showAuthError(res.error);
      state.isLoggedIn = true;
      state.playerName = username;
      state.profile = res.profile;
      sessionStorage.setItem('mafiaPlayerName', username);
      enterMainMenu();
    });
  });

  $('#loginPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btnLogin').click();
  });

  $('#btnRegister').addEventListener('click', () => {
    const username = $('#registerUsername').value.trim();
    const password = $('#registerPassword').value;
    const confirm = $('#registerPasswordConfirm').value;
    if (!username) return showAuthError('닉네임을 입력해주세요.');
    if (!password) return showAuthError('비밀번호를 입력해주세요.');
    if (password !== confirm) return showAuthError('비밀번호가 일치하지 않습니다.');

    socket.emit('register', { username, password }, (res) => {
      if (res.error) return showAuthError(res.error);
      state.isLoggedIn = true;
      state.playerName = username;
      state.profile = res.profile;
      sessionStorage.setItem('mafiaPlayerName', username);
      enterMainMenu();
    });
  });

  $('#registerPasswordConfirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btnRegister').click();
  });

  $('#btnGuest').addEventListener('click', () => {
    state.isLoggedIn = false;
    state.playerName = '';
    enterMainMenu();
  });

  function enterMainMenu() {
    showScreen('screen-main-menu');

    if (state.isLoggedIn) {
      $('#authStatus').style.display = 'flex';
      $('#authStatusText').textContent = state.playerName;
      $('#mainPlayerName').value = state.playerName;
      $('#mainPlayerName').disabled = true;
      $('#btnRanked').disabled = false;
      $('#btnFriendly').disabled = false;
      $('#rankedDesc').textContent = '자동 매칭 · 6인';
      $('#btnRanked').classList.remove('btn-locked');
      if (state.profile) renderProfileCard(state.profile);
    } else {
      $('#authStatus').style.display = 'flex';
      $('#authStatusText').textContent = '비회원';
      $('#mainPlayerName').value = '';
      $('#mainPlayerName').disabled = false;
      $('#btnRanked').disabled = true;
      $('#btnFriendly').disabled = true;
      $('#rankedDesc').textContent = '로그인 필요';
      $('#btnRanked').classList.add('btn-locked');
      $('#profileCard').style.display = 'none';
    }
  }

  $('#btnLogout').addEventListener('click', () => {
    state.isLoggedIn = false;
    state.playerName = '';
    state.profile = null;
    sessionStorage.removeItem('mafiaPlayerName');
    showScreen('screen-auth');
  });

  // ===== MAIN MENU =====
  let profileDebounce = null;
  $('#mainPlayerName').addEventListener('input', () => {
    const name = $('#mainPlayerName').value.trim();
    const hasName = name.length > 0;
    if (!state.isLoggedIn) {
      $('#btnFriendly').disabled = !hasName;
    }

    if (profileDebounce) clearTimeout(profileDebounce);
    if (hasName && state.isLoggedIn) {
      profileDebounce = setTimeout(() => fetchProfile(name), 500);
    } else if (!state.isLoggedIn) {
      $('#profileCard').style.display = 'none';
      state.profile = null;
    }
  });

  function fetchProfile(name) {
    socket.emit('getProfile', { playerName: name }, (res) => {
      state.profile = res.profile;
      renderProfileCard(res.profile);
    });
  }

  function renderProfileCard(profile) {
    $('#profileCard').style.display = 'flex';
    const tier = profile.rankTier;
    $('#profileRankBadge').textContent = `${tier.emoji} ${tier.name}`;
    $('#profileRankBadge').className = `profile-rank-badge rank-${tier.key}`;
    $('#profileTrophies').textContent = `🏆 ${profile.trophies}`;
    $('#profileRecord').textContent = `${profile.wins}승 ${profile.losses}패 (${profile.winRate}%)`;
  }

  function showMenuError(msg) {
    $('#mainMenuError').textContent = msg;
    setTimeout(() => { $('#mainMenuError').textContent = ''; }, 3000);
  }

  $('#btnRanked').addEventListener('click', () => {
    if (!state.isLoggedIn) return showMenuError('랭크 게임은 로그인이 필요합니다.');
    const name = $('#mainPlayerName').value.trim();
    if (!name) return showMenuError('닉네임을 입력해주세요.');
    state.playerName = name;
    sessionStorage.setItem('mafiaPlayerName', name);

    socket.emit('joinMatchmaking', { playerName: name }, (res) => {
      if (res.error) return showMenuError(res.error);
      state.profile = res.profile;
      state.isRanked = true;

      const tier = res.profile.rankTier;
      $('#queueRankBadge').textContent = `${tier.emoji} ${tier.name}`;
      $('#queueRankBadge').className = `rank-badge rank-${tier.key}`;
      $('#queueTrophies').textContent = `🏆 ${res.profile.trophies}`;
      $('#queueTime').textContent = '0';

      showScreen('screen-queue');
    });
  });

  $('#btnFriendly').addEventListener('click', () => {
    const name = $('#mainPlayerName').value.trim();
    if (!name) return showMenuError('닉네임을 입력해주세요.');
    state.playerName = name;
    state.isRanked = false;
    sessionStorage.setItem('mafiaPlayerName', name);
    $('#playerName').value = name;
    showScreen('screen-lobby');
  });

  $('#mainPlayerName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (state.isLoggedIn) {
        $('#btnRanked').click();
      } else {
        $('#btnFriendly').click();
      }
    }
  });

  // ===== QUEUE =====
  $('#btnCancelQueue').addEventListener('click', () => {
    socket.emit('cancelMatchmaking');
    showScreen('screen-main-menu');
  });

  socket.on('queueStatus', (data) => {
    $('#queueTime').textContent = data.waitTime;
  });

  socket.on('matchFound', (data) => {
    state.roomId = data.roomId;
    state.playerId = data.playerId;
    state.isRanked = true;
  });

  // ===== LOBBY =====
  $('#btnBackToMenu').addEventListener('click', () => {
    showScreen('screen-main-menu');
  });

  $('#btnCreate').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    if (!name) return showError('닉네임을 입력해주세요.');
    state.playerName = name;
    sessionStorage.setItem('mafiaPlayerName', name);
    socket.emit('createRoom', { playerName: name }, (res) => {
      if (res.error) return showError(res.error);
      state.roomId = res.roomId;
      state.playerId = res.playerId;
      state.isHost = true;
      state.isRanked = false;
      enterRoom();
    });
  });

  $('#btnJoin').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    const code = $('#roomCode').value.trim().toUpperCase();
    if (!name) return showError('닉네임을 입력해주세요.');
    if (!code) return showError('방 코드를 입력해주세요.');
    state.playerName = name;
    sessionStorage.setItem('mafiaPlayerName', name);
    socket.emit('joinRoom', { roomId: code, playerName: name }, (res) => {
      if (res.error) return showError(res.error);
      state.roomId = res.roomId;
      state.playerId = res.playerId;
      state.isHost = false;
      state.isRanked = false;
      enterRoom();
    });
  });

  $('#playerName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btnCreate').click();
  });

  $('#roomCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btnJoin').click();
  });

  function showError(msg) {
    $('#lobbyError').textContent = msg;
    setTimeout(() => { $('#lobbyError').textContent = ''; }, 3000);
  }

  // ===== ROOM =====
  function enterRoom() {
    showScreen('screen-room');
    $('#displayRoomCode').textContent = state.roomId;
    updateStartButton();
    updateSettingsVisibility();
  }

  $('#btnCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(state.roomId).then(() => {
      $('#btnCopy').textContent = '✅';
      setTimeout(() => { $('#btnCopy').textContent = '📋'; }, 1500);
    });
  });

  $('#btnLeave').addEventListener('click', () => {
    location.reload();
  });

  $('#btnStart').addEventListener('click', () => {
    socket.emit('startGame', { roomId: state.roomId });
  });

  // ===== SETTINGS =====
  function updateSettingsVisibility() {
    const settingsPanel = $('#roleSettings');
    settingsPanel.style.display = state.isHost ? 'block' : 'none';
  }

  function sendSettings() {
    socket.emit('updateSettings', {
      roomId: state.roomId,
      settings: state.roomSettings
    });
  }

  function updateRolePreview(preview) {
    if (!preview) return;
    const container = $('#rolePreview');
    let html = '';
    if (preview.mafiaCount > 0)
      html += `<span class="role-preview-item mafia">🔪 마피아 x${preview.mafiaCount}</span>`;
    if (preview.doctorCount > 0)
      html += `<span class="role-preview-item doctor">💉 의사 x${preview.doctorCount}</span>`;
    if (preview.policeCount > 0)
      html += `<span class="role-preview-item police">🔍 경찰 x${preview.policeCount}</span>`;
    if (preview.citizenCount > 0)
      html += `<span class="role-preview-item citizen">👤 시민 x${preview.citizenCount}</span>`;
    container.innerHTML = html;

    $('#requiredPlayersDisplay').textContent = preview.requiredPlayers;
    $('#mafiaCountDisplay').textContent = preview.mafiaCount;

    const doctorBtn = $('#doctorToggle');
    doctorBtn.textContent = preview.includeDoctor ? 'ON' : 'OFF';
    doctorBtn.classList.toggle('on', preview.includeDoctor);

    const policeBtn = $('#policeToggle');
    policeBtn.textContent = preview.includePolice ? 'ON' : 'OFF';
    policeBtn.classList.toggle('on', preview.includePolice);
  }

  $('#playersDown').addEventListener('click', () => {
    if (state.roomSettings.requiredPlayers > 4) {
      state.roomSettings.requiredPlayers--;
      sendSettings();
    }
  });

  $('#playersUp').addEventListener('click', () => {
    if (state.roomSettings.requiredPlayers < 12) {
      state.roomSettings.requiredPlayers++;
      sendSettings();
    }
  });

  $('#mafiaDown').addEventListener('click', () => {
    if (state.roomSettings.mafiaCount > 1) {
      state.roomSettings.mafiaCount--;
      sendSettings();
    }
  });

  $('#mafiaUp').addEventListener('click', () => {
    state.roomSettings.mafiaCount++;
    sendSettings();
  });

  $('#doctorToggle').addEventListener('click', () => {
    state.roomSettings.includeDoctor = !state.roomSettings.includeDoctor;
    sendSettings();
  });

  $('#policeToggle').addEventListener('click', () => {
    state.roomSettings.includePolice = !state.roomSettings.includePolice;
    sendSettings();
  });

  function updateRoomPlayers(players) {
    state.players = players;
    const list = $('#roomPlayerList');
    list.innerHTML = '';
    players.forEach((p, i) => {
      const li = document.createElement('li');
      let rankHtml = '';
      if (p.rankTier) {
        rankHtml = `<span class="rank-badge rank-${p.rankTier.key}">${p.rankTier.emoji}</span>`;
      }
      li.innerHTML = `
        <div class="player-avatar">${sanitize(p.name[0])}</div>
        <span class="player-name">${sanitize(p.name)}</span>
        ${rankHtml}
        ${i === 0 ? '<span class="host-badge">방장</span>' : ''}
      `;
      list.appendChild(li);
    });
    $('#playerCount').textContent = players.length;
    updateStartButton();
  }

  function updateStartButton() {
    const btn = $('#btnStart');
    const required = state.roomSettings.requiredPlayers || 4;
    const enough = state.players.length >= required;
    btn.style.display = (state.isHost && enough) ? 'block' : 'none';
    const hint = $('.room-footer .hint');
    if (!enough) {
      hint.textContent = `${required}명이 필요합니다 (현재 ${state.players.length}명)`;
    } else {
      hint.textContent = state.isHost ? '게임을 시작할 수 있습니다!' : '방장이 게임을 시작할 때까지 기다려주세요.';
    }
  }

  // ===== GAME =====
  function enterGame() {
    showScreen('screen-game');
    $('#aiMessages').innerHTML = '';
    $('#chatMessages').innerHTML = '';
    $('#actionArea').innerHTML = '';
    state.alive = true;
    state.myVote = null;

    if (state.isRanked && state.profile) {
      $('#trophyDisplay').style.display = 'flex';
      $('#trophyCount').textContent = state.profile.trophies;
    } else {
      $('#trophyDisplay').style.display = 'none';
    }
  }

  function updatePhaseUI(phase, day) {
    const info = PHASE_NAMES[phase] || { icon: '❓', name: phase };
    $('#phaseIcon').textContent = info.icon;
    $('#phaseName').textContent = info.name;
    $('#dayCount').textContent = day > 0 ? `${day}일차` : '';

    const chatInput = $('#chatInput');
    const btnSend = $('#btnSend');
    const canChat = state.alive && (phase === 'day_discussion' || phase === 'day_defense');
    chatInput.disabled = !canChat;
    btnSend.disabled = !canChat;
    if (canChat) {
      chatInput.placeholder = '메시지를 입력하세요...';
    } else if (!state.alive) {
      chatInput.placeholder = '사망한 플레이어는 채팅할 수 없습니다.';
    } else {
      chatInput.placeholder = '채팅이 비활성화되어 있습니다.';
    }
  }

  function updateRoleBadge() {
    if (!state.role) return;
    const info = ROLE_MAP[state.role];
    const badge = $('#roleBadge');
    badge.className = 'role-badge ' + info.cls;
    $('#roleEmoji').textContent = info.emoji;
    $('#roleName').textContent = info.name;
  }

  function addAiMessage(sender, message, type) {
    const container = $('#aiMessages');
    const div = document.createElement('div');
    div.className = `ai-msg ${type}`;
    div.innerHTML = `<span class="msg-sender">${sanitize(sender)}</span>${sanitize(message)}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function addChatMessage(sender, message, type) {
    const container = $('#chatMessages');
    const div = document.createElement('div');
    div.className = `chat-msg ${type === 'system' ? 'system-chat' : ''}`;
    if (type === 'system') {
      div.textContent = message;
    } else {
      div.innerHTML = `<span class="chat-sender">${sanitize(sender)}</span>${sanitize(message)}`;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function updatePlayerGrid(players) {
    const grid = $('#playerGrid');
    grid.innerHTML = '';
    players.forEach(p => {
      const chip = document.createElement('div');
      chip.className = `player-chip ${p.alive ? '' : 'dead'} ${p.connected === false ? 'disconnected' : ''}`;
      let rankEmoji = '';
      if (p.rankTier) rankEmoji = `<span class="rank-emoji">${p.rankTier.emoji}</span>`;
      chip.innerHTML = `<span class="status-dot"></span>${rankEmoji}${sanitize(p.name)}`;
      grid.appendChild(chip);
    });
  }

  function renderVoteUI(alivePlayers) {
    const area = $('#actionArea');
    state.myVote = null;
    area.innerHTML = `
      <div class="action-title">처형할 플레이어를 선택하세요</div>
      <div class="action-buttons" id="voteButtons"></div>
      <div class="vote-info" id="voteInfo">투표 대기중...</div>
    `;
    const btnContainer = $('#voteButtons');

    alivePlayers.forEach(p => {
      if (p.id === state.playerId) return;
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.textContent = p.name;
      btn.addEventListener('click', () => {
        selectVote(p.id, btnContainer);
        socket.emit('vote', { roomId: state.roomId, targetId: p.id });
      });
      btn.dataset.targetId = p.id;
      btnContainer.appendChild(btn);
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'action-btn skip';
    skipBtn.textContent = '건너뛰기';
    skipBtn.dataset.targetId = 'skip';
    skipBtn.addEventListener('click', () => {
      selectVote('skip', btnContainer);
      socket.emit('vote', { roomId: state.roomId, targetId: 'skip' });
    });
    btnContainer.appendChild(skipBtn);
  }

  function renderFinalVoteUI(defensePlayer) {
    const area = $('#actionArea');
    state.myVote = null;
    area.innerHTML = `
      <div class="action-title">${sanitize(defensePlayer.name)}님을 처형할까요?</div>
      <div class="action-buttons" id="voteButtons"></div>
      <div class="vote-info" id="voteInfo">투표 대기중...</div>
    `;
    const btnContainer = $('#voteButtons');

    const agreeBtn = document.createElement('button');
    agreeBtn.className = 'action-btn agree';
    agreeBtn.textContent = '찬성';
    agreeBtn.dataset.targetId = 'agree';
    agreeBtn.addEventListener('click', () => {
      selectVote('agree', btnContainer);
      socket.emit('vote', { roomId: state.roomId, targetId: 'agree' });
    });
    btnContainer.appendChild(agreeBtn);

    const disagreeBtn = document.createElement('button');
    disagreeBtn.className = 'action-btn disagree';
    disagreeBtn.textContent = '반대';
    disagreeBtn.dataset.targetId = 'disagree';
    disagreeBtn.addEventListener('click', () => {
      selectVote('disagree', btnContainer);
      socket.emit('vote', { roomId: state.roomId, targetId: 'disagree' });
    });
    btnContainer.appendChild(disagreeBtn);
  }

  function selectVote(targetId, container) {
    state.myVote = targetId;
    container.querySelectorAll('.action-btn').forEach(b => b.classList.remove('selected'));
    const selected = container.querySelector(`[data-target-id="${targetId}"]`);
    if (selected) selected.classList.add('selected');
  }

  function renderNightActionUI(role, alivePlayers) {
    const area = $('#actionArea');
    let title = '';
    if (role === 'MAFIA') title = '🔪 제거할 대상을 선택하세요';
    else if (role === 'DOCTOR') title = '💉 살릴 대상을 선택하세요';
    else if (role === 'POLICE') title = '🔍 조사할 대상을 선택하세요';

    area.innerHTML = `
      <div class="action-title">${title}</div>
      <div class="action-buttons" id="nightButtons"></div>
    `;
    const btnContainer = $('#nightButtons');

    alivePlayers.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.textContent = p.name;
      btn.addEventListener('click', () => {
        btnContainer.querySelectorAll('.action-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        socket.emit('nightAction', { roomId: state.roomId, targetId: p.id });
        area.innerHTML = `<div class="waiting-msg">행동을 완료했습니다. 다른 플레이어를 기다리는 중...</div>`;
      });
      btnContainer.appendChild(btn);
    });
  }

  function showWaiting(msg) {
    $('#actionArea').innerHTML = `<div class="waiting-msg">${sanitize(msg)}</div>`;
  }

  // ===== CHAT =====
  $('#chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btnSend').click();
  });

  $('#btnSend').addEventListener('click', () => {
    const input = $('#chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('chat', { roomId: state.roomId, message: msg });
    input.value = '';
  });

  // ===== SOCKET EVENTS =====
  socket.on('roomUpdate', (roomState) => {
    state.players = roomState.players;
    if (roomState.settings) {
      state.roomSettings = { ...roomState.settings };
    }
    if (roomState.phase === 'waiting') {
      updateRoomPlayers(roomState.players);
      if (roomState.rolePreview) {
        updateRolePreview(roomState.rolePreview);
      }
    } else {
      updatePlayerGrid(roomState.players);
    }
  });

  socket.on('chatMessage', (data) => {
    if (data.type === 'ai' || data.type === 'mafia-private') {
      addAiMessage(data.sender, data.message, data.type);
    } else {
      addChatMessage(data.sender, data.message, data.type);
    }
  });

  socket.on('roleAssigned', (data) => {
    state.role = data.role;
    enterGame();
    updateRoleBadge();
  });

  socket.on('phaseChange', (data) => {
    state.phase = data.phase;
    state.day = data.day;
    updatePhaseUI(data.phase, data.day);

    const alivePlayers = state.players.filter(p => p.alive);
    const me = state.players.find(p => p.id === state.playerId);
    state.alive = me ? me.alive : false;

    if (data.phase === 'day_discussion') {
      showWaiting('자유롭게 토론하세요!');
    } else if (data.phase === 'day_vote') {
      if (state.alive) {
        renderVoteUI(alivePlayers);
      } else {
        showWaiting('사망한 플레이어는 투표할 수 없습니다.');
      }
    } else if (data.phase === 'day_defense') {
      showWaiting(`${data.defensePlayer.name}님의 최후 변론 시간입니다.`);
    } else if (data.phase === 'day_final_vote') {
      if (state.alive) {
        renderFinalVoteUI(data.defensePlayer);
      } else {
        showWaiting('사망한 플레이어는 투표할 수 없습니다.');
      }
    } else if (data.phase === 'night') {
      if (state.alive && state.role !== 'CITIZEN') {
        showWaiting('행동 선택을 기다리는 중...');
      } else if (state.alive) {
        showWaiting('밤입니다. 아침이 올 때까지 기다려주세요...');
      } else {
        showWaiting('사망한 플레이어입니다.');
      }
    }
  });

  socket.on('nightActionRequest', (data) => {
    renderNightActionUI(data.role, data.alivePlayers);
  });

  socket.on('timerUpdate', (data) => {
    const el = $('#timerValue');
    el.textContent = data.timeLeft;
    if (data.timeLeft <= 10) {
      el.classList.add('urgent');
    } else {
      el.classList.remove('urgent');
    }
  });

  socket.on('voteUpdate', (data) => {
    const info = $('#voteInfo');
    if (info) {
      info.textContent = `${data.voterName}님이 ${data.targetName}에 투표 (${data.voteCount}/${data.totalAlive})`;
    }
  });

  socket.on('playerDied', (data) => {
    if (data.playerId === state.playerId) {
      state.alive = false;
    }
  });

  socket.on('policeResult', (data) => {
    const div = document.createElement('div');
    div.className = `police-notification ${data.isMafia ? 'is-mafia' : ''}`;
    div.innerHTML = `
      <strong>🔍 수사 결과</strong><br>
      ${sanitize(data.targetName)}님은<br>
      <strong>${data.isMafia ? '🔪 마피아입니다!' : '✅ 마피아가 아닙니다.'}</strong>
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
  });

  socket.on('gameEnd', (data) => {
    const overlay = $('#gameOverOverlay');
    overlay.style.display = 'flex';

    const title = $('#gameOverTitle');
    if (data.winner === 'mafia') {
      title.textContent = '🔪 마피아 승리!';
      title.style.color = 'var(--accent-red)';
    } else {
      title.textContent = '🎉 시민 승리!';
      title.style.color = 'var(--accent-green)';
    }

    const trophyResults = $('#trophyResults');
    if (data.isRanked && data.trophyChanges) {
      const myChange = data.trophyChanges.find(tc => tc.playerId === state.playerId);
      if (myChange) {
        trophyResults.style.display = 'block';
        const isPositive = myChange.change > 0;
        $('#trophyChange').innerHTML = `
          <span class="trophy-delta ${isPositive ? 'positive' : 'negative'}">
            ${isPositive ? '+' : ''}${myChange.change} 🏆
          </span>
          <span class="trophy-total">${myChange.newTrophies} 🏆</span>
        `;
        const rankEl = $('#trophyNewRank');
        if (myChange.oldRank.key !== myChange.newRank.key) {
          rankEl.innerHTML = `
            <div class="rank-change-animation">
              <span class="old-rank">${myChange.oldRank.emoji} ${myChange.oldRank.name}</span>
              <span class="rank-arrow">→</span>
              <span class="new-rank">${myChange.newRank.emoji} ${myChange.newRank.name}</span>
            </div>
          `;
        } else {
          rankEl.innerHTML = `<span>${myChange.newRank.emoji} ${myChange.newRank.name}</span>`;
        }
      }
    } else {
      trophyResults.style.display = 'none';
    }

    const roleList = $('#gameOverRoles');
    roleList.innerHTML = '';
    data.players.forEach(p => {
      const item = document.createElement('div');
      item.className = `role-reveal-item ${p.alive ? '' : 'dead-reveal'}`;
      const roleInfo = ROLE_MAP[p.role];
      item.innerHTML = `
        <span class="reveal-name">${sanitize(p.name)} ${p.alive ? '' : '💀'}</span>
        <span class="reveal-role">${roleInfo.emoji} ${roleInfo.name}</span>
      `;
      roleList.appendChild(item);
    });
  });

  $('#btnBackToLobby').addEventListener('click', () => {
    if (state.playerName) {
      sessionStorage.setItem('mafiaPlayerName', state.playerName);
    }
    location.reload();
  });

  socket.on('error', (data) => {
    showError(data.message);
  });

  socket.on('disconnect', () => {
    addAiMessage('SYSTEM', '서버와의 연결이 끊어졌습니다. 재연결을 시도합니다...', 'system');
  });

  socket.on('connect', () => {
    if (state.roomId) {
      addAiMessage('SYSTEM', '서버에 재연결되었습니다.', 'system');
    }
  });
})();
