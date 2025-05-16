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
      autoClose: 4000,
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

  const message = (...args) => {
    const msg = args.join(' ');
    console.log(msg);
    toastQueue.current.push(msg);
    processQueue();
  };

  useEffect(() => {
    message('📡 Connecting to signaling server as broadcaster...');
    wsRef.current = new WebSocket('ws://localhost:4000');

    wsRef.current.onopen = () => {
      message('✅ WebSocket connection opened (broadcaster).');
      wsRef.current.send(JSON.stringify({ type: 'broadcaster' }));
    };

    const start = async () => {
      // 1) Obtain media stream
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      message('📷 Screen sharing stream obtained.');

      // attach to hidden video
      const hiddenVideo = videoRef.current;
      hiddenVideo.srcObject = stream;
      hiddenVideo.play();

      // 2) Set up peer connection as before
      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      message('🔧 RTCPeerConnection created (broadcaster).');
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        message('➕ Track added:', track.kind);
      });

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          message('❄️ Sending ICE candidate from broadcaster:', candidate);
          wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate }));
        }
      };

      wsRef.current.onmessage = async ({ data }) => {
        const json_message = JSON.parse(data);
        message('📬 Message received by broadcaster:', json_message);

        if (json_message.type === 'watcher') {
          message('👀 Watcher connected. Creating and sending offer...');
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsRef.current.send(JSON.stringify({ type: 'offer', sdp: offer }));
        } else if (json_message.type === 'answer') {
          message('📥 Received answer from watcher.');
          await pc.setRemoteDescription(new RTCSessionDescription(json_message.sdp));
        } else if (json_message.type === 'ice-candidate') {
          message('❄️ Received ICE candidate from watcher.');
          await pc.addIceCandidate(new RTCIceCandidate(json_message.candidate));
        }
      };

      // 3) Start snapshot loop every 3 seconds
      const canvas = document.createElement('canvas');
      const imgEl = imageRef.current;
      // canvas.width = 1920; canvas.height = 1080;
      canvas.width = 960; canvas.height = 540;
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

      {!imageLoaded && <div style={{ fontSize: '1.5rem', color: '#666' }}>Carregando...</div>}

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