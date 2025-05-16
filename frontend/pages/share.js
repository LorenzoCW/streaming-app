import { useEffect, useRef } from 'react';
import { ToastContainer, toast, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Share() {
  const videoRef = useRef();
  const peerRef = useRef();
  const wsRef = useRef();

  const toastQueue = useRef([]);
  const isShowing = useRef(false);

  const processQueue = () => {
    if (isShowing.current || toastQueue.current.length === 0) return;

    isShowing.current = true;
    const nextMessage = toastQueue.current.shift();
    toast.info(nextMessage, {
      position: "top-right",
      autoClose: 4000,
      pauseOnFocusLoss: false,
      pauseOnHover: false,
      theme: "light",
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
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      message('📷 Screen sharing stream obtained.');
      videoRef.current.srcObject = stream;

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
    };

    start();
  }, []);

  return (
    <>
      {/* Tela do broadcaster */}
      <video ref={videoRef} autoPlay muted playsInline style={{ width: '50vw', height: '50vh' }} />
      <ToastContainer />
    </>
  );
}