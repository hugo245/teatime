import type { ExpoConfig } from 'expo/config';

const serverUrl = process.env.TEATIME_SERVER_URL || 'https://teatime.hugoplayzpersonal.workers.dev';
const bundleIdentifier = process.env.TEATIME_BUNDLE_ID || 'com.hugo245.teatime';
const buildNumber = process.env.TEATIME_BUILD_NUMBER || '1';

const config: ExpoConfig = {
  name: 'TeaTime',
  slug: 'teatime',
  scheme: 'teatime',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#F7F3EE',
  ios: {
    bundleIdentifier,
    buildNumber,
    supportsTablet: false,
    requireFullScreen: true,
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      UIBackgroundModes: ['audio'],
      NSCameraUsageDescription: 'TeaTime uses your camera so the people you talk with can see you.',
      NSMicrophoneUsageDescription: 'TeaTime uses your microphone so the people you talk with can hear you.',
      NSPhotoLibraryUsageDescription: 'TeaTime lets you choose a profile photo from your photos.',
      NSLocalNetworkUsageDescription: 'TeaTime uses your network to connect video calls.',
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    package: bundleIdentifier,
    adaptiveIcon: {
      backgroundColor: '#2E6B4E',
      foregroundImage: './assets/adaptive-icon.png',
    },
  },
  web: {
    output: 'single',
    favicon: './assets/favicon.png',
    name: 'TeaTime',
    themeColor: '#F7F3EE',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#F7F3EE',
      },
    ],
    [
      'expo-font',
      {
        fonts: [
          './node_modules/@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf',
          './node_modules/@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf',
          './node_modules/@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf',
          './node_modules/@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf',
        ],
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'TeaTime lets you choose a profile photo from your photos.',
        cameraPermission: 'TeaTime uses your camera so the people you talk with can see you.',
        microphonePermission: 'TeaTime uses your microphone so the people you talk with can hear you.',
      },
    ],
    [
      '@config-plugins/react-native-webrtc',
      {
        cameraPermission: 'TeaTime uses your camera so the people you talk with can see you.',
        microphonePermission: 'TeaTime uses your microphone so the people you talk with can hear you.',
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: 'TeaTime uses your microphone so the people you talk with can hear you.',
      },
    ],
    ['expo-secure-store', { faceIDPermission: false }],
    [
      'expo-camera',
      {
        cameraPermission: 'TeaTime uses your camera so the people you talk with can see you.',
        microphonePermission: 'TeaTime uses your microphone so the people you talk with can hear you.',
        barcodeScannerEnabled: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    serverUrl,
  },
};

export default config;
