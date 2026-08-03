const bedrock = require('bedrock-protocol');
const express = require('express');
const fs = require('fs');

// ============================================================
// CONFIGURATION LOADING
// ============================================================
let settings = {
  ip: "163.5.201.11",
  port: 10070,
  username: "YOUR_MICROSOFT_EMAIL@gmail.com",
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

let botStatus = {
  connected: false,
  reconnectCount: 0,
  startTime: Date.now()
};

// ============================================================
// EXPRESS WEB DASHBOARD (FOR RENDER / UPTIMEROBOT)
// ============================================================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Bedrock AFK Bot Dashboard</title>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; background: #0d1117; color: #e6edf3; padding: 40px; text-align: center; }
          .card { background: #161b22; border: 1px solid #21262d; border-radius: 12px; padding: 24px; max-width: 400px; margin: 0 auto; }
          .online { color: #3fb950; font-weight: bold; }
          .offline { color: #f85149; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Bedrock AFK Bot Status</h1>
          <p class="${botStatus.connected ? 'online' : 'offline'}">
            ${botStatus.connected ? '✓ CONNECTED & ACTIVE' : '✗ DISCONNECTED'}
          </p>
          <p>Target: <code>${settings.ip}:${settings.port}</code></p>
          <p>Reconnects: ${botStatus.reconnectCount}</p>
        </div>
      </body>
    </html>
  `);
});

app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Web dashboard running on port ${PORT}`);
});

// ============================================================
// BEDROCK BOT WITH ADVANCED KEEP-ALIVE & ANTI-KICK HEARTBEAT
// ============================================================
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
      profilesFolder: './.mc_profiles'
    });

    client.on('spawn', () => {
      botStatus.connected = true;
      console.log('[Bot] SUCCESS: Spawned in world! Active keep-alive heartbeat started.');

      // Active Heartbeat: Swing arm every 12s, send /help command every 60s
      let tick = 0;
      heartbeatTimer = setInterval(() => {
        if (client && botStatus.connected) {
          try {
            // 1. Arm swing packet
            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });

            // 2. Send active command packet every ~60 seconds to force player activity
            tick++;
            if (tick % 5 === 0) {
              client.queue('text', {
                type: 'chat',
                needs_translation: false,
                source_name: client.username,
                xuid: '',
                platform_chat_id: '',
                message: '/help'
              });
              console.log('[Heartbeat] Sent active chat command /help to server');
            } else {
              console.log('[Heartbeat] Sent active arm swing packet to Geyser');
            }
          } catch (err) {
            // Suppress minor packet write errors
          }
        }
      }, 12000);
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
