// share.js
import { useRef, useState, useEffect } from 'react';
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
  const [connections, setConnections] = useState([]);
  const [isWideScreen, setIsWideScreen] = useState(false);

  const updateConnections = () => {
    const wsConnected = wsRef.current && wsRef.current.readyState === WebSocket.OPEN
      ? [{ type: 'Broadcaster', id: 'Host' }]
      : [];

    const activeConnections = [...wsConnected, ...Object.keys(peers.current).map(id => ({ type: 'Viewer', id }))];
    setConnections(activeConnections);
  };

  const startStreaming = async () => {
    if (isStreaming) return;
    setIsStreaming(true);
    showLog('Starting broadcast...');

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      showLog('WebSocket connected (broadcaster).');
      wsRef.current.send(JSON.stringify({ type: 'broadcaster' }));
      updateConnections();
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

    stream.getTracks().forEach(track => track.onended = handleStop);

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
            delete peers.current[id];
            updateConnections();
            showToast(`🔌 Espectador desconectado: ${id}`);
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

        showToast(`👀 Espectador conectado: ${id}`);
        updateConnections();

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

    // Canvas para snapshots
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
    peers.current = {};
    setImageLoaded(false);
    setConnections([]);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsWideScreen(window.innerWidth > 1500);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#0F0F0F',
        display: 'flex',
        fontFamily: 'sans-serif'
      }}
    >

      {/* Side Panel */}
      <div
        style={{
          width: '250px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          padding: '1rem',
          boxShadow: '2px 0 8px rgba(0,0,0,0.7)',
          fontFamily: 'sans-serif',
          position: 'relative',
          transform: connections.length > 0 ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease-out'
        }}
      >
        {connections.length > 0 && (
          <>
            <h2 style={{ marginTop: 0 }}>Conexões Ativas</h2>
            <ul style={{ listStyleType: 'none', padding: 0 }}>
              {connections.map((conn, index) => (
                <li key={index} style={{ fontSize: '1.2rem' }}>
                  {conn.type === 'Broadcaster' ? '🎥 ' : '👀 '} {conn.type}: {conn.id}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Main Content */}
      <div
        style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: isWideScreen ? 'translateX(-125px)' : 'none'
        }}
      >

        {/* Header */}
        <div
          style={{
            width: '90%',
            maxWidth: '960px',
            position: 'relative',
            borderRadius: '30px 30px 0 0',
            color: '#ffffff',
            textShadow: '0 2px 8px rgba(0,0,0,0.7)',
            background: 'linear-gradient(to right, #00d2ff, #3a7bd5)',
            padding: '2px'
          }}
        >
          <div style={{
            borderRadius: '28px 28px 0 0',
            background: 'linear-gradient(to right, #00d2ff, #3a7bd5)',
            padding: '20px',
            textAlign: 'center'
          }}
          >
            <div style={{ paddingBottom: '20px' }}>
              <h1 style={{ fontSize: '8rem', margin: 0, fontFamily: 'monospace' }}>C I M E N A</h1>
              <span style={{ fontSize: '2.5rem', fontFamily: 'sans-serif' }}>S t u d i o</span>
            </div>
          </div>
        </div>

        {/* Preview Container */}
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

          {/* Status Badge */}
          <div
            style={{
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
            }}
          >
            <span
              style={{
                fontSize: '15px',
                fontWeight: '700',
                color: '#ffffff',
                transition: 'color 0.3s'
              }}
            >
              {isStreaming ? '🟢 Transmissão ativa' : '🔴 Transmissão parada'}
            </span>
          </div>

          {/* Loading Overlay */}
          {isStreaming && !imageLoaded && (
            <div style={{
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

          {/* Hidden Video for capture */}
          <video ref={videoRef} muted playsInline style={{ display: 'none' }} />

          {/* Preview Image */}
          <img ref={imageRef} alt="Preview" style={{ display: imageLoaded ? 'block' : 'none', width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {/* Controls */}
        <div style={{ marginTop: '20px' }}>
          <div>
            <style>
              {`
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
                animation: start-pulse 1.5s infinite
              }

              @keyframes start-pulse {
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
            `}
            </style>
            {!isStreaming && <button onClick={startStreaming} className='start-button'>Iniciar Stream</button>}
          </div>

          <div>
            <style>
              {`
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
                animation: stop-pulse 1.5s infinite;
              }

              @keyframes stop-pulse {
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
          `}
            </style>
            {isStreaming && <button onClick={handleStop} className='stop-button'>Parar Stream</button>}
          </div>
        </div>

      </div>
      <ToastContainer />
    </div>
  );
}