const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { GameManager } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

const gameManager = new GameManager(io);

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('createRoom', ({ playerName }, callback) => {
    const room = gameManager.createRoom();
    const player = room.addPlayer(socket.id, playerName);
    socket.join(room.id);
    callback({ roomId: room.id, playerId: player.id });
    io.to(room.id).emit('roomUpdate', room.getState());
  });

  socket.on('joinRoom', ({ roomId, playerName }, callback) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return callback({ error: '존재하지 않는 방입니다.' });
    if (room.phase !== 'waiting') return callback({ error: '이미 게임이 진행 중입니다.' });
    if (room.players.length >= 12) return callback({ error: '방이 가득 찼습니다.' });

    const player = room.addPlayer(socket.id, playerName);
    socket.join(room.id);
    callback({ roomId: room.id, playerId: player.id });
    io.to(room.id).emit('roomUpdate', room.getState());
    room.addSystemMessage(`${playerName}님이 입장했습니다.`);
    io.to(room.id).emit('chatMessage', {
      sender: 'SYSTEM',
      message: `${playerName}님이 입장했습니다.`,
      type: 'system'
    });
  });

  socket.on('updateSettings', ({ roomId, settings }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    const host = room.players[0];
    if (host.socketId !== socket.id) return;
    if (room.phase !== 'waiting') return;

    room.updateSettings(settings);
    io.to(room.id).emit('roomUpdate', room.getState());
  });

  socket.on('startGame', ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    const host = room.players[0];
    if (host.socketId !== socket.id) return;
    const required = room.settings.requiredPlayers || 4;
    if (room.players.length < required) {
      socket.emit('error', { message: `${required}명이 필요합니다. (현재 ${room.players.length}명)` });
      return;
    }
    room.startGame(io);
  });

  socket.on('chat', ({ roomId, message }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    const player = room.getPlayerBySocket(socket.id);
    if (!player || !player.alive) return;
    if (room.phase !== 'day_discussion' && room.phase !== 'day_defense') return;

    io.to(room.id).emit('chatMessage', {
      sender: player.name,
      message,
      type: 'player'
    });
  });

  socket.on('vote', ({ roomId, targetId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    const player = room.getPlayerBySocket(socket.id);
    if (!player || !player.alive) return;
    if (room.phase !== 'day_vote' && room.phase !== 'day_final_vote') return;

    room.castVote(player.id, targetId, io);
  });

  socket.on('nightAction', ({ roomId, targetId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    const player = room.getPlayerBySocket(socket.id);
    if (!player || !player.alive) return;
    if (room.phase !== 'night') return;

    room.submitNightAction(player.id, targetId, io);
  });

  socket.on('disconnect', () => {
    const room = gameManager.findRoomBySocket(socket.id);
    if (!room) return;
    const player = room.getPlayerBySocket(socket.id);
    if (!player) return;

    player.connected = false;
    io.to(room.id).emit('chatMessage', {
      sender: 'SYSTEM',
      message: `${player.name}님의 연결이 끊어졌습니다.`,
      type: 'system'
    });
    io.to(room.id).emit('roomUpdate', room.getState());

    if (room.phase === 'waiting') {
      room.removePlayer(socket.id);
      if (room.players.length === 0) {
        gameManager.removeRoom(room.id);
      } else {
        io.to(room.id).emit('roomUpdate', room.getState());
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mafia Game Server running on port ${PORT}`);
});
