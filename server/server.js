const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let broadcaster = null;

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    switch (data.type) {
      case 'broadcaster':
        ws.role = 'broadcaster';
        broadcaster = ws;
        break;
      case 'watcher':
        ws.role = 'viewer';
        if (broadcaster) broadcaster.send(JSON.stringify({ type: 'watcher' }));
        break;
      case 'offer':
        // from broadcaster to viewers
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN && client.role === 'viewer') {
            client.send(JSON.stringify({ type: 'offer', sdp: data.sdp }));
          }
        });
        break;
      case 'answer':
        // from viewer to broadcaster
        if (broadcaster) broadcaster.send(JSON.stringify({ type: 'answer', sdp: data.sdp }));
        break;
      case 'ice-candidate':
        // forward ICE candidates
        if (ws.role === 'broadcaster') {
          // from broadcaster to all viewers
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.role === 'viewer') {
              client.send(JSON.stringify({ type: 'ice-candidate', candidate: data.candidate }));
            }
          });
        } else if (ws.role === 'viewer') {
          // from viewer to broadcaster
          if (broadcaster) broadcaster.send(JSON.stringify({ type: 'ice-candidate', candidate: data.candidate }));
        }
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    if (ws === broadcaster) broadcaster = null;
  });
});

server.listen(4000, () => console.log('Signaling server running on :4000'));