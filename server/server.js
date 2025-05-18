// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let broadcaster = null;

wss.on('connection', (ws) => {
  console.log('\n🟢 New WebSocket connection established.');

  ws.on('message', (message) => {
    console.log('📩 Received message of length:', message.length);
    const data = JSON.parse(message);

    switch (data.type) {
      case 'broadcaster':
        ws.role = 'broadcaster';
        broadcaster = ws;
        console.log('🎥 Broadcaster connected.');
        break;

      case 'watcher':
        ws.role = 'viewer';
        console.log('👀 Watcher connected.');
        if (broadcaster) {
          broadcaster.send(JSON.stringify({ type: 'watcher' }));
          console.log('➡️ Notified broadcaster of new watcher.');
        }
        break;

      case 'offer':
        // from broadcaster to viewers
        console.log('📤 Offer from broadcaster to watcher.');
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN && client.role === 'viewer') {
            client.send(JSON.stringify({ type: 'offer', sdp: data.sdp }));
            console.log('➡️ Offer sent to watcher.');
          }
        });
        break;

      case 'answer':
        // from viewer to broadcaster
        console.log('📥 Answer from watcher to broadcaster.');
        if (broadcaster) {
          broadcaster.send(JSON.stringify({ type: 'answer', sdp: data.sdp }));
          console.log('➡️ Answer forwarded to broadcaster.');
        }
        break;

      case 'ice-candidate':
        console.log('❄️ ICE Candidate received.');
        // forward ICE candidates
        if (ws.role === 'broadcaster') {
          // from broadcaster to all viewers
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.role === 'viewer') {
              client.send(JSON.stringify({ type: 'ice-candidate', candidate: data.candidate }));
              console.log('➡️ ICE candidate sent to watcher.');
            }
          });
        } else if (ws.role === 'viewer') {
          // from viewer to broadcaster
          if (broadcaster) {
            broadcaster.send(JSON.stringify({ type: 'ice-candidate', candidate: data.candidate }));
            console.log('➡️ ICE candidate forwarded to broadcaster.');
          }
        }
        break;

      case 'start':
        console.log('▶️ Host has started broadcasting.');
        // avisa todos os viewers para reconectar/iniciar view
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && client.role === 'viewer') {
            client.send(JSON.stringify({ type: 'start' }));
            console.log('➡️ Start notification sent to a viewer.');
          }
        });
        break;

      default:
        console.log('❓ Unknown message type:', data.type);
        break;
    }
  });

  ws.on('close', () => {
    if (ws === broadcaster) {
      broadcaster = null;
      console.log('🔴 Broadcaster disconnected.');
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.role === 'viewer') {
          client.send(JSON.stringify({ type: 'close' }));
          console.log('➡️ Close notification sent to a viewer.');
        }
      });
    } else {
      console.log('🔴 A viewer disconnected.');
    }
  });
});

server.listen(4000, () => console.log('🚀 Signaling server running on :4000'));