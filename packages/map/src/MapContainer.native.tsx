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
import { extentFromGeoJSON } from "./shared/extent.js";
import {
  type ShapeAction,
  findNearestEdge,
  lastOpenRingIndex,
} from "@magnum/shared";

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
  apiUrl: string | null,
  offline: boolean,
  baseLayers: BaseLayerDef[],
  baseLayerId: string,
  center: [number, number],
  zoom: number,
): string {
  const safeMartin = JSON.stringify(martinUrl);
  const safeApiUrl = JSON.stringify(apiUrl);
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
          savedDragPan=null,
          liveRouteSource=null,
          shapeSource=null,
          shapeLayer=null,
          dragVertex=null,
          dragFired=false,
          // Trail editor overlay globals
          trailOverlaySegSrc=null,
          trailOverlaySegLayer=null,
          trailOverlayAnnSrc=null,
          trailOverlayAnnLayer=null,
          trailOverlayBndSrc=null,
          trailOverlayBndLayer=null,
          trailOverlayTrcSrc=null,
          trailOverlayTrcLayer=null,
          editorMode='segments',
          snapEnabled=true,
          tracesVisible=true;

      function postToRN(e){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(e))}}

      function baseStyle(){return new ol.style.Style({stroke:new ol.style.Stroke({color:'#8B4513',width:3})})}
      function highlightStyle(){return new ol.style.Style({stroke:new ol.style.Stroke({color:'#22c55e',width:5})})}

      // Trail overlay: per-segment styled rendering for the editor
      var SURFACE_COLORS={natural:'#8B4513',gravel:'#C2B280',paved:'#4A4A4A',boardwalk:'#A0522D',road_connector:'#888888'};
      function segmentStyle(data){
        var surface=data.surface_type||'natural';
        var color=SURFACE_COLORS[surface]||SURFACE_COLORS.natural;
        var isLow=typeof data.consensus==='number'&&data.consensus<0.4;
        var opacity=isLow?0.4:1;
        function rgba(hex,o){var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return 'rgba('+r+','+g+','+b+','+o+')'}
        var styles=[];
        if(data.is_road_connector){
          styles.push(new ol.style.Style({stroke:new ol.style.Stroke({color:'#888888',width:5,lineDash:[10,6]})}));
        }else{
          styles.push(new ol.style.Style({stroke:new ol.style.Stroke({color:rgba(color,opacity),width:5})}));
        }
        if(data.is_pseudo_trail){
          styles.push(new ol.style.Style({stroke:new ol.style.Stroke({color:'#ef4444',width:8,lineDash:[2,8]})}));
        }
        return styles;
      }
      var ANNOTATION_COLORS={surface_change:'#22c55e',road_crossing:'#eab308',pseudo_trail_start:'#ef4444',pseudo_trail_end:'#6b7280',trail_transition:'#3b82f6'};
      function buildTrailOverlay(data){
        if(!map)return;
        // Segments
        if(!trailOverlaySegSrc){trailOverlaySegSrc=new ol.source.Vector();trailOverlaySegLayer=new ol.layer.Vector({source:trailOverlaySegSrc,zIndex:1000});map.addLayer(trailOverlaySegLayer)}
        trailOverlaySegSrc.clear();
        if(!trailOverlayAnnSrc){trailOverlayAnnSrc=new ol.source.Vector();trailOverlayAnnLayer=new ol.layer.Vector({source:trailOverlayAnnSrc,zIndex:1001});map.addLayer(trailOverlayAnnLayer)}
        trailOverlayAnnSrc.clear();
        if(!trailOverlayBndSrc){trailOverlayBndSrc=new ol.source.Vector();trailOverlayBndLayer=new ol.layer.Vector({source:trailOverlayBndSrc,zIndex:1002});map.addLayer(trailOverlayBndLayer);
          // Boundary drag via Translate interaction
          var bndTranslate=new ol.interaction.Translate({layers:[trailOverlayBndLayer],hitTolerance:10});
          bndTranslate.on('translateend',function(evt){
            for(var fi=0;fi<evt.features.getLength();fi++){
              var f=evt.features.item(fi);
              var bd=f.get('boundaryData');
              var g=f.getGeometry();
              if(bd&&g){var c=ol.proj.toLonLat(g.getCoordinates());postToRN({type:'boundaryDrag',trail_id:bd.trail_id||'',boundary_sort_order:bd.sort_order||0,lon:c[0],lat:c[1]})}
            }
          });
          map.addInteraction(bndTranslate);
        }
        trailOverlayBndSrc.clear();
        if(!data||!data.trails)return;
        // Segments
        for(var ti=0;ti<data.trails.length;ti++){
          var tr=data.trails[ti];
          if(!tr.segments)continue;
          for(var si=0;si<tr.segments.length;si++){
            var s=tr.segments[si];
            if(!s.coordinates||s.coordinates.length<2)continue;
            var coords=s.coordinates.map(function(c){return ol.proj.fromLonLat(c)});
            var feat=new ol.Feature({geometry:new ol.geom.LineString(coords)});
            feat.set('segmentData',s);
            feat.setStyle(segmentStyle(s));
            trailOverlaySegSrc.addFeature(feat);
          }
          // Boundaries
          if(tr.boundaries){
            for(var bi=0;bi<tr.boundaries.length;bi++){
              var b=tr.boundaries[bi];
              var bpt=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat([b.lon,b.lat]))});
              bpt.set('boundaryData',Object.assign({},b,{trail_id:tr.id}));
              bpt.setStyle(new ol.style.Style({image:new ol.style.Circle({radius:9,fill:new ol.style.Fill({color:'#fff'}),stroke:new ol.style.Stroke({color:'#3b82f6',width:2})})}));
              trailOverlayBndSrc.addFeature(bpt);
            }
          }
        }
        // Annotation pins
        if(data.annotations){
          for(var ai=0;ai<data.annotations.length;ai++){
            var ann=data.annotations[ai];
            var acolor=ANNOTATION_COLORS[ann.type]||'#9ca3af';
            var apt=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat([ann.lon,ann.lat]))});
            apt.set('annotationData',ann);
            apt.setStyle(new ol.style.Style({image:new ol.style.Circle({radius:14,fill:new ol.style.Fill({color:acolor}),stroke:new ol.style.Stroke({color:'#fff',width:2})})}));
            trailOverlayAnnSrc.addFeature(apt);
          }
        }
        // Trace lines (for trails mode)
        if(data.traces){
          if(!trailOverlayTrcSrc){trailOverlayTrcSrc=new ol.source.Vector();trailOverlayTrcLayer=new ol.layer.Vector({source:trailOverlayTrcSrc,zIndex:1003});map.addLayer(trailOverlayTrcLayer)}
          trailOverlayTrcSrc.clear();
          for(var ti=0;ti<data.traces.length;ti++){
            var trc=data.traces[ti];
            if(!trc.coordinates||trc.coordinates.length<2)continue;
            var tcoords=trc.coordinates.map(function(c){return ol.proj.fromLonLat(c)});
            var tfeat=new ol.Feature({geometry:new ol.geom.LineString(tcoords)});
            tfeat.set('traceId',trc.id);
            tfeat.set('color',trc.color||'#3b82f6');
            tfeat.set('transitions',trc.transitions||[]);
            tfeat.setStyle(new ol.style.Style({stroke:new ol.style.Stroke({color:trc.color||'#3b82f6',width:3,lineCap:'round'})}));
            trailOverlayTrcSrc.addFeature(tfeat);
            // Transition markers
            if(trc.transitions){
              for(var tri=0;tri<trc.transitions.length;tri++){
                var trp=trc.transitions[tri];
                var tpt=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat([trp.lon,trp.lat]))});
                tpt.setStyle(new ol.style.Style({image:new ol.style.Circle({radius:6,fill:new ol.style.Fill({color:'#f59e0b'}),stroke:new ol.style.Stroke({color:'#fff',width:1})})}));
                trailOverlayTrcSrc.addFeature(tpt);
              }
            }
          }
        }
        // Click handler for segment tap
        map.un('click',onSegmentClick);
        map.on('click',onSegmentClick);
      }
      function onSegmentClick(evt){
        if(!trailOverlaySegLayer)return;
        var feat=map.forEachFeatureAtPixel(map.getEventPixel(evt.originalEvent),function(f,l){return l===trailOverlaySegLayer?f:null});
        if(feat){
          var sdata=feat.get('segmentData');
          if(sdata){
            var coord=ol.proj.toLonLat(evt.coordinate);
            postToRN({type:'segmentTap',trail_id:'',segment_sort_order:sdata.sort_order||0,lon:coord[0],lat:coord[1]});
            return;
          }
        }
        // Check boundary handles
        if(trailOverlayBndLayer){
          var bfeat=map.forEachFeatureAtPixel(map.getEventPixel(evt.originalEvent),function(f,l){return l===trailOverlayBndLayer?f:null});
          if(bfeat){
            var bdata=bfeat.get('boundaryData');
            if(bdata){
              postToRN({type:'boundaryLongPress',trail_id:bdata.trail_id||'',boundary_sort_order:bdata.sort_order||0});
              return;
            }
          }
        }
        // Trail split: tap on trail line between segments
        var nearTrail=map.forEachFeatureAtPixel(map.getEventPixel(evt.originalEvent),function(f,l){return l===trailOverlaySegLayer?f:null},{hitTolerance:12});
        if(nearTrail){
          var coord=ol.proj.toLonLat(evt.coordinate);
          postToRN({type:'trailSplit',trail_id:'',lon:coord[0],lat:coord[1]});
        }
      }
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
        var apiUrl=${safeApiUrl};
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

          // Traces heatmap — client-side canvas heatmap, hidden by default.
          if(apiUrl){
            heatmapSource = new ol.source.Vector();
            heatmapLayer = new ol.layer.Heatmap({
              source: heatmapSource,
              radius: 22,
              blur: 18,
              gradient: ['rgba(0,0,0,0)','rgba(34,197,94,0.12)','rgba(34,197,94,0.18)','rgba(132,204,22,0.22)','rgba(250,204,21,0.25)','rgba(249,115,22,0.28)','rgba(239,68,68,0.32)'],
              weight: function(f){ var w = Number(f.get('weight')); return isFinite(w) ? Math.max(0, Math.min(1, w)) : 0; },
              visible: false
            });
            heatmapLayer.set('name','traces_heatmap');
            allLayers.push(heatmapLayer);
          }
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
        vectorLayers.systems.on('click',function(e){var f=map.forEachFeatureAtPixel(e.pixel,function(f){return f});if(f)postToRN({type:'featureSelect',id:f.get('id'),layer:'systems',slug:f.get('slug'),name:f.get('name')})});

        vectorLayers.features=new ol.layer.Vector({source:new ol.source.Vector(),style:createFeatureVectorStyle(),visible:offlineMode});
        vectorLayers.features.set('name','features');
        allLayers.push(vectorLayers.features);
        vectorLayers.features.on('click',function(e){var f=map.forEachFeatureAtPixel(e.pixel,function(f){return f});if(f)postToRN({type:'featureSelect',id:f.get('id'),layer:'features',slug:f.get('slug'),name:f.get('name')})});

        map=new ol.Map({target:'map',layers:allLayers,view:new ol.View({center:ol.proj.fromLonLat(initCenter),zoom:initZoom})});
        setActiveBaseLayer(initialBaseId);

        // Live recording route — a top-most vector layer driven by
        // setLiveRoute. The recording screen sends coordinates here
        // so the user can watch their trace grow on the map.
        liveRouteSource = new ol.source.Vector();
        var liveRouteStyle = function (feature) {
          var coords = feature.getGeometry().getCoordinates();
          var styles = [
            new ol.style.Style({
              stroke: new ol.style.Stroke({ color: '#22c55e', width: 4, lineCap: 'round' })
            })
          ];
          if (coords.length > 0) {
            var tail = coords[coords.length - 1];
            styles.push(
              new ol.style.Style({
                geometry: new ol.geom.Point(tail),
                image: new ol.style.Circle({
                  radius: 6,
                  fill: new ol.style.Fill({ color: '#22c55e' }),
                  stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                })
              })
            );
          }
          return styles;
        };
        var liveRouteLayer = new ol.layer.Vector({
          source: liveRouteSource,
          style: liveRouteStyle
        });
        liveRouteLayer.set('name', 'live_route');
        map.addLayer(liveRouteLayer);

        // Shape editor layer.
        shapeSource = new ol.source.Vector();
        var shapeStyleFn = function(feature){
          var kind = feature.get('shapeKind');
          if(kind === 'vertex'){
            return new ol.style.Style({
              image: new ol.style.Circle({radius:8, fill:new ol.style.Fill({color:'#0f172a'}), stroke:new ol.style.Stroke({color:'#fff',width:2})})
            });
          }
          if(kind === 'ring-outline' && feature.get('closed')){
            return new ol.style.Style({
              stroke: new ol.style.Stroke({color:'#22c55e',width:2})
            });
          }
          return new ol.style.Style({
            stroke: new ol.style.Stroke({color:'#22c55e',width:2,lineDash:[6,4]})
          });
        };
        shapeLayer = new ol.layer.Vector({source:shapeSource,style:shapeStyleFn});
        shapeLayer.set('name','shape-editor');
        shapeLayer.setZIndex(1000);
        map.addLayer(shapeLayer);

        console.log('[map] buildMap done, activeBaseLayer=', initialBaseId, 'layerCount=', map.getLayers().getArray().length);
        map.on('click',function(e){
          if(shapeLayer && shapeLayer.getVisible() && shapeSource){
            var hit = null;
            try {
              var features = map.getFeaturesAtPixel(e.pixel, {hitTolerance:14, layerFilter:function(l){return l===shapeLayer}});
              if(features){
                for(var fi=0;fi<features.length;fi++){
                  var k = features[fi].get('shapeKind');
                  if(k==='vertex'){
                    hit={kind:'vertex',ringIndex:features[fi].get('ringIndex')||0,vertexIndex:features[fi].get('vertexIndex')||0};
                    break;
                  }
                }
                if(!hit){
                  for(var ej=0;ej<features.length;ej++){
                    var ek = features[ej].get('shapeKind');
                    if(ek==='ring-outline'){
                      hit={kind:'edge',ringIndex:features[ej].get('ringIndex')||0,vertexIndex:-1};
                      break;
            }
          }else if(m === 'setTrailOverlay' && a){
            buildTrailOverlay(a);
          }else if(m === 'clearTrailOverlay'){
            if(trailOverlaySegSrc) trailOverlaySegSrc.clear();
            if(trailOverlayAnnSrc) trailOverlayAnnSrc.clear();
            if(trailOverlayBndSrc) trailOverlayBndSrc.clear();
            if(trailOverlayTrcSrc) trailOverlayTrcSrc.clear();
          }else if(m === 'setEditorMode' && a){
            editorMode = a.mode || 'segments';
          }else if(m === 'setSnapEnabled' && a){
            snapEnabled = !!a.enabled;
          }else if(m === 'setTracesVisible' && a){
            tracesVisible = !!a.visible;
          }
                }
              }
            }catch(_){}
            if(hit){
              dragFired=false;
              var c = ol.proj.toLonLat(e.coordinate);
              postToRN({type:'shapeHit',kind:hit.kind,ringIndex:hit.ringIndex,vertexIndex:hit.vertexIndex,lon:c[0],lat:c[1]});
              return;
            }
          }
          // Hit-test tile/vector features (trails, systems, features,
          // super-systems) and send a featureSelect event when one is
          // found. We do this directly in the map click handler because
          // OpenLayers layer-specific click events do not fire reliably
          // for VectorTile layers on Android WebView.
          var hitResult = null;
          map.forEachFeatureAtPixel(e.pixel,function(f,l){
            if(!hitResult && f){
              var nm = l && l.get ? l.get('name') : '';
              // Map internal layer names to bridge layer identifiers.
              if(nm==='super_systems')nm='superSystems';
              hitResult = {feature:f, layerName:nm};
            }
            return null;
          },{layerFilter:function(l){return l!==shapeLayer}});
          if(hitResult){
            var f = hitResult.feature;
            var id = f.get('id');
            var slug = f.get('slug');
            var name = f.get('name');
            if(id) postToRN({type:'featureSelect',id:id,layer:hitResult.layerName,slug:slug,name:name});
            return;
          }
          var c=ol.proj.toLonLat(e.coordinate);postToRN({type:'mapClick',lon:c[0],lat:c[1]});
        });
        map.on('moveend',function(){var v=map.getView();var c=ol.proj.toLonLat(v.getCenter());postToRN({type:'moveEnd',center:c,zoom:v.getZoom()});if(heatmapVisible)refreshHeatmap()});

        // Long-press-to-drag for shape vertices.
        var dragTimer=null;
        map.on('pointerdown',function(e){
          if(!shapeLayer||!shapeLayer.getVisible()||!shapeSource)return;
          var ev=e.originalEvent;
          if(ev.button!==0)return;
          try{
            var features=map.getFeaturesAtPixel(e.pixel,{hitTolerance:12,layerFilter:function(l){return l===shapeLayer}});
            if(!features)return;
            for(var fi=0;fi<features.length;fi++){
              if(features[fi].get('shapeKind')==='vertex'){
            dragFired=false,
            heatmapLayer=null,
            heatmapSource=null,
            heatmapVisible=false;
                var ringIdx=features[fi].get('ringIndex')||0;
                var vertIdx=features[fi].get('vertexIndex')||0;
                ev.preventDefault();
                dragTimer=setTimeout(function(){
                  dragTimer=null;
                  dragVertex={ringIndex:ringIdx,vertexIndex:vertIdx};
                  dragFired=true;
                },250);
                return;
              }
            }
          }catch(_){}
        });
        map.on('pointermove',function(e){
          if(dragTimer){
            clearTimeout(dragTimer);
            dragTimer=null;
            return;
          }
          if(!dragVertex)return;
          var c=ol.proj.toLonLat(e.coordinate);
          postToRN({type:'shapeDrag',ringIndex:dragVertex.ringIndex,vertexIndex:dragVertex.vertexIndex,lon:c[0],lat:c[1]});
        });
        map.on('pointerup',function(){
          if(dragTimer){clearTimeout(dragTimer);dragTimer=null;}
          dragVertex=null;
        });
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
      function refreshHeatmap(){
        if(!heatmapLayer || !heatmapVisible || !apiUrl || !map) return;
        var view = map.getView();
        var res = view.getResolution();
        var r = typeof res === 'number' ? Math.max(5, Math.min(25, Math.round(80 / res))) : 8;
        heatmapLayer.setRadius(r);
        heatmapLayer.setBlur(Math.round(r * 0.7));
        var ext = ol.proj.transformExtent(view.calculateExtent(), 'EPSG:3857', 'EPSG:4326');
        var z = Math.round(view.getZoom());
        var url = apiUrl + '/api/traces/heat?bbox=' + ext.join(',') + '&zoom=' + z;
        fetch(url).then(function(r){ return r.json(); }).then(function(geojson){
          var features = (new ol.format.GeoJSON()).readFeatures(geojson, {featureProjection:'EPSG:3857'});
          if(heatmapSource){ heatmapSource.clear(); heatmapSource.addFeatures(features); }
        }).catch(function(){});
      }

      function onHostMessage(payload){
        if(!payload || typeof payload !== 'object') return;
        try{
          var m = payload.method;
          var a = payload.args;
          if(m === 'setBaseLayer' && a && a.id){
            setActiveBaseLayer(a.id);
          }else if(m === 'setOfflineMode' && a){
            offlineMode = !!a.offline; updateLayerVisibility();
          }else if(m === 'setHeatmapVisible' && a){
            heatmapVisible = !!(a && a.visible);
            if(heatmapLayer) heatmapLayer.setVisible(heatmapVisible);
            if(heatmapVisible) refreshHeatmap();
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
          }else if(m === 'setLiveRoute' && a){
            if(!map || !liveRouteSource){
              console.log('[map] setLiveRoute skipped: map=', !!map, 'liveRouteSource=', !!liveRouteSource);
              return;
            }
            var coords = a.coordinates || [];
            if(coords.length < 2){
              liveRouteSource.clear();
              return;
            }
            var projected = coords.map(function(c){return ol.proj.fromLonLat(c)});
            var line = new ol.geom.LineString(projected);
            liveRouteSource.clear();
            liveRouteSource.addFeature(new ol.Feature({geometry: line}));
            if(typeof a.followLon === 'number' && typeof a.followLat === 'number'){
              console.log('[map] setLiveRoute: pts=', coords.length, 'animating to', a.followLon.toFixed(5), a.followLat.toFixed(5));
              map.getView().animate({
                center: ol.proj.fromLonLat([a.followLon, a.followLat]),
                duration: 250
              });
            } else {
              console.log('[map] setLiveRoute: pts=', coords.length, 'no follow');
            }
          }else if(m === 'clearLiveRoute'){
            if(liveRouteSource) liveRouteSource.clear();
          }else if(m === 'setShape' && a){
            if(!shapeSource||!shapeLayer) return;
            shapeSource.clear();
            var rings = a.rings || [];
            if(!rings.length){
              shapeLayer.setVisible(false);
              if(tileLayers.systems) tileLayers.systems.setVisible(true);
              return;
            }
            shapeLayer.setVisible(true);
            if(tileLayers.systems) tileLayers.systems.setVisible(false);
            for(var ri=0;ri<rings.length;ri++){
              var r=rings[ri];
              if(!r.vertices||r.vertices.length<2) continue;
              var coords=r.vertices.map(function(v){return ol.proj.fromLonLat(v)});
              var lineFeat=new ol.Feature({geometry:new ol.geom.LineString(coords)});
              lineFeat.set('shapeKind','ring-outline');
              lineFeat.set('closed',r.closed);
              lineFeat.set('ringIndex',ri);
              shapeSource.addFeature(lineFeat);
              for(var vi=0;vi<r.vertices.length;vi++){
                var pt=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat(r.vertices[vi]))});
                pt.set('shapeKind','vertex');
                pt.set('ringIndex',ri);
                pt.set('vertexIndex',vi);
                shapeSource.addFeature(pt);
              }
            }
          }else if(m === 'fitBounds' && a){
            if(!map) return;
            var fitExt = [a.minLon, a.minLat, a.maxLon, a.maxLat];
            var pad = typeof a.padding === 'number' ? a.padding : 30;
            var dur = typeof a.duration === 'number' ? a.duration : 300;
            var mz = typeof a.maxZoom === 'number' ? a.maxZoom : 16;
            map.getView().fit(ol.proj.transformExtent(fitExt, 'EPSG:4326', 'EPSG:3857'), {
              padding: [pad, pad, pad, pad],
              duration: dur,
              maxZoom: mz
            });
          }else if(m === 'refreshTiles' && a){
            if(!map) return;
            var ver = typeof a.version === 'number' ? a.version : 0;
            var layers = map.getLayers().getArray();
            for(var li = 0; li < layers.length; li++){
              var src = layers[li].getSource ? layers[li].getSource() : null;
              if(src && src.getUrls){
                var urls = src.getUrls();
                if(urls && urls[0]){
                  var baseUrl = urls[0].replace(/[?&]_v=\\d+/,'');
                  src.setUrl(baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + '_v=' + ver);
                }
              }
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
        },
        setLiveRoute:function(a){
          if(!map||!liveRouteSource)return;
          var coords=(a&&a.coordinates)||[];
          if(coords.length<2){liveRouteSource.clear();return}
          var projected=coords.map(function(c){return ol.proj.fromLonLat(c)});
          liveRouteSource.clear();
          liveRouteSource.addFeature(new ol.Feature({geometry:new ol.geom.LineString(projected)}));
          if(typeof a.followLon==='number'&&typeof a.followLat==='number'){
            map.getView().animate({center:ol.proj.fromLonLat([a.followLon,a.followLat]),duration:250});
          }
        },
        clearLiveRoute:function(){if(liveRouteSource)liveRouteSource.clear()},
        setHeatmapVisible:function(a){
          heatmapVisible = !!(a && a.visible);
          if(heatmapLayer) heatmapLayer.setVisible(heatmapVisible);
          if(heatmapVisible) refreshHeatmap();
        },
        fitBounds:function(a){
          if(!map)return;
          var ext=[a.minLon,a.minLat,a.maxLon,a.maxLat];
          var pad=typeof a.padding==='number'?a.padding:30;
          var dur=typeof a.duration==='number'?a.duration:300;
          var mz=typeof a.maxZoom==='number'?a.maxZoom:16;
          map.getView().fit(ol.proj.transformExtent(ext,'EPSG:4326','EPSG:3857'),{
            padding:[pad,pad,pad,pad],
            duration:dur,
            maxZoom:mz
          });
        },
        refreshTiles:function(a){
          if(!map)return;
          var ver=typeof a.version==='number'?a.version:0;
          var layers=map.getLayers().getArray();
          for(var li=0;li<layers.length;li++){
            var src=layers[li].getSource?layers[li].getSource():null;
            if(src&&src.getUrls){
              var urls=src.getUrls();
              if(urls&&urls[0]){
                var baseUrl=urls[0].replace(/[?&]_v=\\d+/,'');
                src.setUrl(baseUrl+(baseUrl.indexOf('?')>=0?'&':'?')+'_v='+ver);
              }
            }
          }
        },
        setTrailOverlay:function(a){buildTrailOverlay(a)},
        clearTrailOverlay:function(){
          if(trailOverlaySegSrc) trailOverlaySegSrc.clear();
          if(trailOverlayAnnSrc) trailOverlayAnnSrc.clear();
          if(trailOverlayBndSrc) trailOverlayBndSrc.clear();
          if(trailOverlayTrcSrc) trailOverlayTrcSrc.clear();
        },
        setEditorMode:function(a){if(a&&a.mode) editorMode = a.mode},
        setSnapEnabled:function(a){snapEnabled = !!(a&&a.enabled)},
        setTracesVisible:function(a){tracesVisible = !!(a&&a.visible)}
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
  liveRoute,
  shape,
  shapeMode,
  onShapeAction,
  fitGeometry,
  showHeatmap,
  systemTileVersion,
  trailTileVersion,
  segmentTileVersion,
  featureTileVersion,
  superSystemTileVersion,
  trailOverlay,
  editorMode,
  snapEnabled,
  tracesVisible,
  onSegmentTap,
  onBoundaryDrag,
  onBoundaryLongPress,
  onTrailSplit,
  onDrawSelect,
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
  const drawModeRef = useRef<boolean | undefined>(undefined);
  const baseLayerRef = useRef<string | undefined>(undefined);
  const baseLayerDefsRef = useRef(baseLayerDefs);
  baseLayerDefsRef.current = baseLayerDefs;
  const defaultBaseLayerIdRef = useRef(defaultBaseLayerId);
  defaultBaseLayerIdRef.current = defaultBaseLayerId;
  const offlineModeRef = useRef<boolean | undefined>(undefined);
  const offlineBaseLayerRef = useRef<MapContainerProps["offlineBaseLayer"] | undefined>(undefined);
  const liveRouteRef = useRef<MapContainerProps["liveRoute"] | undefined>(undefined);
  const shapeRef = useRef<MapContainerProps["shape"] | undefined>(undefined);
  const fitGeometryRef = useRef<MapContainerProps["fitGeometry"] | undefined>(undefined);
  const tileVersionRef = useRef<number | undefined>(undefined);
  const showHeatmapRef = useRef<boolean | undefined>(undefined);

  const initialCenter = merged.initialCenter ?? defaultMapConfig.initialCenter;
  const initialZoom = merged.initialZoom ?? defaultMapConfig.initialZoom;

  const initCfgRef = useRef<{
    martinTilesUrl: string | null;
    apiUrl: string | null;
    baseLayerDefs: BaseLayerDef[];
    baseLayerId: string;
    center: [number, number];
    zoom: number;
  } | null>(null);
  if (!initCfgRef.current) {
    initCfgRef.current = {
      martinTilesUrl: merged.martinTilesUrl ?? null,
      apiUrl: merged.apiUrl ?? null,
      baseLayerDefs,
      baseLayerId: defaultBaseLayerId,
      center: initialCenter,
      zoom: initialZoom,
    };
  }
  const initCfg = initCfgRef.current;

  // Write map files to disk for offline-capable loading. Runs once on
  // mount with the initial config; subsequent viewport changes are
  // delivered live via postMessage (e.g. setLiveRoute with followLon).
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
          initCfg.martinTilesUrl,
          initCfg.apiUrl,
          false,
          initCfg.baseLayerDefs,
          initCfg.baseLayerId,
          initCfg.center,
          initCfg.zoom,
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
  }, []);

  const htmlFallback = useMemo(
    () =>
      buildMapHtml(
        initCfg.martinTilesUrl,
        initCfg.apiUrl,
        false,
        initCfg.baseLayerDefs,
        initCfg.baseLayerId,
        initCfg.center,
        initCfg.zoom,
      ),
    [initCfg],
  );

  const shapeForHandler = useRef<typeof shape>(shape);
  const shapeModeForHandler = useRef<typeof shapeMode>(shapeMode);
  const onShapeActionForHandler = useRef<typeof onShapeAction>(onShapeAction);
  shapeForHandler.current = shape;
  shapeModeForHandler.current = shapeMode;
  onShapeActionForHandler.current = onShapeAction;

  const onSegmentTapRef = useRef(onSegmentTap);
  const onBoundaryDragRef = useRef(onBoundaryDrag);
  const onBoundaryLongPressRef = useRef(onBoundaryLongPress);
  const onTrailSplitRef = useRef(onTrailSplit);
  const onDrawSelectRef = useRef(onDrawSelect);
  onSegmentTapRef.current = onSegmentTap;
  onBoundaryDragRef.current = onBoundaryDrag;
  onBoundaryLongPressRef.current = onBoundaryLongPress;
  onTrailSplitRef.current = onTrailSplit;
  onDrawSelectRef.current = onDrawSelect;

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (!isBridgeEvent(parsed)) return;
      handleBridgeEvent(parsed, {
        onReady,
        onClick,
        onFeatureSelect,
        onMoveEnd,
        onDrawEnd,
        shape: shapeForHandler.current,
        shapeMode: shapeModeForHandler.current,
        onShapeAction: onShapeActionForHandler.current,
        onSegmentTap: onSegmentTapRef.current,
        onBoundaryDrag: onBoundaryDragRef.current,
        onBoundaryLongPress: onBoundaryLongPressRef.current,
        onTrailSplit: onTrailSplitRef.current,
        onDrawSelect: onDrawSelectRef.current,
      });
    },
    [onReady, onClick, onFeatureSelect, onMoveEnd, onDrawEnd],
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
    console.log("[MapContainer] onLoadEnd, replaying drawMode=", drawModeRef.current, "liveRoute=", liveRouteRef.current ? `${liveRouteRef.current.coordinates.length}pts` : null);
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
    if (liveRouteRef.current) {
      send({ method: "setLiveRoute", args: liveRouteRef.current });
    }
    if (shapeRef.current) {
      send({ method: "setShape", args: { rings: shapeRef.current.rings } });
    }
    if (fitGeometryRef.current) {
      const ext = extentFromGeoJSON(fitGeometryRef.current);
      if (ext) {
        send({ method: "fitBounds", args: { minLon: ext[0], minLat: ext[1], maxLon: ext[2], maxLat: ext[3], padding: 30, duration: 300, maxZoom: 16 } });
      }
    }
    if (typeof tileVersionRef.current === "number") {
      send({ method: "refreshTiles", args: { version: tileVersionRef.current } });
    }
    if (showHeatmapRef.current !== undefined) {
      send({ method: "setHeatmapVisible", args: { visible: showHeatmapRef.current } });
    }
  }, [send]);

  // Expose send function to parent
  useEffect(() => {
    onMapRef?.(send);
  }, [send, onMapRef]);

  // Sync base layer choice to the WebView. The HTML's `init` already inserted
  // the default; this effect only fires if the user later switches layers.
  useEffect(() => {
    const id = baseLayerId ?? defaultBaseLayerIdRef.current;
    baseLayerRef.current = id;
    if (!initSentRef.current) return;
    send({ method: "setBaseLayer", args: { id } });
  }, [baseLayerId, send]);

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

  // Sync heatmap visibility to WebView.
  useEffect(() => {
    showHeatmapRef.current = !!showHeatmap;
    if (!initSentRef.current) return;
    send({ method: "setHeatmapVisible", args: { visible: !!showHeatmap } });
  }, [showHeatmap, send]);

  // Sync live route polyline. We track the latest route in a ref so
  // that high-frequency updates (every GPS event) don't re-trigger
  // the useEffect's send — instead the recording screen calls the
  // `send` ref directly via `onMapRef`. The effect is still useful
  // for the initial mount and for state changes (e.g. clearing on
  // submit).
  useEffect(() => {
    liveRouteRef.current = liveRoute ?? undefined;
    const pts = liveRoute?.coordinates?.length ?? 0;
    console.log(
      "[MapContainer] liveRoute effect: initSent=", initSentRef.current,
      "pts=", pts,
      "follow=", liveRoute?.followLon != null ? `${liveRoute.followLon.toFixed(5)},${liveRoute.followLat!.toFixed(5)}` : null,
    );
    if (!initSentRef.current) return;
    if (!liveRoute || liveRoute.coordinates.length < 2) {
      send({ method: "clearLiveRoute", args: {} });
    } else {
      send({ method: "setLiveRoute", args: liveRoute });
    }
  }, [liveRoute, send]);

  // Sync shape to WebView.
  useEffect(() => {
    shapeRef.current = shape ?? undefined;
    if (!initSentRef.current) return;
    if (!shape) {
      send({ method: "setShape", args: { rings: [] } });
    } else {
      send({ method: "setShape", args: { rings: shape.rings } });
    }
  }, [shape, send]);

  // Sync trail overlay to WebView (segments, annotations, boundaries).
  useEffect(() => {
    if (!initSentRef.current) return;
    if (!trailOverlay) {
      send({ method: "clearTrailOverlay", args: {} });
    } else {
      send({ method: "setTrailOverlay", args: trailOverlay });
    }
  }, [trailOverlay, send]);

  // Sync editor mode, snap, traces visibility to WebView.
  useEffect(() => {
    if (!initSentRef.current) return;
    send({ method: "setEditorMode", args: { mode: editorMode ?? "segments" } });
  }, [editorMode, send]);

  useEffect(() => {
    if (!initSentRef.current) return;
    send({ method: "setSnapEnabled", args: { enabled: !!snapEnabled } });
  }, [snapEnabled, send]);

  useEffect(() => {
    if (!initSentRef.current) return;
    send({ method: "setTracesVisible", args: { visible: !!tracesVisible } });
  }, [tracesVisible, send]);

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

  const lastFitGeomRef = useRef<unknown>(null);
  useEffect(() => {
    fitGeometryRef.current = fitGeometry;
    if (!fitGeometry || !initSentRef.current) return;
    if (fitGeometry === lastFitGeomRef.current) return;
    lastFitGeomRef.current = fitGeometry;
    const ext = extentFromGeoJSON(fitGeometry);
    if (!ext) return;
    send({
      method: "fitBounds",
      args: { minLon: ext[0], minLat: ext[1], maxLon: ext[2], maxLat: ext[3], padding: 30, duration: 300, maxZoom: 16 },
    });
  }, [fitGeometry, send]);

  useEffect(() => {
    // Compute a combined version (max of all per-layer versions) so
    // the WebView can refresh all layers at once via the WebView bridge.
    const combined = Math.max(
      systemTileVersion ?? 0,
      trailTileVersion ?? 0,
      segmentTileVersion ?? 0,
      featureTileVersion ?? 0,
      superSystemTileVersion ?? 0,
    );
    tileVersionRef.current = combined;
    if (!initSentRef.current || combined === 0) return;
    send({ method: "refreshTiles", args: { version: combined } });
  }, [
    systemTileVersion, trailTileVersion, segmentTileVersion,
    featureTileVersion, superSystemTileVersion,
    send,
  ]);

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
    onShapeAction?: (action: ShapeAction) => void;
    shape?: { rings: Array<{ vertices: Array<[number, number]>; closed: boolean }> } | null;
    shapeMode?: "normal" | "delete";
    onSegmentTap?: (s: { trail_id: string; segment_sort_order: number; lon: number; lat: number }) => void;
    onBoundaryDrag?: (b: { trail_id: string; boundary_sort_order: number; lon: number; lat: number }) => void;
    onBoundaryLongPress?: (b: { trail_id: string; boundary_sort_order: number }) => void;
    onTrailSplit?: (s: { trail_id: string; lon: number; lat: number }) => void;
    onDrawSelect?: (s: { trace_id?: string | null; trail_id?: string | null; start_lon: number; start_lat: number; end_lon: number; end_lat: number; snapped: boolean }) => void;
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
        slug: event.slug ?? null,
        name: event.name ?? null,
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
    case "shapeHit": {
      const { shape, shapeMode, onShapeAction } = handlers;
      if (!shape || !shapeMode || !onShapeAction) return;
      const { kind, ringIndex, vertexIndex, lon, lat } = event;
      if (shapeMode === "delete") {
        if (kind === "vertex" && ringIndex >= 0) {
          onShapeAction({ type: "deleteVertex", ringIndex, vertexIndex });
        } else if (kind === "edge" && ringIndex >= 0) {
          const nearest = findNearestEdge(shape.rings, lon, lat);
          if (nearest) {
            onShapeAction({ type: "openEdge", ringIndex: nearest.ringIndex, after: nearest.insertAfter });
          }
        }
        return;
      }
      if (kind === "vertex" && ringIndex >= 0) {
        const openIdx = lastOpenRingIndex(shape);
        const ring = shape.rings[ringIndex];
        if (openIdx === ringIndex && vertexIndex === 0 && ring && ring.vertices.length >= 3) {
          onShapeAction({ type: "closeRing" });
        }
        return;
      }
      if (kind === "edge" && ringIndex >= 0) {
        const nearest = findNearestEdge(shape.rings, lon, lat);
        if (nearest) {
          onShapeAction({
            type: "splitEdge",
            ringIndex: nearest.ringIndex,
            after: nearest.insertAfter,
            lon,
            lat,
          });
        }
        return;
      }
      onShapeAction({ type: "appendVertex", lon, lat });
      return;
    }
    case "shapeDrag": {
      const { onShapeAction } = handlers;
      if (!onShapeAction) return;
      onShapeAction({
        type: "moveVertex",
        ringIndex: event.ringIndex,
        vertexIndex: event.vertexIndex,
        lon: event.lon,
        lat: event.lat,
      });
      return;
    }
    case "mapLongPress":
    case "error":
      return;
    case "segmentTap":
      handlers.onSegmentTap?.({ trail_id: event.trail_id, segment_sort_order: event.segment_sort_order, lon: event.lon, lat: event.lat });
      return;
    case "boundaryDrag":
      handlers.onBoundaryDrag?.({ trail_id: event.trail_id, boundary_sort_order: event.boundary_sort_order, lon: event.lon, lat: event.lat });
      return;
    case "boundaryLongPress":
      handlers.onBoundaryLongPress?.({ trail_id: event.trail_id, boundary_sort_order: event.boundary_sort_order });
      return;
    case "trailSplit":
      handlers.onTrailSplit?.({ trail_id: event.trail_id, lon: event.lon, lat: event.lat });
      return;
    case "drawSelect":
      handlers.onDrawSelect?.({ trace_id: event.trace_id, trail_id: event.trail_id, start_lon: event.start_lon, start_lat: event.start_lat, end_lon: event.end_lon, end_lat: event.end_lat, snapped: event.snapped });
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
