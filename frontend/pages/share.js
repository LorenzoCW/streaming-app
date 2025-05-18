// share.js
import { useRef, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { showToast, showLog } from '../components/toastUtils';

export default function Share() {
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const wsRef = useRef();
  const peers = useRef({});
  const streamRef = useRef(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const startStreaming = async () => {
    if (isStreaming) return;
    setIsStreaming(true);
    showLog('Starting broadcast...');

    wsRef.current = new WebSocket('ws://localhost:4000');

    wsRef.current.onopen = () => {
      showLog('WebSocket connected (broadcaster).');
      wsRef.current.send(JSON.stringify({ type: 'broadcaster' }));
    };

    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    showToast('⏺️ Stream sendo transmitida');

    const hasAudio = stream.getAudioTracks().length > 0;
    if (!hasAudio) {
      showToast('🔇 A stream está silenciada');
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start' }));
    }

    stream.getTracks().forEach(track => {
      track.onended = () => handleStop();
    });

    const hiddenVideo = videoRef.current;
    hiddenVideo.srcObject = stream;
    hiddenVideo.play();

    wsRef.current.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      showLog('Message received by broadcaster:', msg);

      if (msg.type === 'watcher') {
        const id = msg.id;
        const pc = new RTCPeerConnection();
        peers.current[id] = pc;
        showLog('New RTCPeerConnection created.');

        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
          showLog('Faixa adicionada: ' + track.kind);
        });

        pc.onconnectionstatechange = () => {
          if (['disconnected', 'closed'].includes(pc.connectionState)) {
            showToast('🔌 Espectador desconectado:', id);
          }
        };

        pc.onicecandidate = ({ candidate }) => {
          if (candidate) {
            showLog('Sending ICE candidate from broadcaster:', candidate);
            wsRef.current.send(JSON.stringify({ type: 'ice-candidate', id, candidate }));
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsRef.current.send(JSON.stringify({ type: 'offer', id, sdp: offer }));

        showToast('👀 Espectador conectado:', id);

      } else if (msg.type === 'answer') {
        showLog('Received answer from watcher.');
        const pc = peers.current[msg.id];
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

      } else if (msg.type === 'ice-candidate') {
        showLog('Received ICE candidate from watcher.');
        const pc = peers.current[msg.id];
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    };

    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');

    const intervalId = setInterval(() => {
      if (hiddenVideo.readyState >= 2) {
        ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
        imageRef.current.src = canvas.toDataURL('image/png');
        setImageLoaded(true);
      }
    }, 5000);

    streamRef.current._cleanup = () => clearInterval(intervalId);
  };

  const handleStop = () => {
    if (!isStreaming) return;
    setIsStreaming(false);
    showToast('⏹️ Stream encerrada');

    // cleanup snapshot loop
    streamRef.current._cleanup();

    // stop media tracks
    streamRef.current.getTracks().forEach(track => track.stop());
    wsRef.current.close();
    wsRef.current = null;
    setImageLoaded(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={startStreaming} disabled={isStreaming} style={{ marginRight: '0.5rem' }}>
          Iniciar Transmissão
        </button>
        <button onClick={handleStop} disabled={!isStreaming}>
          Parar Transmissão
        </button>
      </div>
      <div style={{ marginBottom: '1rem' }}>Status: {isStreaming ? 'Transmissão ativa' : 'Transmissão parada'}</div>

      <video ref={videoRef} muted playsInline style={{ display: 'none' }} />
      {isStreaming && !imageLoaded && <div style={{ fontSize: '1.5rem', color: '#666' }}>Iniciando pré-visualização...</div>}
      <img ref={imageRef} style={{ display: imageLoaded ? 'block' : 'none', width: '960px', height: '540px', objectFit: 'cover' }} />
      <ToastContainer />
    </div>
  );
}