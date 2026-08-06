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
app.listen(PORT, '0.0.0.0', () => console.log(`[Server] Web server running on port ${PORT}`));

// 2. Bedrock Engine with PlayerAuthInput Stream
let client = null;
let authInputTimer = null;
let currentPos = { x: -21.5, y: 69.0, z: 22.5 };
let clientTick = 0n;

function startBot() {
  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }
  if (authInputTimer) {
    clearInterval(authInputTimer);
    authInputTimer = null;
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

    // Capture server position updates
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
      console.log('[Bot] SUCCESS: Spawned in world! Starting PlayerAuthInput stream...');

      // CRITICAL: Send PlayerAuthInput packet every 500ms to reset Geyser's 30s timeout timer
      authInputTimer = setInterval(() => {
        if (client && botStatus.connected) {
          try {
            clientTick++;

            // 1. Send PlayerAuthInput (resets Geyser lastAuthInputTime)
            client.write('player_auth_input', {
              pitch: 0,
              yaw: Number(clientTick % 360n),
              position: currentPos,
              move_vector: { x: 0, z: 0 },
              head_yaw: Number(clientTick % 360n),
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

            // 2. Send Arm Swing
            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });

          } catch (err) {
            // Ignore minor packet write errors
          }
        }
      }, 500);
    });

    client.on('join', () => {
      botStatus.connected = true;
      console.log('[Bot] Joined server successfully!');
    });

    client.on('text', (packet) => {
      if (packet && packet.message) {
        console.log(`[Chat] ${packet.source_name || 'Server'}: ${packet.message}`);
      }
    });

    client.on('close', (reason) => {
      botStatus.connected = false;
      if (authInputTimer) clearInterval(authInputTimer);
      console.log(`[Bot] Disconnected: ${reason || 'Server closed connection'}`);

      if (settings.autoReconnect) {
        botStatus.reconnectCount++;
        console.log(`[Bot] Reconnecting in ${settings.reconnectDelayMs / 1000}s... (Attempt #${botStatus.reconnectCount})`);
        setTimeout(startBot, settings.reconnectDelayMs);
      }
    });

    client.on('error', (err) => {
      botStatus.connected = false;
      if (authInputTimer) clearInterval(authInputTimer);
      console.log('[Bot Error]', err.message || err);
    });

  } catch (err) {
    if (authInputTimer) clearInterval(authInputTimer);
    if (settings.autoReconnect) setTimeout(startBot, settings.reconnectDelayMs);
  }
}

startBot();
