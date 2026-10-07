import type { StyleProp, ViewStyle } from 'react-native';

export type RtcTrack = {
  kind: string;
  enabled: boolean;
  readyState?: string;
  stop(): void;
};

export type RtcStream = {
  id: string;
  getTracks(): RtcTrack[];
  getAudioTracks(): RtcTrack[];
  getVideoTracks(): RtcTrack[];
};

export type RtcDescription = { type: string; sdp?: string };

export type RtcCandidate = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

export type RtcPeer = {
  connectionState: string;
  iceConnectionState: string;
  remoteDescription: unknown;
  addTrack(track: RtcTrack, stream: RtcStream): unknown;
  createOffer(options?: { iceRestart?: boolean }): Promise<RtcDescription>;
  createAnswer(): Promise<RtcDescription>;
  setLocalDescription(description: RtcDescription): Promise<void>;
  setRemoteDescription(description: RtcDescription): Promise<void>;
  addIceCandidate(candidate: RtcCandidate): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void): void;
  close(): void;
};

export type IceServerConfig = { urls: string | string[]; username?: string; credential?: string };

export type VideoViewProps = {
  stream: RtcStream;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
  zOrder?: number;
};

export class CameraError extends Error {
  constructor(public reason: 'denied' | 'unavailable') {
    super(reason);
  }
}
