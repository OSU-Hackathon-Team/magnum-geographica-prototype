import { useRouter } from "expo-router";
import { Stack } from "expo-router";
import { UploadTraceSheet } from "../../src/components/trace/UploadTraceSheet";

/**
 * §21.3.2 Import path — file-picker entry point for GPX / GeoJSON
 * traces. This is a separate route so it works as a deep-link target
 * and so it can be reused from anywhere in the app (e.g. the Record
 * tab's "Import a file" link).
 *
 * The component is the existing `UploadTraceSheet` bottom sheet; we
 * present it full-screen on this route so the user has plenty of
 * room for the textarea fallback and the file-picker buttons.
 */
export default function TraceImportScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen
        options={{
          title: "Import trace",
          headerShown: true,
        }}
      />
      <UploadTraceSheet
        visible
        onClose={() => router.back()}
        onImported={() => router.back()}
        testID="trace-import-sheet"
      />
    </>
  );
}
