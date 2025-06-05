// view.js 
import { useEffect, useRef, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { showToast, showLog } from '../components/toastUtils';
import WaveText from '../components/waveText';
import styles from '../styles/view.module.css';
const muteImg = '/images/no-sound.png';

// Firebase v9 (modular) imports
import { initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  push,
  onChildAdded,
  onValue,
  update,
  remove,
  serverTimestamp
} from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export default function View() {
  const videoRef = useRef(null);

  // RTCPeerConnection único
  const peerRef = useRef(null);

  // Firebase
  const appRef = useRef(null);
  const dbRef = useRef(null);

  // ID do viewer (watcher)
  const watcherIdRef = useRef(null);

  // unsubscribe para onChildAdded("/messages/broadcasterToViewers/<watcherId>")
  const childAddedUnsubRef = useRef(null);

  // unsubscribe para onValue("signaling/broadcaster/started")
  const startedUnsubRef = useRef(null);

  // unsubscribe para onValue("signaling/broadcaster")
  const broadcasterUnsubRef = useRef(null);

  // unsubscribe para onValue("signaling/broadcaster/lastPing")
  const pingUnsubRef = useRef(null);

  // Estados de UI
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);

  // Flags para ignorar o primeiro callback do onValue
  const initialStartedLoad = useRef(true);
  const initialBroadcasterLoad = useRef(true);

  // Gera ID para watcher
  const generateWatcherId = () => {
    const db = dbRef.current;
    if (!db) return null;
    const pushRef = push(ref(db, 'signaling/temp'));
    const key = pushRef.key;
    remove(pushRef);
    return key;
  };

  // Cria nó /signaling/viewers/<watcherId> e envia "watcher", e anexa onChildAdded("/messages/broadcasterToViewers/<watcherId>")
  const registerWatcherAndListen = async () => {
    const db = dbRef.current;
    if (!db) return;

    // Cria watcherId se não tiver
    if (watcherIdRef.current) return;

    const newWatcherId = generateWatcherId();
    watcherIdRef.current = newWatcherId;

    // 1) Cria o nó no RTDB
    await set(ref(db, `signaling/viewers/${newWatcherId}`), {
      id: newWatcherId,
      lastSeen: serverTimestamp()
    });
    showLog(`👀 Viewer registrado no RTDB com ID=${newWatcherId}`);

    // 2) Envia "watcher" ao broadcaster
    await push(ref(db, `messages/viewersToBroadcaster/${newWatcherId}`), {
      type: 'watcher'
    });
    showLog('✉️ Enviado "watcher" para broadcaster');

    // 3) Agora que o watcher existe, anexa onChildAdded para receber offer e ice-candidate
    const listenerRef = ref(db, `messages/broadcasterToViewers/${newWatcherId}`);
    const unsubscribe = onChildAdded(listenerRef, async (msgSnap) => {
      const msg = msgSnap.val();
      const key = msgSnap.key;
      showLog('📩 Mensagem do broadcaster → viewer:', msg);

      if (msg.type === 'offer') {
        await handleOffer(msg.sdp);
      } else if (msg.type === 'ice-candidate' && peerRef.current) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
          showLog('✅ ICE candidate do broadcaster adicionado');
        } catch (e) {
          showLog('⚠️ Erro ao adicionar ICE do broadcaster:', e);
        }
      } else {
        showLog('❓ Mensagem desconhecida do broadcaster → viewer:', msg.type);
      }

      // Remove a mensagem para não reprocessar
      await remove(ref(db, `messages/broadcasterToViewers/${newWatcherId}/${key}`));
    });
    childAddedUnsubRef.current = unsubscribe;
  };

  // Lida com offer do broadcaster: cria PeerConnection, envia answer
  const handleOffer = async (sdp) => {
    const db = dbRef.current;
    if (!db) return;
    showLog('📤 Recebendo offer do broadcaster');

    // 1) Cria PeerConnection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerRef.current = pc;

    // 2) ontrack → exibe a stream
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream.getAudioTracks().length > 0) setHasAudio(true);
      if (event.track.kind === 'video') showLog('✅ Conectado à stream');

      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {
          showLog('▶️ Falha ao reproduzir vídeo remoto');
        });
      }
      setIsStreaming(true);
      setStreamEnded(false);
    };

    // 3) onicecandidate → envia ICE ao broadcaster
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const vid = watcherIdRef.current;
        push(ref(db, `messages/viewersToBroadcaster/${vid}`), {
          type: 'ice-candidate',
          candidate: event.candidate.toJSON()
        });
        showLog('❄️ Enviado ICE candidate ao broadcaster');
      }
    };

    // 4) Seta remote description (offer), cria answer e envia
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const vid = watcherIdRef.current;
    await push(ref(db, `messages/viewersToBroadcaster/${vid}`), {
      type: 'answer',
      sdp: answer.sdp
    });
    showLog('📥 Answer enviado ao broadcaster');
  };

  // Limpa tudo quando a stream terminar
  const cleanupAfterStreamEnd = async () => {
    setStreamEnded(true);
    setIsStreaming(false);

    // Cancela listener de onChildAdded("/messages/broadcasterToViewers/<watcherId>")
    if (childAddedUnsubRef.current) {
      childAddedUnsubRef.current();
      childAddedUnsubRef.current = null;
    }
    // Cancela PeerConnection
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    // Remove nó do watcher e mensagens pendentes
    const db = dbRef.current;
    const vid = watcherIdRef.current;
    if (db && vid) {
      await remove(ref(db, `signaling/viewers/${vid}`));
      await remove(ref(db, `messages/viewersToBroadcaster/${vid}`));
      await remove(ref(db, `messages/broadcasterToViewers/${vid}`));
    }
    watcherIdRef.current = null;
  };

  // Habilitar o aúdio
  const handleEnableAudio = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setAudioEnabled(true);
      showToast('🔊 Áudio ativado');
    }
  };

  // Conexão como viewer
  const connectAsViewer = async () => {
    showLog('🔎 Iniciando conexão como viewer (Firebase)');

    // Inicializa Firebase
    if (!appRef.current) {
      const app = initializeApp(firebaseConfig);
      appRef.current = app;
      dbRef.current = getDatabase(app);
    }
    const db = dbRef.current;

    // 1) Listener para "started" em /signaling/broadcaster/started
    const startedRef = ref(db, 'signaling/broadcaster/started');
    const unsubscribeStarted = onValue(startedRef, (snap) => {
      if (initialStartedLoad.current) {
        initialStartedLoad.current = false;
        // Se já estiver true no primeiro load, registramos watcher
        if (snap.val() === true) {
          showToast('🚀 Conectado à stream');
          showLog('🟢 Detectado started=true no primeiro load');
          registerWatcherAndListen();
        }
        return;
      }
      // Nas chamadas seguintes, se virar true, é início agora
      if (snap.val() === true) {
        showToast('🚀 Stream iniciada pelo host');
        showLog('🟢 Stream marcada como ativa pelo broadcaster');
        registerWatcherAndListen();
      }
    });
    startedUnsubRef.current = unsubscribeStarted;

    // 2) Listener para remover `/signaling/broadcaster`
    const broadcasterRef = ref(db, 'signaling/broadcaster');
    const unsubscribeBroadcaster = onValue(broadcasterRef, (snap) => {
      if (initialBroadcasterLoad.current) {
        initialBroadcasterLoad.current = false;
        return;
      }
      if (!snap.exists()) {
        const jaConectado = !!peerRef.current;
        const jaCriouWatcher = !!watcherIdRef.current;
        if (jaConectado || jaCriouWatcher) {
          showToast('✖️ Stream encerrada pelo host');
          cleanupAfterStreamEnd();
        }
      }
    });
    broadcasterUnsubRef.current = unsubscribeBroadcaster;

    // 3) Listener para ping/pong em /signaling/broadcaster/lastPing
    const pingRef = ref(db, 'signaling/broadcaster/lastPing');
    const unsubscribePing = onValue(pingRef, (snap) => {
      const val = snap.val();
      if (val && watcherIdRef.current) {
        update(ref(db, `signaling/viewers/${watcherIdRef.current}`), {
          lastSeen: serverTimestamp()
        });
        showLog('✅ Pong (viewer → RTDB)');
      }
    });
    pingUnsubRef.current = unsubscribePing;
  };

  // Setup e teardown de listeners
  useEffect(() => {
    connectAsViewer();

    return () => {
      // Ao desmontar, limpa tudo
      if (peerRef.current) peerRef.current.close();
      const db = dbRef.current;
      const vid = watcherIdRef.current;
      if (db && vid) {
        remove(ref(db, `signaling/viewers/${vid}`));
        remove(ref(db, `messages/viewersToBroadcaster/${vid}`));
        remove(ref(db, `messages/broadcasterToViewers/${vid}`));
      }
      if (childAddedUnsubRef.current) childAddedUnsubRef.current();
      if (startedUnsubRef.current) startedUnsubRef.current();
      if (broadcasterUnsubRef.current) broadcasterUnsubRef.current();
      if (pingUnsubRef.current) pingUnsubRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className={styles.container}>
        {isStreaming && hasAudio && !audioEnabled && (
          <div className={styles.overlay} onClick={handleEnableAudio}>
            <img src={muteImg} alt="Som desligado" className={styles.muteIcon} />
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          muted={!audioEnabled}
          playsInline
          className={styles.video}
        />

        {!isStreaming && (
          <>
            <div className={styles.poster}>
              <h1 className={styles.heading}>C I M E N A</h1>
              <span className={styles.subHeading}>
                {streamEnded ? <p>Stream encerrada</p> : <WaveText />}
              </span>
            </div>

            <div>
              <svg
                className={styles.waves}
                xmlns="http://www.w3.org/2000/svg"
                xmlnsXlink="http://www.w3.org/1999/xlink"
                viewBox="0 24 150 28"
                preserveAspectRatio="none"
                shapeRendering="auto"
              >
                <defs>
                  <path
                    id="gentle-wave"
                    d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"
                  />
                </defs>
                <g className={styles.parallax}>
                  <use xlinkHref="#gentle-wave" x="48" y="0" fill="rgba(90, 197, 241, 1)" />
                  <use xlinkHref="#gentle-wave" x="48" y="3" fill="rgba(37, 151, 213, 1)" />
                  <use xlinkHref="#gentle-wave" x="48" y="5" fill="rgba(17, 107, 180, 1)" />
                  <use xlinkHref="#gentle-wave" x="48" y="7" fill="rgba(21, 71, 139, 1)" />
                </g>
              </svg>
            </div>

            <div className={styles.fill}></div>
          </>
        )}
      </div>

      <ToastContainer />
    </>
  );
}