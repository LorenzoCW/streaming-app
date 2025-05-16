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
    message('📡 Connecting to signaling server as viewer...');
    wsRef.current = new WebSocket('ws://localhost:4000');

    // create peer connection and handlers before signaling
    const pc = new RTCPeerConnection();
    peerRef.current = pc;
    message('🔧 RTCPeerConnection created (viewer).');

    pc.ontrack = event => {
      message('📺 Received media stream from broadcaster.');
      videoRef.current.srcObject = event.streams[0];
      videoRef.current.onloadedmetadata = () => {
        // ensure playback starts automatically
        videoRef.current.play().catch(err => console.warn('Playback was prevented:', err));
      };
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        message('❄️ Sending ICE candidate from viewer:', candidate);
        wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate }));
      }
    };

    wsRef.current.onmessage = async ({ data }) => {
      const json_message = JSON.parse(data);
      message('📬 Message received by viewer:', json_message);

      if (json_message.type === 'offer') {
        message('📥 Received offer from broadcaster.');
        await pc.setRemoteDescription(new RTCSessionDescription(json_message.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsRef.current.send(JSON.stringify({ type: 'answer', sdp: answer }));
        message('📤 Sent answer to broadcaster.');
      } else if (json_message.type === 'ice-candidate') {
        message('❄️ Received ICE candidate from broadcaster.');
        await pc.addIceCandidate(new RTCIceCandidate(json_message.candidate));
      }
    };

    wsRef.current.onopen = () => {
      message('✅ WebSocket connection opened (viewer).');
      wsRef.current.send(JSON.stringify({ type: 'watcher' }));
    };

  }, []);

  const handleEnableAudio = () => {
    videoRef.current.muted = false;
    setAudioEnabled(true);
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'black',
          margin: 0,
          padding: 0,
        }}
      >
        {!audioEnabled && (
          <button
            onClick={handleEnableAudio}
            style={{ position: 'absolute', zIndex: 10 }}
          >
            Ativar áudio
          </button>
        )}
        <video
          ref={videoRef}
          autoPlay
          muted={!audioEnabled}
          playsInline
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <ToastContainer />
    </>
  );
}