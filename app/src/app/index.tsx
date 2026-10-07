import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { mediaDevices } from 'react-native-webrtc';
import { createAudioPlayer } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { Image } from 'expo-image';
import { prepareCallAudio } from '../../modules/call-audio/src';

export default function Index() {
  useKeepAwake();
  useEffect(() => {
    prepareCallAudio();
    void [mediaDevices, createAudioPlayer, ImagePicker, ImageManipulator, SecureStore, AsyncStorage, Haptics, Image];
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>TeaTime</Text>
    </View>
  );
}
