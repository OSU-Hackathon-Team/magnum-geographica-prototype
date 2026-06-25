import { useRouter } from "expo-router";
import { UploadTraceSheet } from "../../../../src/components/trace/UploadTraceSheet";

/**
 * /system/[slug]/traces/upload — opens the upload-trace sheet scoped
 * to a particular system. The sheet's auto-tag step will use the
 * point-in-polygon endpoint to find the system; the slug is just a
 * nice back-button target.
 */
export default function SystemUploadTrace() {
  const router = useRouter();
  return (
    <UploadTraceSheet
      visible
      onClose={() => router.back()}
      onImported={() => router.back()}
      testID="system-upload-trace-sheet"
    />
  );
}
