import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";

export interface MediaItem {
  id: string;
  thumbnail_url: string;
  data_url?: string;
  caption?: string | null;
  mime_type?: string;
}

export interface MediaGalleryProps {
  items: MediaItem[];
  onPress?: (item: MediaItem) => void;
  emptyText?: string;
  testID?: string;
}

export function MediaGallery({
  items,
  onPress,
  emptyText = "No photos yet.",
  testID,
}: MediaGalleryProps) {
  const { colors } = useTheme();

  if (items.length === 0) {
    return (
      <View style={styles.empty} testID={testID}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View testID={testID}>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const uri = item.thumbnail_url || item.data_url;
          return (
            <Pressable
              onPress={() => onPress?.(item)}
              style={styles.item}
              testID={`media-item-${item.id}`}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  style={[styles.image, { backgroundColor: colors.border }]}
                />
              ) : (
                <View
                  style={[styles.placeholder, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
                    No image
                  </Text>
                </View>
              )}
              {item.caption ? (
                <Text
                  style={[styles.caption, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {item.caption}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 16 },
  emptyText: { fontSize: 13, fontStyle: "italic" },
  list: { gap: 10, paddingHorizontal: 16 },
  item: { width: 120, gap: 4 },
  image: {
    width: 120,
    height: 90,
    borderRadius: 6,
  },
  placeholder: {
    width: 120,
    height: 90,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { fontSize: 11 },
  caption: { fontSize: 11 },
});
