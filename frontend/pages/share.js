import { useEffect, useRef, useState } from 'react';
import { ToastContainer, toast, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Share() {
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const peerRef = useRef();
  const wsRef = useRef();

  const toastQueue = useRef([]);
  const isShowing = useRef(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const processQueue = () => {
    if (isShowing.current || toastQueue.current.length === 0) return;
    isShowing.current = true;
    const nextMessage = toastQueue.current.shift();
    toast.info(nextMessage, {
      position: 'top-right',
      autoClose: 40000,
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
      const msg = args.join(' ');
      console.log(msg);
    }
  };

  const showToast = (...args) => {
    const msg = args.join(' ');
    toastQueue.current.push(msg);
    processQueue();
  };

  useEffect(() => {
    showLog('Connecting to signaling server as broadcaster...');
    wsRef.current = new WebSocket('ws://localhost:4000');

    wsRef.current.onopen = () => {
      showLog('WebSocket connected (broadcaster)');
      wsRef.current.send(JSON.stringify({ type: 'broadcaster' }));
    };

    const start = async () => {
      // 1) Obtain media stream
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      showToast('⏺️ Stream iniciada.');

      // notify when stream ends
      stream.getTracks().forEach(track => {
        track.onended = () => {
          showToast('⏹️ Stream encerrada.');
        };
      });

      // attach to hidden video
      const hiddenVideo = videoRef.current;
      hiddenVideo.srcObject = stream;
      hiddenVideo.play();

      // 2) Set up peer connection
      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      showLog('🔧 RTCPeerConnection created (broadcaster).');
      let trackNumber = 0
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        showToast('➕ Faixa adicionada:', track.kind);
        trackNumber += 1
      });

      if (trackNumber < 2) {
        showToast('🔇 A stream está silenciada.')
      }

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          showLog('❄️ Sending ICE candidate from broadcaster:', candidate);
          wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate }));
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'disconnected' || state === 'closed') {
          showToast('🔌 Espectador desconectado.');
        }
      };

      wsRef.current.onmessage = async ({ data }) => {
        const json = JSON.parse(data);
        showLog('Message received by broadcaster:', json);

        if (json.type === 'watcher') {
          showToast('👀 Espectador conectado.');
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsRef.current.send(JSON.stringify({ type: 'offer', sdp: offer }));
        } else if (json.type === 'answer') {
          showLog('Received answer from watcher.');
          await pc.setRemoteDescription(new RTCSessionDescription(json.sdp));
        } else if (json.type === 'ice-candidate') {
          showLog('Received ICE candidate from watcher.');
          await pc.addIceCandidate(new RTCIceCandidate(json.candidate));
        }
      };

      // 3) Start snapshot loop every 3 seconds
      const canvas = document.createElement('canvas');
      const imgEl = imageRef.current;
      // canvas.width = 1920;
      // canvas.height = 1080;
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext('2d');

      const intervalId = setInterval(() => {
        if (hiddenVideo.readyState >= 2) {
          ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
          imgEl.src = canvas.toDataURL('image/png');
          setImageLoaded(true);
        }
      }, 3000);

      // cleanup on unmount
      return () => clearInterval(intervalId);
    };

    start();
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      flexDirection: 'column',
      fontFamily: 'sans-serif',
    }}>

      <video ref={videoRef} muted playsInline style={{ display: 'none' }} />

      {!imageLoaded && <div style={{ fontSize: '1.5rem', color: '#666' }}>Iniciando pré-visualização...</div>}

      <img
        ref={imageRef}
        alt="Screen snapshot"
        style={{
          display: imageLoaded ? 'block' : 'none',
          width: '960px',
          height: '540px',
          objectFit: 'cover',
        }}
      />

      <ToastContainer />
    </div>
  );
}