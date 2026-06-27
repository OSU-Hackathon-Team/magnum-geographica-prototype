import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";

export interface ImageViewerProps {
  visible: boolean;
  uri: string | null;
  caption?: string | null;
  onClose: () => void;
}

export function ImageViewer({ visible, uri, caption, onClose }: ImageViewerProps) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" testID="image-viewer-modal">
      <View style={styles.overlay} testID="image-viewer-overlay">
        <Pressable style={styles.closeBtn} onPress={onClose} testID="image-viewer-close">
          <Ionicons name="close" size={24} color={colors.textInverse} />
        </Pressable>

        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
            testID="image-viewer-image"
          />
        ) : (
          <Text style={[styles.noImage, { color: colors.textInverse }]} testID="image-viewer-no-image">
            No image
          </Text>
        )}

        {caption ? (
          <View style={styles.captionBar} testID="image-viewer-caption-bar">
            <Text style={[styles.caption, { color: colors.textInverse }]} testID="image-viewer-caption">
              {caption}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 48,
    right: 16,
    zIndex: 10,
    padding: 12,
  },
  image: { width: "100%", height: "80%" },
  noImage: { fontSize: 16 },
  captionBar: {
    position: "absolute",
    bottom: 48,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 12,
    borderRadius: 8,
  },
  caption: { fontSize: 14, textAlign: "center" },
});
