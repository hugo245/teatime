import { Linking, Platform } from 'react-native';
import { PhotoPermissionError, pickPhoto, type PickedPhoto } from '../lib/photo';
import { alertMessage, confirm } from '../state/ui';
import { AppText } from './AppText';
import { Button } from './Button';
import { Sheet } from './Overlays';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPicked: (photo: PickedPhoto) => void;
  onRemove?: () => void;
};

export async function choosePhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  try {
    return await pickPhoto(source);
  } catch (error) {
    if (error instanceof PhotoPermissionError) {
      const open = await confirm({
        title: 'Camera not allowed',
        message: 'Please allow TeaTime to use your camera in Settings to take a photo.',
        confirmLabel: Platform.OS === 'web' ? 'OK' : 'Open Settings',
        cancelLabel: Platform.OS === 'web' ? null : 'Not now',
      });
      if (open && Platform.OS !== 'web') void Linking.openSettings();
      return null;
    }
    await alertMessage('Something went wrong', 'We could not use that photo. Please try another one.');
    return null;
  }
}

export function PhotoSheet({ visible, onClose, onPicked, onRemove }: Props) {
  const choose = async (source: 'camera' | 'library') => {
    onClose();
    if (Platform.OS === 'ios') await new Promise((resolve) => setTimeout(resolve, 500));
    const photo = await choosePhoto(source);
    if (photo) onPicked(photo);
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="title">Your photo</AppText>
      <Button label="Take a photo" icon="camera" variant="secondary" onPress={() => choose('camera')} />
      <Button label="Choose from my photos" icon="images" variant="secondary" onPress={() => choose('library')} />
      {onRemove ? (
        <Button
          label="Remove my photo"
          icon="trash-outline"
          variant="ghost"
          onPress={() => {
            onClose();
            onRemove();
          }}
        />
      ) : null}
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
