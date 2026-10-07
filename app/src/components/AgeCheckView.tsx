import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { serverUrl } from '../lib/config';
import { colors } from '../theme';

export type AgeCheckMessage =
  | { type: 'ready' }
  | { type: 'result'; age: number; samples: number; live: boolean }
  | { type: 'timeout' }
  | { type: 'nocamera' }
  | { type: 'error' };

export function AgeCheckView({ onMessage }: { onMessage: (message: AgeCheckMessage) => void }) {
  return (
    <WebView
      source={{ uri: `${serverUrl()}/age-check/` }}
      style={styles.view}
      originWhitelist={['*']}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      javaScriptEnabled
      scrollEnabled={false}
      bounces={false}
      onMessage={(event) => {
        try {
          onMessage(JSON.parse(event.nativeEvent.data) as AgeCheckMessage);
        } catch {
          onMessage({ type: 'error' });
        }
      }}
      onError={() => onMessage({ type: 'error' })}
    />
  );
}

const styles = StyleSheet.create({
  view: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
