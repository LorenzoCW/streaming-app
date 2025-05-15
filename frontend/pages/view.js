import { useEffect, useRef } from 'react';

export default function View() {
  const videoRef = useRef();
  const peerRef = useRef();
  const wsRef = useRef();

  useEffect(() => {
    console.log('📡 Connecting to signaling server as viewer...');
    wsRef.current = new WebSocket('ws://localhost:4000');

    wsRef.current.onopen = () => {
      console.log('✅ WebSocket connection opened (viewer).');
      wsRef.current.send(JSON.stringify({ type: 'watcher' }));
    };

    const pc = new RTCPeerConnection();
    peerRef.current = pc;
    console.log('🔧 RTCPeerConnection created (viewer).');

    pc.ontrack = event => {
      console.log('📺 Received media stream from broadcaster.');
      videoRef.current.srcObject = event.streams[0];
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log('❄️ Sending ICE candidate from viewer:', candidate);
        wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate }));
      }
    };

    wsRef.current.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      console.log('📬 Message received by viewer:', message);

      if (message.type === 'offer') {
        console.log('📥 Received offer from broadcaster.');
        await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsRef.current.send(JSON.stringify({ type: 'answer', sdp: answer }));
        console.log('📤 Sent answer to broadcaster.');
      } else if (message.type === 'ice-candidate') {
        console.log('❄️ Received ICE candidate from broadcaster.');
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      }
    };
  }, []);

  return (<video ref={videoRef} autoPlay controls style={{ width: '100vw', height: '100vh' }} />);
}
