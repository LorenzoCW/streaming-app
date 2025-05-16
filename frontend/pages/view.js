import { useEffect, useRef, useState } from 'react';

export default function View() {
  const videoRef = useRef();
  const peerRef = useRef();
  const wsRef = useRef();
  const [audioEnabled, setAudioEnabled] = useState(false);

  useEffect(() => {
    wsRef.current = new WebSocket('ws://localhost:4000');

    // create peer connection and handlers before signaling
    const pc = new RTCPeerConnection();
    peerRef.current = pc;

    pc.ontrack = event => {
      videoRef.current.srcObject = event.streams[0];
      videoRef.current.onloadedmetadata = () => {
        // ensure playback starts automatically
        videoRef.current.play().catch(err => console.warn('Playback was prevented:', err));
      };
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate }));
    };

    wsRef.current.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsRef.current.send(JSON.stringify({ type: 'answer', sdp: answer }));
      } else if (message.type === 'ice-candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      }
    };

    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({ type: 'watcher' }));
    };
  }, []);

  const handleEnableAudio = () => {
    videoRef.current.muted = false;
    setAudioEnabled(true);
  };

  return (
    <div>
      {!audioEnabled && (
        <button
          onClick={handleEnableAudio}
          style={{ position: 'absolute', zIndex: 10 }}
        >
          Ativar áudio
        </button>
      )}
      <video
        ref={videoRef}
        autoPlay
        muted={!audioEnabled}
        playsInline
        style={{ width: '100vw', height: '100vh' }}
      />
    </div>
  );
}