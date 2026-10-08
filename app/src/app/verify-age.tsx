import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AgeCheckView, type AgeCheckMessage } from '../components/AgeCheckView';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { api } from '../lib/api';
import { useSession } from '../state/session';
import { colors, space } from '../theme';

type Stage = 'intro' | 'camera' | 'checking' | 'confirm' | 'custom' | 'success' | 'failed';
type IconName = ComponentProps<typeof Ionicons>['name'];

const STEPS: { icon: IconName; text: string }[] = [
  { icon: 'calendar', text: 'Type the year you were born' },
  { icon: 'happy', text: 'Look at the camera for a few seconds' },
  { icon: 'swap-horizontal', text: 'Slowly turn your head to each side' },
];

export default function VerifyAgeScreen() {
  const { first } = useLocalSearchParams<{ first?: string }>();
  const firstRun = first === '1';
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const [stage, setStage] = useState<Stage>(user?.ageVerified ? 'success' : 'intro');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [estimate, setEstimate] = useState<{ raw: number; shown: number } | null>(null);
  const [customAge, setCustomAge] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testAllowed, setTestAllowed] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const taps = useRef<number[]>([]);

  useEffect(() => () => useSession.getState().finishJoining(), []);

  useEffect(() => {
    api
      .config()
      .then((config) => setTestAllowed(config.ageTestSkip === true))
      .catch(() => setTestAllowed(false));
  }, []);

  const now = new Date().getFullYear();
  const birthYear = Number(year);

  const onTitlePress = () => {
    if (!testAllowed) return;
    const time = Date.now();
    taps.current = [...taps.current.filter((t) => time - t < 3000), time];
    if (taps.current.length >= 5) {
      taps.current = [];
      setTestMode(true);
    }
  };

  const submit = async (claimedYear: number, estimatedAge: number, test = false, allowConfirm = true) => {
    setBusy(true);
    try {
      const result = await useSession.getState().checkAge(claimedYear, estimatedAge, test);
      if (result.verified) {
        setStage('success');
        return;
      }
      const shown = Math.round(estimatedAge);
      if (!test && allowConfirm && shown >= 18) {
        setEstimate({ raw: estimatedAge, shown });
        setStage('confirm');
        return;
      }
      setReason(result.reason ?? 'We could not confirm your age. Please try again.');
      setStage('failed');
    } catch (e) {
      setReason(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setStage('failed');
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    useSession.getState().finishJoining();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const validYear = () => {
    if (!/^\d{4}$/.test(year) || birthYear < now - 110 || birthYear > now) {
      setError('Please type the year you were born, for example 1952.');
      return false;
    }
    if (now - birthYear < 18) {
      setError('TeaTime is only for adults.');
      return false;
    }
    setError(null);
    return true;
  };

  const start = () => {
    if (!validYear()) return;
    setDetail(null);
    setEstimate(null);
    setAttempt((n) => n + 1);
    setStage('camera');
  };

  const skipForTesting = () => {
    if (!validYear()) return;
    void submit(birthYear, now - birthYear, true);
  };

  const saveCustomAge = () => {
    const age = Number(customAge);
    if (!/^\d{2,3}$/.test(customAge) || age < 18 || age > 110) {
      setCustomError('Please type your age, for example 72.');
      return;
    }
    setCustomError(null);
    if (estimate) void submit(now - age, estimate.raw, false, false);
  };

  const onMessage = async (message: AgeCheckMessage) => {
    if (message.type === 'result' && message.live) {
      setStage('checking');
      await submit(birthYear, message.age);
    } else if (message.type === 'timeout') {
      setReason('We could not finish the check. Make sure your face is well lit, then try again.');
      setDetail(message.detail ?? null);
      setStage('failed');
    } else if (message.type === 'nocamera') {
      setReason('TeaTime could not use your camera. Please allow camera access in Settings and try again.');
      setDetail(message.detail ?? null);
      setStage('failed');
    } else if (message.type === 'error') {
      setReason('Something went wrong. Please check your internet connection and try again.');
      setDetail(message.detail ?? null);
      setStage('failed');
    }
  };

  if (stage === 'camera' || stage === 'checking') {
    return (
      <View style={[styles.cameraRoot, { paddingTop: insets.top + space.lg, paddingBottom: Math.max(insets.bottom, space.lg) }]}>
        <AppText variant="title" center style={{ paddingHorizontal: space.page }}>
          {stage === 'checking' ? 'Checking your age' : 'Follow the steps below the circle'}
        </AppText>
        <View style={{ flex: 1 }}>
          {stage === 'camera' ? (
            <AgeCheckView key={attempt} onMessage={onMessage} />
          ) : (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
        </View>
        <AppText variant="caption" color={colors.textMuted} center style={{ paddingHorizontal: space.page }}>
          The check happens on your phone. Your face is never saved or sent anywhere.
        </AppText>
        <View style={{ paddingHorizontal: space.page, marginTop: space.md }}>
          <Button label="Cancel" variant="secondary" onPress={() => setStage('intro')} disabled={stage === 'checking'} />
        </View>
      </View>
    );
  }

  if (stage === 'confirm' && estimate) {
    return (
      <Screen
        footer={
          <>
            <Button label="Yes, that is right" icon="checkmark" loading={busy} onPress={() => void submit(now - estimate.shown, estimate.raw)} />
            <Button label="No" variant="secondary" disabled={busy} onPress={() => setStage('custom')} />
            <Button label={firstRun ? 'Skip for now' : 'Not now'} variant="ghost" size="medium" disabled={busy} onPress={leave} />
          </>
        }
      >
        <View style={styles.result}>
          <AppText variant="title" center>
            Your age did not match
          </AppText>
          <AppText variant="body" color={colors.textMuted} center>
            From the camera, we think you are about
          </AppText>
          <View style={[styles.bigIcon, { backgroundColor: colors.primarySoft }]}>
            <AppText variant="display" color={colors.primary}>
              {estimate.shown}
            </AppText>
          </View>
          <AppText variant="title" center>
            Is that right?
          </AppText>
        </View>
      </Screen>
    );
  }

  if (stage === 'custom' && estimate) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen
          title="How old are you?"
          subtitle="Type your age. We will check it against the camera once more."
          footer={
            <>
              <Button label="Save my age" icon="checkmark" loading={busy} onPress={saveCustomAge} disabled={customAge.length < 2} />
              <Button label="Start again" variant="ghost" size="medium" disabled={busy} onPress={() => setStage('intro')} />
            </>
          }
        >
          <TextField
            label="My age"
            value={customAge}
            onChangeText={(text) => {
              setCustomAge(text.replace(/\D/g, '').slice(0, 3));
              setCustomError(null);
            }}
            keyboardType="number-pad"
            placeholder="For example: 72"
            maxLength={3}
            error={customError}
            returnKeyType="done"
            onSubmitEditing={saveCustomAge}
          />
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  if (stage === 'success') {
    return (
      <Screen footer={<Button label={firstRun ? "Let's begin" : 'Done'} icon="checkmark" onPress={leave} />}>
        <View style={styles.result}>
          <View style={[styles.bigIcon, { backgroundColor: colors.verifiedSoft }]}>
            <Ionicons name="shield-checkmark" size={64} color={colors.verified} />
          </View>
          <AppText variant="display" center>
            You are verified
          </AppText>
          <VerifiedBadge age={user?.age} center />
          <AppText variant="body" color={colors.textMuted} center>
            Your Verified Age badge is now on your profile. On the Meet tab you can choose to only meet people who have the badge too.
          </AppText>
        </View>
      </Screen>
    );
  }

  if (stage === 'failed') {
    return (
      <Screen
        footer={
          <>
            <Button label="Try again" icon="refresh" onPress={() => setStage('intro')} />
            <Button label={firstRun ? 'Skip for now' : 'Not now'} variant="ghost" size="medium" onPress={leave} />
          </>
        }
      >
        <View style={styles.result}>
          <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="alert-circle" size={64} color={colors.accent} />
          </View>
          <AppText variant="title" center>
            Not verified this time
          </AppText>
          <AppText variant="body" color={colors.textMuted} center>
            {reason}
          </AppText>
          {estimate ? (
            <AppText variant="body" color={colors.textMuted} center>
              From the camera, we think you are about {estimate.shown}.
            </AppText>
          ) : null}
          {detail ? (
            <AppText variant="caption" color={colors.textFaint} center>
              Details: {detail}
            </AppText>
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        back={!firstRun}
        title="Get your Verified Age badge"
        onTitlePress={onTitlePress}
        subtitle="People trust a Verified Age badge, and you can choose to only meet other verified people. It takes less than a minute."
        footer={
          <>
            <Button label="Start the camera" icon="camera" onPress={start} disabled={year.length !== 4} />
            <Button label={firstRun ? 'Skip for now' : 'Not now'} variant="ghost" size="medium" onPress={leave} />
          </>
        }
      >
        <Card style={{ gap: 16 }}>
          {STEPS.map((step, index) => (
            <View key={step.text} style={styles.step}>
              <View style={styles.stepIcon}>
                <Ionicons name={step.icon} size={22} color={colors.primary} />
              </View>
              <AppText variant="bodyStrong" style={{ flex: 1 }}>
                {index + 1}. {step.text}
              </AppText>
            </View>
          ))}
        </Card>
        <View style={{ marginTop: space.xl }}>
          <TextField
            label="The year you were born"
            value={year}
            onChangeText={(text) => {
              setYear(text.replace(/\D/g, '').slice(0, 4));
              setError(null);
            }}
            keyboardType="number-pad"
            placeholder="For example: 1952"
            maxLength={4}
            error={error}
            returnKeyType="done"
            onSubmitEditing={start}
          />
        </View>
        {testMode ? (
          <Card style={styles.testCard}>
            <AppText variant="heading">Testing</AppText>
            <AppText variant="body" color={colors.textMuted}>
              This skips the camera and gives the Verified Age badge right away. Type a birth year above first. Only use this for testing.
            </AppText>
            <Button label="Skip camera and verify" icon="flask" variant="soft" size="medium" loading={busy} onPress={skipForTesting} />
          </Card>
        ) : null}
        <AppText variant="caption" color={colors.textMuted} style={{ marginTop: space.md }}>
          The check happens on your phone and only uses the live camera. Your face is never saved or sent anywhere. Only your age is shared on your profile, and you can hide it later.
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  cameraRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    gap: space.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  result: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 48,
  },
  bigIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  testCard: {
    marginTop: space.xl,
    gap: 12,
    borderWidth: 2,
    borderColor: colors.accentSoft,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
