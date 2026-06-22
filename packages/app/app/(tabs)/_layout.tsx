import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusIndicator } from "../../src/components/offline/StatusIndicator";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerRight: () => <StatusIndicator />,
        tabBarActiveTintColor: "#22c55e",
        tabBarInactiveTintColor: "#888",
      }}
    >
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarTestID: "tab-explore",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="systems"
        options={{
          title: "Systems",
          tabBarTestID: "tab-systems",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="trails"
        options={{
          title: "Trails",
          tabBarTestID: "tab-trails",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trail-sign-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarTestID: "tab-profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
