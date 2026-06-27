import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { router, Link } from "expo-router";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Form } from "../../src/components/ui/Form";
import { useAuthStore } from "../../src/stores/authStore";
import { createMagnumClient } from "@magnum/shared/api/endpoints";
import { useTheme } from "../../src/providers/ThemeProvider";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function RegisterScreen() {
  const { colors } = useTheme();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleRegister = async () => {
    setError(null);
    if (!username.trim() || !email.trim() || !password.trim()) {
      setError("All fields are required");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const client = createMagnumClient(API_URL);
      const result = await client.register({ username: username.trim(), email: email.trim(), password });
      await setAuth(result.access_token, result.refresh_token, result.user);
      router.replace("/(tabs)/explore");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Registration failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      testID="register-screen"
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <Form onSubmit={handleRegister}>
        <Text style={styles.heading}>Create Account</Text>
        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerMuted }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        )}
        <Text style={styles.label}>Username</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
          value={username}
          onChangeText={setUsername}
          placeholder="trailhiker42"
          textContentType="username"
          autoComplete="username"
          importantForAutofill="yes"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          testID="register-username"
          editable={!loading}
        />
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          importantForAutofill="yes"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          testID="register-email"
          editable={!loading}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          importantForAutofill="yes"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          testID="register-password"
          editable={!loading}
        />
        <Text style={styles.label}>Confirm Password</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Type it again"
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          importantForAutofill="yes"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          testID="register-confirm-password"
          editable={!loading}
        />
        <View style={styles.buttonRow}>
          <Button
            onPress={handleRegister}
            disabled={loading}
            testID="register-submit"
            style={{ flex: 1 }}
          >
            {loading ? <ActivityIndicator color={colors.textInverse} size="small" /> : "Create Account"}
          </Button>
        </View>
        </Form>
        <Link href="/auth/login" style={[styles.link, { color: colors.primary }]} testID="register-to-login">
          Already have an account? Log in
        </Link>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  heading: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  buttonRow: { marginTop: 16, flexDirection: "row", gap: 8 },
  link: { fontSize: 14, textAlign: "center", marginTop: 12 },
  errorBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  errorText: { fontSize: 13 },
});
