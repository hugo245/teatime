import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ComponentProps } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { api } from '../lib/api';
import { serverUrl } from '../lib/config';
import { colors, space } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const HOW: { icon: IconName; title: string; text: string }[] = [
  { icon: 'cafe', title: 'Tap Meet someone new', text: 'We find a friendly person who also wants to chat. You will see and hear each other.' },
  { icon: 'person-add', title: 'Make a friend', text: 'Enjoying the chat? Tap Add friend. If they add you too, you become friends.' },
  { icon: 'videocam', title: 'Call your friends', text: 'Open Friends and tap Call next to anyone with a green dot.' },
  { icon: 'call', title: 'Say goodbye any time', text: 'Tap the red End call button whenever you like. There is no need to explain.' },
];

const SAFE: { icon: IconName; text: string }[] = [
  { icon: 'cash-outline', text: 'Never send money, gifts or bank details to anyone you meet on TeaTime.' },
  { icon: 'key-outline', text: 'Never share passwords, codes from text messages or your home address.' },
  { icon: 'flag-outline', text: 'If someone is unkind or makes you uneasy, tap Report. The call ends right away and you will not see them again.' },
  { icon: 'people-outline', text: 'If you are unsure about someone, talk to a family member or friend you trust.' },
];

const RULES = [
  'Be kind and respectful to everyone.',
  'Keep it clean. No nudity or rude behaviour.',
  'Never ask anyone for money.',
  'Be yourself. Do not pretend to be someone else.',
];

export default function HelpScreen() {
  const [email, setEmail] = useState('support@teatime.app');

  useEffect(() => {
    api
      .config()
      .then((config) => config.supportEmail && setEmail(config.supportEmail))
      .catch(() => {});
  }, []);

  return (
    <Screen back title="Help and safety">
      <AppText variant="heading" style={styles.section}>
        How TeaTime works
      </AppText>
      <Card style={{ gap: 18 }}>
        {HOW.map((item, index) => (
          <View key={item.title} style={styles.row}>
            <View style={styles.number}>
              <AppText variant="label" color={colors.primary}>
                {index + 1}
              </AppText>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">{item.title}</AppText>
              <AppText variant="body" color={colors.textMuted}>
                {item.text}
              </AppText>
            </View>
          </View>
        ))}
      </Card>

      <AppText variant="heading" style={styles.section}>
        Staying safe
      </AppText>
      <Card style={{ gap: 18 }}>
        {SAFE.map((item) => (
          <View key={item.text} style={styles.row}>
            <Ionicons name={item.icon} size={26} color={colors.primary} />
            <AppText variant="body" style={{ flex: 1 }}>
              {item.text}
            </AppText>
          </View>
        ))}
      </Card>

      <AppText variant="heading" style={styles.section}>
        Community rules
      </AppText>
      <Card style={{ gap: 12 }}>
        {RULES.map((rule) => (
          <View key={rule} style={styles.row}>
            <Ionicons name="checkmark-circle" size={24} color={colors.online} />
            <AppText variant="body" style={{ flex: 1 }}>
              {rule}
            </AppText>
          </View>
        ))}
        <AppText variant="caption" color={colors.textMuted}>
          People who break these rules are removed from TeaTime.
        </AppText>
      </Card>

      <AppText variant="heading" style={styles.section}>
        Contact us
      </AppText>
      <Card style={{ gap: 12 }}>
        <AppText variant="body" color={colors.textMuted}>
          Questions or worries? We read every message.
        </AppText>
        <Button label={email} icon="mail-outline" variant="secondary" size="medium" onPress={() => void Linking.openURL(`mailto:${email}`)} />
        <Button label="Read the full rules" variant="ghost" size="medium" onPress={() => void Linking.openURL(`${serverUrl()}/terms`)} />
        <Button label="Privacy policy" variant="ghost" size="medium" onPress={() => void Linking.openURL(`${serverUrl()}/privacy`)} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: space.xl,
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  number: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
