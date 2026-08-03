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
  } catch (err) {
    console.log('[Config] Error reading settings.json:', err.message);
  }
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

function startBot() {
  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  console.log('==================================================');
  console.log('    Minecraft Bedrock AFK Bot - Render Edition');
  console.log('==================================================');
  console.log(` Target Server : ${settings.ip}:${settings.port}`);
  console.log(` Auth Mode     : ${settings.offline ? 'Offline Mode' : 'Microsoft / Xbox'}`);
  console.log('==================================================');

  try {
    client = bedrock.createClient({
      host: settings.ip,
      port: Number(settings.port),
      username: settings.username,
      offline: settings.offline,
      skipPing: true, // <--- PREVENTS RAKNET PING TIMEOUTS
      profilesFolder: './.mc_profiles'
    });

    client.on('spawn', () => {
      botStatus.connected = true;
      console.log('[Bot] SUCCESS: Spawned in world! Active movement heartbeat started.');

      let tick = 0;
      let botPos = { x: -21.5, y: 69.0, z: 22.5 };

      // Active Heartbeat every 3 seconds to keep Geyser connection alive
      heartbeatTimer = setInterval(() => {
        if (client && botStatus.connected) {
          try {
            // 1. Send position movement packet (signals active player physics to Geyser)
            client.write('move_player', {
              runtime_id: client.entityId || 1n,
              position: botPos,
              pitch: 0,
              yaw: (tick * 10) % 360,
              head_yaw: (tick * 10) % 360,
              mode: 'normal',
              on_ground: true,
              ridden_runtime_id: 0n,
              teleport_cause: 'unknown',
              teleport_item: 0,
              tick: BigInt(tick)
            });

            // 2. Send arm swing
            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });

            // 3. Send /help command every ~45 seconds
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
              console.log('[Heartbeat] Sent active position & rotation packet to Geyser');
            }
          } catch (e) {
            // Suppress minor packet errors
          }
        }
      }, 3000);
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
    console.log('[Fatal Error]', err.message);
    if (settings.autoReconnect) {
      setTimeout(startBot, settings.reconnectDelayMs);
    }
  }
}

startBot();
