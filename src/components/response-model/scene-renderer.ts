import * as THREE from "three";
import { cubicBezier } from "motion";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { ResponseCameraView, ResponseModelLink, ResponseModelNode, ResponseScene } from "./types";

const BLUE = 0x2f6bff;
const INK = 0x1e1e1c;
type Payload = { nodes: ResponseModelNode[]; links: ResponseModelLink[] };

/** Procedural materials and geometry only. No remote model, texture, or telemetry request. */
export function createResponseScene(host: HTMLDivElement, labels: HTMLDivElement, payload: Payload, variant: "showcase" | "operational", onSelect: (id: string) => void, instant: boolean, onUnavailable: () => void, onView: (view: ResponseCameraView) => void = () => {}): ResponseScene {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.className = "bb-response-canvas";
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const rig = new THREE.Group();
  scene.add(rig);
  const camera = new THREE.OrthographicCamera(-5, 5, 3.6, -3.6, .1, 80);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const geometry = <T extends THREE.BufferGeometry>(item: T): T => { geometries.add(item); return item; };
  const material = <T extends THREE.Material>(item: T): T => { materials.add(item); return item; };
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .035);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 4);
  key.position.set(-3, 8, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9cbaff, 2);
  rim.position.set(6, 3, -5);
  scene.add(rim);

  const porcelain = material(new THREE.MeshPhysicalMaterial({ color: 0xf5f8ff, metalness: .16, roughness: .16, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.4 }));
  const chrome = material(new THREE.MeshPhysicalMaterial({ color: 0xa7b5ca, metalness: .9, roughness: .17, clearcoat: 1, envMapIntensity: 1.1 }));
  const glass = material(new THREE.MeshPhysicalMaterial({ color: 0xb5ceff, metalness: .02, roughness: .06, transmission: .46, thickness: .6, ior: 1.46, transparent: true, opacity: .9, clearcoat: 1, envMapIntensity: 1.4 }));
  const blue = material(new THREE.MeshPhysicalMaterial({ color: BLUE, metalness: .26, roughness: .16, clearcoat: 1, emissive: 0x163780, emissiveIntensity: .08 }));
  const selectedSurface = material(new THREE.MeshStandardMaterial({ color: 0xd7ff3f, roughness: .4 }));
  const muted = material(new THREE.MeshPhysicalMaterial({ color: 0xb6c2d6, metalness: .1, roughness: .3, clearcoat: 1 }));
  const dark = material(new THREE.MeshStandardMaterial({ color: INK, metalness: .4, roughness: .36 }));

  const bevel = (width: number, height: number, depth: number, radius = .12) => {
    const shape = new THREE.Shape();
    const x = -width / 2, y = -depth / 2;
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + depth - radius);
    shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
    shape.lineTo(x + radius, y + depth);
    shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    const item = geometry(new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: .035, bevelThickness: .035, bevelSegments: 3, steps: 1, curveSegments: 8 }));
    item.rotateX(-Math.PI / 2);
    item.translate(0, -height / 2, 0);
    return item;
  };
  const mesh = (shape: THREE.BufferGeometry, surface: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const item = new THREE.Mesh(shape, surface);
    item.position.set(x, y, z);
    parent.add(item);
    return item;
  };

  const rows = Math.max(1, Math.ceil(payload.nodes.length / 3));
  const boardDepth = Math.max(3.8, rows * 2.15);
  mesh(bevel(8.4, .14, boardDepth, .35), porcelain, rig, 0, -.26);
  mesh(bevel(8.48, .06, boardDepth + .08, .35), chrome, rig, 0, -.37);
  const positions = new Map<string, THREE.Vector3>();
  const modules: { id: string; object: THREE.Group; lid: THREE.Mesh; surface: THREE.Material; label: HTMLElement | null }[] = [];
  const clickable: THREE.Object3D[] = [];
  const labelPoint = new THREE.Vector3();
  const sharedBody = bevel(1.17, .46, .98, .16);
  const sharedLid = bevel(1.2, .11, 1, .16);
  const sharedFoot = bevel(1.25, .09, 1.06, .16);
  const slotShape = geometry(new THREE.BoxGeometry(.63, .032, .023));
  const boltShape = geometry(new THREE.CylinderGeometry(.032, .032, .018, 8));
  payload.nodes.forEach((node, index) => {
    const x = (index % 3 - 1) * 2.7;
    const z = (Math.floor(index / 3) - (rows - 1) / 2) * 2.05;
    const nodeGroup = new THREE.Group();
    nodeGroup.position.set(x, 0, z);
    rig.add(nodeGroup);
    positions.set(node.id, new THREE.Vector3(x, .04, z));
    const isDatabase = (node.kind ?? node.label).toLowerCase().includes("database");
    const inactive = ["ISOLATED", "DISABLED", "DEGRADED"].includes(node.state?.toUpperCase() ?? "");
    let lid: THREE.Mesh;
    if (isDatabase) {
      const disk = geometry(new THREE.CylinderGeometry(.57, .57, .2, 40));
      const seam = geometry(new THREE.CylinderGeometry(.53, .53, .045, 40));
      for (let layer = 0; layer < 3; layer++) {
        const body = mesh(disk, layer === 2 ? glass : porcelain, nodeGroup, 0, .03 + layer * .22);
        body.userData.nodeId = node.id;
        clickable.push(body);
        mesh(seam, inactive ? muted : blue, nodeGroup, 0, .145 + layer * .22);
      }
      lid = mesh(geometry(new THREE.CylinderGeometry(.46, .46, .025, 40)), inactive ? muted : blue, nodeGroup, 0, .605);
    } else {
      mesh(sharedFoot, chrome, nodeGroup, 0, -.11);
      const body = mesh(sharedBody, porcelain, nodeGroup, 0, .19);
      body.userData.nodeId = node.id;
      clickable.push(body);
      lid = mesh(sharedLid, glass, nodeGroup, 0, .48);
      mesh(bevel(.81, .022, .58, .08), inactive ? muted : blue, nodeGroup, 0, .548);
      for (let slot = 0; slot < 3; slot++) mesh(slotShape, dark, nodeGroup, 0, .2 - slot * .075, .527);
      for (const bx of [-.49, .49]) for (const bz of [-.4, .4]) mesh(boltShape, chrome, nodeGroup, bx, .552, bz);
    }
    lid.userData.nodeId = node.id;
    clickable.push(lid);
    const statusLight = mesh(geometry(new THREE.SphereGeometry(.041, 12, 8)), inactive ? muted : blue, nodeGroup, .38, .04, .55);
    statusLight.scale.set(1, .65, .65);
    const label = [...labels.querySelectorAll<HTMLElement>("[data-model-id]")].find(element => element.dataset.modelId === node.id) ?? null;
    modules.push({ id: node.id, object: nodeGroup, lid, surface: lid.material as THREE.Material, label });
  });

  type Particle = { mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; offset: number; speed: number };
  const particles: Particle[] = [];
  const signalShape = geometry(new THREE.SphereGeometry(.063, 10, 8));
  const signalMaterial = material(new THREE.MeshBasicMaterial({ color: BLUE }));
  const railMaterial = material(new THREE.MeshStandardMaterial({ color: 0xa3b9e5, metalness: .55, roughness: .25 }));
  const supportedMaterial = material(new THREE.MeshPhysicalMaterial({ color: BLUE, metalness: .42, roughness: .18, clearcoat: 1, transparent: true, opacity: .62 }));
  const dashedMaterial = material(new THREE.LineDashedMaterial({ color: 0xb2bfd3, dashSize: .13, gapSize: .11, transparent: true, opacity: .8 }));
  payload.links.forEach((link, index) => {
    const from = positions.get(link.from), to = positions.get(link.to);
    if (!from || !to) return;
    const start = from.clone(), end = to.clone();
    start.y = .02; end.y = .02;
    const midpoint = start.clone().lerp(end, .5);
    midpoint.y = .12 + index % 2 * .06;
    const curve = new THREE.CatmullRomCurve3([start, midpoint, end]);
    if (link.enabled === false || link.verified === false) {
      const line = new THREE.Line(geometry(new THREE.BufferGeometry().setFromPoints(curve.getPoints(50))), dashedMaterial);
      line.computeLineDistances();
      rig.add(line);
    } else {
      mesh(geometry(new THREE.TubeGeometry(curve, 24, .029, 6, false)), railMaterial, rig);
      mesh(geometry(new THREE.TubeGeometry(curve, 24, .012, 5, false)), supportedMaterial, rig, 0, .025);
    }
    if (link.enabled !== false) {
      const packet = mesh(signalShape, signalMaterial, rig);
      packet.position.copy(curve.getPoint(index % 5 / 5));
      packet.visible = false;
      particles.push({ mesh: packet, curve, offset: index * .27, speed: .14 });
    }
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const home = .13;
  let targetYaw = home, yaw = home;
  let targetZoom = 1, zoom = 1;
  const center = new THREE.Vector3(), targetCenter = new THREE.Vector3();
  const startCenter = new THREE.Vector3();
  let startYaw = home, startZoom = 1, transitionStart = 0, transitioning = false;
  let gestures = false, manualCamera = false;
  const easeCamera = cubicBezier(.77, 0, .175, 1);
  const view = (): ResponseCameraView => ({zoom: targetZoom, yaw: targetYaw, center: targetCenter.toArray() as [number, number, number]});
  const constrainCenter = () => { targetCenter.x = THREE.MathUtils.clamp(targetCenter.x, -6, 6); targetCenter.y = THREE.MathUtils.clamp(targetCenter.y, -4, 4); targetCenter.z = THREE.MathUtils.clamp(targetCenter.z, -6, 6); };
  const changeView = (immediately = false) => {
    manualCamera = true;
    constrainCenter();
    startYaw = yaw; startZoom = zoom; startCenter.copy(center);
    transitionStart = performance.now(); transitioning = !(calm || immediately);
    if (!transitioning) { yaw = targetYaw; zoom = targetZoom; center.copy(targetCenter); }
    onView(view()); draw(); queue();
  };
  let pointerTilt = 0, tilt = 0;
  let width = 1, height = 1;
  let inView = false, flow = false, disposed = false, calm = instant;
  let raf = 0, last = 0, elapsed = 0;
  let intro = instant ? 1 : 0;
  let dragging = false, downX = 0, downY = 0;
  const pointers = new Map<number, {x: number; y: number}>();
  let dragged = false;
  // Match the CSS viewport breakpoint, not the width of a desktop dashboard column.
  const compactLabels = window.matchMedia("(max-width: 640px)");

  const updateCamera = () => {
    const aspect = width / height;
    const vertical = Math.max(5.4, boardDepth * .75 + 2, Math.max(10.2, boardDepth * .6 + 7) / aspect);
    camera.left = -vertical * aspect / 2;
    camera.right = vertical * aspect / 2;
    camera.top = vertical / 2;
    camera.bottom = -vertical / 2;
    camera.zoom = zoom;
    camera.position.set(6.8, 8.5, 11).add(center);
    camera.lookAt(center.x, center.y - .1, center.z);
    camera.updateProjectionMatrix();
  };
  const projectLabels = () => {
    if (compactLabels.matches) {
      modules.forEach(({ label }) => { if (label) { label.hidden = false; label.style.transform = ""; label.style.left = ""; label.style.top = ""; } });
      return;
    }
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    modules.forEach(({ object, label }) => {
      if (!label) return;
      labelPoint.set(0, .79, .55);
      object.localToWorld(labelPoint);
      labelPoint.project(camera);
      label.hidden = Math.abs(labelPoint.x) > 1 || Math.abs(labelPoint.y) > 1;
      if (label.hidden) return;
      const w = label.offsetWidth, h = label.offsetHeight;
      const x = THREE.MathUtils.clamp((labelPoint.x + 1) * width / 2, w / 2 + 8, width - w / 2 - 8);
      let y = (1 - labelPoint.y) * height / 2;
      for (let pass = 0; pass < 5; pass++) {
        if (!placed.some(box => Math.abs(box.x - x) < (box.w + w) / 2 + 5 && Math.abs(box.y - y) < (box.h + h) / 2 + 4)) break;
        y += h + 7;
      }
      y = THREE.MathUtils.clamp(y, h / 2 + 10, height - h / 2 - 12);
      label.style.left = "0px";
      label.style.top = "0px";
      label.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px)`;
      placed.push({ x, y, w, h });
    });
  };
  const draw = () => {
    rig.rotation.y = yaw;
    rig.rotation.x = tilt;
    rig.updateMatrixWorld(true);
    updateCamera();
    renderer.render(scene, camera);
    projectLabels();
  };
  const queue = () => { if (!disposed && inView && !raf) raf = requestAnimationFrame(frame); };
  const frame = (time: number) => {
    raf = 0;
    if (disposed || !inView) return;
    const delta = Math.min(.04, last ? (time - last) / 1000 : .016);
    last = time;
    elapsed += delta;
    if (transitioning) {
      const progress = Math.min(1, (time - transitionStart) / 220);
      const amount = easeCamera(progress);
      yaw = THREE.MathUtils.lerp(startYaw, targetYaw, amount);
      zoom = THREE.MathUtils.lerp(startZoom, targetZoom, amount);
      center.lerpVectors(startCenter, targetCenter, amount);
      transitioning = progress < 1;
    }
    tilt += (pointerTilt - tilt) * Math.min(1, delta * 8);
    if (intro < 1) {
      intro = Math.min(1, intro + delta / .85);
      const amount = 1 - Math.pow(1 - intro, 4);
      modules.forEach(({ object }, index) => {
        const delay = Math.min(index * .035, .2);
        const local = THREE.MathUtils.clamp((amount - delay) / (1 - delay), 0, 1);
        object.position.y = -.16 * (1 - local);
      });
    }
    particles.forEach(packet => {
      packet.mesh.visible = flow;
      if (flow) packet.mesh.position.copy(packet.curve.getPoint((elapsed * packet.speed + packet.offset) % 1));
    });
    draw();
    if (flow || intro < 1 || transitioning || Math.abs(pointerTilt - tilt) > .0001) queue();
  };
  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight - (compactLabels.matches ? labels.offsetHeight + 24 : 0));
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = `${width}px`;
    renderer.domElement.style.height = `${height}px`;
    updateCamera();
    draw();
    queue();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const panPixels = (dx: number, dy: number) => {
    const scale = (camera.top - camera.bottom) / zoom / height;
    targetCenter.add(new THREE.Vector3(-dx * scale, dy * scale, 0).applyQuaternion(camera.quaternion));
  };
  const pair = () => {
    const [a,b] = [...pointers.values()];
    return a && b ? {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)} : null;
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType === "touch" && !gestures || event.button !== 0) return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    dragging = true;
    if (pointers.size === 1) { dragged = false; downX = event.clientX; downY = event.clientY; }
    else dragged = true;
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (dragging && previous) {
      const oldPair = pair();
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      const nextPair = pair();
      dragged ||= Math.abs(event.clientX-downX)+Math.abs(event.clientY-downY)>5;
      if (oldPair && nextPair) {
        if (oldPair.distance > 0) targetZoom = THREE.MathUtils.clamp(targetZoom * nextPair.distance / oldPair.distance, .75, 3);
        panPixels(nextPair.x-oldPair.x,nextPair.y-oldPair.y);
      } else if (event.shiftKey || event.pointerType === "touch") panPixels(event.clientX-previous.x,event.clientY-previous.y);
      else targetYaw = THREE.MathUtils.clamp(targetYaw+(event.clientX-previous.x)*.003,-.55,.65);
      changeView(true);
    } else if (variant === "showcase" && !manualCamera && !calm && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointerTilt = THREE.MathUtils.clamp((event.clientY-bounds.top)/bounds.height-.5,-.5,.5)*.08;
      targetYaw = home+((event.clientX-bounds.left)/bounds.width-.5)*.2;
      startYaw=yaw; startZoom=zoom; startCenter.copy(center); transitionStart=performance.now(); transitioning=true;
      queue();
    }
  };
  const up = (event: PointerEvent) => {
    const tracked = pointers.delete(event.pointerId);
    dragging = pointers.size > 0;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    if (!tracked || dragging || dragged || event.type === "pointercancel") return;
    const bounds=renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(clickable,false)[0];
    if (hit?.object.userData.nodeId) onSelect(hit.object.userData.nodeId as string);
  };
  const wheel = (event: WheelEvent) => {
    // Ordinary wheel scroll remains page navigation. Trackpad pinch sends ctrlKey.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    targetZoom=THREE.MathUtils.clamp(targetZoom*Math.exp(-event.deltaY*.004),.75,3);
    changeView();
  };
  const leave = () => { if (!dragging && !manualCamera && variant === "showcase") { targetYaw=home; pointerTilt=0; changeView(); manualCamera=false; } };
  const lost = (event: Event) => { event.preventDefault(); flow = false; if (raf) cancelAnimationFrame(raf); raf = 0; onUnavailable(); };
  renderer.domElement.addEventListener("wheel", wheel, {passive:false});
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointermove", move);
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("pointercancel", up);
  renderer.domElement.addEventListener("pointerleave", leave);
  renderer.domElement.addEventListener("webglcontextlost", lost);

  return {
    setMotion(enabled) { flow = enabled; particles.forEach(packet => { packet.mesh.visible = enabled; }); if (enabled) queue(); else draw(); },
    setInstant(enabled) { calm = enabled; if (enabled) { intro = 1; yaw = targetYaw; zoom = targetZoom; center.copy(targetCenter); transitioning = false; tilt = pointerTilt = 0; modules.forEach(({ object }) => { object.position.y = 0; }); } draw(); queue(); },
    setVisible(value) { inView = value; last = 0; if (value) queue(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    select(id) { modules.forEach(node => { node.lid.material = node.id === id ? selectedSurface : node.surface; }); draw(); },
    rotate(direction, immediately) { targetYaw=THREE.MathUtils.clamp(targetYaw+direction*.16,-.55,.65); changeView(immediately); },
    zoomBy(factor, immediately) { if (!Number.isFinite(factor) || factor<=0) return; targetZoom=THREE.MathUtils.clamp(targetZoom*factor,.75,3); changeView(immediately); },
    pan(x,y,immediately) { if (!Number.isFinite(x) || !Number.isFinite(y)) return; targetCenter.add(new THREE.Vector3(x*.6/targetZoom,y*.6/targetZoom,0).applyQuaternion(camera.quaternion)); changeView(immediately); },
    focus(id, immediately) { const node=modules.find(node=>node.id===id); if(!node) return; rig.updateMatrixWorld(true); node.object.getWorldPosition(targetCenter); targetZoom=1.7; pointerTilt=0; changeView(immediately); },
    setGestures(enabled) { gestures=enabled; renderer.domElement.dataset.touchControls=String(enabled); if(!enabled) { pointers.clear(); dragging=false; } },
    getView() { return {zoom,yaw,center:center.toArray() as [number,number,number]}; },
    restoreView(saved) { if(!Number.isFinite(saved.zoom) || !Number.isFinite(saved.yaw) || saved.center.length!==3 || !saved.center.every(Number.isFinite)) return; targetZoom=THREE.MathUtils.clamp(saved.zoom,.75,3); targetYaw=THREE.MathUtils.clamp(saved.yaw,-.55,.65); targetCenter.fromArray(saved.center); changeView(true); },
    reset(immediately) { targetYaw=home; targetZoom=1; targetCenter.set(0,0,0); pointerTilt=0; changeView(immediately); manualCamera=false; },
    dispose() {
      disposed = true;
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("wheel", wheel);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", up);
      renderer.domElement.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      geometries.forEach(item => item.dispose());
      materials.forEach(item => item.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      modules.forEach(({ label }) => { if (label) { label.hidden = false; label.style.transform = ""; label.style.left = ""; label.style.top = ""; } });
    },
  };
}
