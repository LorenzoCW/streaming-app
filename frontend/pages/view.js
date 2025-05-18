// view.js
import { useEffect, useRef, useState } from 'react';
import { ToastContainer, toast, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function View() {
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const wsRef = useRef(null);
  const watcherIdRef = useRef(null);
  const [audioEnabled, setAudioEnabled] = useState(false);

  const toastQueue = useRef([]);
  const isShowing = useRef(false);

  const processQueue = () => {
    if (isShowing.current || toastQueue.current.length === 0) return;
    isShowing.current = true;
    const nextMessage = toastQueue.current.shift();
    toast.info(nextMessage, {
      position: 'top-right',
      autoClose: 5000,
      pauseOnFocusLoss: false,
      pauseOnHover: false,
      theme: 'light',
      icon: false,
      transition: Slide,
      onOpen: () => {
        setTimeout(() => {
          isShowing.current = false;
          processQueue();
        }, 2000);
      },
    });
  };

  const showLog = (...args) => {
    if (true) {
      console.log(...args);
    }
  };
  const showToast = (...args) => {
    showLog(...args)
    toastQueue.current.push(args.join(' '));
    processQueue();
  };

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
          showLog('Transmissão iniciada pelo host.');
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
          showToast('✖️ Transmissão encerrada');
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
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'black' }}>
        {!audioEnabled && <button onClick={handleEnableAudio} style={{ position: 'absolute', zIndex: 10 }}>Ativar áudio</button>}
        <button onClick={connect} style={{ position: 'absolute', zIndex: 10, translate: '0px 30px' }}>Conectar</button>
        <video ref={videoRef} autoPlay muted={!audioEnabled} playsInline style={{ width: '100%', height: '100%' }} />
      </div>
      <ToastContainer />
    </>
  );
}