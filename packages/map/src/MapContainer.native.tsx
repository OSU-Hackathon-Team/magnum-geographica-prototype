import { useCallback, useMemo, useRef } from "react";
import { Platform, View, StyleSheet } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { defaultMapConfig } from "./shared/config.js";
import { commandToScript, isBridgeEvent } from "./bridge/ol-bridge.js";
import type { MapContainerProps } from "./types.js";
import type { BridgeCommand, BridgeEvent } from "./bridge/types.js";

export type { MapContainerProps };

const OL_HTML_URL = "https://cdn.jsdelivr.net/npm/ol@10.3.1/ol.css";

function buildHtml(martinUrl: string | undefined): string {
  const safeMartin = JSON.stringify(martinUrl ?? null);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <link rel="stylesheet" href="${OL_HTML_URL}" />
    <style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#e8e8e8}</style>
  </head>
  <body><div id="map"></div>
  <script src="https://cdn.jsdelivr.net/npm/ol@10.3.1/dist/ol.js"></script>
  <script>
    var map=null,vectorSources={},highlightedId=null;
    function postToRN(e){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(e));}}
    function baseStyle(){return new ol.style.Style({stroke:new ol.style.Stroke({color:'#8B4513',width:3})});}
    function highlightStyle(){return new ol.style.Style({stroke:new ol.style.Stroke({color:'#22c55e',width:5})});}
    function applyHighlight(){if(!vectorSources.trails)return;vectorSources.trails.forEachFeature(function(f){f.setStyle(highlightedId && f.get('id')===highlightedId ? highlightStyle() : baseStyle());});}
    function buildMap(){
      var layers=[new ol.layer.Tile({source:new ol.source.OSM()})];
      var martinUrl=${safeMartin};
      if(martinUrl){
        var src=new ol.source.VectorTile({format:new ol.format.MVT(),url:martinUrl+'/trails/{z}/{x}/{y}'});
        vectorSources.trails=src;
        var trailLayer=new ol.layer.VectorTile({source:src,style:baseStyle});
        layers.push(trailLayer);
        trailLayer.on('click',function(e){
          var feat=e.feature;
          if(feat){postToRN({type:'featureSelect',id:feat.get('id'),layer:'trails'});}
        });

        var segSrc=new ol.source.VectorTile({format:new ol.format.MVT(),url:martinUrl+'/segments/{z}/{x}/{y}'});
        vectorSources.segments=segSrc;
        layers.push(new ol.layer.VectorTile({source:segSrc,style:baseStyle}));

        var sysSrc=new ol.source.VectorTile({format:new ol.format.MVT(),url:martinUrl+'/systems/{z}/{x}/{y}'});
        vectorSources.systems=sysSrc;
        layers.push(new ol.layer.VectorTile({source:sysSrc,
          style:function(f){return new ol.style.Style({fill:new ol.style.Fill({color:'rgba(34,197,94,0.08)'}),stroke:new ol.style.Stroke({color:'#22c55e',width:1.5})});}
        }));

        var featSrc=new ol.source.VectorTile({format:new ol.format.MVT(),url:martinUrl+'/features/{z}/{x}/{y}'});
        vectorSources.features=featSrc;
        var featLayer=new ol.layer.VectorTile({source:featSrc,
          style:function(f){return new ol.style.Style({image:new ol.style.Circle({radius:7,fill:new ol.style.Fill({color:'white'}),stroke:new ol.style.Stroke({color:'#22c55e',width:2})}),text:new ol.style.Text({text:f.get('name'),offsetY:-12,font:'12px sans-serif',fill:new ol.style.Fill({color:'#333'}),stroke:new ol.style.Stroke({color:'white',width:3})})});}
        });
        layers.push(featLayer);
        featLayer.on('click',function(e){
          var feat=e.feature;
          if(feat){postToRN({type:'featureSelect',id:feat.get('id'),layer:'features'});}
        });
      }
      map=new ol.Map({target:'map',layers:layers,view:new ol.View({center:ol.proj.fromLonLat([-82.9988,39.9612]),zoom:6})});
      map.on('click',function(e){var c=ol.proj.toLonLat(e.coordinate);postToRN({type:'mapClick',lon:c[0],lat:c[1]});});
      map.on('moveend',function(){var v=map.getView();var c=ol.proj.toLonLat(v.getCenter());postToRN({type:'moveEnd',center:c,zoom:v.getZoom()});});
    }
    window.olBridge={
      init:function(opts){buildMap();postToRN({type:'ready'});},
      setViewport:function(a){if(!map)return;map.getView().setCenter(ol.proj.fromLonLat(a.center));if(typeof a.zoom==='number')map.getView().setZoom(a.zoom);},
      flyTo:function(a){if(!map)return;map.getView().animate({center:ol.proj.fromLonLat([a.lon,a.lat]),zoom:a.zoom||map.getView().getZoom(),duration:500});},
      setTrails:function(a){if(!vectorSources.trails)return;var f=(new ol.format.GeoJSON()).readFeatures(a.geojson,{featureProjection:'EPSG:3857'});vectorSources.trails.clear();vectorSources.trails.addFeatures(f);applyHighlight();},
      setSystems:function(a){if(!vectorSources.systems)return;var f=(new ol.format.GeoJSON()).readFeatures(a.geojson,{featureProjection:'EPSG:3857'});vectorSources.systems.clear();vectorSources.systems.addFeatures(f);},
      setFeatures:function(a){if(!vectorSources.features)return;var f=(new ol.format.GeoJSON()).readFeatures(a.geojson,{featureProjection:'EPSG:3857'});vectorSources.features.clear();vectorSources.features.addFeatures(f);},
      highlightTrail:function(a){highlightedId=a&&a.id;applyHighlight();}
    };
    window.addEventListener('error',function(e){postToRN({type:'error',message:e.message});});
  </script>
  </body>
</html>`;
}

export default function MapContainer({
  config,
  onReady,
  onClick,
}: MapContainerProps) {
  const webViewRef = useRef<WebView | null>(null);
  const merged = useMemo(() => ({ ...defaultMapConfig, ...config }), [config]);
  const html = useMemo(() => buildHtml(merged.martinTilesUrl), [merged.martinTilesUrl]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (!isBridgeEvent(parsed)) return;
      handleBridgeEvent(parsed, { onReady, onClick });
    },
    [onReady, onClick],
  );

  const send = useCallback((command: BridgeCommand) => {
    const script = commandToScript(command);
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const onLoadEnd = useCallback(() => {
    send({ method: "init", args: {} as never });
  }, [send]);

  if (Platform.OS === "web") {
    return null;
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        onMessage={handleMessage}
        onLoadEnd={onLoadEnd}
        originWhitelist={["*"]}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit={false}
        scrollEnabled={false}
        bounces={false}
        androidLayerType="hardware"
      />
    </View>
  );
}

function handleBridgeEvent(
  event: BridgeEvent,
  handlers: { onReady?: () => void; onClick?: (lon: number, lat: number) => void },
) {
  switch (event.type) {
    case "ready":
      handlers.onReady?.();
      return;
    case "mapClick":
      handlers.onClick?.(event.lon, event.lat);
      return;
    case "mapLongPress":
    case "moveEnd":
    case "featureSelect":
    case "error":
      return;
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
    }
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e8e8e8" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
