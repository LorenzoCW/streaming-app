// view.js
import { useEffect, useRef, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { showToast, showLog } from '../components/toastUtils';
import WaveText from '../components/waveText';
const backgroundImg = '/images/background.png';
const muteImg = '/images/no-sound.png';

export default function View() {
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const wsRef = useRef(null);
  const watcherIdRef = useRef(null);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);

  const connect = () => {
    showLog('Connecting to signaling server as viewer...');

    if (wsRef.current) wsRef.current.close();
    wsRef.current = new WebSocket('ws://localhost:4000');
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
            if (event.track.kind === 'video') showToast('✅ Conectado à stream');
            showLog('Received media stream from broadcaster.');
            videoRef.current.srcObject = event.streams[0];
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
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'black' }}>

        {isStreaming && !audioEnabled && (
          <div
            onClick={handleEnableAudio}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 20,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(0, 0, 0, 0.247)',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img
              src={muteImg}
              alt="Som desligado"
              style={{
                zIndex: 20,
                width: '100px',
                height: '100px',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            />
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          muted={!audioEnabled}
          playsInline
          style={{ width: '100%', height: '100%', zIndex: 10 }}
        />

        {!isStreaming && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundImage: `url(${backgroundImg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              color: '#ffffff',
              textShadow: '0 2px 8px rgba(0,0,0,0.7)',
            }}
          >
            <div style={{ height: '60%' }}>
              <h1 style={{ fontSize: '8rem', margin: 0, fontFamily: 'monospace' }}>C I M E N A</h1>
              <span style={{ fontSize: '2.5rem', marginTop: '0.5rem', fontFamily: 'sans-serif' }}>
                {streamEnded
                  ? <p>Stream encerrada</p>
                  : <WaveText />
                }
              </span>
            </div>

          </div>
        )}

      </div>
      <ToastContainer />
    </>
  );
}