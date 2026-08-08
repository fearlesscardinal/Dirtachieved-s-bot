const bedrock = require('bedrock-protocol');
const express = require('express');
const fs = require('fs');

// Load settings
let settings = {
  ip: "dirtachieved.seedloaf.gg",
  port: 50828,
  username: "t03cooper@gmail.com",
  offline: false,
  autoReconnect: true,
  reconnectDelayMs: 5000
};

if (fs.existsSync('./settings.json')) {
  try {
    settings = { ...settings, ...JSON.parse(fs.readFileSync('./settings.json', 'utf8')) };
  } catch (err) {}
}

let botStatus = { connected: false, reconnectCount: 0 };

// 1. Keep-Alive Web Dashboard
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bedrock AFK Bot Online'));
app.listen(PORT, '0.0.0.0', () => console.log(`[Server] Web dashboard running on port ${PORT}`));

// 2. Bedrock Engine
let client = null;
let taskInterval = null;
let currentPos = { x: 0, y: 70, z: 0 };
let originPos = null;
let clientTick = 0n;
let isReconnecting = false;
let activeTask = 'afk';
let attackTarget = '';

// AUTHORIZED COMMAND USER
const ALLOWED_MASTER = 'fearlesscardinal';

function sendBotChat(msg) {
  if (client && botStatus.connected) {
    try {
      client.queue('text', {
        type: 'chat',
        needs_translation: false,
        source_name: client.username || 'Bot',
        xuid: '',
        platform_chat_id: '',
        message: msg
      });
    } catch (e) {}
  }
}

function scheduleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;
  botStatus.connected = false;

  if (taskInterval) {
    clearInterval(taskInterval);
    taskInterval = null;
  }

  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }

  botStatus.reconnectCount++;
  const delay = settings.reconnectDelayMs || 5000;
  console.log(`[Bot] Reconnecting in ${delay / 1000}s... (Attempt #${botStatus.reconnectCount})`);

  setTimeout(() => {
    isReconnecting = false;
    startBot();
  }, delay);
}

function startBot() {
  if (isReconnecting) return;

  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }
  if (taskInterval) {
    clearInterval(taskInterval);
    taskInterval = null;
  }

  console.log(`[Bot] Connecting to ${settings.ip}:${settings.port}...`);

  try {
    client = bedrock.createClient({
      host: settings.ip,
      port: Number(settings.port),
      username: settings.username,
      offline: settings.offline,
      skipPing: true,
      profilesFolder: './.mc_profiles'
    });

    client.on('start_game', (packet) => {
      if (packet && packet.player_position) {
        currentPos = packet.player_position;
        originPos = { ...currentPos };
      }
      try {
        client.write('request_chunk_radius', { chunk_radius: 2 });
      } catch (e) {}
    });

    client.on('move_player', (packet) => {
      if (packet && packet.position) {
        currentPos = packet.position;
        if (!originPos) originPos = { ...currentPos };
      }
    });

    client.on('spawn', () => {
      botStatus.connected = true;
      botStatus.reconnectCount = 0;
      console.log(`[Bot] SUCCESS: Spawned in world! Listening for commands from ${ALLOWED_MASTER}.`);

      taskInterval = setInterval(() => {
        if (!client || !botStatus.connected || !originPos) return;

        try {
          clientTick++;

          if (activeTask === 'afk') {
            let step = (clientTick % 2n === 0n) ? 1.0 : 0.0;
            let targetX = originPos.x + step;

            client.write('move_player', {
              runtime_id: client.entityId || 1n,
              position: { x: targetX, y: originPos.y, z: originPos.z },
              pitch: 0,
              yaw: step > 0 ? 90 : 270,
              head_yaw: step > 0 ? 90 : 270,
              mode: 'normal',
              on_ground: true,
              ridden_runtime_id: 0n,
              teleport_cause: 'unknown',
              teleport_item: 0,
              tick: clientTick
            });

            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });

          } else if (activeTask === 'mine') {
            client.write('move_player', {
              runtime_id: client.entityId || 1n,
              position: currentPos,
              pitch: 90,
              yaw: 0,
              head_yaw: 0,
              mode: 'normal',
              on_ground: true,
              ridden_runtime_id: 0n,
              teleport_cause: 'unknown',
              teleport_item: 0,
              tick: clientTick
            });

            client.write('player_action', {
              runtime_entity_id: client.entityId || 1n,
              action: 'start_break',
              position: { x: Math.floor(currentPos.x), y: Math.floor(currentPos.y - 1), z: Math.floor(currentPos.z) },
              result_position: { x: 0, y: 0, z: 0 },
              face: 1
            });

            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });

          } else if (activeTask === 'attack') {
            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });
          }

          client.write('player_auth_input', {
            pitch: activeTask === 'mine' ? 90 : 0,
            yaw: Number((clientTick * 15n) % 360n),
            position: currentPos,
            move_vector: { x: 0, z: 0 },
            head_yaw: Number((clientTick * 15n) % 360n),
            input_data: 0n,
            input_mode: 'touch',
            play_mode: 'normal',
            interaction_model: 'touch',
            gaze_direction: { x: 0, y: 0, z: 0 },
            tick: clientTick,
            delta: { x: 0, y: 0, z: 0 },
            transaction: null,
            item_stack_request: null,
            block_action: null,
            analogue_move_vector: { x: 0, z: 0 }
          });

        } catch (err) {}
      }, 1000);
    });

    client.on('join', () => {
      botStatus.connected = true;
    });

    // STRICT SENDER & PREFIX CHAT COMMAND LISTENER
    client.on('text', (packet) => {
      if (!packet || !packet.message) return;

      const rawSender = (packet.source_name || '').trim();
      // Clean sender name (strips Floodgate . or * prefix if present)
      const cleanSender = rawSender.toLowerCase().replace(/^[.*]/, '');
      const rawMsg = packet.message.trim();

      console.log(`[Chat] ${rawSender}: ${rawMsg}`);

      // 1. Verify sender is Fearlesscardinal
      if (cleanSender !== ALLOWED_MASTER) {
        return; // Ignore commands from other players!
      }

      // 2. Check if message starts with !
      if (!rawMsg.startsWith('!')) return;

      const args = rawMsg.substring(1).trim().split(/\s+/);
      const command = args[0].toLowerCase();

      if (command === 'afk') {
        activeTask = 'afk';
        originPos = { ...currentPos };
        sendBotChat(`[Bot] Command accepted from ${rawSender}. Switched to AFK mode.`);
        console.log(`[Master Command] !afk executed by ${rawSender}`);

      } else if (command === 'mine') {
        activeTask = 'mine';
        sendBotChat(`[Bot] Command accepted. Mining block below!`);
        console.log(`[Master Command] !mine executed by ${rawSender}`);

      } else if (command === 'attack') {
        activeTask = 'attack';
        attackTarget = args[1] || 'mobs';
        sendBotChat(`[Bot] Command accepted. Attacking target: ${attackTarget}!`);
        console.log(`[Master Command] !attack ${attackTarget} executed by ${rawSender}`);

      } else if (command === 'stop') {
        activeTask = 'idle';
        sendBotChat(`[Bot] Command accepted. Stopped all tasks.`);
        console.log(`[Master Command] !stop executed by ${rawSender}`);

      } else if (command === 'help') {
        sendBotChat(`[Bot Commands] !afk, !mine, !attack [target], !stop`);
      }
    });

    client.on('close', (reason) => {
      console.log(`[Bot] Disconnected: ${reason || 'Closed'}`);
      if (settings.autoReconnect) scheduleReconnect();
    });

    client.on('error', (err) => {
      console.log('[Bot Error]', err.message || err);
      if (settings.autoReconnect) scheduleReconnect();
    });

  } catch (err) {
    console.log('[Fatal Error]', err.message);
    if (settings.autoReconnect) scheduleReconnect();
  }
}

startBot();
