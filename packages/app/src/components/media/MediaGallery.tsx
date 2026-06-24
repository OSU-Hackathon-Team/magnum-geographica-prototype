import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";

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
  if (items.length === 0) {
    return (
      <View style={styles.empty} testID={testID}>
        <Text style={styles.emptyText}>{emptyText}</Text>
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
                <Image source={{ uri }} style={styles.image} />
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderText}>No image</Text>
                </View>
              )}
              {item.caption ? (
                <Text style={styles.caption} numberOfLines={1}>
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
  emptyText: { fontSize: 13, color: "#aaa", fontStyle: "italic" },
  list: { gap: 10, paddingHorizontal: 16 },
  item: { width: 120, gap: 4 },
  image: {
    width: 120,
    height: 90,
    borderRadius: 6,
    backgroundColor: "#e8e8e8",
  },
  placeholder: {
    width: 120,
    height: 90,
    borderRadius: 6,
    backgroundColor: "#f1f1f1",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { fontSize: 11, color: "#999" },
  caption: { fontSize: 11, color: "#666" },
});
