import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../components/TabBar';
import { colors } from '../../theme';

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="index"
      backBehavior="initialRoute"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="friends" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
