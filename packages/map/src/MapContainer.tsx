import { Platform } from "react-native";
import type { ComponentType } from "react";
import type { MapContainerProps } from "./types.js";

declare const require: (id: string) => { default: ComponentType<MapContainerProps> };

let Component: ComponentType<MapContainerProps>;

if (Platform.OS === "web") {
  Component = require("./MapContainer.web.js").default;
} else {
  Component = require("./MapContainer.native.js").default;
}

export default Component;
export type { MapContainerProps } from "./types.js";
