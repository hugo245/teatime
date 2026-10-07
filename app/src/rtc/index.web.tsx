import { createElement, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { isSimSoundOn, isSimulator, onSimSoundChange, simCameraMode } from '../lib/sim';
import { CameraError, type IceServerConfig, type RtcPeer, type RtcStream, type VideoViewProps } from './types';

export * from './types';

export function createPeer(iceServers: IceServerConfig[]): RtcPeer {
  return new RTCPeerConnection({ iceServers }) as unknown as RtcPeer;
}

export async function openCamera(label: string): Promise<RtcStream> {
  if (isSimulator && simCameraMode === 'demo') return demoStream(label) as unknown as RtcStream;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
    });
    return stream as unknown as RtcStream;
  } catch (error) {
    if (isSimulator) return demoStream(label) as unknown as RtcStream;
    const name = (error as DOMException)?.name;
    throw new CameraError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
  }
}

export function VideoView({ stream, mirror, fit = 'cover', muted, style }: VideoViewProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [soundOn, setSoundOn] = useState(isSimSoundOn());

  useEffect(() => onSimSoundChange(setSoundOn), []);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream as unknown as MediaStream;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
  }, [stream]);

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#111814' }, style]}>
      {createElement('video', {
        ref,
        autoPlay: true,
        playsInline: true,
        muted: muted || !soundOn,
        style: {
          width: '100%',
          height: '100%',
          objectFit: fit,
          transform: mirror ? 'scaleX(-1)' : undefined,
          display: 'block',
        },
      })}
    </View>
  );
}

const palettes = [
  ['#F6D9B8', '#E7B98F', '#8C5A3C'],
  ['#CFE6D8', '#9CCBB0', '#3F6E57'],
  ['#D9DDF2', '#AEB6E3', '#4B5694'],
  ['#F3D4DA', '#E3A7B3', '#8F4555'],
];

function demoStream(label: string): MediaStream {
  const width = 480;
  const height = 640;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  let seed = 0;
  for (const ch of label) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const [light, mid, dark] = palettes[Math.abs(seed) % palettes.length]!;
  const initial = (label.trim()[0] ?? '?').toUpperCase();
  const start = performance.now();

  const video = canvas.captureStream(24);
  const videoTrack = video.getVideoTracks()[0]!;

  function draw() {
    if (videoTrack.readyState === 'ended') return;
    const t = (performance.now() - start) / 1000;
    const bob = Math.sin(t * 1.6) * 6;
    const sway = Math.sin(t * 0.7) * 8;

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, light);
    bg.addColorStop(1, mid);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(width * 0.82, height * 0.16, 70 + Math.sin(t) * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(width / 2 + sway, height + 40 + bob, 190, 230, 0, Math.PI, 0);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(width / 2 + sway, height * 0.42 + bob, 104, 0, Math.PI * 2);
    ctx.fillStyle = '#F7E7D6';
    ctx.fill();

    ctx.fillStyle = dark;
    ctx.font = '700 96px Nunito_800ExtraBold, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, width / 2 + sway, height * 0.42 + bob + 4);

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, height - 54, width, 54);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText('Demo camera', width / 2, height - 27);

    requestAnimationFrame(draw);
  }
  draw();

  const tracks: MediaStreamTrack[] = [videoTrack];
  try {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    gain.gain.value = 0;
    const destination = audio.createMediaStreamDestination();
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    const audioTrack = destination.stream.getAudioTracks()[0];
    if (audioTrack) {
      const stop = audioTrack.stop.bind(audioTrack);
      audioTrack.stop = () => {
        stop();
        void audio.close();
      };
      tracks.push(audioTrack);
    }
  } catch {
    return new MediaStream(tracks);
  }
  return new MediaStream(tracks);
}
