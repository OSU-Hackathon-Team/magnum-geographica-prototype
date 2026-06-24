import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import React from "react";

interface FormProps {
  onSubmit: () => void;
  children: ReactNode;
}

export function Form({ onSubmit, children }: FormProps) {
  if (Platform.OS === "web") {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit();
    };
    return React.createElement(
      "form",
      {
        onSubmit: handleSubmit,
        style: { display: "flex", flexDirection: "column", gap: 12, width: "100%" },
      },
      children as React.ReactElement[],
      React.createElement("input", { type: "submit", style: { display: "none" } }),
    );
  }
  return <View>{children}</View>;
}
