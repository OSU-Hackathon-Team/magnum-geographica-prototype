import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { WikiPage } from "@magnum/shared";
import { Button } from "../ui/Button";
import { WikiPageView } from "./WikiPageView";
import { RevisionHistory } from "./RevisionHistory";
import { CitationForm } from "./CitationForm";
import type { Revision, Citation } from "@magnum/shared";

export interface WikiPageEditorProps {
  wikiPage?: WikiPage | null;
  isLoading?: boolean;
  contributorName: string;
  onContributorNameChange: (name: string) => void;
  onSave: (data: { title: string; content_md: string; edit_summary: string }) => void;
  canSave?: boolean;
  revisions?: Revision[];
  onRevert?: (revisionId: string) => void;
  citations?: Citation[];
  onAddCitation?: (citation: { url?: string; title: string }) => void;
  onDeleteCitation?: (citationId: string) => void;
  defaultTitle?: string;
}

export function WikiPageEditor({
  wikiPage,
  isLoading,
  contributorName,
  onContributorNameChange,
  onSave,
  canSave = true,
  revisions,
  onRevert,
  citations,
  onAddCitation,
  onDeleteCitation,
  defaultTitle,
}: WikiPageEditorProps) {
  const [title, setTitle] = useState(wikiPage?.title ?? defaultTitle ?? "");
  const [content, setContent] = useState(wikiPage?.content_md ?? "");
  const [editSummary, setEditSummary] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [tab, setTab] = useState<"edit" | "revisions" | "citations">("edit");

  useEffect(() => {
    setTitle(wikiPage?.title ?? defaultTitle ?? "");
    setContent(wikiPage?.content_md ?? "");
    setEditSummary("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wikiPage?.id]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const previewPage = {
    ...wikiPage,
    title,
    content_md: content,
  } as WikiPage;

  return (
    <ScrollView style={styles.container} testID="wiki-editor">
      <View style={styles.section}>
        <Text style={styles.label}>Contributor Name</Text>
        <TextInput
          style={styles.input}
          value={contributorName}
          onChangeText={onContributorNameChange}
          placeholder="anonymous"
          testID="wiki-editor-contributor"
        />
      </View>

      {tab === "edit" ? (
        <>
          <View style={styles.section}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Wiki page title"
              testID="wiki-editor-title"
            />
          </View>

          <View style={styles.section}>
            <View style={styles.toolbarRow}>
              <Text style={styles.label}>Content (Markdown)</Text>
              <Button
                variant="ghost"
                size="small"
                onPress={() => setShowPreview(!showPreview)}
                testID="wiki-toggle-preview"
              >
                <Ionicons
                  name={showPreview ? "create-outline" : "eye-outline"}
                  size={14}
                  color="#666"
                />
                <Text style={styles.btnLabel}>{showPreview ? "Edit" : "Preview"}</Text>
              </Button>
            </View>
            {showPreview ? (
              <View style={styles.previewBox} testID="wiki-editor-preview">
                <WikiPageView wikiPage={previewPage} />
              </View>
            ) : (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={content}
                onChangeText={setContent}
                placeholder="Write wiki content in Markdown..."
                multiline
                textAlignVertical="top"
                testID="wiki-editor-content"
              />
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Edit Summary (optional)</Text>
            <TextInput
              style={styles.input}
              value={editSummary}
              onChangeText={setEditSummary}
              placeholder="Describe your changes"
              testID="wiki-editor-summary"
            />
          </View>

          <View style={styles.section}>
            <Button
              variant="primary"
              onPress={() => onSave({ title, content_md: content, edit_summary: editSummary })}
              disabled={!canSave || !title.trim()}
              testID="wiki-editor-save"
              title={wikiPage ? "Save Changes" : "Create Page"}
            />
          </View>
        </>
      ) : null}

      <View style={styles.section}>
        <View style={styles.tabBar}>
          {[
            { key: "edit" as const, label: "Edit", icon: "create-outline" as const },
            { key: "revisions" as const, label: "History", icon: "time-outline" as const },
            { key: "citations" as const, label: "Citations", icon: "link-outline" as const },
          ].map((t) => (
            <Button
              key={t.key}
              variant={tab === t.key ? "primary" : "ghost"}
              size="small"
              onPress={() => setTab(t.key)}
              testID={`wiki-tab-${t.key}`}
            >
              <Ionicons name={t.icon} size={14} color={tab === t.key ? "#fff" : "#666"} />
              <Text style={[styles.btnLabel, tab === t.key ? styles.btnLabelActive : null]}>
                {t.label}
              </Text>
            </Button>
          ))}
        </View>
      </View>

      {tab === "revisions" && revisions !== undefined && (
        <View style={styles.section}>
          <RevisionHistory revisions={revisions} onRevert={onRevert} />
        </View>
      )}

      {tab === "citations" && (
        <View style={styles.section}>
          <CitationForm
            citations={citations ?? []}
            onAdd={(c) => onAddCitation?.(c)}
            onDelete={(id) => onDeleteCitation?.(id)}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  section: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#444" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: "#222",
    backgroundColor: "#fafafa",
  },
  textArea: { minHeight: 180 },
  toolbarRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  previewBox: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 6,
    backgroundColor: "#fafafa",
    minHeight: 180,
  },
  tabBar: { flexDirection: "row", gap: 8 },
  btnLabel: { fontSize: 12, fontWeight: "600", color: "#666" },
  btnLabelActive: { color: "#fff" },
});
