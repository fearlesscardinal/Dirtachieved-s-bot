const bedrock = require('bedrock-protocol');
const express = require('express');
const fs = require('fs');

// ============================================================
// CONFIGURATION LOADING
// ============================================================
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
    const raw = fs.readFileSync('./settings.json', 'utf8');
    settings = { ...settings, ...JSON.parse(raw) };
  } catch (err) {
    console.log('[Config] Error parsing settings.json, using defaults:', err.message);
  }
}

let botStatus = {
  connected: false,
  startTime: Date.now(),
  reconnectCount: 0,
  lastError: null
};

// ============================================================
// KEEP-ALIVE WEB DASHBOARD (FOR RENDER)
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
          .status { font-weight: bold; font-size: 20px; }
          .online { color: #3fb950; }
          .offline { color: #f85149; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Bedrock AFK Bot Status</h1>
          <p class="status ${botStatus.connected ? 'online' : 'offline'}">
            ${botStatus.connected ? '✓ CONNECTED & ACTIVE' : '✗ DISCONNECTED'}
          </p>
          <p>Target: <code>${settings.ip}:${settings.port}</code></p>
          <p>Reconnect Attempts: ${botStatus.reconnectCount}</p>
        </div>
      </body>
    </html>
  `);
});

app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] HTTP Keep-alive dashboard started on port ${PORT}`);
});

// ============================================================
// BEDROCK BOT LOGIC WITH ADVANCED ANTI-AFK (CHAT & SWING)
// ============================================================
let client = null;
let isConnecting = false;
let afkInterval = null;

function startBot() {
  if (isConnecting) return;
  isConnecting = true;

  console.log('==================================================');
  console.log('    Minecraft Bedrock AFK Bot - Render Edition');
  console.log('==================================================');
  console.log(` Target Server : ${settings.ip}:${settings.port}`);
  console.log(` Auth Mode     : ${settings.offline ? 'Offline Mode' : 'Microsoft / Xbox'}`);
  console.log(` Auto Reconnect: ${settings.autoReconnect}`);
  console.log('==================================================');

  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }
  if (afkInterval) {
    clearInterval(afkInterval);
    afkInterval = null;
  }

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
      isConnecting = false;
      console.log('[Bot] SUCCESS: Spawned in Bedrock world!');

      // Advanced Anti-AFK: Arm Swing every 20s + Chat packet every 90s
      let cycle = 0;
      afkInterval = setInterval(() => {
        if (client && botStatus.connected) {
          try {
            // 1. Arm swing
            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });

            // 2. Chat command every ~90 seconds to force server packet activity
            cycle++;
            if (cycle % 4 === 0) {
              client.queue('text', {
                type: 'chat',
                needs_translation: false,
                source_name: client.username,
                xuid: '',
                platform_chat_id: '',
                message: '/help'
              });
              console.log('[Anti-AFK] Sent /help command to force player activity');
            } else {
              console.log('[Anti-AFK] Performed arm swing');
            }
          } catch (err) {
            // Ignore minor packet write errors
          }
        }
      }, 22000);
    });

    client.on('join', () => {
      botStatus.connected = true;
      isConnecting = false;
      console.log('[Bot] Joined server successfully!');
    });

    client.on('text', (packet) => {
      if (packet && packet.message) {
        console.log(`[Chat] ${packet.source_name || 'Server'}: ${packet.message}`);
      }
    });

    client.on('close', (reason) => {
      botStatus.connected = false;
      isConnecting = false;
      if (afkInterval) clearInterval(afkInterval);

      console.log(`[Bot] Connection closed: ${reason || 'Server closed socket'}`);

      if (settings.autoReconnect) {
        botStatus.reconnectCount++;
        console.log(`[Bot] Reconnecting in ${settings.reconnectDelayMs / 1000}s... (Attempt #${botStatus.reconnectCount})`);
        setTimeout(startBot, settings.reconnectDelayMs);
      }
    });

    client.on('error', (err) => {
      botStatus.connected = false;
      if (afkInterval) clearInterval(afkInterval);
      botStatus.lastError = err.message || String(err);
      console.log('[Bot Error]', botStatus.lastError);
    });

  } catch (err) {
    isConnecting = false;
    if (afkInterval) clearInterval(afkInterval);
    console.log('[Bot Fatal Error]', err.message);
    if (settings.autoReconnect) {
      setTimeout(startBot, settings.reconnectDelayMs);
    }
  }
}

startBot();
