// assets/js/three/furniture.js
// ES module: builds furniture pieces as Three.js Groups from BoxGeometry only.

import * as THREE from 'three';

const TMP_COLOR = new THREE.Color();

function hexToColor(hex) {
  TMP_COLOR.set(hex);
  return TMP_COLOR.clone();
}

function shadeColor(hex, delta) {
  const c = hexToColor(hex);
  c.r = Math.min(1, Math.max(0, c.r + delta / 255));
  c.g = Math.min(1, Math.max(0, c.g + delta / 255));
  c.b = Math.min(1, Math.max(0, c.b + delta / 255));
  return c;
}

function makeFaceMaterials(baseColorHex, opts = {}) {
  const top = opts.top !== undefined ? opts.top : shadeColor(baseColorHex, 20);
  const side = opts.side !== undefined ? opts.side : hexToColor(baseColorHex);
  const front = opts.front !== undefined ? opts.front : shadeColor(baseColorHex, -15);
  return [
    new THREE.MeshStandardMaterial({ color: side, roughness: 0.85, metalness: 0.05 }), // +X
    new THREE.MeshStandardMaterial({ color: side, roughness: 0.85, metalness: 0.05 }), // -X
    new THREE.MeshStandardMaterial({ color: top, roughness: 0.85, metalness: 0.05 }),  // +Y top
    new THREE.MeshStandardMaterial({ color: side, roughness: 0.85, metalness: 0.05 }), // -Y bottom
    new THREE.MeshStandardMaterial({ color: front, roughness: 0.85, metalness: 0.05 }),// +Z front
    new THREE.MeshStandardMaterial({ color: front, roughness: 0.85, metalness: 0.05 }) // -Z back
  ];
}

function makeBox(w, h, d, materials) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function placeOnGround(mesh, groupHeight) {
  mesh.position.y = groupHeight / 2;
}

function getColor(materials, baseColor, key) {
  if (materials && materials[key]) return materials[key];
  return baseColor;
}

// ---------- Category Builders ----------

function buildBed(asset, options, w, d, h) {
  const group = new THREE.Group();
  group.name = asset.name || 'bed';
  const baseColor = getColor(options.materials, asset.base_color, 'bed');
  const mattressColor = getColor(options.materials, asset.base_color, 'bedMattress') || '#f5f1e8';
  const headboardColor = getColor(options.materials, asset.base_color, 'bedHeadboard');
  const pillowColor = getColor(options.materials, asset.base_color, 'bedPillow') || '#ffffff';
  const blanketColor = getColor(options.materials, asset.base_color, 'bedBlanket');

  // Base (slightly inset)
  const baseH = h * 0.18;
  const baseW = w;
  const baseD = d;
  const baseMat = makeFaceMaterials(headboardColor || baseColor);
  const base = makeBox(baseW, baseH, baseD, baseMat);
  placeOnGround(base, baseH);
  group.add(base);

  // Mattress on top of base
  const matH = h * 0.18;
  const matY = baseH + matH / 2;
  const matMat = makeFaceMaterials(mattressColor);
  const mattress = makeBox(w * 0.95, matH, d * 0.95, matMat);
  mattress.position.y = matY;
  group.add(mattress);

  // Blanket on top of mattress (folded portion near the foot)
  const blanketH = h * 0.04;
  const blanketD = d * 0.45;
  const blanketZ = -(d * 0.5) + blanketD / 2 + d * 0.05;
  const blanketMat = makeFaceMaterials(blanketColor || baseColor);
  const blanket = makeBox(w * 0.94, blanketH, blanketD, blanketMat);
  blanket.position.set(0, baseH + matH + blanketH / 2, blanketZ);
  group.add(blanket);

  // Headboard behind mattress
  const hbH = h * 0.55;
  const hbW = w;
  const hbD = 0.08;
  const hbMat = makeFaceMaterials(headboardColor || baseColor);
  const headboard = makeBox(hbW, hbH, hbD, hbMat);
  headboard.position.set(0, hbH / 2, -(d / 2) + hbD / 2);
  group.add(headboard);

  // Pillow
  const pillowW = w * 0.35;
  const pillowH = h * 0.08;
  const pillowD = d * 0.18;
  const pillowX = -w * 0.25;
  const pillowY = baseH + matH + pillowH / 2;
  const pillowZ = -(d / 2) + pillowD / 2 + d * 0.05;
  const pillowMat = makeFaceMaterials(pillowColor);
  const pillow = makeBox(pillowW, pillowH, pillowD, pillowMat);
  pillow.position.set(pillowX, pillowY, pillowZ);
  group.add(pillow);

  const pillow2 = makeBox(pillowW, pillowH, pillowD, pillowMat);
  pillow2.position.set(w * 0.25, pillowY, pillowZ);
  group.add(pillow2);

  return group;
}

function buildChair(asset, options, w, d, h) {
  const group = new THREE.Group();
  group.name = asset.name || 'chair';
  const variant = (asset.variant || 'chair').toLowerCase();
  const baseColor = getColor(options.materials, asset.base_color, 'chair');

  const seatH = h * (variant === 'armchair' ? 0.45 : 0.5);
  const seatT = 0.06;
  const seatY = seatH + seatT / 2;
  const seatMat = makeFaceMaterials(baseColor);
  const seat = makeBox(w, seatT, d, seatMat);
  seat.position.y = seatY;
  group.add(seat);

  // Legs
  const legT = 0.05;
  const legH = seatH;
  const legMat = makeFaceMaterials(shadeColor(baseColor, -30));
  const legPositions = [
    [-(w / 2) + legT / 2, -(d / 2) + legT / 2],
    [(w / 2) - legT / 2, -(d / 2) + legT / 2],
    [-(w / 2) + legT / 2, (d / 2) - legT / 2],
    [(w / 2) - legT / 2, (d / 2) - legT / 2]
  ];
  legPositions.forEach(([x, z]) => {
    const leg = makeBox(legT, legH, legT, legMat);
    leg.position.set(x, legH / 2, z);
    group.add(leg);
  });

  if (variant !== 'stool') {
    // Backrest
    const backH = h - seatH - seatT;
    const backT = 0.05;
    const backMat = makeFaceMaterials(baseColor);
    const back = makeBox(w, backH, backT, backMat);
    back.position.set(0, seatY + seatT / 2 + backH / 2, -(d / 2) + backT / 2);
    group.add(back);

    if (variant === 'armchair') {
      // Armrests
      const armH = backH * 0.55;
      const armT = 0.06;
      const armY = seatY + seatT / 2 + armH / 2;
      const armMat = makeFaceMaterials(shadeColor(baseColor, -10));
      const leftArm = makeBox(armT, armH, d, armMat);
      leftArm.position.set(-(w / 2) + armT / 2, armY, 0);
      group.add(leftArm);
      const rightArm = makeBox(armT, armH, d, armMat);
      rightArm.position.set((w / 2) - armT / 2, armY, 0);
      group.add(rightArm);
    }
  }

  return group;
}

function buildTable(asset, options, w, d, h) {
  const group = new THREE.Group();
  group.name = asset.name || 'table';
  const variant = (asset.variant || 'table').toLowerCase();
  const baseColor = getColor(options.materials, asset.base_color, 'table');

  const topT = 0.05;
  const topY = h - topT / 2;
  const topMat = makeFaceMaterials(baseColor);
  const top = makeBox(w, topT, d, topMat);
  top.position.y = topY;
  group.add(top);

  // Legs
  const legT = 0.06;
  const legH = h - topT;
  const legMat = makeFaceMaterials(shadeColor(baseColor, -30));
  const inset = legT / 2 + 0.02;
  const legPositions = [
    [-(w / 2) + inset, -(d / 2) + inset],
    [(w / 2) - inset, -(d / 2) + inset],
    [-(w / 2) + inset, (d / 2) - inset],
    [(w / 2) - inset, (d / 2) - inset]
  ];
  legPositions.forEach(([x, z]) => {
    const leg = makeBox(legT, legH, legT, legMat);
    leg.position.set(x, legH / 2, z);
    group.add(leg);
  });

  if (variant === 'desk') {
    // Drawer under top
    const drawerH = h * 0.18;
    const drawerW = w * 0.4;
    const drawerD = d * 0.85;
    const drawerY = (h - topT) - drawerH / 2 - 0.02;
    const drawerMat = makeFaceMaterials(shadeColor(baseColor, -10));
    const drawer = makeBox(drawerW, drawerH, drawerD, drawerMat);
    drawer.position.set(0, drawerY, 0);
    group.add(drawer);

    // Drawer handle
    const handleW = drawerW * 0.3;
    const handleH = 0.02;
    const handleD = 0.03;
    const handleMat = new THREE.MeshStandardMaterial({
      color: shadeColor(baseColor, -60),
      roughness: 0.4,
      metalness: 0.6
    });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(handleW, handleH, handleD), handleMat);
    handle.castShadow = true;
    handle.receiveShadow = true;
    handle.position.set(0, drawerY, drawerD / 2 + handleD / 2);
    group.add(handle);
  } else if (variant === 'coffee') {
    // Lower shelf
    const shelfT = 0.03;
    const shelfY = (h - topT) * 0.35;
    const shelfMat = makeFaceMaterials(shadeColor(baseColor, -10));
    const shelf = makeBox(w * 0.85, shelfT, d * 0.7, shelfMat);
    shelf.position.y = shelfY;
    group.add(shelf);
  }

  return group;
}

function buildShelf(asset, options, w, d, h) {
  const group = new THREE.Group();
  group.name = asset.name || 'shelf';
  const variant = (asset.variant || 'shelf').toLowerCase();
  const baseColor = getColor(options.materials, asset.base_color, 'shelf');
  const panelT = 0.02;

  // Side panels
  const sideMat = makeFaceMaterials(baseColor);
  const left = makeBox(panelT, h, d, sideMat);
  left.position.set(-(w / 2) + panelT / 2, h / 2, 0);
  group.add(left);
  const right = makeBox(panelT, h, d, sideMat);
  right.position.set((w / 2) - panelT / 2, h / 2, 0);
  group.add(right);

  // Back panel
  const backMat = makeFaceMaterials(shadeColor(baseColor, -20));
  const back = makeBox(w, h, panelT, backMat);
  back.position.set(0, h / 2, -(d / 2) + panelT / 2);
  group.add(back);

  // Determine shelves count
  let shelves = 3;
  if (asset.shelf_count !== undefined) shelves = asset.shelf_count;
  if (variant === 'wardrobe') shelves = 1;
  const shelfMat = makeFaceMaterials(baseColor);
  for (let i = 0; i < shelves; i++) {
    const shelfT = 0.025;
    const shelfY = (h / (shelves + 1)) * (i + 1);
    const shelf = makeBox(w - panelT * 2, shelfT, d - panelT, shelfMat);
    shelf.position.set(0, shelfY, 0);
    group.add(shelf);
  }

  if (variant === 'bookshelf') {
    // Books on each shelf
    const bookColors = ['#8b3a3a', '#3a5f8b', '#3a8b5f', '#8b6b3a', '#5f3a8b', '#8b3a6b'];
    const shelfHeight = h / (shelves + 1);
    for (let i = 0; i < shelves; i++) {
      const shelfY = (h / (shelves + 1)) * (i + 1);
      const availableH = shelfHeight * 0.85;
      const bookT = 0.04;
      const bookH = availableH * (0.7 + Math.random() * 0.25);
      let cursor = -(w - panelT * 2) / 2 + 0.03;
      const end = (w - panelT * 2) / 2 - 0.03;
      while (cursor < end) {
        const bw = 0.04 + Math.random() * 0.04;
        if (cursor + bw > end) break;
        const color = bookColors[Math.floor(Math.random() * bookColors.length)];
        const mat = makeFaceMaterials(color);
        const book = makeBox(bw, bookH, bookT, mat);
        book.position.set(cursor + bw / 2, shelfY + shelfT / 2 + bookH / 2, (d - panelT) / 2 - bookT / 2 - 0.01);
        group.add(book);
        cursor += bw + 0.003;
      }
    }
  } else if (variant === 'wardrobe') {
    // Doors
    const doorT = 0.02;
    const doorW = (w - panelT * 2) / 2 - 0.005;
    const doorH = h - 0.04;
    const doorMat = makeFaceMaterials(shadeColor(baseColor, -5));
    const leftDoor = makeBox(doorW, doorH, doorT, doorMat);
    leftDoor.position.set(-(doorW / 2) - 0.0025, doorH / 2 + 0.02, (d / 2) - doorT / 2);
    group.add(leftDoor);
    const rightDoor = makeBox(doorW, doorH, doorT, doorMat);
    rightDoor.position.set((doorW / 2) + 0.0025, doorH / 2 + 0.02, (d / 2) - doorT / 2);
    group.add(rightDoor);

    // Handles
    const handleMat = new THREE.MeshStandardMaterial({
      color: shadeColor(baseColor, -70),
      roughness: 0.3,
      metalness: 0.7
    });
    const handle1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.02), handleMat);
    handle1.castShadow = true;
    handle1.receiveShadow = true;
    handle1.position.set(-0.02, doorH / 2 + 0.02, (d / 2) + 0.01);
    group.add(handle1);
    const handle2 = handle1.clone();
    handle2.position.set(0.02, doorH / 2 + 0.02, (d / 2) + 0.01);
    group.add(handle2);
  }

  return group;
}

function buildLamp(asset, options, w, d, h) {
  const group = new THREE.Group();
  group.name = asset.name || 'lamp';
  const baseColor = getColor(options.materials, asset.base_color, 'lampBase') || '#2a2a2a';
  const shadeColorHex = getColor(options.materials, asset.base_color, 'lampShade') || '#f4e4b8';

  // Base
  const baseH = 0.04;
  const baseW = Math.max(w, d) * 0.6;
  const baseMat = makeFaceMaterials(baseColor);
  const base = makeBox(baseW, baseH, baseW, baseMat);
  base.position.y = baseH / 2;
  group.add(base);

  // Pole
  const poleT = 0.03;
  const poleH = h * 0.65;
  const poleMat = makeFaceMaterials(shadeColor(baseColor, -20));
  const pole = makeBox(poleT, poleH, poleT, poleMat);
  pole.position.y = baseH + poleH / 2;
  group.add(pole);

  // Shade
  const shadeH = h * 0.3;
  const shadeW = Math.max(w, d) * 0.7;
  const shadeD = Math.max(w, d) * 0.7;
  const shadeMat = new THREE.MeshStandardMaterial({
    color: hexToColor(shadeColorHex),
    roughness: 0.5,
    metalness: 0.0,
    emissive: hexToColor(shadeColorHex),
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.95
  });
  const shade = new THREE.Mesh(new THREE.BoxGeometry(shadeW, shadeH, shadeD), shadeMat);
  shade.castShadow = true;
  shade.receiveShadow = true;
  shade.position.y = baseH + poleH + shadeH / 2;
  group.add(shade);

  // Glow (point light)
  const glow = new THREE.PointLight(shadeColorHex, 0.6, h * 4, 2);
  glow.position.copy(shade.position);
  group.add(glow);

  return group;
}

function buildPlant(asset, options, w, d, h) {
  const group = new THREE.Group();
  group.name = asset.name || 'plant';
  const baseColor = getColor(options.materials, asset.base_color, 'plantPot') || '#8b5a3c';
  const leafColor = getColor(options.materials, asset.base_color, 'plantLeaves') || '#2f7a3a';

  // Pot
  const potH = h * 0.35;
  const potW = Math.min(w, d) * 0.85;
  const potMat = makeFaceMaterials(baseColor);
  const pot = makeBox(potW, potH, potW, potMat);
  pot.position.y = potH / 2;
  group.add(pot);

  // Soil (top of pot)
  const soilH = 0.02;
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 1 });
  const soil = new THREE.Mesh(new THREE.BoxGeometry(potW * 0.95, soilH, potW * 0.95), soilMat);
  soil.castShadow = true;
  soil.receiveShadow = true;
  soil.position.y = potH + soilH / 2;
  group.add(soil);

  // Stem
  const stemH = h * 0.25;
  const stemT = 0.025;
  const stemMat = new THREE.MeshStandardMaterial({ color: shadeColor(leafColor, -40), roughness: 0.9 });
  const stem = new THREE.Mesh(new THREE.BoxGeometry(stemT, stemH, stemT), stemMat);
  stem.castShadow = true;
  stem.receiveShadow = true;
  stem.position.y = potH + soilH + stemH / 2;
  group.add(stem);

  // Leaves (cluster of boxes)
  const leafMat = makeFaceMaterials(leafColor);
  const leafBaseY = potH + soilH + stemH;
  const leafSize = Math.min(w, d) * 0.55;
  const offsets = [
    [0, 0, 0, leafSize, h * 0.4, leafSize],
    [-leafSize * 0.4, h * 0.05, 0, leafSize * 0.7, h * 0.3, leafSize * 0.7],
    [leafSize * 0.4, h * 0.05, 0, leafSize * 0.7, h * 0.3, leafSize * 0.7],
    [0, h * 0.05, -leafSize * 0.4, leafSize * 0.7, h * 0.3, leafSize * 0.7],
    [0, h * 0.05, leafSize * 0.4, leafSize * 0.7, h * 0.3, leafSize * 0.7]
  ];
  offsets.forEach(([lx, ly, lz, lw, lh, ld]) => {
    const leaf = makeBox(lw, lh, ld, leafMat);
    leaf.position.set(lx, leafBaseY + ly + lh / 2, lz);
    group.add(leaf);
  });

  return group;
}

function buildRug(asset, options, w, d) {
  const group = new THREE.Group();
  group.name = asset.name || 'rug';
  const baseColor = getColor(options.materials, asset.base_color, 'rug') || '#a86b4a';
  const mat = new THREE.MeshStandardMaterial({
    color: hexToColor(baseColor),
    roughness: 0.95,
    metalness: 0.0
  });
  const geo = new THREE.BoxGeometry(w, 0.02, d);
  const rug = new THREE.Mesh(geo, mat);
  rug.castShadow = false;
  rug.receiveShadow = true;
  rug.position.y = 0.01;
  group.add(rug);
  return group;
}

function buildPictureFrame(asset, options, w, d, h) {
  const group = new THREE.Group();
  group.name = asset.name || 'picture';
  const frameColor = getColor(options.materials, asset.base_color, 'frame') || '#3a2418';
  const innerColor = getColor(options.materials, asset.base_color, 'pictureInner') || '#e8d8a8';
  const mountainColor = getColor(options.materials, asset.base_color, 'mountain') || '#5a6b7a';

  // Frame (outer)
  const frameT = 0.04;
  const frameMat = makeFaceMaterials(frameColor);
  const frameW = w;
  const frameH = h * 0.8;
  const frame = makeBox(frameW, frameH, frameT, frameMat);
  frame.position.set(0, frameH / 2 + h * 0.1, -(d / 2) + frameT / 2);
  group.add(frame);

  // Inner panel
  const innerT = 0.01;
  const innerW = w * 0.85;
  const innerH = frameH * 0.85;
  const innerMat = new THREE.MeshStandardMaterial({ color: hexToColor(innerColor), roughness: 0.9 });
  const inner = new THREE.Mesh(new THREE.BoxGeometry(innerW, innerH, innerT), innerMat);
  inner.castShadow = false;
  inner.receiveShadow = true;
  inner.position.set(0, frameH / 2 + h * 0.1, -(d / 2) + frameT + innerT / 2);
  group.add(inner);

  // Mountain (triangular-ish approximation via stacked boxes)
  const mountainMat = new THREE.MeshStandardMaterial({ color: hexToColor(mountainColor), roughness: 0.9 });
  const mountain1 = new THREE.Mesh(new THREE.BoxGeometry(innerW * 0.6, innerH * 0.45, innerT * 0.5), mountainMat);
  mountain1.position.set(-innerW * 0.1, frameH / 2 + h * 0.1 - innerH * 0.25, -(d / 2) + frameT + innerT + 0.001);
  mountain1.rotation.z = 0.15;
  group.add(mountain1);
  const mountain2 = new THREE.Mesh(new THREE.BoxGeometry(innerW * 0.5, innerH * 0.35, innerT * 0.5), mountainMat);
  mountain2.position.set(innerW * 0.15, frameH / 2 + h * 0.1 - innerH * 0.3, -(d / 2) + frameT + innerT + 0.001);
  mountain2.rotation.z = -0.1;
  group.add(mountain2);

  return group;
}

function buildSofa(asset, options, w, d, h) {
  const group = new THREE.Group();
  group.name = asset.name || 'sofa';
  const baseColor = getColor(options.materials, asset.base_color, 'sofa');

  // Base
  const baseH = h * 0.25;
  const baseMat = makeFaceMaterials(baseColor);
  const base = makeBox(w, baseH, d, baseMat);
  base.position.y = baseH / 2;
  group.add(base);

  // Seat cushions
  const cushionH = h * 0.2;
  const cushionCount = 2;
  const cushionW = (w - 0.05) / cushionCount;
  const cushionD = d * 0.85;
  const cushionMat = makeFaceMaterials(shadeColor(baseColor, 10));
  for (let i = 0; i < cushionCount; i++) {
    const c = makeBox(cushionW, cushionH, cushionD, cushionMat);
    c.position.set(-w / 2 + cushionW / 2 + 0.025 + i * cushionW, baseH + cushionH / 2, 0.02);
    group.add(c);
  }

  // Backrest
  const backH = h * 0.55;
  const backT = 0.1;
  const backMat = makeFaceMaterials(baseColor);
  const back = makeBox(w, backH, backT, backMat);
  back.position.set(0, baseH + backH / 2, -(d / 2) + backT / 2);
  group.add(back);

  // Armrests
  const armH = h * 0.45;
  const armT = 0.1;
  const armMat = makeFaceMaterials(shadeColor(baseColor, -10));
  const leftArm = makeBox(armT, armH, d, armMat);
  leftArm.position.set(-(w / 2) + armT / 2, baseH + armH / 2, 0);
  group.add(leftArm);
  const rightArm = makeBox(armT, armH, d, armMat);
  rightArm.position.set((w / 2) - armT / 2, baseH + armH / 2, 0);
  group.add(rightArm);

  return group;
}

function buildGenericBox(asset, options, w, d, h) {
  const group = new THREE.Group();
  group.name = asset.name || 'furniture';
  const baseColor = asset.base_color || '#888888';
  const mat = makeFaceMaterials(baseColor);
  const mesh = makeBox(w, h, d, mat);
  mesh.position.y = h / 2;
  group.add(mesh);
  return group;
}

function buildBeanBag(asset, options, w, d, h) {
  const group = new THREE.Group();
  group.name = asset.name || 'beanbag';
  const baseColor = getColor(options.materials, asset.base_color, 'beanbag') || '#7b6b8a';
  const bodyMat = makeFaceMaterials(baseColor);
  const body = makeBox(w * 0.9, h * 0.5, d * 0.9, bodyMat);
  body.position.y = h * 0.25;
  group.add(body);
  const topMat = makeFaceMaterials(shadeColor(baseColor, 18));
  const top = makeBox(w * 0.55, h * 0.25, d * 0.55, topMat);
  top.position.y = h * 0.5 + h * 0.125;
  top.rotation.y = Math.PI / 4;
  group.add(top);
  return group;
}

// ---------------------------------------------------------------------------
// Category resolution
//
// The live catalogue stores plural categories (`beds`, `seating`, `tables`,
// `storage`, `decor`) and human-readable names ("Single Bed", "Office Chair").
// The builders below key off singular kinds, so we map name/category to a
// builder kind first.
// ---------------------------------------------------------------------------

function normalizeName(name) {
  return String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

const NAME_KIND_MAP = {
  'single bed': { kind: 'bed' },
  'double bed': { kind: 'bed' },
  'queen bed': { kind: 'bed' },
  'king bed': { kind: 'bed' },
  'bunk bed': { kind: 'bed' },
  'couch': { kind: 'sofa' },
  'office chair': { kind: 'chair' },
  'armchair': { kind: 'chair', variant: 'armchair' },
  'sofa (2-seat)': { kind: 'sofa' },
  'sofa (3-seat)': { kind: 'sofa' },
  'dining chair': { kind: 'chair' },
  'bean-bag': { kind: 'beanbag' },
  'floor lamp': { kind: 'lamp' },
  'table lamp': { kind: 'lamp' },
  'rug medium': { kind: 'rug' },
  'plant large': { kind: 'plant' },
  'plant pot': { kind: 'plant' },
  'tv stand': { kind: 'shelf', variant: 'tv-stand', shelf_count: 1 },
  'wall shelf': { kind: 'shelf', variant: 'wall', shelf_count: 2 },
  'shoe rack': { kind: 'shelf', variant: 'shoe', shelf_count: 2 },
  'mirror': { kind: 'picture' },
  'picture frame': { kind: 'picture' },
  'wardrobe': { kind: 'shelf', variant: 'wardrobe' },
  'dresser': { kind: 'shelf', variant: 'dresser', shelf_count: 4 },
  'bookshelf': { kind: 'shelf', variant: 'bookshelf' },
  'nightstand': { kind: 'box' },
  'cabinet': { kind: 'box' },
  'coffee table': { kind: 'table', variant: 'coffee' },
  'dining table 4': { kind: 'table' },
  'dining table 6': { kind: 'table' },
  'side table': { kind: 'table' },
  'desk': { kind: 'table', variant: 'desk' },
};

const CATEGORY_KIND_MAP = {
  beds: 'bed',
  seating: 'chair',
  tables: 'table',
  storage: 'shelf',
  decor: 'lamp',
};

function resolveSpec(asset) {
  const byName = NAME_KIND_MAP[normalizeName(asset.name)] || null;
  if (byName) return byName;
  const fallback = CATEGORY_KIND_MAP[String(asset.category || '').toLowerCase()] || 'box';
  return { kind: fallback };
}

// ---------- Main Entry ----------

export function buildFurniture(asset, options = {}) {
  options = options || {};
  const materials = options.materials || {};

  const gridW = asset.grid_width || 1;
  const gridH = asset.grid_height || 1;
  const w = gridW * 0.5;
  const d = gridH * 0.5;
  const h = asset.height_m || (asset.height || 1);

  const spec = resolveSpec(asset);
  const kind = spec.kind || 'box';
  const specAsset = Object.assign({}, asset, {
    variant: spec.variant || asset.variant,
    shelf_count: spec.shelf_count !== undefined ? spec.shelf_count : asset.shelf_count,
  });

  switch (kind) {
    case 'bed':
      return buildBed(specAsset, options, w, d, h);
    case 'chair':
      return buildChair(specAsset, options, w, d, h);
    case 'sofa':
      return buildSofa(specAsset, options, w, d, h);
    case 'beanbag':
      return buildBeanBag(specAsset, options, w, d, h);
    case 'table':
      return buildTable(specAsset, options, w, d, h);
    case 'shelf':
      return buildShelf(specAsset, options, w, d, h);
    case 'lamp':
      return buildLamp(specAsset, options, w, d, h);
    case 'plant':
      return buildPlant(specAsset, options, w, d, h);
    case 'rug':
      return buildRug(specAsset, options, w, d);
    case 'picture':
      return buildPictureFrame(specAsset, options, w, d, h);
    default:
      return buildGenericBox(specAsset, options, w, d, h);
  }
}

export function createMeshForAsset(asset, x, z) {
  const group = buildFurniture(asset);
  group.position.set(x || 0, 0, z || 0);
  return group;
}

export function disposeMesh(mesh) {
  if (!mesh) return;
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => m.dispose());
    } else {
      mesh.material.dispose();
    }
  }
  if (mesh.parent) mesh.parent.remove(mesh);
}

export default buildFurniture;