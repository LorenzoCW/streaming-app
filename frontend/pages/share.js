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
    streamRef.current?._cleanup();

    // stop media tracks
    streamRef.current?.getTracks().forEach(track => track.stop());
    wsRef.current.close();
    wsRef.current = null;
    setImageLoaded(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#212121',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif'
      }}
    >

      <div
        style={{
          width: '90%',
          maxWidth: '960px',
          border: '2px solid transparent',
          borderImage: 'linear-gradient(45deg, #00d2ff, #3a7bd5) 2',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          color: '#ffffff',
          textShadow: '0 2px 8px rgba(0,0,0,0.7)',
          background: 'linear-gradient(to right, #00d2ff, #3a7bd5)'
        }}
      >
        <div style={{ paddingBottom: '20px' }}>
          <h1 style={{ fontSize: '8rem', margin: 0, fontFamily: 'monospace' }}>C I M E N A</h1>
          <span style={{ fontSize: '2.5rem', fontFamily: 'sans-serif' }}>S t u d i o</span>
        </div>
      </div>

      {/* Container da prévia */}
      <div
        style={{
          position: 'relative',
          width: '90%',
          maxWidth: '960px',
          aspectRatio: '16/9',
          border: '2px solid transparent',
          borderImage: 'linear-gradient(45deg, #00d2ff, #3a7bd5) 2',
          overflow: 'hidden',
          backgroundColor: '#000'
        }}
      >

        {/* Status */}
        <div style={{
          marginTop: '0.5rem',
          marginLeft: '0.5rem',
          position: 'absolute',
          color: '#fff',
          fontSize: '15px',
          fontWeight: '600',
          textAlign: 'center',
          padding: '0.5rem 1rem',
          borderRadius: '10px',
          background: !isStreaming ? 'linear-gradient(45deg, #ff0000, #ff305d)' : 'linear-gradient(45deg, #2c3e50, #34495e)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          transition: 'background 0.3s, color 0.3s',
          opacity: '90%',
          zIndex: 10
        }}>
          <span style={{
            fontSize: '15px',
            fontWeight: '700',
            color: isStreaming ? '#fffae6' : '#ecf0f1',
            transition: 'color 0.3s',
          }}>
            {isStreaming ? '🟢 Transmissão ativa' : '🔴 Transmissão parada'}
          </span>
        </div>

        {/* Texto de loading */}
        {isStreaming && !imageLoaded && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#666',
              fontSize: '1.5rem',
              backgroundColor: 'rgba(255,255,255,0.1)',
              zIndex: 10
            }}
          >
            Iniciando pré-visualização...
          </div>
        )}

        {/* Vídeo escondido */}
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ display: 'none' }}
        />

        {/* Imagem responsiva */}
        <img
          ref={imageRef}
          alt="Preview"
          style={{
            display: imageLoaded ? 'block' : 'none',
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      </div>

      {/* Botão */}
      <div style={{ marginTop: '20px' }}>
        <div>
          <style>{`
          .start-button {
            border: none;
            color: #fff;
            background-image: linear-gradient(30deg, #0400ff, #4ce3f7);
            border-radius: 20px;
            background-size: 100% auto;
            font-family: inherit;
            font-size: 17px;
            padding: 0.6em 1.5em;
            cursor: pointer;
            transition: background-size 0.3s ease, box-shadow 1.5s ease;
            background-position: right center;
            background-size: 200% auto;
            animation: pulse512 1.5s infinite
          }

          @keyframes pulse512 {
            0% {
              box-shadow: 0 0 0 0 #05bada66;
            }
            70% {
              box-shadow: 0 0 0 10px rgb(218 103 68 / 0%);
            }
            100% {
              box-shadow: 0 0 0 0 rgb(218 103 68 / 0%);
            }
          }
          `}</style>
          {!isStreaming && <button onClick={startStreaming} className='start-button'>
            Iniciar Stream
          </button>}
        </div>

        <div>
          <style>{`
          .stop-button {
            border: none;
            color: #fff;
            background-image: linear-gradient(30deg, #ff0000, #ff305d);
            border-radius: 20px;
            background-size: 100% auto;
            font-family: inherit;
            font-size: 17px;
            padding: 0.6em 1.5em;
            cursor: pointer;
            transition: background-size 0.3s, background-position 0.3s;
          }

          .stop-button:hover {
            background-position: right center;
            background-size: 200% auto;
            animation: pulse513 1.5s infinite;
          }

          @keyframes pulse513 {
            0% {
              box-shadow: 0 0 0 0 #ff4d4d;
            }
            70% {
              box-shadow: 0 0 0 10px rgb(255 0 0 / 30%);
            }
            100% {
              box-shadow: 0 0 0 0 rgb(255 0 0 / 30%);
            }
          }
      `}</style>
          {isStreaming && <button onClick={handleStop} className='stop-button'>
            Parar Stream
          </button>}
        </div>
      </div>

      <ToastContainer />
    </div >
  );
}