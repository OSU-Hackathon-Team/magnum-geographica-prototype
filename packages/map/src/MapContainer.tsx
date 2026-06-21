import { Platform } from "react-native";
import MapContainerWeb from "./MapContainer.web.js";
import MapContainerNative from "./MapContainer.native.js";

const MapContainer = Platform.OS === "web" ? MapContainerWeb : MapContainerNative;

export default MapContainer;
export type { MapContainerProps } from "./types.js";
