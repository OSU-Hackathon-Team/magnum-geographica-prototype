import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { Asset } from "expo-asset";
import {
  defaultMapConfig,
  resolveBaseLayers,
  resolveDefaultBaseLayerId,
  type BaseLayerDef,
} from "./shared/config.js";
import { commandToScript, isBridgeEvent } from "./bridge/ol-bridge.js";
import type { MapContainerProps } from "./types.js";
import type { BridgeCommand, BridgeEvent } from "./bridge/types.js";

export type { MapContainerProps };

const OFFLINE_BG_COLOR = "#e8e8e8";

// OpenLayers JS + CSS bundled as raw Metro assets. The `.bin` extension is
// registered in metro.config.js so `Asset.fromModule()` resolves them. We
// cannot simply read them from `bundleDirectory/assets/...` because Metro
// does not treat `.js`/`.css` as asset extensions by default, so those files
// never make it into the APK.
// @ts-expect-error - non-TS asset module (resolved by Metro at bundle time)
import olJsAssetModule from "../assets/ol.bin";
// @ts-expect-error - non-TS asset module (resolved by Metro at bundle time)
import olCssAssetModule from "../assets/ol-styles.bin";

function buildMapHtml(
  martinUrl: string | null,
  offline: boolean,
  baseLayers: BaseLayerDef[],
  baseLayerId: string,
  center: [number, number],
  zoom: number,
): string {
  const safeMartin = JSON.stringify(martinUrl);
  const safeBaseLayers = JSON.stringify(baseLayers);
  const safeBaseLayerId = JSON.stringify(baseLayerId);
  const safeCenter = JSON.stringify(center);
  const safeZoom = JSON.stringify(zoom);
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
          offlineMode=${isOffline},
          baseLayerImpls={},
          activeBaseLayer=null,
          dragBox=null,
          dragLayer=null,
          savedDragPan=null;

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

      function styleMvtFeature(f){
        var name = f.get('layer') || '';
        if(name === 'water'){
          return new ol.style.Style({fill:new ol.style.Fill({color:'rgba(170,210,230,0.85)'})});
        }
        if(name === 'roads'){
          var hw = String(f.get('highway') || '').toLowerCase();
          var color = '#c2bcae';
          var width = 1.0;
          if(hw === 'motorway' || hw === 'trunk'){color = '#c8a26e'; width = 1.6;}
          else if(hw === 'primary'){color = '#b9b3a4'; width = 1.3;}
          return new ol.style.Style({stroke:new ol.style.Stroke({color:color,width:width})});
        }
        var lu = String(f.get('landuse') || '');
        var le = String(f.get('leisure') || '');
        var color = 'rgba(180,200,160,0.55)';
        if(lu === 'forest' || le === 'forest' || lu === 'wood') color = 'rgba(150,180,130,0.65)';
        else if(lu === 'grass' || lu === 'meadow' || lu === 'grassland') color = 'rgba(200,215,170,0.55)';
        else if(lu === 'wetland' || le === 'nature_reserve') color = 'rgba(160,190,170,0.55)';
        return new ol.style.Style({fill:new ol.style.Fill({color:color})});
      }

      function buildBaseLayer(def){
        if(def.kind === 'raster'){
          return new ol.layer.Tile({
            source: new ol.source.XYZ({url: def.url, crossOrigin: 'anonymous'}),
            minZoom: typeof def.minZoom === 'number' ? def.minZoom : undefined,
            maxZoom: typeof def.maxZoom === 'number' ? def.maxZoom : undefined
          });
        }
        return new ol.layer.VectorTile({
          source: new ol.source.VectorTile({
            format: new ol.format.MVT(),
            url: def.url,
            tileGrid: ol.tilegrid.createXYZ()
          }),
          minZoom: typeof def.minZoom === 'number' ? def.minZoom : undefined,
          maxZoom: typeof def.maxZoom === 'number' ? def.maxZoom : undefined,
          style: styleMvtFeature
        });
      }

      function setActiveBaseLayer(id){
        if(!map) return;
        var layers = map.getLayers().getArray();
        for(var i = layers.length - 1; i >= 0; i--){
          if(layers[i].get('isBase')) map.removeLayer(layers[i]);
        }
        var impl = baseLayerImpls[id];
        if(!impl) return;
        impl.set('isBase', true);
        impl.set('name', 'basemap');
        impl.setVisible(!offlineMode);
        map.getLayers().insertAt(0, impl);
        activeBaseLayer = impl;
      }

      function updateLayerVisibility(){
        if(!map)return;
        if(activeBaseLayer) activeBaseLayer.setVisible(!offlineMode);
        var olayers = vectorSources.trails?[tileLayers.superSystems,tileLayers.trails,tileLayers.segments,tileLayers.systems,tileLayers.features].filter(Boolean):[];
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
        var baseLayerDefs=${safeBaseLayers};
        var initialBaseId=${safeBaseLayerId};
        var initCenter=${safeCenter};
        var initZoom=${safeZoom};
        console.log('[map] buildMap start, martinUrl=', martinUrl, 'baseLayerId=', initialBaseId, 'center=', initCenter, 'zoom=', initZoom);

        // Pre-build all base layer implementations (only the active one is added to the map).
        for(var i = 0; i < baseLayerDefs.length; i++){
          var d = baseLayerDefs[i];
          baseLayerImpls[d.id] = buildBaseLayer(d);
          console.log('[map] base layer built:', d.id, 'kind=', d.kind, 'url=', d.url);
        }

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

        map=new ol.Map({target:'map',layers:allLayers,view:new ol.View({center:ol.proj.fromLonLat(initCenter),zoom:initZoom})});
        setActiveBaseLayer(initialBaseId);
        console.log('[map] buildMap done, activeBaseLayer=', initialBaseId, 'layerCount=', map.getLayers().getArray().length);
        map.on('click',function(e){var c=ol.proj.toLonLat(e.coordinate);postToRN({type:'mapClick',lon:c[0],lat:c[1]})});
        map.on('moveend',function(){var v=map.getView();var c=ol.proj.toLonLat(v.getCenter());postToRN({type:'moveEnd',center:c,zoom:v.getZoom()})});
      }

      // Auto-initialize the map when the page loads. The React Native side
      // can no longer rely on injectJavaScript to call olBridge.init because
      // Android WebView runs injected scripts in a separate "about:blank"
      // context where the ol global is undefined. Building the map here
      // guarantees it is ready as soon as OL finishes loading.
      //
      // On the very first render cycle the WebView may load this HTML inline
      // (via the htmlFallback path) before ol.js has been written to disk
      // alongside map.html. When that happens ol is undefined and buildMap
      // throws — we catch it so the error doesn't pollute the console. The
      // file-backed reload picks it up correctly.
      try {
        buildMap();
        postToRN({type:'ready'});
      } catch(e) {
        console.log('[map] buildMap skipped (ol.js not yet available):', e.message);
      }

      // Handle commands sent from React Native via window.postMessage. This
      // is the only reliable channel on Android because injectJavaScript
      // runs in an isolated about:blank context that can't see ol, map, etc.
      // The handler is hoisted to a top-level function so it closes over
      // enterDrawMode, setActiveBaseLayer, etc. (the olBridge methods are
      // not in scope from a sibling function defined inside the object).
      function onHostMessage(payload){
        if(!payload || typeof payload !== 'object') return;
        try{
          var m = payload.method;
          var a = payload.args;
          if(m === 'setBaseLayer' && a && a.id){
            setActiveBaseLayer(a.id);
          }else if(m === 'setOfflineMode' && a){
            offlineMode = !!a.offline; updateLayerVisibility();
          }else if(m === 'setOfflineData' && a){
            if(a.superSystems && vectorLayers.superSystems){
              var ssf = (new ol.format.GeoJSON()).readFeatures(a.superSystems, {featureProjection:'EPSG:3857'});
              vectorLayers.superSystems.getSource().clear();
              vectorLayers.superSystems.getSource().addFeatures(ssf);
            }
            if(a.trails && vectorLayers.trails){
              var tf = (new ol.format.GeoJSON()).readFeatures(a.trails, {featureProjection:'EPSG:3857'});
              vectorLayers.trails.getSource().clear();
              vectorLayers.trails.getSource().addFeatures(tf);
            }
            if(a.systems && vectorLayers.systems){
              var sf = (new ol.format.GeoJSON()).readFeatures(a.systems, {featureProjection:'EPSG:3857'});
              vectorLayers.systems.getSource().clear();
              vectorLayers.systems.getSource().addFeatures(sf);
            }
            if(a.features && vectorLayers.features){
              var ff = (new ol.format.GeoJSON()).readFeatures(a.features, {featureProjection:'EPSG:3857'});
              vectorLayers.features.getSource().clear();
              vectorLayers.features.getSource().addFeatures(ff);
            }
          }else if(m === 'flyTo' && a){
            if(!map) return;
            map.getView().animate({center: ol.proj.fromLonLat([a.lon, a.lat]), zoom: a.zoom || map.getView().getZoom(), duration: 500});
          }else if(m === 'setViewport' && a){
            if(!map) return;
            map.getView().setCenter(ol.proj.fromLonLat(a.center));
            if(typeof a.zoom === 'number') map.getView().setZoom(a.zoom);
          }else if(m === 'highlightTrail'){
            highlightedId = a && a.id; applyHighlight();
          }else if(m === 'enterDrawMode'){
            console.log('[MapContainer] enterDrawMode called, olBridge=', !!window.olBridge);
            if(window.olBridge && typeof window.olBridge.enterDrawMode === 'function'){
              window.olBridge.enterDrawMode();
            }
          }else if(m === 'exitDrawMode'){
            if(window.olBridge && typeof window.olBridge.exitDrawMode === 'function'){
              window.olBridge.exitDrawMode();
            }
          }
        }catch(err){
          postToRN({type:'error', message: 'onHostMessage: ' + (err && err.message || String(err))});
        }
      }

      // Command queue for messages that arrive before window.olBridge is
      // defined (e.g. user taps the download FAB while the page is still
      // parsing OL). Replay them once the bridge is installed.
      window.__pendingCmds = window.__pendingCmds || [];
      function drainPending(){
        if(!window.olBridge || !window.__pendingCmds.length) return;
        var q = window.__pendingCmds; window.__pendingCmds = [];
        for(var i = 0; i < q.length; i++) onHostMessage(q[i]);
      }

      // react-native-webview dispatches postMessage events on document
      // (see RNCWebViewManagerImpl.kt - it calls document.dispatchEvent).
      // Listening on window does NOT catch them on Android WebView, so we
      // MUST attach the listener to document.
      document.addEventListener('message', function(ev){
        var data = ev && ev.data;
        console.log('[WebView] message event, data=', typeof data, data ? String(data).substring(0, 80) : '');
        if(!data) return;
        var payload = null;
        if(typeof data === 'string'){
          try { payload = JSON.parse(data); } catch(e){ return; }
        }else if(typeof data === 'object'){
          payload = data;
        }
        if(!payload || !payload.method) return;
        console.log('[WebView] dispatching method=', payload.method, 'olBridge=', !!window.olBridge);
        if(window.olBridge){
          onHostMessage(payload);
        }else{
          // Bridge not installed yet — buffer the command.
          window.__pendingCmds.push(payload);
        }
      });

      window.olBridge={
        init:function(opts){
          // The map is built automatically when the page loads. init is
          // kept as a no-op for backwards compatibility with the host
          // onLoadEnd handler; any host overrides (baseLayers/center/zoom)
          // are still honored.
          if(opts && opts.baseLayers){
            for(var i = 0; i < opts.baseLayers.length; i++){
              var d = opts.baseLayers[i];
              baseLayerImpls[d.id] = buildBaseLayer(d);
            }
            if(opts.baseLayerId) setActiveBaseLayer(opts.baseLayerId);
          }
          if(opts && opts.center && typeof opts.zoom === 'number'){
            map.getView().setCenter(ol.proj.fromLonLat(opts.center));
            map.getView().setZoom(opts.zoom);
          }
          postToRN({type:'ready'})
        },
        setViewport:function(a){if(!map)return;map.getView().setCenter(ol.proj.fromLonLat(a.center));if(typeof a.zoom==='number')map.getView().setZoom(a.zoom)},
        flyTo:function(a){if(!map)return;map.getView().animate({center:ol.proj.fromLonLat([a.lon,a.lat]),zoom:a.zoom||map.getView().getZoom(),duration:500})},
        setTrails:function(a){if(!vectorSources.trails)return;var f=(new ol.format.GeoJSON()).readFeatures(a.geojson,{featureProjection:'EPSG:3857'});vectorSources.trails.clear();vectorSources.trails.addFeatures(f);applyHighlight()},
        setSystems:function(a){if(!vectorSources.systems)return;var f=(new ol.format.GeoJSON()).readFeatures(a.geojson,{featureProjection:'EPSG:3857'});vectorSources.systems.clear();vectorSources.systems.addFeatures(f)},
        setFeatures:function(a){if(!vectorSources.features)return;var f=(new ol.format.GeoJSON()).readFeatures(a.geojson,{featureProjection:'EPSG:3857'});vectorSources.features.clear();vectorSources.features.addFeatures(f)},
        highlightTrail:function(a){highlightedId=a&&a.id;applyHighlight()},
        setOfflineMode:function(a){offlineMode=!!a.offline;updateLayerVisibility()},
        setBaseLayer:function(a){if(a && a.id) setActiveBaseLayer(a.id)},
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
        },
        setOfflineBaseLayer:function(a){
          if(!map)return;
          var ext=a.kind==='raster'?'.jpg':'.pbf';
          // tilesPath already contains the file:// scheme from
          // expo-file-system's documentDirectory — don't double-prefix.
          // Strip any trailing slashes so the join below is a clean
          // {tilesPath}/{z}/{x}/{y}.{ext}.
          var prefix=a.tilesPath.replace(/\\/+$/, '') + '/';
          var tileUrl=prefix+'{z}/{x}/{y}'+ext;
          console.log('[map] setOfflineBaseLayer kind='+a.kind+' active='+a.active+' url='+tileUrl);
          var srcMaxZoom=a.maxZoom||14;
          if(a.kind==='raster'){
            var src=new ol.source.XYZ({url:tileUrl,maxZoom:srcMaxZoom});
            var layer=new ol.layer.Tile({source:src,minZoom:a.minZoom||2,maxZoom:a.maxZoom||18});
            layer.set('name','basemap-offline');
            var layers=map.getLayers().getArray();
            for(var i=layers.length-1;i>=0;i--){
              if(layers[i].get('name')==='basemap-offline')map.removeLayer(layers[i]);
              if(layers[i].get('name')==='basemap')layers[i].setVisible(!a.active);
            }
            layer.setVisible(a.active);
            map.getLayers().insertAt(0,layer);
          }else{
            var src2=new ol.source.VectorTile({format:new ol.format.MVT(),url:tileUrl,tileGrid:ol.tilegrid.createXYZ({maxZoom:srcMaxZoom})});
            var layer2=new ol.layer.VectorTile({source:src2,minZoom:a.minZoom||2,maxZoom:a.maxZoom||18,style:styleMvtFeature});
            layer2.set('name','basemap-offline');
            var layers2=map.getLayers().getArray();
            for(var i2=layers2.length-1;i2>=0;i2--){
              if(layers2[i2].get('name')==='basemap-offline')map.removeLayer(layers2[i2]);
              if(layers2[i2].get('name')==='basemap')layers2[i2].setVisible(!a.active);
            }
            layer2.setVisible(a.active);
            map.getLayers().insertAt(0,layer2);
          }
        },
        enterDrawMode:function(){
          console.log('[MapContainer] olBridge.enterDrawMode, map=', !!map);
          if(!map)return;
          if(dragBox)exitDrawMode();
          dragLayer=new ol.layer.Vector({source:new ol.source.Vector(),style:new ol.style.Style({fill:new ol.style.Fill({color:'rgba(34,197,94,0.1)'}),stroke:new ol.style.Stroke({color:'#22c55e',width:2,lineDash:[6,4]})})});
          dragLayer.set('name','draw-layer');
          map.addLayer(dragLayer);
          // DragBox needs to win against the default DragPan so the user's
          // drag is interpreted as drawing a bbox, not panning the map.
          // We disable DragPan while drawing and re-enable it on exit.
          savedDragPan=null;
          var defaults=map.getInteractions().getArray();
          for(var i=0;i<defaults.length;i++){
            if(defaults[i] instanceof ol.interaction.DragPan){
              savedDragPan=defaults[i];
              map.removeInteraction(defaults[i]);
              break;
            }
          }
          dragBox=new ol.interaction.DragBox({condition:ol.events.condition.always});
          map.addInteraction(dragBox);
          dragBox.on('boxend',function(){
            var geom=dragBox.getGeometry();
            var ext=geom.getExtent();
            var bl=ol.proj.toLonLat([ext[0],ext[1]]);
            var tr=ol.proj.toLonLat([ext[2],ext[3]]);
            dragLayer.getSource().clear();
            dragLayer.getSource().addFeature(new ol.Feature(geom));
            postToRN({type:'drawEnd',minLon:bl[0],minLat:bl[1],maxLon:tr[0],maxLat:tr[1]});
          });
        },
        exitDrawMode:function(){
          if(dragBox){map.removeInteraction(dragBox);dragBox=null}
          if(dragLayer){map.removeLayer(dragLayer);dragLayer=null}
          if(savedDragPan){map.addInteraction(savedDragPan);savedDragPan=null}
        }
      };
      window.addEventListener('error',function(e){postToRN({type:'error',message:e.message})});
      // Replay any commands the host sent before the bridge was installed.
      drainPending();
    </script>
  </body>
</html>`;
}

export default function MapContainer({
  config,
  baseLayerId,
  onReady,
  onClick,
  onFeatureSelect,
  onMoveEnd,
  flyTo,
  offlineMode,
  offlineData,
  offlineBaseLayer,
  drawMode,
  onDrawEnd,
  onMapRef,
}: MapContainerProps) {
  const webViewRef = useRef<WebView | null>(null);
  const merged = useMemo(() => ({ ...defaultMapConfig, ...config }), [config]);
  const baseLayerDefs = useMemo(() => resolveBaseLayers(merged), [merged]);
  const defaultBaseLayerId = useMemo(
    () => resolveDefaultBaseLayerId(merged, baseLayerDefs),
    [merged, baseLayerDefs],
  );
  const [mapUri, setMapUri] = useState<string | null>(null);
  const initSentRef = useRef(false);
  // Track the latest state we need to sync to the WebView. The useEffect-driven
  // `send()` only runs once `initSentRef.current` is true, so if the user taps
  // the download FAB or switches layers before the WebView finishes loading,
  // those commands are dropped. We capture the latest values in refs and replay
  // them in onLoadEnd so the WebView always ends up in the correct state.
  const drawModeRef = useRef<boolean | undefined>(undefined);
  const baseLayerRef = useRef<string | undefined>(undefined);
  const offlineModeRef = useRef<boolean | undefined>(undefined);
  const offlineBaseLayerRef = useRef<MapContainerProps["offlineBaseLayer"] | undefined>(undefined);

  const initialCenter = merged.initialCenter ?? defaultMapConfig.initialCenter;
  const initialZoom = merged.initialZoom ?? defaultMapConfig.initialZoom;

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

        // Resolve and (if needed) download the bundled OpenLayers assets.
        // `Asset.fromModule()` returns a local `file://` URI once downloaded;
        // without this the WebView's `<script src="./ol.js">` and
        // `<link href="./ol.css">` 404 and the map renders blank.
        const cssAsset = Asset.fromModule(olCssAssetModule);
        const jsAsset = Asset.fromModule(olJsAssetModule);
        if (!cssAsset.localUri) await cssAsset.downloadAsync();
        if (!jsAsset.localUri) await jsAsset.downloadAsync();
        const cssLocal = cssAsset.localUri;
        const jsLocal = jsAsset.localUri;
        if (!cssLocal || !jsLocal) {
          throw new Error("Failed to resolve bundled OL assets to a local URI");
        }

        // Copy into the same directory the WebView loads `map.html` from so
        // the relative `./ol.css` / `./ol.js` references resolve correctly.
        await FS.copyAsync({ from: cssLocal, to: cssPath });
        await FS.copyAsync({ from: jsLocal, to: jsPath });

        // Write map HTML (with basemap info baked in).
        const html = buildMapHtml(
          merged.martinTilesUrl ?? null,
          false,
          baseLayerDefs,
          defaultBaseLayerId,
          initialCenter,
          initialZoom,
        );
        await FS.writeAsStringAsync(htmlPath, html);

        if (!cancelled) setMapUri(htmlPath);
      } catch (e) {
        console.warn("Failed to write map files, falling back to inline HTML", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [merged.martinTilesUrl, baseLayerDefs, defaultBaseLayerId, initialCenter, initialZoom]);

  const htmlFallback = useMemo(
    () =>
      buildMapHtml(
        merged.martinTilesUrl ?? null,
        false,
        baseLayerDefs,
        defaultBaseLayerId,
        initialCenter,
        initialZoom,
      ),
    [merged.martinTilesUrl, baseLayerDefs, defaultBaseLayerId, initialCenter, initialZoom],
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
      handleBridgeEvent(parsed, { onReady, onClick, onFeatureSelect, onMoveEnd, onDrawEnd });
    },
    [onReady, onClick, onFeatureSelect, onMoveEnd],
  );

  const send = useCallback((command: BridgeCommand) => {
    // Use window.postMessage rather than injectJavaScript. On Android the
    // WebView runs injected scripts in a separate about:blank context where
    // the page's globals (ol, map, the olBridge wrapper) are not defined, so
    // commands silently fail. window.postMessage lands in the page's main
    // context where the listener installed in buildMapHtml can dispatch them.
    //
    // We MUST NOT fall back to injectJavaScript — it runs in an isolated
    // context that doesn't have 'ol' defined, which causes an uncaught
    // ReferenceError that crashes the Chromium WebView process and kills the
    // entire app. If postMessage fails, the command is simply dropped.
    if (!webViewRef.current) {
      console.log(
        "[MapContainer] send DROPPED (no ref):",
        command.method,
        JSON.stringify(command.args),
      );
      return;
    }
    try {
      console.log("[MapContainer] send OK:", command.method, JSON.stringify(command.args));
      webViewRef.current.postMessage(JSON.stringify(command));
    } catch (_e) {
      // postMessage may fail if the WebView hasn't finished loading.
      // Retry on the next render — don't use injectJavaScript here.
      console.log("[MapContainer] send THREW:", command.method);
    }
  }, []);

  const onLoadEnd = useCallback(() => {
    // The WebView auto-initializes the map and posts `{type:'ready'}` to the
    // host as soon as OL finishes loading. The original `injectJavaScript`
    // init call was a no-op on the JS side and is no longer needed.
    console.log("[MapContainer] onLoadEnd, replaying drawMode=", drawModeRef.current);
    initSentRef.current = true;
    // Replay any state changes that happened before the WebView finished
    // loading. The per-state useEffects gate on `initSentRef.current`, so
    // commands fired before this point were silently dropped. We use refs
    // (not the React state values) so the latest state is always read,
    // even if the state has since toggled back.
    if (drawModeRef.current !== undefined) {
      send({
        method: drawModeRef.current ? "enterDrawMode" : "exitDrawMode",
        args: {},
      });
    }
    if (baseLayerRef.current !== undefined) {
      send({ method: "setBaseLayer", args: { id: baseLayerRef.current } });
    }
    if (offlineModeRef.current !== undefined) {
      send({ method: "setOfflineMode", args: { offline: offlineModeRef.current } });
    }
    if (offlineBaseLayerRef.current) {
      send({
        method: "setOfflineBaseLayer",
        args: { ...offlineBaseLayerRef.current, active: !!offlineModeRef.current },
      });
    }
  }, [send]);

  // Expose send function to parent
  useEffect(() => {
    onMapRef?.(send);
  }, [send, onMapRef]);

  // Sync base layer choice to the WebView. The HTML's `init` already inserted
  // the default; this effect only fires if the user later switches layers.
  useEffect(() => {
    const id = baseLayerId ?? defaultBaseLayerId;
    baseLayerRef.current = id;
    if (!initSentRef.current) return;
    send({ method: "setBaseLayer", args: { id } });
  }, [baseLayerId, defaultBaseLayerId, send]);

  // Sync offline mode to WebView
  useEffect(() => {
    offlineModeRef.current = !!offlineMode;
    if (!initSentRef.current) return;
    send({ method: "setOfflineMode", args: { offline: !!offlineMode } });
  }, [offlineMode, send]);

  // Sync offline data to WebView
  useEffect(() => {
    if (!initSentRef.current || !offlineData) return;
    send({ method: "setOfflineData", args: offlineData });
  }, [offlineData, send]);

  // Sync offline base layer to WebView
  useEffect(() => {
    offlineBaseLayerRef.current = offlineBaseLayer;
    if (!initSentRef.current) return;
    if (offlineBaseLayer) {
      send({
        method: "setOfflineBaseLayer",
        args: { ...offlineBaseLayer, active: !!offlineMode },
      });
    }
  }, [offlineBaseLayer, offlineMode, send]);

  // Sync draw mode to WebView
  useEffect(() => {
    drawModeRef.current = !!drawMode;
    if (!initSentRef.current) return;
    if (drawMode) {
      send({ method: "enterDrawMode", args: {} });
    } else {
      send({ method: "exitDrawMode", args: {} });
    }
  }, [drawMode, send]);

  // Track the last flyTo values so we only re-send when the target actually
  // changes (not when the parent passes a new object ref with same values).
  const lastFlyToRef = useRef<{ lon: number; lat: number; zoom?: number } | null>(null);

  useEffect(() => {
    if (!flyTo || !initSentRef.current) return;
    const last = lastFlyToRef.current;
    if (last && last.lon === flyTo.lon && last.lat === flyTo.lat && last.zoom === flyTo.zoom)
      return;
    lastFlyToRef.current = flyTo;
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
        // The WebView is loaded from a `file://` URI and needs to fetch
        // `./ol.js`, `./ol.css`, and tile/vector sources over both `file://`
        // (offline basemap) and `http(s)://` (Martin, EOX satellite). Without
        // these flags the same-origin policy blocks the relative script/css
        // imports and the map stays blank.
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
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
    onMoveEnd?: (center: [number, number], zoom: number) => void;
    onDrawEnd?: (bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }) => void;
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
    case "moveEnd":
      handlers.onMoveEnd?.(event.center, event.zoom);
      return;
    case "drawEnd":
      handlers.onDrawEnd?.({
        minLon: event.minLon,
        minLat: event.minLat,
        maxLon: event.maxLon,
        maxLat: event.maxLat,
      });
      return;
    case "mapLongPress":
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
