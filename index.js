const bedrock = require('bedrock-protocol');
const express = require('express');
const fs = require('fs');

// Load settings
let settings = {
  ip: "163.5.201.11",
  port: 10070,
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

// 1. Keep-Alive Web Dashboard for Render
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bedrock AFK Bot Online'));
app.listen(PORT, '0.0.0.0', () => console.log(`[Server] Web dashboard running on port ${PORT}`));

// 2. Bedrock Bot Engine
let client = null;
let heartbeatTimer = null;
let currentPos = null;

function startBot() {
  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
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

    // Capture position assigned by server (never hardcode)
    client.on('start_game', (packet) => {
      if (packet && packet.player_position) {
        currentPos = packet.player_position;
        console.log(`[Bot] Server assigned position: X=${currentPos.x}, Y=${currentPos.y}, Z=${currentPos.z}`);
      }
    });

    client.on('move_player', (packet) => {
      if (packet && packet.position) {
        currentPos = packet.position;
      }
    });

    client.on('spawn', () => {
      botStatus.connected = true;
      console.log('[Bot] SUCCESS: Spawned in world! Dynamic heartbeat started.');

      let tick = 0;
      heartbeatTimer = setInterval(() => {
        if (client && botStatus.connected) {
          try {
            // Only send movement if server assigned a valid position
            if (currentPos) {
              client.write('move_player', {
                runtime_id: client.entityId || 1n,
                position: currentPos,
                pitch: 0,
                yaw: (tick * 15) % 360,
                head_yaw: (tick * 15) % 360,
                mode: 'normal',
                on_ground: true,
                ridden_runtime_id: 0n,
                teleport_cause: 'unknown',
                teleport_item: 0,
                tick: BigInt(tick)
              });
            }

            // Arm swing packet
            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });

            // Chat command every ~60s
            tick++;
            if (tick % 15 === 0) {
              client.queue('text', {
                type: 'chat',
                needs_translation: false,
                source_name: client.username,
                xuid: '',
                platform_chat_id: '',
                message: '/help'
              });
              console.log('[Heartbeat] Sent /help command to server');
            } else {
              console.log('[Heartbeat] Sent rotation & arm swing packet');
            }
          } catch (e) {}
        }
      }, 4000);
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
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      console.log(`[Bot] Disconnected: ${reason || 'Server closed connection'}`);

      if (settings.autoReconnect) {
        botStatus.reconnectCount++;
        console.log(`[Bot] Reconnecting in ${settings.reconnectDelayMs / 1000}s... (Attempt #${botStatus.reconnectCount})`);
        setTimeout(startBot, settings.reconnectDelayMs);
      }
    });

    client.on('error', (err) => {
      botStatus.connected = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      console.log('[Bot Error]', err.message || err);
    });

  } catch (err) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (settings.autoReconnect) setTimeout(startBot, settings.reconnectDelayMs);
  }
}

startBot();
