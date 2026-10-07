import { RTCPeerConnection, RTCView, mediaDevices, type MediaStream } from 'react-native-webrtc';
import { CameraError, type IceServerConfig, type RtcPeer, type RtcStream, type VideoViewProps } from './types';

export * from './types';

export function createPeer(iceServers: IceServerConfig[]): RtcPeer {
  return new RTCPeerConnection({ iceServers }) as unknown as RtcPeer;
}

export async function openCamera(_label: string): Promise<RtcStream> {
  try {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'user', width: 640, height: 480, frameRate: 24 },
    });
    return stream as unknown as RtcStream;
  } catch (error) {
    const message = String((error as Error)?.message ?? error).toLowerCase();
    throw new CameraError(message.includes('denied') || message.includes('permission') ? 'denied' : 'unavailable');
  }
}

export function VideoView({ stream, mirror, fit = 'cover', style, zOrder }: VideoViewProps) {
  return (
    <RTCView
      streamURL={(stream as unknown as MediaStream).toURL()}
      mirror={mirror}
      objectFit={fit}
      zOrder={zOrder}
      style={style}
    />
  );
}
