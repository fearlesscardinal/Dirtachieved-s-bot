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

// 2. Pure Bedrock Client (No Corrupted Packets)
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
      console.log('[Bot] SUCCESS: Spawned in Bedrock world! Connected cleanly without packet spam.');
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
      console.log(`[Bot] Disconnected: ${reason || 'Server closed connection'}`);

      if (settings.autoReconnect) {
        botStatus.reconnectCount++;
        console.log(`[Bot] Reconnecting in ${settings.reconnectDelayMs / 1000}s... (Attempt #${botStatus.reconnectCount})`);
        setTimeout(startBot, settings.reconnectDelayMs);
      }
    });

    client.on('error', (err) => {
      botStatus.connected = false;
      console.log('[Bot Error]', err.message || err);
    });

  } catch (err) {
    if (settings.autoReconnect) setTimeout(startBot, settings.reconnectDelayMs);
  }
}

startBot();
