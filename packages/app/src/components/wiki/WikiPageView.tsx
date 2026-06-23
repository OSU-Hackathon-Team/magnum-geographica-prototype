import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { WikiPage, Revision } from "@magnum/shared";
import { Button } from "../ui/Button";

function renderMarkdown(md: string): Array<{ type: "h1" | "h2" | "h3" | "p" | "li" | "hr"; text: string; url?: string }> {
  const lines = md.split("\n");
  const blocks: Array<{ type: "h1" | "h2" | "h3" | "p" | "li" | "hr"; text: string; url?: string }> = [];
  let buf = "";

  function flush() {
    const trimmed = buf.trim();
    if (trimmed) {
      blocks.push({ type: "p", text: trimmed });
    }
    buf = "";
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (line.startsWith("### ")) {
      flush();
      blocks.push({ type: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ type: "h2", text: line.slice(3) });
    } else if (line.startsWith("# ")) {
      flush();
      blocks.push({ type: "h1", text: line.slice(2) });
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      flush();
      blocks.push({ type: "li", text: line.slice(2) });
    } else if (line.startsWith("---") || line === "***") {
      flush();
      blocks.push({ type: "hr", text: "" });
    } else if (line === "") {
      flush();
    } else {
      buf += (buf ? "\n" : "") + line;
    }
  }
  flush();
  return blocks;
}

function renderInline(text: string): Array<{ type: "text" | "bold" | "italic" | "code" | "link"; text: string; url?: string }> {
  const parts: Array<{ type: "text" | "bold" | "italic" | "code" | "link"; text: string; url?: string }> = [];
  let i = 0;
  let current = "";

  while (i < text.length) {
    if (text[i] === "[" && text.indexOf("](", i) > i) {
      const closeBracket = text.indexOf("](", i);
      const closeParen = text.indexOf(")", closeBracket + 2);
      if (closeParen > closeBracket) {
        if (current) parts.push({ type: "text", text: current });
        current = "";
        const linkText = text.slice(i + 1, closeBracket);
        const url = text.slice(closeBracket + 2, closeParen);
        parts.push({ type: "link", text: linkText, url });
        i = closeParen + 1;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i) {
        if (current) parts.push({ type: "text", text: current });
        current = "";
        parts.push({ type: "bold", text: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] !== "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i) {
        if (current) parts.push({ type: "text", text: current });
        current = "";
        parts.push({ type: "italic", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        if (current) parts.push({ type: "text", text: current });
        current = "";
        parts.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    current += text[i];
    i++;
  }
  if (current) parts.push({ type: "text", text: current });

  return parts;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export interface WikiPageViewProps {
  wikiPage: WikiPage;
  citationCount?: number;
  revisionCount?: number;
  lastRevision?: Revision | null;
  onEdit?: () => void;
  onViewHistory?: () => void;
}

export function WikiPageView({
  wikiPage,
  citationCount = 0,
  revisionCount = 0,
  lastRevision,
  onEdit,
  onViewHistory,
}: WikiPageViewProps) {
  const blocks = renderMarkdown(wikiPage.content_md);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} testID="wiki-page-title">{wikiPage.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta} testID="wiki-page-meta">
            Updated {formatDate(wikiPage.updated_at)}
          </Text>
          {lastRevision ? (
            <Text style={styles.meta} testID="wiki-page-contributor">
              {" "}· by {lastRevision.contributor_name}
            </Text>
          ) : null}
        </View>
        <View style={styles.actionRow}>
          {revisionCount > 0 ? (
            <Pressable onPress={onViewHistory} testID="wiki-view-history" style={styles.actionBtn}>
              <Ionicons name="time-outline" size={12} color="#666" />
              <Text style={styles.actionText}>{revisionCount} revision{revisionCount !== 1 ? "s" : ""}</Text>
            </Pressable>
          ) : null}
          {citationCount > 0 ? (
            <Text style={styles.actionText} testID="wiki-citation-count">{citationCount} citation{citationCount !== 1 ? "s" : ""}</Text>
          ) : null}
          {onEdit ? (
            <Button variant="primary" size="small" onPress={onEdit} testID="wiki-edit-button">
              Edit
            </Button>
          ) : null}
        </View>
      </View>

      <View style={styles.content} testID="wiki-page-content">
        {blocks.length === 0 ? (
          <Text style={styles.empty} testID="wiki-page-empty">No content yet. Tap Edit to add information.</Text>
        ) : (
          blocks.map((block, idx) => {
            if (block.type === "hr") {
              return <View key={idx} style={styles.hr} />;
            }
            const inline = renderInline(block.text);
            const baseStyle = block.type === "h1"
              ? styles.h1
              : block.type === "h2"
                ? styles.h2
                : block.type === "h3"
                  ? styles.h3
                  : block.type === "li"
                    ? styles.li
                    : styles.p;
            return (
              <Text key={idx} style={baseStyle}>
                {block.type === "li" ? "· " : null}
                {inline.map((p, i) => {
                  if (p.type === "link") {
                    return (
                      <Text
                        key={i}
                        style={{ color: "#22c55e", textDecorationLine: "underline" }}
                        onPress={() => p.url && Linking.openURL(p.url)}
                      >
                        {p.text}
                      </Text>
                    );
                  }
                  if (p.type === "bold") return <Text key={i} style={{ fontWeight: "700" }}>{p.text}</Text>;
                  if (p.type === "italic") return <Text key={i} style={{ fontStyle: "italic" }}>{p.text}</Text>;
                  if (p.type === "code") return <Text key={i} style={{ fontFamily: "monospace", backgroundColor: "#f1f1f1" }}>{p.text}</Text>;
                  return <Text key={i}>{p.text}</Text>;
                })}
              </Text>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
    gap: 6,
  },
  title: { fontSize: 22, fontWeight: "700" },
  metaRow: { flexDirection: "row", flexWrap: "wrap" },
  meta: { fontSize: 12, color: "#888" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 12, color: "#666" },
  content: { padding: 16 },
  h1: { fontSize: 22, fontWeight: "700", marginBottom: 12, marginTop: 8 },
  h2: { fontSize: 18, fontWeight: "600", marginBottom: 10, marginTop: 8 },
  h3: { fontSize: 15, fontWeight: "600", marginBottom: 8, marginTop: 6 },
  p: { fontSize: 14, color: "#444", lineHeight: 22, marginBottom: 10 },
  li: { fontSize: 14, color: "#444", lineHeight: 22, marginBottom: 4, paddingLeft: 8 },
  hr: { height: 1, backgroundColor: "#e0e0e0", marginVertical: 14 },
  empty: { fontSize: 14, color: "#aaa", fontStyle: "italic" },
});
