// view.js
import { useEffect, useRef, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { showToast, showLog } from '../components/toastUtils';
import WaveText from '../components/waveText';
const backgroundImg = '/images/background.png';
const muteImg = '/images/no-sound.png';
import styles from '../styles/view.module.css';

export default function View() {
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const wsRef = useRef(null);
  const watcherIdRef = useRef(null);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);

  const connect = () => {
    showLog('Connecting to signaling server as viewer...');
    setHasAudio(false);

    if (wsRef.current) wsRef.current.close();
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
    wsRef.current = new WebSocket(wsUrl);
    showLog('RTCPeerConnection created (viewer).');

    wsRef.current.onopen = () => {
      showLog('Connected to server (viewer).');
      wsRef.current.send(JSON.stringify({ type: 'watcher' }));
    };

    wsRef.current.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      showLog('Message received by viewer:', msg);

      try {
        if (msg.type === 'start') {
          showLog('Stream iniciada pelo host.');
          return connect();
        }

        else if (msg.type === 'offer') {
          showLog('Received offer from broadcaster.');

          watcherIdRef.current = msg.id;
          const pc = new RTCPeerConnection();
          peerRef.current = pc;

          pc.ontrack = event => {
            const stream = event.streams[0];
            if (stream.getAudioTracks().length > 0) {
              setHasAudio(true);
            }

            if (event.track.kind === 'video') showToast('✅ Conectado à stream');
            showLog('Received media stream from broadcaster.');
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => { showLog('Previous video track interrupted.') });
            setIsStreaming(true);
          };

          pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
              showLog('Sending ICE candidate from viewer:', candidate);
              wsRef.current.send(JSON.stringify({ type: 'ice-candidate', id: watcherIdRef.current, candidate }));
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          wsRef.current.send(JSON.stringify({ type: 'answer', id: watcherIdRef.current, sdp: answer }));
          showLog('Sent answer to broadcaster.');
        }

        else if (msg.type === 'ice-candidate') {
          showLog('Received ICE candidate from broadcaster.');
          await peerRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }

        else if (msg.type === 'close') {
          showToast('✖️ Stream encerrada');
          setStreamEnded(true);
          setIsStreaming(false);
          peerRef.current?.close();
          watcherIdRef.current = null;
        }

        else {
          showLog('Mensagem recebida desconhecida.');
        }

      } catch (err) {
        showLog('Error handling message:', err);
      }
    };

    wsRef.current.onclose = () => {
      showLog('Disconnected from signaling server.');
    };

    wsRef.current.onerror = err => {
      showLog('WebSocket error:', err, 'Closing and scheduling reconnect.');
      wsRef.current.close();
    };
  };

  useEffect(() => {
    connect();
  }, []);

  const handleEnableAudio = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setAudioEnabled(true);
      showToast('🔊 Áudio ativado');
    }
  };

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
              <svg className={styles.waves} xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox="0 24 150 28" preserveAspectRatio="none" shapeRendering="auto">
                <defs>
                  <path id="gentle-wave" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" />
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