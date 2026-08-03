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

// 1. Keep-Alive Web Server
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bedrock AFK Bot Online'));
app.listen(PORT, '0.0.0.0', () => console.log(`[Server] Web server running on port ${PORT}`));

// 2. Bedrock Bot Logic
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

  console.log(`[Bot] Connecting directly to ${settings.ip}:${settings.port}...`);

  try {
    client = bedrock.createClient({
      host: settings.ip,
      port: Number(settings.port),
      username: settings.username,
      offline: settings.offline,
      skipPing: true, // <--- SKIPS RAKNET PING TIMEOUT!
      profilesFolder: './.mc_profiles'
    });

    client.on('spawn', () => {
      botStatus.connected = true;
      console.log('[Bot] SUCCESS: Spawned in Bedrock world! Active heartbeat started.');

      // Active Heartbeat every 15 seconds
      heartbeatTimer = setInterval(() => {
        if (client && botStatus.connected) {
          try {
            // 1. Arm swing
            client.write('animate', {
              action_id: 'swing_arm',
              runtime_entity_id: client.entityId || 1n
            });

            // 2. Chat command to keep Geyser network session active
            client.queue('text', {
              type: 'chat',
              needs_translation: false,
              source_name: client.username,
              xuid: '',
              platform_chat_id: '',
              message: '/help'
            });
            console.log('[Heartbeat] Sent arm swing & /help command to Geyser');
          } catch (e) {}
        }
      }, 15000);
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
      console.log(`[Bot] Disconnected: ${reason || 'Closed'}`);

      if (settings.autoReconnect) {
        botStatus.reconnectCount++;
        console.log(`[Bot] Reconnecting in ${set
