const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let broadcaster = null;

wss.on('connection', (ws) => {
  console.log('🟢 New WebSocket connection established.');

  ws.on('message', (message) => {
    console.log('📩 Received message:', message);
    const data = JSON.parse(message);

    switch (data.type) {
      case 'broadcaster':
        broadcaster = ws;
        ws.broadcaster = true;
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
        console.log('📤 Offer from broadcaster to watcher.');
        ws.targets = data.target;
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN && client.role === 'viewer') {
            client.send(JSON.stringify({ type: 'offer', sdp: data.sdp }));
            console.log('➡️ Offer sent to watcher.');
          }
        });
        break;

      case 'answer':
        console.log('📥 Answer from watcher to broadcaster.');
        if (broadcaster) {
          broadcaster.send(JSON.stringify({ type: 'answer', sdp: data.sdp }));
          console.log('➡️ Answer forwarded to broadcaster.');
        }
        break;

      case 'ice-candidate':
        console.log('❄️ ICE Candidate received.');
        if (ws === broadcaster && ws.broadcaster === false) {
          broadcaster.send(JSON.stringify({ type: 'ice-candidate', candidate: data.candidate }));
          console.log('➡️ ICE candidate forwarded to broadcaster.');
        } else if (ws === broadcaster) {
          console.log('🔇 ICE candidate from broadcaster ignored.');
        } else {
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.role === 'viewer') {
              client.send(JSON.stringify({ type: 'ice-candidate', candidate: data.candidate }));
              console.log('➡️ ICE candidate sent to watcher.');
            }
          });
        }
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
    } else {
      console.log('🔴 A viewer disconnected.');
    }
  });
});

server.listen(4000, () => console.log('🚀 Signaling server running on :4000'));
