import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type PickedPhoto = { uri: string; base64: string };

export class PhotoPermissionError extends Error {}

export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  if (source === 'camera' && Platform.OS !== 'web') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PhotoPermissionError('camera');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front })
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const size = Math.min(asset.width || 512, asset.height || 512);
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width && asset.height && asset.width !== asset.height) {
    context.crop({
      originX: Math.round((asset.width - size) / 2),
      originY: Math.round((asset.height - size) / 2),
      width: size,
      height: size,
    });
  }
  context.resize({ width: 512, height: 512 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.75, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) return null;
  return { uri: saved.uri, base64: saved.base64.replace(/^data:image\/\w+;base64,/, '') };
}
