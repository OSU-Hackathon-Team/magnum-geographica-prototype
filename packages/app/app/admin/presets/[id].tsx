import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  createMagnumClient,
  PRESET_CATEGORIES,
  PRESET_CATEGORY_LABELS,
  PRESET_QUESTIONS_MAX,
  PRESET_SELECT_MAX_OPTIONS,
  type Preset,
  type PresetCategory,
} from "@magnum/shared";
import { useAuthStore } from "../../../src/stores/authStore";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { Button } from "../../../src/components/ui/Button";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface QuestionDraft {
  key: string;
  type: "boolean" | "select";
  label: string;
  options: { value: string; label: string }[];
}

const IONICONS_GLYPHS = [
  "ellipse",
  "flag",
  "water",
  "home",
  "bonfire",
  "eye",
  "man",
  "car",
  "car-sport",
  "cafe",
  "restaurant",
  "navigate",
  "map",
  "information-circle",
  "git-merge",
  "warning",
  "trending-up",
  "leaf",
  "rainy",
  "moon",
  "git-network",
  "subway",
  "trash",
];

const COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#8B4513", "#059669",
  "#6366f1", "#64748b", "#7c3aed", "#475569", "#dc2626",
  "#f97316", "#9ca3af", "#16a34a", "#ef4444",
];

export default function AdminPresetEditorScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const isNew = !params.id || params.id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [iconName, setIconName] = useState("ellipse");
  const [iconColor, setIconColor] = useState(colors.primary);
  const [category, setCategory] = useState<PresetCategory>("landmarks");
  const [upstreamable, setUpstreamable] = useState(false);
  const [sortOrder, setSortOrder] = useState(100);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  useEffect(() => {
    if (isNew) return;
    const id = params.id;
    if (!id) return;
    void (async () => {
      try {
        const client = createMagnumClient(API_URL, {
          getAuthToken: () => token ?? undefined,
        });
        const p = await client.raw.request<Preset>("GET", `/api/presets/${id}`);
        setKey(p.key);
        setLabel(p.label);
        setIconName(p.icon_name);
        setIconColor(p.icon_color);
        setCategory(p.category as PresetCategory);
        setUpstreamable(p.upstreamable);
        setSortOrder(p.sort_order);
        setQuestions(
          p.questions.map((q) => ({
            key: q.key,
            type: q.type,
            label: q.label,
            options: q.options ?? [],
          })),
        );
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [isNew, params.id, token]);

  const addQuestion = useCallback(() => {
    if (questions.length >= PRESET_QUESTIONS_MAX) {
      Alert.alert("Limit reached", `Presets can have at most ${PRESET_QUESTIONS_MAX} questions.`);
      return;
    }
    setQuestions((prev) => [
      ...prev,
      { key: `q${prev.length + 1}`, type: "boolean", label: "", options: [] },
    ]);
  }, [questions.length]);

  const updateQuestion = useCallback((idx: number, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }, []);

  const removeQuestion = useCallback((idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addOption = useCallback((qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        if (q.options.length >= PRESET_SELECT_MAX_OPTIONS) {
          Alert.alert("Limit", `A select question can have at most ${PRESET_SELECT_MAX_OPTIONS} options.`);
          return q;
        }
        return {
          ...q,
          options: [...q.options, { value: `opt${q.options.length + 1}`, label: "" }],
        };
      }),
    );
  }, []);

  const updateOption = useCallback(
    (qIdx: number, oIdx: number, patch: Partial<{ value: string; label: string }>) => {
      setQuestions((prev) =>
        prev.map((q, i) =>
          i === qIdx
            ? { ...q, options: q.options.map((o, j) => (j === oIdx ? { ...o, ...patch } : o)) }
            : q,
        ),
      );
    },
    [],
  );

  const removeOption = useCallback((qIdx: number, oIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx ? { ...q, options: q.options.filter((_, j) => j !== oIdx) } : q,
      ),
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!key.trim() || !label.trim()) {
      Alert.alert("Missing fields", "Key and label are required.");
      return;
    }
    setSaving(true);
    const body = isNew
      ? {
          key: key.trim(),
          label: label.trim(),
          icon_name: iconName,
          icon_color: iconColor,
          category,
          upstreamable,
          sort_order: sortOrder,
          questions,
        }
      : {
          label: label.trim(),
          icon_name: iconName,
          icon_color: iconColor,
          category,
          upstreamable,
          sort_order: sortOrder,
          questions,
        };
    try {
      const client = createMagnumClient(API_URL, {
        getAuthToken: () => token ?? undefined,
      });
      if (isNew) {
        await client.raw.request("POST", "/api/presets", { body });
      } else {
        await client.raw.request("PUT", `/api/presets/${params.id}`, { body });
      }
      router.back();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [category, iconColor, iconName, isNew, key, label, params.id, questions, router, sortOrder, token, upstreamable]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: isNew ? "New Preset" : `Edit ${label}` }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} testID="admin-preset-editor">
        <Section title="Identity">
          <Field label="Key (snake_case)">
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text }]}
              value={key}
              onChangeText={setKey}
              editable={isNew}
              placeholder="bench"
              autoCapitalize="none"
              testID="preset-key"
            />
          </Field>
          <Field label="Label">
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text }]}
              value={label}
              onChangeText={setLabel}
              placeholder="Bench"
              testID="preset-label"
            />
          </Field>
          <Field label="Sort order">
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text }]}
              value={String(sortOrder)}
              onChangeText={(v) => setSortOrder(Number(v) || 0)}
              keyboardType="numeric"
              testID="preset-sort-order"
            />
          </Field>
          <Field label="Upstreamable to OSM">
            <Switch value={upstreamable} onValueChange={setUpstreamable} testID="preset-upstreamable" />
          </Field>
        </Section>

        <Section title="Category">
          <View style={styles.chipsRow}>
            {PRESET_CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.chip, category === c ? [styles.chipActive, { backgroundColor: colors.primary }] : { backgroundColor: colors.surfaceMutedStrong }]}
                testID={`preset-category-${c}`}
              >
                <Text style={[styles.chipText, category === c ? [styles.chipTextActive, { color: colors.textInverse }] : { color: colors.text }]}>
                  {PRESET_CATEGORY_LABELS[c]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="Icon">
          <View style={styles.iconRow}>
            {IONICONS_GLYPHS.map((g) => (
              <Pressable
                key={g}
                onPress={() => setIconName(g)}
                style={[styles.iconBtn, iconName === g ? [styles.iconBtnActive, { borderColor: colors.primary, backgroundColor: colors.successMuted }] : null]}
                testID={`preset-icon-${g}`}
              >
                <Ionicons name={g as never} size={20} color={iconName === g ? iconColor : colors.textMuted} />
              </Pressable>
            ))}
          </View>
          <View style={styles.chipsRow}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setIconColor(c)}
                style={[
                  styles.colorDot,
                  { backgroundColor: c },
                  iconColor === c ? [styles.colorDotActive, { borderColor: colors.text }] : null,
                ]}
                testID={`preset-color-${c}`}
              />
            ))}
          </View>
          <View style={styles.previewRow}>
            <Ionicons name={iconName as never} size={28} color={iconColor} />
            <Text style={styles.previewLabel}>{label || key || "Preview"}</Text>
          </View>
        </Section>

        <Section
          title={`Questions (${questions.length}/${PRESET_QUESTIONS_MAX})`}
          action={
            <Button size="small" variant="secondary" onPress={addQuestion} testID="preset-add-question">
              Add
            </Button>
          }
        >
          {questions.length === 0 ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>No questions — feature will save with just a name.</Text>
          ) : (
            questions.map((q, qi) => (
              <View key={qi} style={[styles.questionCard, { backgroundColor: colors.surfaceMuted }]}>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.flex1, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text }]}
                    value={q.label}
                    onChangeText={(v) => updateQuestion(qi, { label: v })}
                    placeholder="Question label"
                    testID={`preset-q-${qi}-label`}
                  />
                  <Pressable onPress={() => removeQuestion(qi)} style={styles.removeBtn} testID={`preset-q-${qi}-remove`}>
                    <Ionicons name="close" size={18} color={colors.danger} />
                  </Pressable>
                </View>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.flex1, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text }]}
                    value={q.key}
                    onChangeText={(v) => updateQuestion(qi, { key: v })}
                    placeholder="question_key"
                    autoCapitalize="none"
                    testID={`preset-q-${qi}-key`}
                  />
                  <Pressable
                    onPress={() => updateQuestion(qi, { type: q.type === "boolean" ? "select" : "boolean" })}
                    style={[styles.typeBtn, { backgroundColor: colors.primaryMuted }]}
                    testID={`preset-q-${qi}-type`}
                  >
                    <Text style={[styles.typeBtnText, { color: colors.text }]}>{q.type}</Text>
                  </Pressable>
                </View>
                {q.type === "select" ? (
                  <View style={[styles.optionsBlock, { borderLeftColor: colors.primaryMuted }]}>
                    {q.options.map((o, oi) => (
                      <View key={oi} style={styles.row}>
                        <TextInput
                          style={[styles.input, styles.flex2, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text }]}
                          value={o.value}
                          onChangeText={(v) => updateOption(qi, oi, { value: v })}
                          placeholder="value"
                          autoCapitalize="none"
                          testID={`preset-q-${qi}-opt-${oi}-value`}
                        />
                        <TextInput
                          style={[styles.input, styles.flex3, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text }]}
                          value={o.label}
                          onChangeText={(v) => updateOption(qi, oi, { label: v })}
                          placeholder="Label"
                          testID={`preset-q-${qi}-opt-${oi}-label`}
                        />
                        <Pressable
                          onPress={() => removeOption(qi, oi)}
                          style={styles.removeBtn}
                          testID={`preset-q-${qi}-opt-${oi}-remove`}
                        >
                          <Ionicons name="close" size={18} color={colors.danger} />
                        </Pressable>
                      </View>
                    ))}
                    <Button size="small" variant="secondary" onPress={() => addOption(qi)} testID={`preset-q-${qi}-add-option`}>
                      + Option
                    </Button>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </Section>

        <View style={styles.footer}>
          <Button variant="secondary" onPress={() => router.back()} testID="preset-cancel">
            Cancel
          </Button>
          <Button variant="primary" onPress={handleSave} disabled={saving} testID="preset-save">
            {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </View>
      </ScrollView>
    </>
  );

  function Section({
    title,
    action,
    children,
  }: {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
  }) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
          {action}
        </View>
        <View style={{ gap: 8 }}>{children}</View>
      </View>
    );
  }

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        {children}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  section: { gap: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 14, fontWeight: "700" },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  flex3: { flex: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  removeBtn: { padding: 6 },
  typeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  typeBtnText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  optionsBlock: { gap: 6, paddingLeft: 12, borderLeftWidth: 2 },
  questionCard: { gap: 8, padding: 12, borderRadius: 8 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  chipActive: {},
  chipText: { fontSize: 12 },
  chipTextActive: { fontWeight: "600" },
  iconRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  iconBtn: { padding: 6, borderRadius: 6, borderWidth: 1, borderColor: "transparent" },
  iconBtnActive: {},
  colorDot: { width: 22, height: 22, borderRadius: 11 },
  colorDotActive: { borderWidth: 2 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8 },
  previewLabel: { fontSize: 14, fontWeight: "600" },
  hint: { fontSize: 12, fontStyle: "italic" },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 8 },
});
