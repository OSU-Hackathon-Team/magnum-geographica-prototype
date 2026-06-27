import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import {
  SURFACE_TYPES,
  type SurfaceType,
  type TrailSegment,
  type UpdateSegmentInput,
} from "@magnum/shared";
import { useTheme } from "../../providers/ThemeProvider";
import { radii, spacing, text as textTokens } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { SegmentTypeBadge } from "../ui/SegmentTypeBadge";

const HAZARD_OPTIONS = [
  "steep",
  "rocky",
  "muddy",
  "exposed",
  "flooding",
  "downed_trees",
  "traffic",
  "low_visibility",
];

export interface SegmentEditorProps {
  segment: TrailSegment;
  onSave: (id: string, body: UpdateSegmentInput) => void;
  onDelete: (id: string) => void;
  onSplit: (id: string, splitAt: number, nameA?: string, nameB?: string) => void;
  saving?: boolean;
  deleting?: boolean;
  testID?: string;
}

export function SegmentEditor({
  segment,
  onSave,
  onDelete,
  onSplit,
  saving,
  deleting,
  testID,
}: SegmentEditorProps) {
  const { colors } = useTheme();
  const [name, setName] = useState(segment.name ?? "");
  const [surfaceType, setSurfaceType] = useState<SurfaceType | null>(
    (segment.surface_type as SurfaceType | null) ?? null,
  );
  const [hazards, setHazards] = useState<string[]>(segment.hazards ?? []);
  const [steepGrade, setSteepGrade] = useState(Boolean(segment.steep_grade));
  const [isRoadConnector, setIsRoadConnector] = useState(Boolean(segment.is_road_connector));
  const [oneWay, setOneWay] = useState(Boolean(segment.one_way));
  const [description, setDescription] = useState(segment.description ?? "");
  const [showSplit, setShowSplit] = useState(false);
  const [splitAt, setSplitAt] = useState(0.5);
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");

  const toggleHazard = (h: string) => {
    setHazards((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]));
  };

  const canSave = !saving && !deleting;

  const handleSave = () => {
    onSave(segment.id, {
      name: name.trim() || null,
      surface_type: surfaceType,
      hazards,
      steep_grade: steepGrade,
      is_road_connector: isRoadConnector,
      one_way: oneWay,
      description: description.trim() || null,
    });
  };

  const handleDelete = () => {
    onDelete(segment.id);
  };

  const handleSplit = () => {
    const clamped = Math.max(0.05, Math.min(0.95, splitAt));
    onSplit(segment.id, clamped, nameA.trim() || undefined, nameB.trim() || undefined);
    setShowSplit(false);
  };

  return (
    <View testID={testID ?? `segment-editor-${segment.id}`}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Segment {segment.sort_order + 1}
          </Text>
          {surfaceType ? <SegmentTypeBadge surface={surfaceType} /> : null}
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceMuted },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="Optional"
            testID={`segment-editor-name-${segment.id}`}
            editable={canSave}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Surface</Text>
          <View style={styles.surfaceRow}>
            {SURFACE_TYPES.map((s) => (
              <Pressable
                key={s}
                onPress={() => setSurfaceType(surfaceType === s ? null : s)}
                style={[
                  styles.surfaceOption,
                  surfaceType === s
                    ? { backgroundColor: colors.warningMuted, borderColor: colors.warning }
                    : { backgroundColor: colors.divider, borderColor: "transparent" },
                ]}
                testID={`segment-editor-surface-${s}-${segment.id}`}
                disabled={!canSave}
              >
                <Text
                  style={[
                    styles.surfaceOptionText,
                    { color: colors.textSecondary },
                    surfaceType === s && { color: colors.warning, fontWeight: "600" },
                  ]}
                >
                  {s.replace("_", " ")}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Hazards</Text>
          <View style={styles.hazardRow}>
            {HAZARD_OPTIONS.map((h) => {
              const active = hazards.includes(h);
              return (
                <Pressable
                  key={h}
                  onPress={() => toggleHazard(h)}
                  style={[
                    styles.hazardChip,
                    active
                      ? { backgroundColor: colors.dangerMuted }
                      : { backgroundColor: colors.divider },
                  ]}
                  testID={`segment-editor-hazard-${h}-${segment.id}`}
                  disabled={!canSave}
                >
                  <Text
                    style={[
                      styles.hazardChipText,
                      { color: colors.textSecondary },
                      active && { color: colors.danger, fontWeight: "600" },
                    ]}
                  >
                    {h.replace("_", " ")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>Steep grade</Text>
          <Switch
            value={steepGrade}
            onValueChange={setSteepGrade}
            testID={`segment-editor-steep-${segment.id}`}
            disabled={!canSave}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>Road connector</Text>
          <Switch
            value={isRoadConnector}
            onValueChange={setIsRoadConnector}
            testID={`segment-editor-road-${segment.id}`}
            disabled={!canSave}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>One-way</Text>
          <Switch
            value={oneWay}
            onValueChange={setOneWay}
            testID={`segment-editor-oneway-${segment.id}`}
            disabled={!canSave}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
          <TextInput
            style={[
              styles.input,
              styles.textarea,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceMuted },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Notes about this section..."
            multiline
            testID={`segment-editor-description-${segment.id}`}
            editable={canSave}
          />
        </View>

        <View style={styles.actionRow}>
          <Button
            variant="primary"
            size="small"
            onPress={handleSave}
            disabled={!canSave}
            testID={`segment-editor-save-${segment.id}`}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="secondary"
            size="small"
            onPress={() => setShowSplit((v) => !v)}
            disabled={!canSave}
            testID={`segment-editor-split-toggle-${segment.id}`}
          >
            {showSplit ? "Cancel split" : "Split"}
          </Button>
          <Button
            variant="ghost"
            size="small"
            onPress={handleDelete}
            disabled={!canSave}
            testID={`segment-editor-delete-${segment.id}`}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </View>

        {showSplit ? (
          <View
            style={[styles.splitPanel, { borderTopColor: colors.border }]}
            testID={`segment-editor-split-panel-${segment.id}`}
          >
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Split position (0.0 – 1.0)
            </Text>
            <View style={styles.splitPositionRow}>
              {[0.25, 0.5, 0.75].map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setSplitAt(v)}
                  style={[
                    styles.splitPreset,
                    splitAt === v
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: colors.divider },
                  ]}
                  testID={`segment-editor-split-preset-${v}-${segment.id}`}
                >
                  <Text
                    style={[
                      styles.splitPresetText,
                      { color: colors.textSecondary },
                      splitAt === v && { color: colors.textInverse, fontWeight: "600" },
                    ]}
                  >
                    {v}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceMuted },
              ]}
              value={String(splitAt)}
              onChangeText={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) setSplitAt(n);
              }}
              keyboardType="numeric"
              testID={`segment-editor-split-value-${segment.id}`}
            />
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceMuted },
              ]}
              value={nameA}
              onChangeText={setNameA}
              placeholder="Name for first half (optional)"
              testID={`segment-editor-split-name-a-${segment.id}`}
            />
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceMuted },
              ]}
              value={nameB}
              onChangeText={setNameB}
              placeholder="Name for second half (optional)"
              testID={`segment-editor-split-name-b-${segment.id}`}
            />
            <Button
              variant="primary"
              size="small"
              onPress={handleSplit}
              testID={`segment-editor-split-confirm-${segment.id}`}
            >
              Confirm split
            </Button>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

export interface SegmentEditListProps {
  segments: TrailSegment[];
  onUpdate: (id: string, body: UpdateSegmentInput) => void;
  onDelete: (id: string) => void;
  onSplit: (id: string, splitAt: number, nameA?: string, nameB?: string) => void;
  onMerge: (idA: string, idB: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onExit: () => void;
  pendingId?: string | null;
  savingId?: string | null;
  deletingId?: string | null;
  splittingId?: string | null;
  merging?: boolean;
  reordering?: boolean;
  testID?: string;
}

export function SegmentEditList({
  segments,
  onUpdate,
  onDelete,
  onSplit,
  onMerge,
  onReorder,
  onExit,
  pendingId,
  savingId,
  deletingId,
  splittingId,
  merging,
  reordering,
  testID,
}: SegmentEditListProps) {
  const { colors } = useTheme();
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());

  const toggleMergeSelect = (id: string) => {
    setSelectedForMerge((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const next = [...segments];
    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
    onReorder(next.map((s) => s.id));
  };

  const moveDown = (idx: number) => {
    if (idx >= segments.length - 1) return;
    const next = [...segments];
    [next[idx + 1], next[idx]] = [next[idx]!, next[idx + 1]!];
    onReorder(next.map((s) => s.id));
  };

  const handleMerge = () => {
    const ids = Array.from(selectedForMerge);
    if (ids.length !== 2) return;
    onMerge(ids[0]!, ids[1]!);
    setSelectedForMerge(new Set());
  };

  return (
    <ScrollView testID={testID ?? "segment-edit-list"}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Edit Segments</Text>
        <Button variant="ghost" size="small" onPress={onExit} testID="segment-edit-exit">
          Done
        </Button>
      </View>

      <View
        style={[styles.mergeBar, { backgroundColor: colors.warningMuted }]}
        testID="segment-merge-bar"
      >
        <Text
          style={[styles.mergeHint, { color: colors.warning }]}
          testID="segment-merge-count"
        >
          Select two segments to merge ({selectedForMerge.size}/2)
        </Text>
        <Button
          variant="secondary"
          size="small"
          onPress={handleMerge}
          disabled={selectedForMerge.size !== 2 || merging}
          testID="segment-merge-confirm"
        >
          {merging ? "Merging..." : "Merge"}
        </Button>
      </View>

      {segments.map((s, idx) => (
        <View key={s.id} style={styles.itemWrapper}>
          <View style={styles.itemHeader}>
            <Pressable
              onPress={() => toggleMergeSelect(s.id)}
              style={[
                styles.mergeToggle,
                selectedForMerge.has(s.id)
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.divider },
              ]}
              testID={`segment-merge-toggle-${s.id}`}
            >
              <Text style={[styles.mergeToggleText, { color: colors.textSecondary }]}>
                {selectedForMerge.has(s.id) ? "✓" : "Merge"}
              </Text>
            </Pressable>
            <View style={styles.reorderRow}>
              <Pressable
                onPress={() => moveUp(idx)}
                style={[styles.reorderButton, { backgroundColor: colors.divider }]}
                testID={`segment-reorder-up-${s.id}`}
                disabled={idx === 0 || reordering}
              >
                <Text style={[styles.reorderText, { color: colors.textSecondary }]}>↑</Text>
              </Pressable>
              <Pressable
                onPress={() => moveDown(idx)}
                style={[styles.reorderButton, { backgroundColor: colors.divider }]}
                testID={`segment-reorder-down-${s.id}`}
                disabled={idx === segments.length - 1 || reordering}
              >
                <Text style={[styles.reorderText, { color: colors.textSecondary }]}>↓</Text>
              </Pressable>
            </View>
          </View>
          <SegmentEditor
            segment={s}
            onSave={onUpdate}
            onDelete={onDelete}
            onSplit={onSplit}
            saving={savingId === s.id}
            deleting={deletingId === s.id}
            testID={`segment-editor-${s.id}`}
          />
          {pendingId === s.id ? (
            <Text style={[styles.pendingHint, { color: colors.warning }]}>Pending sync…</Text>
          ) : null}
          {splittingId === s.id ? (
            <Text style={[styles.pendingHint, { color: colors.warning }]}>Splitting…</Text>
          ) : null}
        </View>
      ))}

      {segments.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]} testID="segment-edit-empty">
          No segments yet. Add a segment to describe this trail.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs, marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    fontSize: 13,
  },
  textarea: { minHeight: 60, textAlignVertical: "top" },
  label: { fontSize: 12, fontWeight: "600" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  surfaceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  surfaceOption: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    borderWidth: 1,
  },
  surfaceOptionText: { fontSize: 11, textTransform: "capitalize" },
  hazardRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hazardChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 10,
  },
  hazardChipText: { fontSize: 11, textTransform: "capitalize" },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  toggleLabel: { fontSize: 13 },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: 10, flexWrap: "wrap" },
  splitPanel: { marginTop: 10, gap: spacing.sm, paddingTop: 10, borderTopWidth: 1 },
  splitPositionRow: { flexDirection: "row", gap: 6 },
  splitPreset: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  splitPresetText: { fontSize: 12 },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  listTitle: { fontSize: 18, fontWeight: "600" },
  mergeBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  mergeHint: { fontSize: 12, flexShrink: 1, marginRight: spacing.sm },
  itemWrapper: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  mergeToggle: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.xs,
  },
  mergeToggleText: { fontSize: 11, fontWeight: "600" },
  reorderRow: { flexDirection: "row", gap: 6 },
  reorderButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.xs,
  },
  reorderText: { fontSize: 14 },
  empty: {
    textAlign: "center",
    fontStyle: "italic",
    padding: spacing.lg,
  },
  pendingHint: {
    fontSize: 11,
    textAlign: "right",
    marginTop: spacing.xs,
  },
});
