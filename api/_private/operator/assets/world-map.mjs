import { worldGeometryBudget } from './world-state.mjs';
import { orbitFixedPosition } from './world-orbit-state.mjs';
let cesiumPromise;
async function loadCesium(getHeaders) {
  if (!cesiumPromise) cesiumPromise=(async()=>{
    const response=await fetch('/api/operator-renderer-assets/cesium/index.js',{headers:getHeaders(),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Private globe engine unavailable.');
    const url=URL.createObjectURL(new Blob([await response.text()],{type:'text/javascript'}));
    try { const c=await import(url); c.buildModuleUrl.setBaseUrl(new URL('/api/operator-renderer-assets/cesium/',location.origin).href); return c; }
    finally { URL.revokeObjectURL(url); }
  })().catch((error)=>{cesiumPromise=null;throw error;});
  return cesiumPromise;
}
function hierarchy(c,rings) {
  return new c.PolygonHierarchy(c.Cartesian3.fromDegreesArray(rings[0].flat()),rings.slice(1).map((ring)=>new c.PolygonHierarchy(c.Cartesian3.fromDegreesArray(ring.flat()))));
}
function addGround(c,viewer,item) {
  const color=item.freshness==='stale' ? c.Color.GRAY : c.Color.ORANGE;
  if(item.geometry.type==='Point') { viewer.entities.add({id:item.id,position:c.Cartesian3.fromDegrees(...item.geometry.coordinates.slice(0,2)),point:{pixelSize:7,color,disableDepthTestDistance:0}});return; }
  const polygons=item.geometry.type==='Polygon' ? [item.geometry.coordinates] : item.geometry.coordinates;
  for(const [index,rings] of polygons.entries()) viewer.entities.add({id:`${item.id}:${index}`,properties:{reportId:item.id},polygon:{hierarchy:hierarchy(c,rings),height:0,material:color.withAlpha(0.3)}});
}
export async function createWorldMap({container,getHeaders=()=>({}),onSelect=()=>{},onFailure=()=>{}}) {
  const c=await loadCesium(getHeaders); let viewer;
  try {
    c.Ion.defaultAccessToken='';
    c.CreditDisplay.cesiumCredit=new c.Credit('CesiumJS (Apache-2.0)',true);
    viewer=new c.Viewer(container,{baseLayer:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,
      animation:false,timeline:false,fullscreenButton:false,selectionIndicator:false,infoBox:false,skyBox:false,skyAtmosphere:false,
      terrainProvider:new c.EllipsoidTerrainProvider(),requestRenderMode:true,maximumRenderTimeChange:Infinity,shouldAnimate:false});
    viewer.resolutionScale=Math.min(devicePixelRatio || 1,1.5)/(devicePixelRatio || 1);
    const controls=viewer.scene.screenSpaceCameraController;controls.minimumZoomDistance=200000;controls.maximumZoomDistance=40000000;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){controls.inertiaSpin=0;controls.inertiaTranslate=0;controls.inertiaZoom=0;}
    viewer.scene.globe.baseColor=c.Color.fromCssColorString('#122536'); viewer.scene.globe.enableLighting=false;
    if(viewer.scene.sun)viewer.scene.sun.show=false;if(viewer.scene.moon)viewer.scene.moon.show=false;viewer.scene.fog.enabled=false;
    const response=await fetch('/api/operator-assets/world-land.geojson',{headers:getHeaders(),credentials:'same-origin',signal:AbortSignal.timeout(12000)});
    if(!response.ok) throw new Error('Local basemap unavailable.');
    const land=await c.GeoJsonDataSource.load(await response.json(),{stroke:c.Color.TRANSPARENT,fill:c.Color.fromCssColorString('#35534e'),clampToGround:false});
    await viewer.dataSources.add(land);viewer.cesiumWidget.creditDisplay.addStaticCredit(new c.Credit('Made with Natural Earth (public domain)'));
    viewer.scene.canvas.addEventListener('webglcontextlost',onFailure);viewer.scene.renderError.addEventListener(onFailure);
    const click=new c.ScreenSpaceEventHandler(viewer.scene.canvas);
    click.setInputAction((event)=>{const picked=viewer.scene.pick(event.position);const entity=picked?.id;if(entity)onSelect(entity.properties?.reportId?.getValue() || entity.id);},c.ScreenSpaceEventType.LEFT_CLICK);
    let presetId=null,positions=[];
    return {set(items,preset,orbits=[]){
      const budget=worldGeometryBudget(items);viewer.entities.removeAll();
      for(const item of budget.items)addGround(c,viewer,item);
      positions=[];
      for(const prediction of orbits){const position=orbitFixedPosition(prediction,c);if(!position)continue;
        const height=c.Ellipsoid.WGS84.cartesianToCartographic(position).height;
        if(height<=0 || !Number.isFinite(height))continue;
        viewer.clock.currentTime=c.JulianDate.fromDate(new Date(prediction.simulationUtc));
        viewer.entities.add({id:prediction.id,position,point:{pixelSize:10,color:prediction.stale ? c.Color.GRAY : c.Color.CYAN,disableDepthTestDistance:0}});
        positions.push({id:prediction.id,heightMetres:height,position,simulationUtc:prediction.simulationUtc});}
      const next=JSON.stringify(preset.center);
      if(next!==presetId){presetId=next;viewer.camera.setView({destination:c.Cartesian3.fromDegrees(...preset.center,preset.boxes ? 5000000 : 20000000)});}
      viewer.scene.requestRender();return {geometries:budget.items.length,vertices:budget.vertices,orbits:positions.length};
    },resize:()=>{viewer.resize();viewer.scene.requestRender();},destroy:()=>{click.destroy();viewer.destroy();},projection:()=> 'globe',orbitDiagnostics:()=>positions.map(p=>({...p,depthTestDistance:viewer.entities.getById(p.id).point.disableDepthTestDistance.getValue(),horizonVisible:new c.EllipsoidalOccluder(c.Ellipsoid.WGS84,viewer.camera.positionWC).isPointVisible(p.position)}))};
  }catch(error){viewer?.destroy();throw error;}
}
