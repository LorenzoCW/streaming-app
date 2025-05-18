// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

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
        ws.id = uuidv4();
        console.log(`👀 Watcher connected: ${ws.id}`);
        if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
          broadcaster.send(JSON.stringify({ type: 'watcher', id: ws.id }));
          console.log('➡️ Notified broadcaster of new watcher.');
        }
        break;

      case 'offer':
        console.log('📤 Offer from broadcaster to watcher:', data.id);
        // send only to the targeted viewer
        wss.clients.forEach(client => {
          if (client.role === 'viewer' && client.id === data.id && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'offer', id: data.id, sdp: data.sdp }));
            console.log('➡️ Offer sent to watcher', data.id);
          }
        });
        break;

      case 'answer':
        console.log('📥 Answer from watcher to broadcaster:', data.id);
        if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
          broadcaster.send(JSON.stringify({ type: 'answer', id: data.id, sdp: data.sdp }));
          console.log('➡️ Answer forwarded to broadcaster.');
        }
        break;

      case 'ice-candidate':
        console.log('❄️ ICE Candidate received from', ws.role, ws.id);
        if (ws.role === 'broadcaster') {
          // forward from broadcaster to one viewer
          wss.clients.forEach(client => {
            if (client.role === 'viewer' && client.id === data.id && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'ice-candidate', id: data.id, candidate: data.candidate }));
              console.log('➡️ ICE candidate sent to watcher', data.id);
            }
          });
        } else if (ws.role === 'viewer') {
          // from viewer to broadcaster
          if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
            broadcaster.send(JSON.stringify({ type: 'ice-candidate', id: ws.id, candidate: data.candidate }));
            console.log('➡️ ICE candidate forwarded to broadcaster.');
          }
        }
        break;

      case 'start':
        console.log('▶️ Host has started broadcasting.');
        wss.clients.forEach(client => {
          if (client.role === 'viewer' && client.readyState === WebSocket.OPEN) {
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
        if (client.role === 'viewer' && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'close' }));
          console.log('➡️ Close notification sent to a viewer.');
        }
      });
    } else if (ws.role === 'viewer') {
      console.log(`🔴 Watcher disconnected: ${ws.id}`);
      // optionally notify broadcaster that a watcher left
      if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
        broadcaster.send(JSON.stringify({ type: 'disconnect', id: ws.id }));
      }
    }
  });
});

server.listen(4000, () => console.log('🚀 Signaling server running on :4000'));