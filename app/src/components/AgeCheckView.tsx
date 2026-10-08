import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { defaultServerUrl, serverUrl } from '../lib/config';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

export type AgeCheckMessage =
  | { type: 'ready' }
  | { type: 'status'; text: string; turn: boolean; progress: number }
  | { type: 'frameDone' }
  | { type: 'rotation'; degrees: number }
  | { type: 'debug'; detail?: string }
  | { type: 'result'; age: number; samples: number; live: boolean }
  | { type: 'timeout' }
  | { type: 'nocamera'; detail?: string }
  | { type: 'error'; detail?: string };

function SnapshotAgeCheck({ onMessage }: { onMessage: (message: AgeCheckMessage) => void }) {
  const camera = useRef<CameraView | null>(null);
  const web = useRef<WebView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [status, setStatus] = useState({ text: 'Getting ready', turn: false, progress: 0 });
  const [frame, setFrame] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const busy = useRef(false);
  const done = useRef(false);
  const failures = useRef(0);
  const report = useRef(onMessage);
  report.current = onMessage;

  const finish = useCallback((message: AgeCheckMessage) => {
    if (done.current) return;
    done.current = true;
    report.current(message);
  }, []);

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) {
      if (permission.canAskAgain) void requestPermission();
      else finish({ type: 'nocamera', detail: 'permission denied' });
    }
  }, [permission, requestPermission, finish]);

  const capture = useCallback(async () => {
    if (busy.current || done.current || !camera.current) return;
    busy.current = true;
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.6, shutterSound: false });
      if (!photo || done.current) {
        busy.current = false;
        return;
      }
      const context = ImageManipulator.manipulate(photo.uri);
      context.resize({ width: 480 });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
      if (!saved.base64 || done.current) {
        busy.current = false;
        return;
      }
      failures.current = 0;
      setFrame(saved.uri);
      web.current?.injectJavaScript(`window.__teatimeFrame("data:image/jpeg;base64,${saved.base64}"); true;`);
    } catch (error) {
      busy.current = false;
      failures.current += 1;
      if (failures.current >= 8) {
        finish({ type: 'nocamera', detail: String((error as Error)?.message ?? error) });
        return;
      }
      setTimeout(() => void capture(), 400);
    }
  }, [finish]);

  useEffect(() => {
    if (cameraReady && pageReady) void capture();
  }, [cameraReady, pageReady, capture]);

  const onWebMessage = (raw: string) => {
    let message: AgeCheckMessage;
    try {
      message = JSON.parse(raw) as AgeCheckMessage;
    } catch {
      return;
    }
    if (message.type === 'ready') setPageReady(true);
    else if (message.type === 'rotation') setRotation(message.degrees);
    else if (message.type === 'status') setStatus({ text: message.text, turn: message.turn, progress: message.progress });
    else if (message.type === 'frameDone') {
      busy.current = false;
      setTimeout(() => void capture(), 50);
    } else if (message.type === 'result' || message.type === 'timeout' || message.type === 'error' || message.type === 'nocamera') {
      finish(message);
    }
  };

  const granted = permission?.granted === true;

  return (
    <View style={styles.root}>
      <View style={[styles.ring, { borderColor: status.progress >= 1 ? colors.online : status.progress > 0 ? colors.primary : colors.border }]}>
        <View style={styles.circle}>
          {granted ? (
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing="front"
              animateShutter={false}
              onCameraReady={() => setCameraReady(true)}
              onMountError={(event) => finish({ type: 'nocamera', detail: event.message })}
            />
          ) : null}
          {frame ? (
            <Image
              source={{ uri: frame }}
              style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }, { rotate: `${rotation}deg` }] }]}
              contentFit="cover"
              transition={0}
            />
          ) : null}
        </View>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.round(status.progress * 100)}%` }]} />
      </View>
      <View style={styles.statusRow}>
        {status.turn ? <Ionicons name="swap-horizontal" size={32} color={colors.primary} /> : null}
        <AppText variant="title" center style={{ flexShrink: 1 }}>
          {pageReady ? status.text : 'Getting ready'}
        </AppText>
      </View>
      <WebView
        ref={web}
        source={{ uri: `${ageCheckBase()}/age-check/?mode=frames` }}
        style={styles.hidden}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={(event) => onWebMessage(event.nativeEvent.data)}
        onError={(event) => finish({ type: 'error', detail: `page: ${event.nativeEvent.description}` })}
        onHttpError={(event) => finish({ type: 'error', detail: `page: HTTP ${event.nativeEvent.statusCode}` })}
      />
    </View>
  );
}

function ageCheckBase() {
  const fallback = defaultServerUrl();
  const current = serverUrl();
  if (current.startsWith('https://')) return current;
  return fallback.startsWith('https://') ? fallback : current;
}

export function AgeCheckView({ onMessage }: { onMessage: (message: AgeCheckMessage) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'live' | 'snapshots'>('live');
  const done = useRef(false);
  const report = useRef(onMessage);
  report.current = onMessage;

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) {
      if (permission.canAskAgain) void requestPermission();
      else if (!done.current) {
        done.current = true;
        report.current({ type: 'nocamera', detail: 'permission denied' });
      }
    }
  }, [permission, requestPermission]);

  if (mode === 'snapshots') return <SnapshotAgeCheck onMessage={onMessage} />;
  if (!permission?.granted) return <View style={styles.root} />;

  return (
    <WebView
      source={{ uri: `${ageCheckBase()}/age-check/` }}
      style={styles.live}
      originWhitelist={['*']}
      javaScriptEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      scrollEnabled={false}
      bounces={false}
      onMessage={(event) => {
        let message: AgeCheckMessage;
        try {
          message = JSON.parse(event.nativeEvent.data) as AgeCheckMessage;
        } catch {
          return;
        }
        if (message.type === 'nocamera') {
          setMode('snapshots');
          return;
        }
        if ((message.type === 'result' || message.type === 'timeout' || message.type === 'error') && !done.current) {
          done.current = true;
          onMessage(message);
        }
      }}
      onError={(event) => {
        if (done.current) return;
        done.current = true;
        onMessage({ type: 'error', detail: `page: ${event.nativeEvent.description}` });
      }}
    />
  );
}

const SIZE = 260;

const styles = StyleSheet.create({
  live: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: 20,
  },
  ring: {
    width: SIZE + 16,
    height: SIZE + 16,
    borderRadius: (SIZE + 16) / 2,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#26302B',
  },
  bar: {
    width: SIZE,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 72,
  },
  hidden: {
    position: 'absolute',
    width: 2,
    height: 2,
    opacity: 0.01,
    left: 0,
    bottom: 0,
  },
});
