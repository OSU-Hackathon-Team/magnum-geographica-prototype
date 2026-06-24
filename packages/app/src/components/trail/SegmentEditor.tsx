import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import {
  SURFACE_TYPES,
  type SurfaceType,
  type TrailSegment,
  type UpdateSegmentInput,
} from "@magnum/shared";
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
          <Text style={styles.label}>Segment {segment.sort_order + 1}</Text>
          {surfaceType ? <SegmentTypeBadge surface={surfaceType} /> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Optional"
            testID={`segment-editor-name-${segment.id}`}
            editable={canSave}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Surface</Text>
          <View style={styles.surfaceRow}>
            {SURFACE_TYPES.map((s) => (
              <Pressable
                key={s}
                onPress={() => setSurfaceType(surfaceType === s ? null : s)}
                style={[styles.surfaceOption, surfaceType === s && styles.surfaceOptionActive]}
                testID={`segment-editor-surface-${s}-${segment.id}`}
                disabled={!canSave}
              >
                <Text
                  style={[
                    styles.surfaceOptionText,
                    surfaceType === s && styles.surfaceOptionTextActive,
                  ]}
                >
                  {s.replace("_", " ")}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Hazards</Text>
          <View style={styles.hazardRow}>
            {HAZARD_OPTIONS.map((h) => {
              const active = hazards.includes(h);
              return (
                <Pressable
                  key={h}
                  onPress={() => toggleHazard(h)}
                  style={[styles.hazardChip, active && styles.hazardChipActive]}
                  testID={`segment-editor-hazard-${h}-${segment.id}`}
                  disabled={!canSave}
                >
                  <Text style={[styles.hazardChipText, active && styles.hazardChipTextActive]}>
                    {h.replace("_", " ")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Steep grade</Text>
          <Switch
            value={steepGrade}
            onValueChange={setSteepGrade}
            testID={`segment-editor-steep-${segment.id}`}
            disabled={!canSave}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Road connector</Text>
          <Switch
            value={isRoadConnector}
            onValueChange={setIsRoadConnector}
            testID={`segment-editor-road-${segment.id}`}
            disabled={!canSave}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>One-way</Text>
          <Switch
            value={oneWay}
            onValueChange={setOneWay}
            testID={`segment-editor-oneway-${segment.id}`}
            disabled={!canSave}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
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
          <View style={styles.splitPanel} testID={`segment-editor-split-panel-${segment.id}`}>
            <Text style={styles.fieldLabel}>Split position (0.0 – 1.0)</Text>
            <View style={styles.splitPositionRow}>
              {[0.25, 0.5, 0.75].map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setSplitAt(v)}
                  style={[styles.splitPreset, splitAt === v && styles.splitPresetActive]}
                  testID={`segment-editor-split-preset-${v}-${segment.id}`}
                >
                  <Text
                    style={[styles.splitPresetText, splitAt === v && styles.splitPresetTextActive]}
                  >
                    {v}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={String(splitAt)}
              onChangeText={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) setSplitAt(n);
              }}
              keyboardType="numeric"
              testID={`segment-editor-split-value-${segment.id}`}
            />
            <TextInput
              style={styles.input}
              value={nameA}
              onChangeText={setNameA}
              placeholder="Name for first half (optional)"
              testID={`segment-editor-split-name-a-${segment.id}`}
            />
            <TextInput
              style={styles.input}
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

      <View style={styles.mergeBar} testID="segment-merge-bar">
        <Text style={styles.mergeHint} testID="segment-merge-count">
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
              style={[styles.mergeToggle, selectedForMerge.has(s.id) && styles.mergeToggleActive]}
              testID={`segment-merge-toggle-${s.id}`}
            >
              <Text style={styles.mergeToggleText}>
                {selectedForMerge.has(s.id) ? "✓" : "Merge"}
              </Text>
            </Pressable>
            <View style={styles.reorderRow}>
              <Pressable
                onPress={() => moveUp(idx)}
                style={styles.reorderButton}
                testID={`segment-reorder-up-${s.id}`}
                disabled={idx === 0 || reordering}
              >
                <Text style={styles.reorderText}>↑</Text>
              </Pressable>
              <Pressable
                onPress={() => moveDown(idx)}
                style={styles.reorderButton}
                testID={`segment-reorder-down-${s.id}`}
                disabled={idx === segments.length - 1 || reordering}
              >
                <Text style={styles.reorderText}>↓</Text>
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
          {pendingId === s.id ? <Text style={styles.pendingHint}>Pending sync…</Text> : null}
          {splittingId === s.id ? <Text style={styles.pendingHint}>Splitting…</Text> : null}
        </View>
      ))}

      {segments.length === 0 ? (
        <Text style={styles.empty} testID="segment-edit-empty">
          No segments yet. Add a segment to describe this trail.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: { gap: 4, marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#555" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    color: "#222",
    backgroundColor: "#fafafa",
  },
  textarea: { minHeight: 60, textAlignVertical: "top" },
  label: { fontSize: 12, fontWeight: "600", color: "#555" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  surfaceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  surfaceOption: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "transparent",
  },
  surfaceOptionActive: {
    backgroundColor: "#fff7ed",
    borderColor: "#ea580c",
  },
  surfaceOptionText: { fontSize: 11, color: "#666", textTransform: "capitalize" },
  surfaceOptionTextActive: { color: "#9a3412", fontWeight: "600" },
  hazardRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hazardChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
  },
  hazardChipActive: { backgroundColor: "#fee2e2" },
  hazardChipText: { fontSize: 11, color: "#666", textTransform: "capitalize" },
  hazardChipTextActive: { color: "#991b1b", fontWeight: "600" },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  toggleLabel: { fontSize: 13, color: "#333" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  splitPanel: { marginTop: 10, gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#eee" },
  splitPositionRow: { flexDirection: "row", gap: 6 },
  splitPreset: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#f0f0f0",
  },
  splitPresetActive: { backgroundColor: "#1d4ed8" },
  splitPresetText: { fontSize: 12, color: "#666" },
  splitPresetTextActive: { color: "#fff", fontWeight: "600" },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listTitle: { fontSize: 18, fontWeight: "600" },
  mergeBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fef9c3",
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 6,
  },
  mergeHint: { fontSize: 12, color: "#854d0e", flexShrink: 1, marginRight: 8 },
  itemWrapper: { marginHorizontal: 16, marginBottom: 12 },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  mergeToggle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#f0f0f0",
  },
  mergeToggleActive: { backgroundColor: "#1d4ed8" },
  mergeToggleText: { fontSize: 11, color: "#666", fontWeight: "600" },
  reorderRow: { flexDirection: "row", gap: 6 },
  reorderButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#f0f0f0",
  },
  reorderText: { fontSize: 14, color: "#666" },
  empty: {
    textAlign: "center",
    color: "#888",
    fontStyle: "italic",
    padding: 16,
  },
  pendingHint: {
    fontSize: 11,
    color: "#854d0e",
    textAlign: "right",
    marginTop: 4,
  },
});
