import { useEffect, useRef, useState } from 'react';
import { ToastContainer, toast, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function View() {
  const videoRef = useRef();
  const peerRef = useRef();
  const wsRef = useRef();
  const [audioEnabled, setAudioEnabled] = useState(false);

  const toastQueue = useRef([]);
  const isShowing = useRef(false);

  const processQueue = () => {
    if (isShowing.current || toastQueue.current.length === 0) return;
    isShowing.current = true;
    const nextMessage = toastQueue.current.shift();
    toast.info(nextMessage, {
      position: 'top-right', autoClose: 40000, pauseOnFocusLoss: false, pauseOnHover: false, theme: 'light', transition: Slide,
      onOpen: () => setTimeout(() => { isShowing.current = false; processQueue(); }, 2000),
    });
  };

  const showLog = (...args) => {
    if (true) {
      console.log(...args);
    }
  };
  const showToast = (...args) => {
    toastQueue.current.push(args.join(' '));
    processQueue();
  };

  useEffect(() => {
    showLog('Connecting to signaling server as viewer...');
    wsRef.current = new WebSocket('ws://localhost:4000');

    const pc = new RTCPeerConnection();
    peerRef.current = pc;
    let firstTrack = true;
    showLog('RTCPeerConnection created (viewer).');

    pc.ontrack = event => {
      showLog('Received media stream from broadcaster.');
      videoRef.current.srcObject = event.streams[0];
      videoRef.current.play().catch(() => { });
      if (firstTrack) {
        showToast('✅ Conectado à stream.');
        firstTrack = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        showLog('Sending ICE candidate from viewer:', candidate);
        wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate }));
      }
    };

    wsRef.current.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      showLog('Message received by viewer:', msg);

      if (msg.type === 'offer') {
        showLog('Received offer from broadcaster.');
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsRef.current.send(JSON.stringify({ type: 'answer', sdp: answer }));
        showLog('Sent answer to broadcaster.');
      } else if (msg.type === 'ice-candidate') {
        showLog('Received ICE candidate from broadcaster.');
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } else if (msg.type === 'stop') {
        showToast('✖️ Transmissão finalizada.');
        pc.close(); wsRef.current.close();
      }
    };

    wsRef.current.onopen = () => {
      showLog('Connected to server (viewer).');
      wsRef.current.send(JSON.stringify({ type: 'watcher' }));
    }
    wsRef.current.onclose = () => {
      showLog('Disconnected from signaling server.');
    }

    return () => {
      pc.close();
      wsRef.current.close();
    };

  }, []);

  const handleEnableAudio = () => {
    videoRef.current.muted = false;
    setAudioEnabled(true);
    showToast('🔊 Áudio ativado.');
  };

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'black' }}>
        {!audioEnabled && <button onClick={handleEnableAudio} style={{ position: 'absolute', zIndex: 10 }}>Ativar áudio</button>}
        <video ref={videoRef} autoPlay muted={!audioEnabled} playsInline style={{ width: '100%', height: '100%' }} />
      </div>
      <ToastContainer />
    </>
  );
}