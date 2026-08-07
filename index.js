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

// 2. Micro-Movement Anti-Idle Engine
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
  if (afkInterval) {
    clearInterval(afkInterval);
    afkInterval = null;
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
      console.log('[Bot] SUCCESS: Spawned in world! Micro-Movement Anti-Idle Active.');

      // Micro-Movement Loop every 10 seconds: Steps 0.05 blocks to trigger Paper's resetLastActionTime()
      afkInterval = setInterval(() => {
        if (client && botStatus.connected && currentPos) {
          try {
            clientTick++;

            // Alternate position 0.05 blocks back and forth
            let step = (clientTick % 2n === 0n) ? 0.05 : -0.05;
            let movePos = {
              x: currentPos.x + step,
              y: currentPos.y,
              z: currentPos.z
            };

            // 1. Write move_player packet (Forces Geyser -> Spigot resetLastActionTime)
            client.write('move_player', {
              runtime_id: client.entityId || 1n,
              position: movePos,
              pitch: 0,
              yaw: Number((clientTick * 45n) % 360n),
              head_yaw: Number((clientTick * 45n) % 360n),
              mode: 'normal',
              on_ground: true,
              ridden_runtime_id: 0n,
              teleport_cause: 'unknown',
              teleport_item: 0,
              tick: clientTick
            });

            // 2. Write player_auth_input
            client.write('player_auth_input', {
              pitch: 0,
              yaw: Number((clientTick * 45n) % 360n),
              position: movePos,
              move_vector: { x: 0, z: 0 },
              head_yaw: Number((clientTick * 45n) % 360n),
              input_data: 0n,
              input_mode: 'touch',
              play_mode: 'normal',
              interaction_model: 'touch',
              gaze_direction: { x: 0, y: 0, z: 0 },
              tick: clientTick,
              delta: { x: step, y: 0, z: 0 },
              transaction: null,
              item_stack_request: null,
              block_action: null,
              analogue_move_vector: { x: 0, z: 0 }
            });

            // 3. Arm Swing
            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });

            console.log(`[Anti-AFK] Micro-step moved to X: ${movePos.x.toFixed(2)} (Resets Spigot Idle Timer)`);

          } catch (err) {}
        }
      }, 10000);
    });

    client.on('join', () => {
      botStatus.connected = true;
    });

    client.on('text', (packet) => {
      if (packet && packet.message) {
        console.log(`[Chat] ${packet.source_name || 'Server'}: ${packet.message}`);
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
