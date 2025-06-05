// share.js
import { useRef, useState, useEffect } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { showToast, showLog } from '../components/toastUtils';
import styles from '../styles/share.module.css';

import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  push,
  onChildAdded,
  update,
  remove,
  serverTimestamp,
  get,
  onDisconnect
} from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export default function Share() {
  const videoRef = useRef(null);
  const imageRef = useRef(null);

  // Firebase app e banco
  const appRef = useRef(null);
  const dbRef = useRef(null);

  // Mapeia viewerId → RTCPeerConnection
  const peers = useRef({});

  // Guarda o stream local (getDisplayMedia)
  const streamRef = useRef(null);

  // ID do broadcaster atual
  const broadcasterIdRef = useRef(null);

  // Intervalos de ping/pong e timer
  const heartbeatIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Funções de cancelamento de assinatura para os ouvintes do Firebase
  const watchersListenerRef = useRef(null);
  const beforeUnloadListenerRef = useRef(null);

  // Estados para UI
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connections, setConnections] = useState([]);
  const [isWideScreen, setIsWideScreen] = useState(true);
  const [buttonsDisabled, setButtonsDisabled] = useState(false);

  // Atualiza lista de conexões (host + viewers)
  const updateConnections = () => {
    const hostEntry = broadcasterIdRef.current
      ? [{ type: 'Host', id: broadcasterIdRef.current }]
      : [];

    const viewerEntries = Object.keys(peers.current).map(id => ({
      type: 'Viewer',
      id
    }));

    setConnections([...hostEntry, ...viewerEntries]);
  };

  // Responsividade
  useEffect(() => {
    const handleResize = () => {
      setIsWideScreen(window.innerWidth > 1500);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Ping/Pong enquanto transmitindo
  useEffect(() => {
    if (isStreaming) {
      heartbeatIntervalRef.current = setInterval(() => {
        const db = dbRef.current;
        if (!db) return;
        const bRef = ref(db, "signaling/broadcaster");
        update(bRef, { lastPing: serverTimestamp() });
        showLog('✉️ Ping (broadcaster → RTDB)');
        checkViewersAlive();
      }, 30000);
    }
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [isStreaming]);

  // Remove viewers offline
  const checkViewersAlive = async () => {
    const db = dbRef.current;
    if (!db) return;
    const viewersSnap = await get(ref(db, "signaling/viewers"));
    if (!viewersSnap.exists()) return;

    const agora = Date.now();
    const viewers = viewersSnap.val();
    for (const [vid, data] of Object.entries(viewers)) {
      if (!data.lastSeen || agora - data.lastSeen > 40000) {
        showLog(`❌ Viewer ${vid} não respondeu a tempo, removendo`);
        remove(ref(db, `signaling/viewers/${vid}`));
        const entry = peers.current[vid];
        if (entry && entry.pc) entry.pc.close();
        delete peers.current[vid];
      }
    }
    updateConnections();
  };

  // Gera ID aleatório para broadcaster
  const generateBroadcasterId = () => {
    const db = dbRef.current;
    if (!db) return null;
    const pushRef = push(ref(db, "signaling/temp"));
    const key = pushRef.key;
    remove(pushRef);
    return key;
  };

  // Desabilita botões por 6s
  const disableButtonsTemporarily = () => {
    setButtonsDisabled(true);
    setTimeout(() => setButtonsDisabled(false), 6000);
  };

  // Iniciar stream
  const startStreaming = async () => {
    if (isStreaming || buttonsDisabled) return;
    disableButtonsTemporarily();
    showLog('🟢 Iniciando handshake do broadcaster com Firebase...');

    // Inicializa Firebase
    if (!appRef.current) {
      const app = initializeApp(firebaseConfig);
      appRef.current = app;
      dbRef.current = getDatabase(app);
    }
    const db = dbRef.current;

    // Gera broadcasterId e verifica se há um broadcaster ativo
    const newBroadcasterId = generateBroadcasterId();
    broadcasterIdRef.current = newBroadcasterId;
    const bRef = ref(db, "signaling/broadcaster");

    onDisconnect(bRef).remove();

    // Checa se broadcaster existe e está ativo
    const snapshotB = await get(bRef);
    if (snapshotB.exists()) {
      const data = snapshotB.val();
      const STALE_THRESHOLD = 60000;
      const lastPing = data.lastPing || STALE_THRESHOLD + 1;

      if (Date.now() - lastPing > STALE_THRESHOLD) {
        await remove(bRef);
      } else {
        showToast('🚫 Já existe um broadcaster ativo no momento.');
        broadcasterIdRef.current = null;
        return;
      }
    }

    // Captura de mídia
    let stream;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new TypeError();
      }
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (err) {
      switch (err.name) {
        case 'NotAllowedError':
          showToast('⏸️ Compartilhamento de tela cancelado');
          break;
        case 'TypeError':
          showToast('📵 Compartilhamento de tela não suportado em dispositivos móveis');
          break;
        default:
          showToast('❌ Erro ao compartilhar tela:', err.name);
          break;
      }
      await remove(ref(db, "signaling/broadcaster"));
      broadcasterIdRef.current = null;
      setIsStreaming(false);
      setConnections([]);
      return;
    }

    // Guarda e exibe preview
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    setIsStreaming(true);
    showToast('⏺️ Stream sendo transmitida');

    // Cria o nó em "/signaling/broadcaster" com started=false e lastPing
    await set(bRef, {
      id: newBroadcasterId,
      started: false,
      lastPing: serverTimestamp()
    });
    showLog(`🎥 Broadcaster registrado no RTDB com ID=${newBroadcasterId}`);

    // Anexa o listener de viewers
    const watchersPath = ref(db, "messages/viewersToBroadcaster");
    const unsubscribeWatchers = onChildAdded(watchersPath, (viewerSnap) => {
      const vid = viewerSnap.key;
      const childPath = `messages/viewersToBroadcaster/${vid}`;
      // Cada vez que um watcher chega, anexa outro onChildAdded para as mensagens deste watcher
      const unsubscribeInner = onChildAdded(ref(db, childPath), (msgSnap) => {
        const msg = msgSnap.val();
        const msgKey = msgSnap.key;
        handleMessageFromViewer(vid, msg, msgKey);
      });
      // Guarda o unsubscribe do childPath dentro de peers.current[vid], para limpar depois
      peers.current[vid] = {
        ...peers.current[vid],
        unsubscribeInner
      };
    });
    watchersListenerRef.current = unsubscribeWatchers;

    // Define started = true, sinalizando ao viewer que pode enviar "watcher"
    await update(bRef, { started: true });
    showLog('▶️ Broadcast iniciado (started → true)');

    // Inicia cronômetro
    const now = Date.now();
    setStartTime(now);
    setElapsedTime(0);
    timerIntervalRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - now) / 1000));
    }, 1000);

    // Avisa se não houver áudio
    const hasAudio = stream.getAudioTracks().length > 0;
    if (!hasAudio) {
      showToast('🔇 A stream está silenciada');
    }

    // Se qualquer track terminar, para a stream
    stream.getTracks().forEach(track => (track.onended = handleStop));

    // Loop de snapshots para o <img> de preview
    const hiddenVideo = videoRef.current;
    hiddenVideo.play().catch(() => { });
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

    updateConnections();

    // Função para processar cada mensagem de um viewer (watcher, answer, ice-candidate)
    async function handleMessageFromViewer(vid, msg, msgKey) {
      if (!dbRef.current) return;
      showLog('🟣 Mensagem de viewer → broadcaster:', vid, msg);

      // Se não há entry para este vid, inicializa
      if (!peers.current[vid]) {
        peers.current[vid] = { pc: null, answeredOnce: false, unsubscribeInner: null };
      }

      switch (msg.type) {
        case 'watcher':
          // Viewer solicitou conexão: cria RTCPeerConnection
          await setupPeerConnectionForViewer(vid);
          break;

        case 'answer':
          // Viewer enviou answer (SDP)
          const entry = peers.current[vid];
          if (entry?.pc && !entry.answeredOnce && entry.pc.signalingState === "have-local-offer") {
            try {
              await entry.pc.setRemoteDescription(
                new RTCSessionDescription({ type: "answer", sdp: msg.sdp })
              );
              entry.answeredOnce = true;
              showLog(`✅ Answer aplicado para viewer ${vid}`);
            } catch (e) {
              showLog('⚠️ Falha ao aplicar answer:', e);
            }
          } else {
            showLog(`⚠️ Ignorando answer de ${vid}: sinalState=${entry.pc?.signalingState} ou já aplicado`);
          }
          break;

        case 'ice-candidate':
          // Viewer enviou ICE candidate
          const entry2 = peers.current[vid];
          if (entry2?.pc) {
            try {
              await entry2.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              showLog(`❄️ ICE candidate adicionado para viewer ${vid}`);
            } catch (e) {
              showLog('⚠️ Erro ao adicionar ICE do viewer:', e);
            }
          }
          break;

        default:
          showLog('❓ Mensagem desconhecida do viewer:', msg.type);
          break;
      }

      // Remove essa mensagem para não processar de novo
      await remove(ref(dbRef.current, `messages/viewersToBroadcaster/${vid}/${msgKey}`));
      updateConnections();
    }

    // Configura RTCPeerConnection para um viewer específico
    async function setupPeerConnectionForViewer(vid) {
      if (!dbRef.current) return;
      showLog(`▶️ Setup RTCPeerConnection para viewer ${vid}`);

      const rtcPeer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      peers.current[vid].pc = rtcPeer;
      peers.current[vid].answeredOnce = false;

      // Adiciona as tracks da nossa stream local
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          rtcPeer.addTrack(track, streamRef.current);
          showLog('🔊 Faixa local adicionada:', track.kind);
        });
      }

      // onicecandidate → envia ICE candidate ao viewer via RTDB
      rtcPeer.onicecandidate = (event) => {
        if (event.candidate) {
          push(ref(dbRef.current, `messages/broadcasterToViewers/${vid}`), {
            type: "ice-candidate",
            candidate: event.candidate.toJSON()
          });
          showLog(`❄️ Enviado ICE candidate ao viewer ${vid}`);
        }
      };

      // Cria offer/local description
      const offer = await rtcPeer.createOffer();
      await rtcPeer.setLocalDescription(offer);

      // Envia offer via RTDB
      push(ref(dbRef.current, `messages/broadcasterToViewers/${vid}`), {
        type: "offer",
        sdp: offer.sdp
      });
      showLog(`📤 Offer enviado ao viewer ${vid}`);
      updateConnections();
    }

    // Se o host fechar ou mudar de página, limpa tudo
    const beforeUnloadHandler = async () => {
      if (dbRef.current) {
        await remove(ref(dbRef.current, "signaling/broadcaster"));
        await remove(ref(dbRef.current, "messages/broadcasterToViewers"));
      }
      // Fecha todas as conexões
      Object.values(peers.current).forEach(entry => {
        if (entry.pc) entry.pc.close();
      });
      peers.current = {};
    };
    window.addEventListener("beforeunload", beforeUnloadHandler);
    beforeUnloadListenerRef.current = beforeUnloadHandler;
  };

  // Parar stream
  const handleStop = async () => {
    if (!isStreaming || buttonsDisabled) return;
    disableButtonsTemporarily();
    setIsStreaming(false);

    // Mostra toast com duração
    if (startTime) {
      const totalMs = Date.now() - startTime;
      const totalSeconds = Math.floor(totalMs / 1000);
      showToast(`⏹️ Stream encerrada (⏱️ ${formatSeconds(totalSeconds)})`);
    } else {
      showToast('⏹️ Stream encerrada');
    }

    // Limpa timer e ping
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    // Limpa snapshots
    if (streamRef.current?._cleanup) {
      streamRef.current._cleanup();
    }
    // Para todas as tracks
    streamRef.current?.getTracks().forEach(track => track.stop());

    // Fecha todas as peerConnections e limpa os unsubscribe internos
    for (const [vid, entry] of Object.entries(peers.current)) {
      if (entry.pc) entry.pc.close();
      // Se havia um unsubscribe para onChildAdded("messages/broadcasterToViewers/")+`${vid}`, limpa
      if (entry.unsubscribeInner) {
        entry.unsubscribeInner();
      }
    }
    peers.current = {};

    // Remove nós no RTDB
    if (dbRef.current) {
      await remove(ref(dbRef.current, "signaling/broadcaster"));
      await remove(ref(dbRef.current, "messages/broadcasterToViewers"));
      // Remove também o listener de onChildAdded("messages/viewersToBroadcaster")
      if (watchersListenerRef.current) {
        watchersListenerRef.current();
        watchersListenerRef.current = null;
      }
    }

    broadcasterIdRef.current = null;
    setConnections([]);
    setImageLoaded(false);
    setStartTime(null);
    setElapsedTime(0);

    // Remove o event listener do window.beforeunload
    if (beforeUnloadListenerRef.current) {
      window.removeEventListener("beforeunload", beforeUnloadListenerRef.current);
      beforeUnloadListenerRef.current = null;
    }
  };

  // Cleanup geral quando o componente desmonta
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      // Fecha conexões e tracks
      Object.values(peers.current).forEach(entry => {
        if (entry.pc) entry.pc.close();
        if (entry.unsubscribeInner) entry.unsubscribeInner();
      });
      streamRef.current?.getTracks().forEach(track => track.stop());
      // Remove listeners de Firebase
      if (watchersListenerRef.current) watchersListenerRef.current();
      if (beforeUnloadListenerRef.current) {
        window.removeEventListener("beforeunload", beforeUnloadListenerRef.current);
      }
    };
  }, []);

  function formatSeconds(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  return (
    <div className={styles.container}>
      {/* Side Panel */}
      <div className={`${styles.sidePanel} ${isStreaming ? styles.sidePanelActive : ''}`}>
        {isStreaming && (
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
            <span style={{ textAlign: 'left', display: 'flex' }}>
              {isStreaming ? '🟢 Transmissão ativa' : '🔴 Transmissão parada'}
            </span>
            {isStreaming && (
              <div style={{ marginTop: '0.5rem', marginLeft: '2px' }}>
                ⏱️ Tempo de stream: {formatSeconds(elapsedTime)}
              </div>
            )}
          </div>

          {/* Loading Overlay */}
          {isStreaming && !imageLoaded && (
            <div className={styles.loadingOverlay}>Iniciando pré-visualização...</div>
          )}

          <video ref={videoRef} muted playsInline style={{ display: 'none' }} />
          <img
            ref={imageRef}
            alt="Preview"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: imageLoaded ? 'block' : 'none'
            }}
          />
        </div>

        {/* Controls */}
        <div>
          {isStreaming ? (
            <button
              onClick={handleStop}
              disabled={buttonsDisabled}
              className={styles.stopButton}
            >
              Parar Stream
            </button>
          ) : (
            <button
              onClick={startStreaming}
              disabled={buttonsDisabled}
              className={styles.startButton}
            >
              Iniciar Stream
            </button>
          )}
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}