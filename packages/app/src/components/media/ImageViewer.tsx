import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface ImageViewerProps {
  visible: boolean;
  uri: string | null;
  caption?: string | null;
  onClose: () => void;
}

export function ImageViewer({ visible, uri, caption, onClose }: ImageViewerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>

        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <Text style={styles.noImage}>No image</Text>
        )}

        {caption ? (
          <View style={styles.captionBar}>
            <Text style={styles.caption}>{caption}</Text>
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
  noImage: { color: "#fff", fontSize: 16 },
  captionBar: {
    position: "absolute",
    bottom: 48,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 12,
    borderRadius: 8,
  },
  caption: { color: "#fff", fontSize: 14, textAlign: "center" },
});
