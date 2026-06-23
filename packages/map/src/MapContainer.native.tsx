import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { defaultMapConfig } from "./shared/config.js";
import { commandToScript, isBridgeEvent } from "./bridge/ol-bridge.js";
import type { MapContainerProps } from "./types.js";
import type { BridgeCommand, BridgeEvent } from "./bridge/types.js";

export type { MapContainerProps };

const OFFLINE_BG_COLOR = "#e8e8e8";

function buildMapHtml(martinUrl: string | null, offline: boolean): string {
  const safeMartin = JSON.stringify(martinUrl);
  const isOffline = offline ? "true" : "false";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <link rel="stylesheet" href="./ol.css" />
    <style>
      html,body,#map{margin:0;padding:0;width:100%;height:100%;background:${OFFLINE_BG_COLOR}}
      .offline-bar{display:none;position:absolute;top:0;left:0;right:0;z-index:10;background:#fef9c3;color:#854d0e;text-align:center;padding:4px;font:12px sans-serif}
    </style>
  </head>
  <body>
    <div class="offline-bar" id="offlineBar">Offline map — downloaded data only</div>
    <div id="map"></div>
    <script src="./ol.js"></script>
    <script>
      var map=null,
          tileLayers={},
          vectorLayers={},
          vectorSources={},
          highlightedId=null,
          offlineMode=${isOffline};

      function postToRN(e){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(e))}}

      function baseStyle(){return new ol.style.Style({stroke:new ol.style.Stroke({color:'#8B4513',width:3})})}
      function highlightStyle(){return new ol.style.Style({stroke:new ol.style.Stroke({color:'#22c55e',width:5})})}

      function applyHighlight(){
        if(!vectorSources.trails)return;
        var src = vectorSources.trails;
        if(typeof src.forEachFeature === 'function'){
          src.forEachFeature(function(f){f.setStyle(highlightedId&&f.get('id')===highlightedId?highlightStyle():baseStyle())})
        }
      }

      function updateLayerVisibility(){
        if(!map)return;
        var olayers = tileLayers.base?[tileLayers.superSystems,tileLayers.base,tileLayers.trails,tileLayers.segments,tileLayers.systems,tileLayers.features].filter(Boolean):[];
        var vlayers = vectorLayers.trails?[vectorLayers.superSystems,vectorLayers.trails,vectorLayers.systems,vectorLayers.features].filter(Boolean):[];
        olayers.forEach(function(l){l.setVisible(!offlineMode)})
        vlayers.forEach(function(l){l.setVisible(offlineMode)})
        document.getElementById('offlineBar').style.display = offlineMode?'block':'none'
      }

      function createTrailVectorStyle(){
        return function(f){
          var s=f.get('surface_type')||'';
          var color='#8B4513';
          if(s==='paved')color='#555';
          else if(s==='gravel')color='#C4A45A';
          else if(s==='boardwalk')color='#A0825A';
          else if(s==='road_connector')color='#999';
          if(f.get('is_road_connector'))color='#999';
          return new ol.style.Style({stroke:new ol.style.Stroke({color:color,width:3})})
        }
      }

      function createSystemVectorStyle(){
        return new ol.style.Style({
          fill:new ol.style.Fill({color:'rgba(34,197,94,0.08)'}),
          stroke:new ol.style.Stroke({color:'#22c55e',width:2})
        })
      }

      function createFeatureVectorStyle(){
        return function(f){
          return new ol.style.Style({
            image:new ol.style.Circle({radius:7,fill:new ol.style.Fill({color:'white'}),stroke:new ol.style.Stroke({color:'#22c55e',width:2})}),
            text:new ol.style.Text({text:f.get('name'),offsetY:-12,font:'12px sans-serif',fill:new ol.style.Fill({color:'#333'}),stroke:new ol.style.Stroke({color:'white',width:3})})
          })
        }
      }

      function buildMap(){
        var allLayers=[];
        var martinUrl=${safeMartin};

        // Online tile layers
        tileLayers.base=new ol.layer.Tile({source:new ol.source.OSM(),visible:!offlineMode});
        allLayers.push(tileLayers.base);

        if(martinUrl){
          // Super systems: dotted outlines at zoom 2-8
          var ssSrc=new ol.source.VectorTile({format:new ol.format.MVT(),url:martinUrl+'/super_systems/{z}/{x}/{y}'});
          vectorSources.superSystems=ssSrc;
          tileLayers.superSystems=new ol.layer.VectorTile({source:ssSrc,minZoom:2,maxZoom:8,
            style:function(f){
              return new ol.style.Style({
                stroke:new ol.style.Stroke({color:'#8B8B8B',width:2,lineDash:[8,6]}),
                fill:new ol.style.Fill({color:'rgba(128,128,128,0.04)'}),
                text:new ol.style.Text({text:f.get('name')||'',font:'bold 13px system-ui, sans-serif',fill:new ol.style.Fill({color:'#666'}),stroke:new ol.style.Stroke({color:'#fff',width:3}),overflow:true})
              })
            },visible:!offlineMode});
          tileLayers.superSystems.set('name','super_systems');
          allLayers.push(tileLayers.superSystems);
          tileLayers.superSystems.on('click',function(e){var f=e.feature;if(f)postToRN({type:'featureSelect',id:f.get('id'),layer:'superSystems',slug:f.get('slug'),name:f.get('name')})});

          var trailSrc=new ol.source.VectorTile({format:new ol.format.MVT(),url:martinUrl+'/trails/{z}/{x}/{y}'});
          vectorSources.trails=trailSrc;
          tileLayers.trails=new ol.layer.VectorTile({source:trailSrc,minZoom:9,maxZoom:18,style:baseStyle,visible:!offlineMode});
          tileLayers.trails.set('name','trails');
          allLayers.push(tileLayers.trails);
          tileLayers.trails.on('click',function(e){var f=e.feature;if(f)postToRN({type:'featureSelect',id:f.get('id'),layer:'trails',slug:f.get('slug'),name:f.get('name')})});

          var segSrc=new ol.source.VectorTile({format:new ol.format.MVT(),url:martinUrl+'/segments/{z}/{x}/{y}'});
          vectorSources.segments=segSrc;
          tileLayers.segments=new ol.layer.VectorTile({source:segSrc,minZoom:12,maxZoom:18,style:baseStyle,visible:!offlineMode});
          tileLayers.segments.set('name','segments');
          allLayers.push(tileLayers.segments);

          var sysSrc=new ol.source.VectorTile({format:new ol.format.MVT(),url:martinUrl+'/systems/{z}/{x}/{y}'});
          vectorSources.systems=sysSrc;
          tileLayers.systems=new ol.layer.VectorTile({source:sysSrc,minZoom:5,maxZoom:12,
            style:function(f){
              var color=String(f.get('color')||'#22c55e');
              var match=/^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(color);
              var rgba='rgba(34,197,94,0.25)';
              if(match){rgba='rgba('+parseInt(match[1],16)+','+parseInt(match[2],16)+','+parseInt(match[3],16)+',0.25)'}
              return new ol.style.Style({
                fill:new ol.style.Fill({color:rgba}),
                stroke:new ol.style.Stroke({color:color,width:2}),
                text:new ol.style.Text({text:f.get('name')||'',font:'bold 12px system-ui, sans-serif',fill:new ol.style.Fill({color:'#222'}),stroke:new ol.style.Stroke({color:'#fff',width:3}),overflow:true})
              })
            },visible:!offlineMode});
          tileLayers.systems.set('name','systems');
          allLayers.push(tileLayers.systems);
          tileLayers.systems.on('click',function(e){var f=e.feature;if(f)postToRN({type:'featureSelect',id:f.get('id'),layer:'systems',slug:f.get('slug'),name:f.get('name')})});

          var featSrc=new ol.source.VectorTile({format:new ol.format.MVT(),url:martinUrl+'/features/{z}/{x}/{y}'});
          vectorSources.features=featSrc;
          tileLayers.features=new ol.layer.VectorTile({source:featSrc,minZoom:12,maxZoom:18,style:createFeatureVectorStyle(),visible:!offlineMode});
          tileLayers.features.set('name','features');
          allLayers.push(tileLayers.features);
          tileLayers.features.on('click',function(e){var f=e.feature;if(f)postToRN({type:'featureSelect',id:f.get('id'),layer:'features',slug:f.get('slug'),name:f.get('name')})});
        }

        // Offline vector layers (hidden by default, shown when offline)
        vectorLayers.superSystems=new ol.layer.Vector({source:new ol.source.Vector(),
          style:function(f){
            return new ol.style.Style({
              stroke:new ol.style.Stroke({color:'#8B8B8B',width:2,lineDash:[8,6]}),
              fill:new ol.style.Fill({color:'rgba(128,128,128,0.04)'}),
              text:new ol.style.Text({text:f.get('name')||'',font:'bold 13px sans-serif',fill:new ol.style.Fill({color:'#666'}),stroke:new ol.style.Stroke({color:'#fff',width:3}),overflow:true})
            })
          },visible:offlineMode});
        vectorLayers.superSystems.set('name','super_systems');
        allLayers.push(vectorLayers.superSystems);

        vectorLayers.trails=new ol.layer.Vector({source:new ol.source.Vector(),style:createTrailVectorStyle(),visible:offlineMode});
        vectorLayers.trails.set('name','trails');
        allLayers.push(vectorLayers.trails);
        vectorLayers.trails.on('click',function(e){var f=map.forEachFeatureAtPixel(e.pixel,function(f){return f});if(f)postToRN({type:'featureSelect',id:f.get('id'),layer:'trails',slug:f.get('slug'),name:f.get('name')})});

        vectorLayers.systems=new ol.layer.Vector({source:new ol.source.Vector(),style:createSystemVectorStyle(),visible:offlineMode});
        vectorLayers.systems.set('name','systems');
        allLayers.push(vectorLayers.systems);

        vectorLayers.features=new ol.layer.Vector({source:new ol.source.Vector(),style:createFeatureVectorStyle(),visible:offlineMode});
        vectorLayers.features.set('name','features');
        allLayers.push(vectorLayers.features);
        vectorLayers.features.on('click',function(e){var f=map.forEachFeatureAtPixel(e.pixel,function(f){return f});if(f)postToRN({type:'featureSelect',id:f.get('id'),layer:'features',slug:f.get('slug'),name:f.get('name')})});

        map=new ol.Map({target:'map',layers:allLayers,view:new ol.View({center:ol.proj.fromLonLat([-82.9988,39.9612]),zoom:6})});
        map.on('click',function(e){var c=ol.proj.toLonLat(e.coordinate);postToRN({type:'mapClick',lon:c[0],lat:c[1]})});
        map.on('moveend',function(){var v=map.getView();var c=ol.proj.toLonLat(v.getCenter());postToRN({type:'moveEnd',center:c,zoom:v.getZoom()})});
      }

      window.olBridge={
        init:function(opts){buildMap();postToRN({type:'ready'})},
        setViewport:function(a){if(!map)return;map.getView().setCenter(ol.proj.fromLonLat(a.center));if(typeof a.zoom==='number')map.getView().setZoom(a.zoom)},
        flyTo:function(a){if(!map)return;map.getView().animate({center:ol.proj.fromLonLat([a.lon,a.lat]),zoom:a.zoom||map.getView().getZoom(),duration:500})},
        setTrails:function(a){if(!vectorSources.trails)return;var f=(new ol.format.GeoJSON()).readFeatures(a.geojson,{featureProjection:'EPSG:3857'});vectorSources.trails.clear();vectorSources.trails.addFeatures(f);applyHighlight()},
        setSystems:function(a){if(!vectorSources.systems)return;var f=(new ol.format.GeoJSON()).readFeatures(a.geojson,{featureProjection:'EPSG:3857'});vectorSources.systems.clear();vectorSources.systems.addFeatures(f)},
        setFeatures:function(a){if(!vectorSources.features)return;var f=(new ol.format.GeoJSON()).readFeatures(a.geojson,{featureProjection:'EPSG:3857'});vectorSources.features.clear();vectorSources.features.addFeatures(f)},
        highlightTrail:function(a){highlightedId=a&&a.id;applyHighlight()},
        setOfflineMode:function(a){offlineMode=!!a.offline;updateLayerVisibility()},
        setOfflineData:function(a){
          if(a.superSystems&&vectorLayers.superSystems){
            var ssf=(new ol.format.GeoJSON()).readFeatures(a.superSystems,{featureProjection:'EPSG:3857'});
            vectorLayers.superSystems.getSource().clear();
            vectorLayers.superSystems.getSource().addFeatures(ssf);
          }
          if(a.trails&&vectorLayers.trails){
            var tf=(new ol.format.GeoJSON()).readFeatures(a.trails,{featureProjection:'EPSG:3857'});
            vectorLayers.trails.getSource().clear();
            vectorLayers.trails.getSource().addFeatures(tf);
          }
          if(a.systems&&vectorLayers.systems){
            var sf=(new ol.format.GeoJSON()).readFeatures(a.systems,{featureProjection:'EPSG:3857'});
            vectorLayers.systems.getSource().clear();
            vectorLayers.systems.getSource().addFeatures(sf);
          }
          if(a.features&&vectorLayers.features){
            var ff=(new ol.format.GeoJSON()).readFeatures(a.features,{featureProjection:'EPSG:3857'});
            vectorLayers.features.getSource().clear();
            vectorLayers.features.getSource().addFeatures(ff);
          }
        }
      };
      window.addEventListener('error',function(e){postToRN({type:'error',message:e.message})});
    </script>
  </body>
</html>`;
}

export default function MapContainer({
  config,
  onReady,
  onClick,
  onFeatureSelect,
  flyTo,
  offlineMode,
  offlineData,
  onMapRef,
}: MapContainerProps) {
  const webViewRef = useRef<WebView | null>(null);
  const merged = useMemo(() => ({ ...defaultMapConfig, ...config }), [config]);
  const [mapUri, setMapUri] = useState<string | null>(null);
  const initSentRef = useRef(false);

  // Write map files to disk for offline-capable loading
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const FS = await import("expo-file-system");
        const dir = `${FS.documentDirectory}magnum-map/`;
        const dirInfo = await FS.getInfoAsync(dir);
        if (!dirInfo.exists) {
          await FS.makeDirectoryAsync(dir, { intermediates: true });
        }

        const htmlPath = `${dir}map.html`;
        const cssPath = `${dir}ol.css`;
        const jsPath = `${dir}ol.js`;

        // Write OL CSS if not present
        const cssInfo = await FS.getInfoAsync(cssPath);
        if (!cssInfo.exists) {
          const cssData = await FS.readAsStringAsync(
            `${FS.bundleDirectory}assets/ol.css`,
          ).catch(() => null);
          if (cssData) await FS.writeAsStringAsync(cssPath, cssData);
        }

        // Write OL JS if not present
        const jsInfo = await FS.getInfoAsync(jsPath);
        if (!jsInfo.exists) {
          const jsData = await FS.readAsStringAsync(
            `${FS.bundleDirectory}assets/ol.js`,
          ).catch(() => null);
          if (jsData) await FS.writeAsStringAsync(jsPath, jsData);
        }

        // Write map HTML
        const html = buildMapHtml(merged.martinTilesUrl ?? null, false);
        await FS.writeAsStringAsync(htmlPath, html);

        if (!cancelled) setMapUri(htmlPath);
      } catch (e) {
        console.warn("Failed to write map files, falling back to inline HTML", e);
      }
    })();
    return () => { cancelled = true };
  }, [merged.martinTilesUrl]);

  const htmlFallback = useMemo(
    () => buildMapHtml(merged.martinTilesUrl ?? null, false),
    [merged.martinTilesUrl],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (!isBridgeEvent(parsed)) return;
      handleBridgeEvent(parsed, { onReady, onClick, onFeatureSelect });
    },
    [onReady, onClick, onFeatureSelect],
  );

  const send = useCallback((command: BridgeCommand) => {
    const script = commandToScript(command);
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const onLoadEnd = useCallback(() => {
    if (initSentRef.current) return;
    initSentRef.current = true;
    send({ method: "init", args: {} as never });
  }, [send]);

  // Expose send function to parent
  useEffect(() => {
    onMapRef?.(send);
  }, [send, onMapRef]);

  // Sync offline mode to WebView
  useEffect(() => {
    if (!initSentRef.current) return;
    send({ method: "setOfflineMode", args: { offline: !!offlineMode } });
  }, [offlineMode, send]);

  // Sync offline data to WebView
  useEffect(() => {
    if (!initSentRef.current || !offlineData) return;
    send({ method: "setOfflineData", args: offlineData });
  }, [offlineData, send]);

  useEffect(() => {
    if (!flyTo || !initSentRef.current) return;
    send({ method: "flyTo", args: { lon: flyTo.lon, lat: flyTo.lat, zoom: flyTo.zoom } });
  }, [flyTo, send]);

  if (Platform.OS === "web") {
    return null;
  }

  const source = mapUri ? { uri: mapUri } : { html: htmlFallback };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={source}
        onMessage={handleMessage}
        onLoadEnd={onLoadEnd}
        originWhitelist={["*"]}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
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
  handlers: {
    onReady?: () => void;
    onClick?: (lon: number, lat: number) => void;
    onFeatureSelect?: (selection: {
      id: string;
      layer: "trails" | "segments" | "systems" | "features" | "superSystems";
      slug?: string | null;
      name?: string | null;
    }) => void;
  },
) {
  switch (event.type) {
    case "ready":
      handlers.onReady?.();
      return;
    case "mapClick":
      handlers.onClick?.(event.lon, event.lat);
      return;
    case "featureSelect": {
      const layer = (["trails", "segments", "systems", "features", "superSystems"] as const).find(
        (l) => l === event.layer,
      );
      if (!layer) return;
      handlers.onFeatureSelect?.({
        id: event.id,
        layer,
        slug: null,
        name: null,
      });
      return;
    }
    case "mapLongPress":
    case "moveEnd":
    case "error":
      return;
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
    }
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFFLINE_BG_COLOR },
  webview: { flex: 1, backgroundColor: "transparent" },
});
