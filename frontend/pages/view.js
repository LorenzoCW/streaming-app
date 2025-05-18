// view.js
import { useEffect, useRef, useState } from 'react';
import { ToastContainer, toast, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function View() {
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const wsRef = useRef(null);
  const firstTrackRef = useRef(true);
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

  const muteMedia = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const cleanup = () => {
    muteMedia()

    // Close peer connection
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    // Close websocket
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    // Reset first track flag
    firstTrackRef.current = true;
  };

  const connect = () => {
    cleanup();

    showLog('Connecting to signaling server as viewer...');

    const ws = new WebSocket('ws://localhost:4000');
    wsRef.current = ws;

    const pc = new RTCPeerConnection();
    peerRef.current = pc;

    showLog('RTCPeerConnection created (viewer).');

    pc.ontrack = event => {
      showLog('Received media stream from broadcaster.');
      videoRef.current.srcObject = event.streams[0];
      videoRef.current.play().catch(() => { });
      if (firstTrackRef.current) {
        showToast('✅ Conectado à stream.');
        firstTrackRef.current = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && ws.readyState === WebSocket.OPEN) {
        showLog('Sending ICE candidate from viewer:', candidate);
        ws.send(JSON.stringify({ type: 'ice-candidate', candidate }));
      }
    };

    ws.onopen = () => {
      showLog('Connected to server (viewer).');
      ws.send(JSON.stringify({ type: 'watcher' }));
    };

    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      showLog('Message received by viewer:', msg);

      if (!peerRef.current || peerRef.current.signalingState === 'closed') {
        showLog('Peer connection closed, ignoring message.');
        return;
      }

      try {
        if (msg.type === 'offer') {
          showLog('Received offer from broadcaster.');
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await peerRef.current.createAnswer();
          await peerRef.current.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'answer', sdp: answer }));
          showLog('Sent answer to broadcaster.');
        } else if (msg.type === 'ice-candidate') {
          showLog('Received ICE candidate from broadcaster.');
          await peerRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } else if (msg.type === 'start') {
          showLog('Transmissão iniciada pelo host.');
          connect();
        } else if (msg.type === 'close') {
          showToast('✖️ Transmissão encerrada.');
          muteMedia();
        } else {
          showLog('Mensagem recebida desconhecida.');
        }
      } catch (err) {
        showLog('Error handling message:', err);
      }
    };

    ws.onclose = () => {
      showLog('Disconnected from signaling server.');
    };

    ws.onerror = err => {
      showLog('WebSocket error:', err, 'Closing and scheduling reconnect.');
      ws.close();
    };
  };

  useEffect(() => {
    connect();
  }, []);

  const handleEnableAudio = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setAudioEnabled(true);
      showToast('🔊 Áudio ativado.');
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