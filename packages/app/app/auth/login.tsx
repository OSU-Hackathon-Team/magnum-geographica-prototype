import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router, Link } from "expo-router";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { useAuthStore } from "../../src/stores/authStore";
import { createMagnumClient } from "@magnum/shared/api/endpoints";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleLogin = async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      const client = createMagnumClient(API_URL);
      const result = await client.login({ email: email.trim(), password });
      await setAuth(result.access_token, result.refresh_token, result.user);
      router.replace("/(tabs)");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Login failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="login-screen"
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <Text style={styles.heading}>Welcome Back</Text>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          testID="login-email"
          editable={!loading}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          testID="login-password"
          editable={!loading}
        />
        <View style={styles.buttonRow}>
          <Button
            onPress={handleLogin}
            disabled={loading}
            testID="login-submit"
            style={{ flex: 1 }}
          >
            {loading ? <ActivityIndicator color="#fff" size="small" /> : "Log In"}
          </Button>
        </View>
        <Link href="/auth/register" style={styles.link} testID="login-to-register">
          Don&apos;t have an account? Create one
        </Link>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 12 },
  heading: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: "#fafafa",
  },
  buttonRow: { marginTop: 16, flexDirection: "row", gap: 8 },
  link: { color: "#22c55e", fontSize: 14, textAlign: "center", marginTop: 12 },
  errorBox: {
    backgroundColor: "#fee2e2",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  errorText: { color: "#dc2626", fontSize: 13 },
});
