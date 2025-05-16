import { useEffect, useRef } from 'react';

export default function Share() {
  const videoRef = useRef();
  const peerRef = useRef();
  const wsRef = useRef();

  useEffect(() => {
    console.log('📡 Connecting to signaling server as broadcaster...');
    wsRef.current = new WebSocket('ws://localhost:4000');

    wsRef.current.onopen = () => {
      console.log('✅ WebSocket connection opened (broadcaster).');
      wsRef.current.send(JSON.stringify({ type: 'broadcaster' }));
    };

    const start = async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      console.log('📷 Screen sharing stream obtained.');
      videoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      console.log('🔧 RTCPeerConnection created (broadcaster).');

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        console.log('➕ Track added:', track.kind);
      });

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          console.log('❄️ Sending ICE candidate from broadcaster:', candidate);
          wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate }));
        }
      };

      wsRef.current.onmessage = async ({ data }) => {
        const message = JSON.parse(data);
        console.log('📬 Message received by broadcaster:', message);

        if (message.type === 'watcher') {
          console.log('👀 Watcher connected. Creating and sending offer...');
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsRef.current.send(JSON.stringify({ type: 'offer', sdp: offer }));
        } else if (message.type === 'answer') {
          console.log('📥 Received answer from watcher.');
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
        } else if (message.type === 'ice-candidate') {
          console.log('❄️ Received ICE candidate from watcher.');
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
      };
    };

    start();
  }, []);

  return (<video ref={videoRef} autoPlay muted playsInline style={{ width: '100vw', height: '100vh' }} />);
}