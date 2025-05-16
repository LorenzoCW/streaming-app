import { useEffect, useRef } from 'react';

export default function Share() {
  const videoRef = useRef();
  const peerRef = useRef();
  const wsRef = useRef();

  useEffect(() => {
    wsRef.current = new WebSocket('ws://localhost:4000');
    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({ type: 'broadcaster' }));
    };

    const start = async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      videoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection();
      peerRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate }));
      };

      wsRef.current.onmessage = async ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === 'watcher') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsRef.current.send(JSON.stringify({ type: 'offer', sdp: offer }));
        } else if (message.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
        } else if (message.type === 'ice-candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
      };
    };

    start();
  }, []);

  return (<video ref={videoRef} autoPlay muted playsInline style={{ width: '100vw', height: '100vh' }} />);
}