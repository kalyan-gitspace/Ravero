import { Heart } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@ravero/design-tokens';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { RecentPlaceRow } from '../components/home/RecentPlaceRow';
import { places } from '../components/home/LocationPickerModal';

export default function FavouritePlacesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PageHeader subtitle="Mock places around Hyderabad" title="Favourite places" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Choose a place to use it as your destination preview.</Text>
        {places.slice(0, 4).map((place) => (
          <RecentPlaceRow
            key={place.name}
            onPress={() => router.replace({ pathname: '/(tabs)', params: { destination: place.name } })}
            place={place}
          />
        ))}
        <View style={styles.emptyHint}>
          <Icon color={colors.textSecondary} icon={Heart} size={17} />
          <Text style={styles.hintText}>Saved places are demo examples, not customer data.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  intro: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  hintText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11,
  },
});
