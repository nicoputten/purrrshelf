import type { SimilarWorks } from '@purrshelf/contract';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BookCover } from '@/components/BookCover';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSize } from '@/theme/tokens';

const COVER_W = 84;

/** "Similar books" row on the detail page (APP-09): covers that open the book. */
export function SimilarBooks({
  similar,
  onOpen,
}: {
  similar: SimilarWorks;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (similar.works.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <AppText style={styles.section} accessibilityRole="header">
        {t('book.similar.title')}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {similar.works.map(({ reason, work }) => {
          const why = t(`book.similar.${reason}`);
          return (
            <Pressable
              key={work.id}
              accessibilityRole="button"
              accessibilityLabel={`${work.title}, ${why}`}
              onPress={() => onOpen(work.id)}
              style={styles.item}
            >
              <BookCover workId={work.id} title={work.title} width={COVER_W} height={126} />
              <AppText numberOfLines={2} style={[styles.title, { color: colors.text }]}>
                {work.title}
              </AppText>
              <AppText numberOfLines={1} variant="muted" style={styles.why}>
                {why}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  section: { fontFamily: fonts.heading, fontSize: fontSize.section },
  row: { gap: 12, paddingRight: 8 },
  item: { width: COVER_W, gap: 4 },
  title: { fontFamily: fonts.headingMedium, fontSize: fontSize.small },
  why: { fontSize: fontSize.small },
});
