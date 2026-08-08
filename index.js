const bedrock = require('bedrock-protocol');
const express = require('express');
const fs = require('fs');

// 1. Load Settings with Fallback Defaults
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
    const raw = fs.readFileSync('./settings.json', 'utf8');
    settings = { ...settings, ...JSON.parse(raw) };
  } catch (err) {
    console.log('[Config] Error reading settings.json:', err.message);
  }
}

let botStatus = { connected: false, reconnectCount: 0 };

// 2. Keep-Alive Web Dashboard (For Render / UptimeRobot)
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bedrock AFK Bot Dashboard Online'));
app.get('/ping', (req, res) => res.send('pong'));
app.listen(PORT, '0.0.0.0', () => console.log(`[Server] Web dashboard running on port ${PORT}`));

// 3. Bot State & Master Definition
let client = null;
let taskInterval = null;
let currentPos = { x: 0, y: 70, z: 0 };
let originPos = null;
let clientTick = 0n;
let isReconnecting = false;
let activeTask = 'afk'; // State: 'afk', 'mine', 'attack', 'idle'

const ALLOWED_MASTER = 'fearlesscardinal';

// Helper: Send Chat Packet to Server
function sendBotChat(msg) {
  if (client && botStatus.connected) {
    try {
      client.queue('text', {
        type: 'chat',
        needs_translation: false,
        source_name: client.username || 'Bot',
        xuid: '',
        platform_chat_id: '',
        message: msg,
        filtered_message: ''
      });
    } catch (e) {}
  }
}

// 4. Immortal Reconnection Manager
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

// 5. Main Bot Engine
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
      skipPing: true, // Prevents RakNet ping timeouts
      profilesFolder: './.mc_profiles'
    });

    // Capture spawn & move packets to track bot location dynamically
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

    // Active Task & Movement Loop
    client.on('spawn', () => {
      botStatus.connected = true;
      botStatus.reconnectCount = 0;
      console.log(`[Bot] SUCCESS: Spawned in world! Active Task Engine Running.`);

      // 500ms loop for fast visual updates
      taskInterval = setInterval(() => {
        if (!client || !botStatus.connected || !originPos) return;

        try {
          clientTick++;

          let pitch = 0;
          let yaw = Number((clientTick * 30n) % 360n);
          let pos = { ...currentPos };
          let moveVec = { x: 0, z: 0 };

          if (activeTask === 'afk') {
            // Walk 1 full block back and forth
            let step = (clientTick % 2n === 0n) ? 1.0 : -1.0;
            pos.x = originPos.x + step;
            moveVec.x = step;
            yaw = step > 0 ? 90 : 270;

            client.write('move_player', {
              runtime_id: client.entityId || 1n,
              position: pos,
              pitch: 0,
              yaw: yaw,
              head_yaw: yaw,
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
            // Look 90 degrees straight down at the floor
            pitch = 90;
            yaw = 0;

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

            // Send block breaking action
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
            // Fast spin & weapon swing simulation
            yaw = Number((clientTick * 60n) % 360n);

            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });
          }

          // PlayerAuthInput stream for Geyser sync
          client.write('player_auth_input', {
            pitch: pitch,
            yaw: yaw,
            position: pos,
            move_vector: moveVec,
            head_yaw: yaw,
            input_data: 0n,
            input_mode: 'touch',
            play_mode: 'normal',
            interaction_model: 'touch',
            gaze_direction: { x: 0, y: 0, z: 0 },
            tick: clientTick,
            delta: { x: moveVec.x, y: 0, z: 0 },
            transaction: null,
            item_stack_request: null,
            block_action: null,
            analogue_move_vector: { x: 0, z: 0 }
          });

        } catch (err) {}
      }, 500);
    });

    client.on('join', () => {
      botStatus.connected = true;
    });

    // 6. Universal Geyser Translation Chat Listener
    client.on('text', (packet) => {
      if (!packet) return;

      // Extract text from string messages or translation arrays
      let fullText = '';
      if (typeof packet.message === 'string') fullText += ' ' + packet.message;
      if (Array.isArray(packet.parameters)) fullText += ' ' + packet.parameters.join(' ');
      if (Array.isArray(packet.param)) fullText += ' ' + packet.param.join(' ');

      const lowerFull = fullText.toLowerCase().trim();
      const sender = packet.source_name || 'Server';

      console.log(`[Chat Debug] Sender: ${sender} | Text: ${lowerFull}`);

      // Check if message is from Java account Fearlesscardinal
      const isMaster = lowerFull.includes('fearlesscardinal') || lowerFull.includes('fearlessman') || (packet.source_name && packet.source_name.toLowerCase().includes('fearless'));

      if (!isMaster) return;

      // Match and execute commands
      if (lowerFull.includes('!afk') || lowerFull.includes('bot afk')) {
        activeTask = 'afk';
        originPos = { ...currentPos };
        sendBotChat(`[Bot] Switched to 1-block AFK walking.`);
        console.log(`[Master Command] !afk executed!`);

      } else if (lowerFull.includes('!mine') || lowerFull.includes('bot mine')) {
        activeTask = 'mine';
        sendBotChat(`[Bot] Mining block directly below!`);
        console.log(`[Master Command] !mine executed!`);

      } else if (lowerFull.includes('!attack') || lowerFull.includes('bot attack')) {
        activeTask = 'attack';
        sendBotChat(`[Bot] Switched to ATTACK mode!`);
        console.log(`[Master Command] !attack executed!`);

      } else if (lowerFull.includes('!stop') || lowerFull.includes('bot stop')) {
        activeTask = 'idle';
        sendBotChat(`[Bot] Stopped all tasks.`);
        console.log(`[Master Command] !stop executed!`);

      } else if (lowerFull.includes('!help') || lowerFull.includes('bot help')) {
        sendBotChat(`[Bot Commands] !afk, !mine, !attack, !stop`);
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
