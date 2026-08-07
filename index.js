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

// 1. Keep-Alive Web Dashboard for Render / UptimeRobot
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('AFK Bot Dashboard Online'));
app.listen(PORT, '0.0.0.0', () => console.log(`[Server] Web server running on port ${PORT}`));

// 2. Clean Bedrock Connection Engine
let client = null;

function startBot() {
  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }

  console.log(`[Bot] Connecting cleanly to ${settings.ip}:${settings.port}...`);

  try {
    client = bedrock.createClient({
      host: settings.ip,
      port: Number(settings.port),
      username: settings.username,
      offline: settings.offline,
      skipPing: true,
      profilesFolder: './.mc_profiles'
    });

    client.on('spawn', () => {
      botStatus.connected = true;
      console.log('[Bot] SUCCESS: Spawned in world! Connected cleanly.');
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
      console.log(`[Bot] Disconnected: ${reason || 'Closed'}`);

      if (settings.autoReconnect) {
        botStatus.reconnectCount++;
        console.log(`[Bot] Reconnecting in ${settings.reconnectDelayMs / 1000}s... (Attempt #${botStatus.reconnectCount})`);
        setTimeout(startBot, settings.reconnectDelayMs);
      }
    });

    client.on('error', (err) => {
      botStatus.connected = false;
      console.log('[Bot Error]', err.message || err);
      if (settings.autoReconnect) {
        setTimeout(startBot, settings.reconnectDelayMs);
      }
    });

  } catch (err) {
    if (settings.autoReconnect) setTimeout(startBot, settings.reconnectDelayMs);
  }
}

startBot();
