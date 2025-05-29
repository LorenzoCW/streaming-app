// share.js
import { useRef, useState, useEffect } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { showToast, showLog } from '../components/toastUtils';
import styles from '../styles/share.module.css';

export default function Share() {
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const wsRef = useRef();
  const peers = useRef({});
  const streamRef = useRef(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connections, setConnections] = useState([]);
  const [isWideScreen, setIsWideScreen] = useState(true);
  const [buttonsDisabled, setButtonsDisabled] = useState(false);

  const updateConnections = () => {
    const wsConnected = wsRef.current && wsRef.current.readyState === WebSocket.OPEN
      ? [{ type: 'Host', id: 'Você' }]
      : [];

    const activeConnections = [...wsConnected, ...Object.keys(peers.current).map(id => ({ type: 'Viewer', id }))];
    setConnections(activeConnections);
  };

  const startStreaming = () => {
    if (isStreaming || buttonsDisabled) return;
    disableButtonsTemporarily();
    showLog('Starting broadcaster handshake...');

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      showLog('WebSocket connected (broadcaster).');
      wsRef.current.send(JSON.stringify({ type: 'broadcaster' }));
      updateConnections();
    };

    wsRef.current.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      showLog('Message received by broadcaster:', msg);

      if (msg.type === 'error' && msg.code === 'BROADCASTER_EXISTS') {
        showToast('❌ ' + msg.message);
        wsRef.current.close();
        return;
      }

      if (msg.type === 'broadcaster-accepted') {
        showLog('Broadcaster accepted, starting screen sharing...');
        await beginStreaming();
        return;
      }

      handleSignalingMessage(msg);
    };
  };

  const beginStreaming = async () => {
    showLog('Capturing screen and audio...');

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (err) {
      showToast('❌ Compartilhamento de tela cancelado');
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
      setConnections([]);
      setIsStreaming(false);
      return;
    }

    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    setIsStreaming(true);
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

    // snapshots
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

  const handleSignalingMessage = async (msg) => {
    if (msg.type === 'watcher') {
      const id = msg.id;
      const pc = new RTCPeerConnection();
      peers.current[id] = pc;
      showLog('New RTCPeerConnection created.');

      const localStream = streamRef.current;
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
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
    }

    else if (msg.type === 'answer') {
      showLog('Received answer from watcher.');
      const pc = peers.current[msg.id];
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    }

    else if (msg.type === 'ice-candidate') {
      showLog('Received ICE candidate from watcher.');
      const pc = peers.current[msg.id];
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
  };

  const handleStop = () => {
    if (!isStreaming || buttonsDisabled) return;
    disableButtonsTemporarily();
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

  const disableButtonsTemporarily = () => {
    setButtonsDisabled(true);
    setTimeout(() => {
      setButtonsDisabled(false);
    }, 6000);
  };


  // cleanup on unmount
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
    <div className={styles.container}>

      {/* Side Panel */}
      <div className={`${styles.sidePanel} ${isStreaming ? styles.sidePanelActive : ''}`}>
        {isStreaming > 0 && (
          <>
            <h2 style={{ marginTop: 0 }}>Conexões Ativas</h2>
            <ul style={{ listStyleType: 'none', padding: 0 }}>
              {connections.map((conn, index) => (
                <li key={index} style={{ fontSize: '1.2rem' }}>
                  {conn.type === 'Host' ? '🎥 ' : '👀 '} {conn.type}: {conn.id}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Main Content */}
      <div className={`${styles.mainContent} ${isWideScreen ? styles.mainContentShifted : ''}`}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerTitleWrapper}>
              <h1 className={styles.headerTitle}>C I M E N A</h1>
              <span className={styles.headerSubtitle}>S t u d i o</span>
            </div>
          </div>
        </div>

        {/* Preview Container */}
        <div className={styles.previewContainer}>
          <div className={`${styles.statusBadge} ${isStreaming ? styles.statusBadgeActive : ''}`}>
            <span>{isStreaming ? '🟢 Transmissão ativa' : '🔴 Transmissão parada'}</span>
          </div>

          {/* Loading Overlay */}
          {isStreaming && !imageLoaded && (
            <div className={styles.loadingOverlay}>Iniciando pré-visualização...</div>
          )}

          <video ref={videoRef} muted playsInline style={{ display: 'none' }} />
          <img ref={imageRef} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: imageLoaded ? 'block' : 'none' }} />
        </div>

        {/* Controls */}
        <div>
          {isStreaming ? (
            <button onClick={handleStop} disabled={buttonsDisabled} className={styles.stopButton}>
              Parar Stream
            </button>
          ) : (
            <button onClick={startStreaming} disabled={buttonsDisabled} className={styles.startButton}>
              Iniciar Stream
            </button>
          )}
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}