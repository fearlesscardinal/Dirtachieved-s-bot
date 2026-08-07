const bedrock = require('bedrock-protocol');
const express = require('express');
const fs = require('fs');

// Load settings
let settings = {
  ip: "dirtachieved.seedloaf.gg",
  port: 19132,
  username: "t03cooper@gmail.com",
  offline: false,
  autoReconnect: true,
  reconnectDelayMs: 15000
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

// 2. Immortal Reconnect Manager
let client = null;
let afkInterval = null;
let currentPos = { x: 0, y: 70, z: 0 };
let clientTick = 0n;
let isReconnecting = false;

function scheduleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;
  botStatus.connected = false;

  if (afkInterval) {
    clearInterval(afkInterval);
    afkInterval = null;
  }

  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }

  botStatus.reconnectCount++;
  const delay = settings.reconnectDelayMs || 15000;
  console.log(`[Bot] Server offline or restarting... Will retry in ${delay / 1000}s (Attempt #${botStatus.reconnectCount})`);

  setTimeout(() => {
    isReconnecting = false;
    startBot();
  }, delay);
}

// 3. Bedrock Bot Engine
function startBot() {
  if (isReconnecting) return;

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
      }
      try {
        client.write('request_chunk_radius', { chunk_radius: 2 });
      } catch (e) {}
    });

    client.on('move_player', (packet) => {
      if (packet && packet.position) {
        currentPos = packet.position;
      }
    });

    client.on('spawn', () => {
      botStatus.connected = true;
      botStatus.reconnectCount = 0;
      console.log('[Bot] SUCCESS: Spawned in world! Immortal reconnect active.');

      let cycle = 0;
      afkInterval = setInterval(() => {
        if (client && botStatus.connected) {
          try {
            clientTick++;

            // 1. Send PlayerAuthInput
            client.write('player_auth_input', {
              pitch: 0,
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

            // 2. Arm Swing
            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });

            // 3. Send /help command every 45 seconds (resets Seedloaf 5-min timer)
            cycle++;
            if (cycle % 9 === 0) {
              client.queue('text', {
                type: 'chat',
                needs_translation: false,
                source_name: client.username,
                xuid: '',
                platform_chat_id: '',
                message: '/help'
              });
              console.log('[Anti-Idle] Sent /help command');
            }
          } catch (err) {}
        }
      }, 5000);
    });

    client.on('join', () => {
      botStatus.connected = true;
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
