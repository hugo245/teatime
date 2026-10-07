import { useState } from 'react';
import { View } from 'react-native';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Sheet } from '../components/Overlays';
import type { ReportReason } from '../lib/api';
import { colors } from '../theme';

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'rude', label: 'They were rude or unkind' },
  { id: 'inappropriate', label: 'They did something inappropriate' },
  { id: 'money', label: 'They asked for money or bank details' },
  { id: 'fake', label: 'They pretended to be someone else' },
  { id: 'other', label: 'Something else' },
];

type Props = {
  name: string;
  visible: boolean;
  onClose: () => void;
  onReport: (reason: ReportReason) => Promise<void>;
};

export function ReportSheet({ name, visible, onClose, onReport }: Props) {
  const [sending, setSending] = useState<ReportReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (reason: ReportReason) => {
    setSending(reason);
    setError(null);
    try {
      await onReport(reason);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSending(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="title" accessibilityRole="header">
        Report {name}
      </AppText>
      <AppText variant="body" color={colors.textMuted}>
        What happened? The call will end and you will not be matched with {name} again.
      </AppText>
      <View style={{ gap: 10, marginTop: 4 }}>
        {REASONS.map((reason) => (
          <Button
            key={reason.id}
            label={reason.label}
            variant="secondary"
            size="medium"
            loading={sending === reason.id}
            disabled={!!sending && sending !== reason.id}
            onPress={() => send(reason.id)}
          />
        ))}
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger} center>
          {error}
        </AppText>
      ) : null}
      <Button label="Cancel" variant="ghost" size="medium" onPress={onClose} />
    </Sheet>
  );
}
