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
          tabBarButtonTestID: "tab-explore",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: "Record",
          tabBarButtonTestID: "tab-record",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="radio-button-on-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="systems"
        options={{
          title: "Systems",
          tabBarButtonTestID: "tab-systems",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="trails"
        options={{
          title: "Trails",
          tabBarButtonTestID: "tab-trails",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trail-sign-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarButtonTestID: "tab-profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
