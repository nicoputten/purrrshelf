import { coverUrl } from '@purrshelf/contract';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSession } from '@/session/session';
import { coverColours, fonts, radius } from '@/theme/tokens';
import { AppText } from './AppText';

/** Same pick as the broker's placeholder, so a card doesn't change colour when it loads. */
export function coverColour(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return coverColours[h % coverColours.length] ?? coverColours[0];
}

interface BookCoverProps {
  workId: string;
  title: string;
  width: number;
  height: number;
  size?: 's' | 'm' | 'l';
}

/**
 * A book cover from the broker (with the access token), on top of a
 * placeholder card with the title, which also shows while loading or offline.
 */
export function BookCover({ workId, title, width, height, size = 's' }: BookCoverProps) {
  const serverUrl = useSession((s) => s.serverUrl);
  const token = useSession((s) => s.accessToken);
  const [failed, setFailed] = useState(false);
  const box = { width, height, borderRadius: width > 80 ? radius.cover + 2 : radius.cover - 2 };
  return (
    <View
      style={[styles.card, box, { backgroundColor: coverColour(workId) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AppText numberOfLines={4} style={[styles.title, { fontSize: Math.max(9, width / 7) }]}>
        {title}
      </AppText>
      {serverUrl && token && !failed ? (
        <Image
          testID={`cover-${workId}`}
          source={{
            uri: coverUrl(serverUrl, workId, size),
            headers: { authorization: `Bearer ${token}` },
          }}
          onError={() => setFailed(true)}
          style={[StyleSheet.absoluteFill, box]}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 4 },
  title: { fontFamily: fonts.heading, color: '#F4EFEA', textAlign: 'center' },
});
