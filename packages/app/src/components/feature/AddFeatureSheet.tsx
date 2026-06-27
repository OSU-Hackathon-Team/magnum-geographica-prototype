import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  PRESET_CATEGORY_LABELS,
  type Preset,
  type PresetCategory,
} from "@magnum/shared";
import { Button } from "../ui/Button";
import { usePresetStore, groupPresetsByCategory } from "../../stores/presetStore";
import { useTheme } from "../../providers/ThemeProvider";
import { radii, spacing, text as textTokens } from "../../theme/tokens";
import type { ThemeColors } from "../../theme/colors";

export interface AddFeatureSheetResult {
  preset_id: string;
  name: string;
  answers: Record<string, string | boolean>;
  description?: string;
  /**
   * Pre-detected system id, if the parent passed one in via
   * `detectedSystemId` and the user didn't override it. The parent
   * uses this to default `system_id` on the create payload.
   */
  system_id?: string | null;
}

export interface AddFeatureSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (result: AddFeatureSheetResult) => void;
  /**
   * Optional default name to pre-fill (e.g. when the pin is dropped
   * near a known landmark, suggest "Shelter" as the default name).
   */
  initialName?: string;
  /**
   * Auto-detected system id from the point-in-polygon endpoint
   * (§21.4 "Mountains Park" pre-fill). Passed up to the route layer.
   */
  detectedSystemId?: string | null;
  submitting?: boolean;
  testID?: string;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: "90%",
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 8,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
    },
    headerTitle: { fontSize: 16, fontWeight: "700" },
    body: { flex: 1 },
    centered: { alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
    search: {
      margin: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 8,
      fontSize: 14,
    },
    chipsRow: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: c.surfaceMuted,
    },
    chipActive: { backgroundColor: c.primary },
    chipText: { fontSize: 12, color: c.textSecondary },
    chipTextActive: { color: c.textInverse, fontWeight: "600" },
    gridContent: { padding: 12, gap: 12, paddingBottom: 32 },
    section: { gap: 6 },
    sectionLabel: { fontSize: 12, fontWeight: "700", color: c.textMuted, textTransform: "uppercase" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    tile: {
      width: 88,
      paddingVertical: 12,
      paddingHorizontal: 6,
      alignItems: "center",
      gap: 4,
      borderRadius: 8,
      backgroundColor: c.surfaceMuted,
    },
    tileLabel: { fontSize: 11, textAlign: "center", color: c.text },

    questionsContent: { padding: 16, gap: 12, paddingBottom: 32 },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    presetTitle: { fontSize: 18, fontWeight: "700" },
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: "600", color: c.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 6,
      padding: 10,
      fontSize: 14,
      color: c.text,
      backgroundColor: c.surfaceMuted,
    },
    textArea: { minHeight: 80, textAlignVertical: "top" },
    booleanRow: { flexDirection: "row", gap: 8 },
    booleanBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: 8,
      backgroundColor: c.surfaceMuted,
    },
    booleanActive: { backgroundColor: c.primary },
    booleanText: { fontSize: 14, color: c.textSecondary, fontWeight: "600" },
    booleanTextActive: { color: c.textInverse },
    selectRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    selectBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: c.surfaceMuted,
    },
    selectActive: { backgroundColor: c.primary },
    selectText: { fontSize: 13, color: c.textSecondary },
    selectTextActive: { color: c.textInverse, fontWeight: "600" },

    photoPrompt: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 10,
      backgroundColor: c.successMuted,
      borderRadius: 6,
    },
    photoPromptText: { fontSize: 12, color: c.textOnTint, flex: 1 },

    footerRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 8 },
    hint: { color: c.textMuted, fontSize: 12 },
    errorText: { color: c.danger, fontSize: 12 },
  });

/**
 * §21.3.1 — the Add-Feature bottom sheet.
 *
 * Two-step flow:
 *   1. Preset grid (grouped by category with chip navigation)
 *   2. Questions + auto-filled name + photo prompt
 *
 * Photo capture is acknowledged but not wired here — the MediaUploader
 * component handles the actual camera/gallery. The sheet sends the
 * preset_id + answers back; the route layer attaches the media after
 * the feature is created (or queues both offline).
 */
export function AddFeatureSheet({
  visible,
  onClose,
  onSubmit,
  initialName = "",
  detectedSystemId,
  submitting,
  testID,
}: AddFeatureSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const presets = usePresetStore((s) => s.presets);
  const loading = usePresetStore((s) => s.loading);
  const error = usePresetStore((s) => s.error);
  const fetchPresets = usePresetStore((s) => s.fetchPresets);
  const loadFromCache = usePresetStore((s) => s.loadFromCache);

  const [step, setStep] = useState<"preset" | "questions">("preset");
  const [activeCategory, setActiveCategory] = useState<PresetCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (!visible) return;
    void loadFromCache();
    void fetchPresets();
  }, [visible, fetchPresets, loadFromCache]);

  // Reset transient state when the sheet is hidden.
  useEffect(() => {
    if (!visible) {
      setStep("preset");
      setActiveCategory("all");
      setSearch("");
      setSelectedPreset(null);
      setName(initialName);
      setDescription("");
      setAnswers({});
    } else {
      setName(initialName);
    }
  }, [visible, initialName]);

  const grouped = useMemo(() => groupPresetsByCategory(presets), [presets]);

  const filteredGrouped = useMemo(() => {
    if (activeCategory === "all" && !search) return grouped;
    const needle = search.trim().toLowerCase();
    return grouped
      .filter((g) => activeCategory === "all" || g.category === activeCategory)
      .map((g) => ({
        ...g,
        presets: g.presets.filter(
          (p) =>
            !needle ||
            p.label.toLowerCase().includes(needle) ||
            p.key.toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.presets.length > 0);
  }, [grouped, activeCategory, search]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of presets) set.add(p.category);
    return Array.from(set);
  }, [presets]);

  const handleSelectPreset = useCallback(
    (p: Preset) => {
      setSelectedPreset(p);
      // Auto-fill name from the preset label if blank.
      if (!name.trim()) setName(p.label);
      setStep("questions");
    },
    [name],
  );

  const handleAnswer = useCallback((key: string, value: string | boolean) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedPreset) return;
    onSubmit({
      preset_id: selectedPreset.id,
      name: name.trim() || selectedPreset.label,
      answers,
      description: description.trim() || undefined,
      system_id: detectedSystemId,
    });
  }, [answers, description, detectedSystemId, name, onSubmit, selectedPreset]);

  if (!visible) return null;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {step === "preset" ? "Add Feature" : selectedPreset?.label}
        </Text>
        <Pressable onPress={onClose} testID="add-feature-close" hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      {step === "preset" ? (
        <View style={styles.body}>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search presets…"
            placeholderTextColor={colors.textMuted}
            testID="add-feature-search"
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            <Chip
              label="All"
              active={activeCategory === "all"}
              onPress={() => setActiveCategory("all")}
              testID="add-feature-chip-all"
            />
            {allCategories.map((c) => (
              <Chip
                key={c}
                label={PRESET_CATEGORY_LABELS[c as PresetCategory] ?? c}
                active={activeCategory === c}
                onPress={() => setActiveCategory(c as PresetCategory)}
                testID={`add-feature-chip-${c}`}
              />
            ))}
          </ScrollView>

          {loading && presets.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.hint}>Loading presets…</Text>
            </View>
          ) : error && presets.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
              <Button size="small" variant="secondary" onPress={() => void fetchPresets(true)}>
                Retry
              </Button>
            </View>
          ) : filteredGrouped.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.hint}>No presets match.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.gridContent}>
              {filteredGrouped.map((g) => (
                <View key={g.category} style={styles.section}>
                  <Text style={styles.sectionLabel}>
                    {PRESET_CATEGORY_LABELS[g.category as PresetCategory] ?? g.category}
                  </Text>
                  <View style={styles.grid}>
                    {g.presets.map((p) => (
                      <PresetTile
                        key={p.id}
                        preset={p}
                        onPress={() => handleSelectPreset(p)}
                        testID={`add-feature-tile-${p.key}`}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.questionsContent}>
          <View style={styles.row}>
            <Ionicons
              name={(selectedPreset?.icon_name as never) ?? "ellipse"}
              size={32}
              color={selectedPreset?.icon_color ?? colors.textMuted}
            />
            <Text style={styles.presetTitle}>{selectedPreset?.label}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={selectedPreset?.label}
              testID="add-feature-name"
            />
          </View>

          {selectedPreset?.questions.map((q) => (
            <QuestionField
              key={q.key}
              question={q}
              value={answers[q.key]}
              onChange={(v) => handleAnswer(q.key, v)}
            />
          ))}

          <View style={styles.field}>
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Add a note…"
              multiline
              testID="add-feature-description"
            />
          </View>

          <View style={styles.photoPrompt}>
            <Ionicons name="camera" size={20} color={colors.primary} />
            <Text style={styles.photoPromptText}>
              Add a photo after saving — it helps others find this feature.
            </Text>
          </View>

          <View style={styles.footerRow}>
            <Button
              variant="secondary"
              onPress={() => setStep("preset")}
              testID="add-feature-back"
            >
              Back
            </Button>
            <Button
              variant="primary"
              onPress={handleSubmit}
              disabled={submitting}
              testID="add-feature-submit"
            >
              {submitting ? "Saving…" : "Save Feature"}
            </Button>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
      testID={testID}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function PresetTile({
  preset,
  onPress,
  testID,
}: {
  preset: Preset;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable style={styles.tile} onPress={onPress} testID={testID}>
      <Ionicons
        name={(preset.icon_name as never) ?? "ellipse"}
        size={28}
        color={preset.icon_color}
      />
      <Text style={styles.tileLabel} numberOfLines={2}>
        {preset.label}
      </Text>
    </Pressable>
  );
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: { key: string; type: "boolean" | "select"; label: string; options?: { value: string; label: string }[] };
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (question.type === "boolean") {
    const v = value === true;
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{question.label}</Text>
        <View style={styles.booleanRow}>
          <Pressable
            style={[styles.booleanBtn, v === true ? styles.booleanActive : null]}
            onPress={() => onChange(true)}
            testID={`question-${question.key}-yes`}
          >
            <Text style={[styles.booleanText, v === true ? styles.booleanTextActive : null]}>Yes</Text>
          </Pressable>
          <Pressable
            style={[styles.booleanBtn, v === false ? styles.booleanActive : null]}
            onPress={() => onChange(false)}
            testID={`question-${question.key}-no`}
          >
            <Text style={[styles.booleanText, v === false ? styles.booleanTextActive : null]}>No</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  // select
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{question.label}</Text>
      <View style={styles.selectRow}>
        {(question.options ?? []).map((opt) => {
          const active = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.selectBtn, active ? styles.selectActive : null]}
              onPress={() => onChange(opt.value)}
              testID={`question-${question.key}-${opt.value}`}
            >
              <Text style={[styles.selectText, active ? styles.selectTextActive : null]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
