const { v4: uuidv4 } = require('uuid');

const ROLES = {
  MAFIA: { name: '마피아', team: 'mafia', emoji: '🔪' },
  DOCTOR: { name: '의사', team: 'citizen', emoji: '💉' },
  POLICE: { name: '경찰', team: 'citizen', emoji: '🔍' },
  CITIZEN: { name: '시민', team: 'citizen', emoji: '👤' }
};

const PHASE_DURATION = {
  day_discussion: 60,
  day_vote: 30,
  day_defense: 20,
  day_final_vote: 15,
  night: 30
};

const AI_MESSAGES = {
  gameStart: [
    '어둠이 마을을 감싸고 있습니다... 마피아가 잠입했습니다!',
    '평화롭던 마을에 마피아가 숨어들었습니다. 시민 여러분, 경계하세요!'
  ],
  dayStart: [
    '☀️ 아침이 밝았습니다. 시민 여러분, 의심되는 사람을 찾아주세요.',
    '☀️ 새로운 아침입니다. 마피아를 색출할 시간입니다!'
  ],
  nightStart: [
    '🌙 밤이 찾아왔습니다. 각자의 역할을 수행해주세요.',
    '🌙 어둠이 내려앉았습니다. 마피아가 활동을 시작합니다...'
  ],
  voteStart: [
    '⚖️ 투표 시간입니다! 처형할 사람을 선택해주세요.',
    '⚖️ 이제 투표로 결정할 시간입니다.'
  ],
  noKill: [
    '기적적으로 아무도 죽지 않은 밤이었습니다!',
    '의사의 활약으로 마을은 평화로운 밤을 보냈습니다.'
  ],
  mafiaWin: [
    '🔪 마피아가 승리했습니다! 마을은 어둠에 잠식되었습니다...',
    '🔪 마피아의 승리! 시민들은 마피아를 찾지 못했습니다.'
  ],
  citizenWin: [
    '🎉 시민이 승리했습니다! 모든 마피아를 처단했습니다!',
    '🎉 마을에 평화가 돌아왔습니다! 시민의 승리!'
  ]
};

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

class Player {
  constructor(socketId, name) {
    this.id = uuidv4();
    this.socketId = socketId;
    this.name = name;
    this.role = null;
    this.alive = true;
    this.connected = true;
  }
}

class Room {
  constructor(id) {
    this.id = id;
    this.players = [];
    this.phase = 'waiting';
    this.day = 0;
    this.votes = {};
    this.nightActions = {};
    this.timer = null;
    this.timeLeft = 0;
    this.timerInterval = null;
    this.messages = [];
    this.defenseTarget = null;
    this.policeResult = null;
    this.settings = {
      requiredPlayers: 4,
      mafiaCount: 1,
      includeDoctor: true,
      includePolice: true
    };
  }

  addPlayer(socketId, name) {
    const player = new Player(socketId, name);
    this.players.push(player);
    return player;
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.socketId !== socketId);
  }

  getPlayerBySocket(socketId) {
    return this.players.find(p => p.socketId === socketId);
  }

  getPlayerById(id) {
    return this.players.find(p => p.id === id);
  }

  addSystemMessage(msg) {
    this.messages.push({ sender: 'SYSTEM', message: msg, type: 'system', time: Date.now() });
  }

  getAlivePlayers() {
    return this.players.filter(p => p.alive);
  }

  getAliveByRole(roleName) {
    return this.players.filter(p => p.alive && p.role === roleName);
  }

  updateSettings(settings) {
    if (settings.requiredPlayers !== undefined) {
      this.settings.requiredPlayers = Math.min(12, Math.max(4, settings.requiredPlayers));
    }
    const count = Math.max(this.players.length, this.settings.requiredPlayers);
    const maxMafia = Math.max(1, Math.floor((count - 1) / 2));
    this.settings.mafiaCount = Math.min(Math.max(1, settings.mafiaCount), maxMafia);
    this.settings.includeDoctor = Boolean(settings.includeDoctor);
    this.settings.includePolice = Boolean(settings.includePolice);

    const specialRoles = this.settings.mafiaCount
      + (this.settings.includeDoctor ? 1 : 0)
      + (this.settings.includePolice ? 1 : 0);
    if (specialRoles >= count) {
      if (this.settings.includePolice && specialRoles > count) {
        this.settings.includePolice = false;
      }
      if (this.settings.includeDoctor && this.settings.mafiaCount + (this.settings.includeDoctor ? 1 : 0) > count) {
        this.settings.includeDoctor = false;
      }
      this.settings.mafiaCount = Math.min(this.settings.mafiaCount, count - 1);
    }
  }

  getRolePreview() {
    const count = Math.max(this.players.length, this.settings.requiredPlayers);
    const s = this.settings;
    const citizenCount = count - s.mafiaCount - (s.includeDoctor ? 1 : 0) - (s.includePolice ? 1 : 0);
    return {
      requiredPlayers: s.requiredPlayers,
      mafiaCount: s.mafiaCount,
      doctorCount: s.includeDoctor ? 1 : 0,
      policeCount: s.includePolice ? 1 : 0,
      citizenCount: Math.max(0, citizenCount),
      maxMafia: Math.max(1, Math.floor((count - 1) / 2)),
      includeDoctor: s.includeDoctor,
      includePolice: s.includePolice
    };
  }

  assignRoles() {
    const count = this.players.length;
    const roles = [];
    const s = this.settings;

    const mafiaCount = Math.min(s.mafiaCount, Math.max(1, Math.floor((count - 1) / 2)));
    for (let i = 0; i < mafiaCount; i++) roles.push('MAFIA');

    if (s.includeDoctor && roles.length < count - 1) roles.push('DOCTOR');
    if (s.includePolice && roles.length < count - 1) roles.push('POLICE');

    while (roles.length < count) roles.push('CITIZEN');

    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    this.players.forEach((player, idx) => {
      player.role = roles[idx];
    });
  }

  startGame(io) {
    this.assignRoles();
    this.phase = 'starting';
    this.day = 0;

    const aiMsg = randomPick(AI_MESSAGES.gameStart);
    io.to(this.id).emit('chatMessage', { sender: 'AI 진행자', message: aiMsg, type: 'ai' });

    this.players.forEach(player => {
      const roleInfo = ROLES[player.role];
      io.to(player.socketId).emit('roleAssigned', {
        role: player.role,
        roleName: roleInfo.name,
        roleEmoji: roleInfo.emoji,
        team: roleInfo.team
      });
    });

    const mafiaPlayers = this.players.filter(p => p.role === 'MAFIA');
    if (mafiaPlayers.length > 1) {
      const mafiaNames = mafiaPlayers.map(p => p.name).join(', ');
      mafiaPlayers.forEach(p => {
        io.to(p.socketId).emit('chatMessage', {
          sender: 'AI 진행자',
          message: `당신의 마피아 동료: ${mafiaNames}`,
          type: 'mafia-private'
        });
      });
    }

    io.to(this.id).emit('roomUpdate', this.getState());

    setTimeout(() => {
      this.startDay(io);
    }, 3000);
  }

  startDay(io) {
    this.day++;
    this.phase = 'day_discussion';
    this.votes = {};
    this.timeLeft = PHASE_DURATION.day_discussion;

    const aiMsg = randomPick(AI_MESSAGES.dayStart);
    io.to(this.id).emit('chatMessage', {
      sender: 'AI 진행자',
      message: `[${this.day}일차] ${aiMsg}`,
      type: 'ai'
    });

    io.to(this.id).emit('phaseChange', {
      phase: this.phase,
      day: this.day,
      timeLeft: this.timeLeft
    });
    io.to(this.id).emit('roomUpdate', this.getState());

    this.startTimer(io, () => {
      this.startVote(io);
    });
  }

  startVote(io) {
    this.phase = 'day_vote';
    this.votes = {};
    this.timeLeft = PHASE_DURATION.day_vote;

    const aiMsg = randomPick(AI_MESSAGES.voteStart);
    io.to(this.id).emit('chatMessage', { sender: 'AI 진행자', message: aiMsg, type: 'ai' });
    io.to(this.id).emit('phaseChange', {
      phase: this.phase,
      day: this.day,
      timeLeft: this.timeLeft
    });
    io.to(this.id).emit('roomUpdate', this.getState());

    this.startTimer(io, () => {
      this.resolveVote(io);
    });
  }

  castVote(voterId, targetId, io) {
    if (this.phase === 'day_vote') {
      this.votes[voterId] = targetId;
      const voter = this.getPlayerById(voterId);
      const target = targetId === 'skip' ? null : this.getPlayerById(targetId);
      const targetName = target ? target.name : '건너뛰기';

      io.to(this.id).emit('voteUpdate', {
        voterId,
        voterName: voter.name,
        targetName,
        voteCount: Object.keys(this.votes).length,
        totalAlive: this.getAlivePlayers().length
      });

      if (Object.keys(this.votes).length >= this.getAlivePlayers().length) {
        this.clearTimer();
        this.resolveVote(io);
      }
    } else if (this.phase === 'day_final_vote') {
      this.votes[voterId] = targetId;
      const voter = this.getPlayerById(voterId);

      io.to(this.id).emit('voteUpdate', {
        voterId,
        voterName: voter.name,
        targetName: targetId === 'agree' ? '찬성' : '반대',
        voteCount: Object.keys(this.votes).length,
        totalAlive: this.getAlivePlayers().length
      });

      if (Object.keys(this.votes).length >= this.getAlivePlayers().length) {
        this.clearTimer();
        this.resolveFinalVote(io);
      }
    }
  }

  resolveVote(io) {
    const tally = {};
    let skipCount = 0;

    Object.values(this.votes).forEach(targetId => {
      if (targetId === 'skip') {
        skipCount++;
      } else {
        tally[targetId] = (tally[targetId] || 0) + 1;
      }
    });

    let maxVotes = skipCount;
    let maxTarget = null;

    Object.entries(tally).forEach(([targetId, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        maxTarget = targetId;
      }
    });

    if (!maxTarget) {
      io.to(this.id).emit('chatMessage', {
        sender: 'AI 진행자',
        message: '투표 결과, 아무도 처형되지 않습니다.',
        type: 'ai'
      });
      this.startNight(io);
    } else {
      const target = this.getPlayerById(maxTarget);
      this.defenseTarget = maxTarget;
      this.phase = 'day_defense';
      this.timeLeft = PHASE_DURATION.day_defense;

      io.to(this.id).emit('chatMessage', {
        sender: 'AI 진행자',
        message: `${target.name}님이 최다 득표되었습니다. 최후의 변론 기회를 드립니다.`,
        type: 'ai'
      });
      io.to(this.id).emit('phaseChange', {
        phase: this.phase,
        day: this.day,
        timeLeft: this.timeLeft,
        defensePlayer: { id: target.id, name: target.name }
      });
      io.to(this.id).emit('roomUpdate', this.getState());

      this.startTimer(io, () => {
        this.startFinalVote(io);
      });
    }
  }

  startFinalVote(io) {
    this.phase = 'day_final_vote';
    this.votes = {};
    this.timeLeft = PHASE_DURATION.day_final_vote;

    const target = this.getPlayerById(this.defenseTarget);
    io.to(this.id).emit('chatMessage', {
      sender: 'AI 진행자',
      message: `${target.name}님을 처형할까요? 찬성/반대로 투표해주세요.`,
      type: 'ai'
    });
    io.to(this.id).emit('phaseChange', {
      phase: this.phase,
      day: this.day,
      timeLeft: this.timeLeft,
      defensePlayer: { id: target.id, name: target.name }
    });
    io.to(this.id).emit('roomUpdate', this.getState());

    this.startTimer(io, () => {
      this.resolveFinalVote(io);
    });
  }

  resolveFinalVote(io) {
    let agree = 0;
    let disagree = 0;

    Object.values(this.votes).forEach(vote => {
      if (vote === 'agree') agree++;
      else disagree++;
    });

    const target = this.getPlayerById(this.defenseTarget);

    if (agree > disagree) {
      target.alive = false;
      const roleInfo = ROLES[target.role];
      io.to(this.id).emit('chatMessage', {
        sender: 'AI 진행자',
        message: `${target.name}님이 처형되었습니다. 그의 정체는... ${roleInfo.emoji} ${roleInfo.name}이었습니다!`,
        type: 'ai'
      });
      io.to(this.id).emit('playerDied', { playerId: target.id, playerName: target.name, role: target.role });

      if (this.checkWinCondition(io)) return;
    } else {
      io.to(this.id).emit('chatMessage', {
        sender: 'AI 진행자',
        message: `투표 결과, ${target.name}님은 살아남았습니다.`,
        type: 'ai'
      });
    }

    this.defenseTarget = null;
    this.startNight(io);
  }

  startNight(io) {
    this.phase = 'night';
    this.nightActions = {};
    this.timeLeft = PHASE_DURATION.night;

    const aiMsg = randomPick(AI_MESSAGES.nightStart);
    io.to(this.id).emit('chatMessage', { sender: 'AI 진행자', message: aiMsg, type: 'ai' });
    io.to(this.id).emit('phaseChange', {
      phase: this.phase,
      day: this.day,
      timeLeft: this.timeLeft
    });
    io.to(this.id).emit('roomUpdate', this.getState());

    this.players.forEach(p => {
      if (p.alive && p.role !== 'CITIZEN') {
        io.to(p.socketId).emit('nightActionRequest', {
          role: p.role,
          alivePlayers: this.getAlivePlayers()
            .filter(ap => ap.id !== p.id || p.role === 'DOCTOR')
            .map(ap => ({ id: ap.id, name: ap.name }))
        });
      }
    });

    this.startTimer(io, () => {
      this.resolveNight(io);
    });
  }

  submitNightAction(playerId, targetId, io) {
    const player = this.getPlayerById(playerId);
    if (!player) return;

    this.nightActions[playerId] = { role: player.role, targetId };

    const expectedActions = this.getAlivePlayers().filter(p => p.role !== 'CITIZEN').length;
    if (Object.keys(this.nightActions).length >= expectedActions) {
      this.clearTimer();
      this.resolveNight(io);
    }
  }

  resolveNight(io) {
    let mafiaTarget = null;
    let doctorTarget = null;
    let policeTarget = null;

    Object.values(this.nightActions).forEach(action => {
      if (action.role === 'MAFIA') mafiaTarget = action.targetId;
      if (action.role === 'DOCTOR') doctorTarget = action.targetId;
      if (action.role === 'POLICE') policeTarget = action.targetId;
    });

    if (!mafiaTarget) {
      const possibleTargets = this.getAlivePlayers().filter(p => p.role !== 'MAFIA');
      if (possibleTargets.length > 0) {
        mafiaTarget = randomPick(possibleTargets).id;
      }
    }

    if (policeTarget) {
      const investigated = this.getPlayerById(policeTarget);
      const policePlayer = this.getAliveByRole('POLICE')[0];
      if (policePlayer && investigated) {
        const isMafia = investigated.role === 'MAFIA';
        io.to(policePlayer.socketId).emit('policeResult', {
          targetName: investigated.name,
          targetId: investigated.id,
          isMafia
        });
      }
    }

    let killed = null;
    if (mafiaTarget && mafiaTarget !== doctorTarget) {
      const victim = this.getPlayerById(mafiaTarget);
      if (victim) {
        victim.alive = false;
        killed = victim;
      }
    }

    if (killed) {
      const roleInfo = ROLES[killed.role];
      io.to(this.id).emit('chatMessage', {
        sender: 'AI 진행자',
        message: `💀 ${killed.name}님이 마피아에 의해 살해당했습니다. 그의 정체는 ${roleInfo.emoji} ${roleInfo.name}이었습니다.`,
        type: 'ai'
      });
      io.to(this.id).emit('playerDied', { playerId: killed.id, playerName: killed.name, role: killed.role });
    } else {
      const aiMsg = randomPick(AI_MESSAGES.noKill);
      io.to(this.id).emit('chatMessage', { sender: 'AI 진행자', message: aiMsg, type: 'ai' });
    }

    if (this.checkWinCondition(io)) return;

    setTimeout(() => {
      this.startDay(io);
    }, 2000);
  }

  checkWinCondition(io) {
    const aliveMafia = this.getAliveByRole('MAFIA').length;
    const aliveCitizens = this.getAlivePlayers().length - aliveMafia;

    if (aliveMafia === 0) {
      this.phase = 'ended';
      const aiMsg = randomPick(AI_MESSAGES.citizenWin);
      io.to(this.id).emit('chatMessage', { sender: 'AI 진행자', message: aiMsg, type: 'ai' });
      io.to(this.id).emit('gameEnd', {
        winner: 'citizen',
        players: this.players.map(p => ({
          name: p.name,
          role: p.role,
          roleName: ROLES[p.role].name,
          alive: p.alive
        }))
      });
      this.clearTimer();
      return true;
    }

    if (aliveMafia >= aliveCitizens) {
      this.phase = 'ended';
      const aiMsg = randomPick(AI_MESSAGES.mafiaWin);
      io.to(this.id).emit('chatMessage', { sender: 'AI 진행자', message: aiMsg, type: 'ai' });
      io.to(this.id).emit('gameEnd', {
        winner: 'mafia',
        players: this.players.map(p => ({
          name: p.name,
          role: p.role,
          roleName: ROLES[p.role].name,
          alive: p.alive
        }))
      });
      this.clearTimer();
      return true;
    }

    return false;
  }

  startTimer(io, callback) {
    this.clearTimer();
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      io.to(this.id).emit('timerUpdate', { timeLeft: this.timeLeft });
      if (this.timeLeft <= 0) {
        this.clearTimer();
        callback();
      }
    }, 1000);
  }

  clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getState() {
    return {
      id: this.id,
      phase: this.phase,
      day: this.day,
      timeLeft: this.timeLeft,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected
      })),
      defenseTarget: this.defenseTarget,
      settings: this.settings,
      rolePreview: this.getRolePreview()
    };
  }
}

class GameManager {
  constructor(io) {
    this.rooms = new Map();
    this.io = io;
  }

  createRoom() {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(id) {
    return this.rooms.get(id);
  }

  removeRoom(id) {
    const room = this.rooms.get(id);
    if (room) room.clearTimer();
    this.rooms.delete(id);
  }

  findRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.some(p => p.socketId === socketId)) {
        return room;
      }
    }
    return null;
  }
}

module.exports = { GameManager, Room, Player, ROLES };
