import { dialogueData, scaleFactor } from "./constants.js";
import { k } from "./kaboomCtx.js";
import { displayDialogue } from "./utils.js";


// Define custom scale factor for player
const customScaleFactor = 2.5; // Adjust this as needed
const playerCollisionBox = {
  offsetX: 0,
  offsetY: 3,
  width: 10,
  height: 10,
};

// Load sprites and set background color
k.loadSprite("spritesheet", "./spritesheet.png", {
  sliceX: 39,
  sliceY: 31,
  anims: {
    "idle-down": 936,
    "walk-down": { from: 936, to: 939, loop: true, speed: 8 },
    "idle-side": 975,
    "walk-side": { from: 975, to: 978, loop: true, speed: 8 },
    "idle-up": 1014,
    "walk-up": { from: 1014, to: 1017, loop: true, speed: 8 },
  },
});

k.loadSprite("map", "./map.png");

k.setBackground(k.Color.fromHex("#FDFFC2"));

// Define main scene
k.scene("main", async () => {
  try {
    // Fetch map data
    const response = await fetch("./map.json");
    const mapData = await response.json();
    console.log("Map data loaded:", mapData);

    const layers = mapData.layers;
    console.log("Map layers:", layers);

    const mapWidth = mapData.width * mapData.tilewidth;
    const mapHeight = mapData.height * mapData.tileheight;

    // Add map to scene
    const map = k.add([
      k.sprite("map"),
      k.pos(0, 0),
      k.scale(scaleFactor),
    ]);
    console.log("Map added to scene at scale:", scaleFactor);

    // Define player entity with custom scale factor
    const player = k.add([
      k.sprite("spritesheet", { anim: "idle-down" }),
      k.area({
        shape: new k.Rect(
          k.vec2(playerCollisionBox.offsetX, playerCollisionBox.offsetY),
          playerCollisionBox.width,
          playerCollisionBox.height
        ),
      }),
      k.body(),
      k.anchor("center"),
      k.pos(0, 0),
      k.scale(scaleFactor * customScaleFactor), // Apply custom scale factor
      {
        speed: 250,
        direction: "down",
        isInDialogue: false,
      },
      "player",
    ]);

    const tileWidth = mapData.tilewidth;
    const tileHeight = mapData.tileheight;
    const mapGridWidth = mapData.width;
    const mapGridHeight = mapData.height;
    const navCellSize = 4;
    const navGridWidth = Math.ceil(mapWidth / navCellSize);
    const navGridHeight = Math.ceil(mapHeight / navCellSize);
    const navBlockedGrid = Array.from({ length: navGridHeight }, () =>
      Array(navGridWidth).fill(false)
    );
    const autoMovePath = [];
    let autoMoveTargetCell = null;
    let autoMoveTargetWorld = null;
    let lastAutoMovePos = null;
    let stuckSeconds = 0;
    let pendingRoomDialogue = null;
    let lastPointerClientPos = null;
    const obstacleRects = [];
    const interactiveZones = [];
    const titleHotspots = [];
    const roomClickZones = [
      {
        roomName: "Skills",
        x: 48,
        y: 160,
        width: 400,
        height: 240,
        targetX: 320,
        targetY: 304,
      },
      {
        roomName: "Experience",
        x: 48,
        y: 432,
        width: 432,
        height: 272,
        targetX: 320,
        targetY: 624,
      },
      {
        roomName: "Projects",
        x: 640,
        y: 160,
        width: 320,
        height: 288,
        targetX: 800,
        targetY: 304,
      },
      {
        roomName: "ContactMe",
        x: 480,
        y: 448,
        width: 224,
        height: 256,
        targetX: 592,
        targetY: 592,
      },
      {
        roomName: "Summary",
        x: 720,
        y: 512,
        width: 240,
        height: 192,
        targetX: 848,
        targetY: 624,
      },
    ];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const playerColliderWidth = playerCollisionBox.width * customScaleFactor;
    const playerColliderHeight = playerCollisionBox.height * customScaleFactor;
    const playerColliderOffsetX = playerCollisionBox.offsetX * customScaleFactor;
    const playerColliderOffsetY = playerCollisionBox.offsetY * customScaleFactor;
    const canvasEl = document.getElementById("game");

    function isMobileRotatedView() {
      return window.innerWidth <= 700;
    }

    function getPointerWorldPos() {
      if (!isMobileRotatedView() || !canvasEl || !lastPointerClientPos) {
        return k.toWorld(k.mousePos());
      }

      const rect = canvasEl.getBoundingClientRect();
      const normalizedX = clamp(
        (lastPointerClientPos.x - rect.left) / rect.width,
        0,
        1
      );
      const normalizedY = clamp(
        (lastPointerClientPos.y - rect.top) / rect.height,
        0,
        1
      );

      const localX = normalizedY * k.width();
      const localY = (1 - normalizedX) * k.height();

      return k.toWorld(k.vec2(localX, localY));
    }

    function worldToMapGrid(worldPos) {
      const mapX = worldPos.x / scaleFactor;
      const mapY = worldPos.y / scaleFactor;
      return {
        x: clamp(Math.floor(mapX / tileWidth), 0, mapGridWidth - 1),
        y: clamp(Math.floor(mapY / tileHeight), 0, mapGridHeight - 1),
      };
    }

    function mapGridToWorldCenter(cell) {
      return k.vec2(
        (cell.x * tileWidth + tileWidth / 2) * scaleFactor,
        (cell.y * tileHeight + tileHeight / 2) * scaleFactor
      );
    }

    function worldToNavGrid(worldPos) {
      const mapX = worldPos.x / scaleFactor;
      const mapY = worldPos.y / scaleFactor;
      return {
        x: clamp(Math.floor(mapX / navCellSize), 0, navGridWidth - 1),
        y: clamp(Math.floor(mapY / navCellSize), 0, navGridHeight - 1),
      };
    }

    function navGridToWorldCenter(cell) {
      return k.vec2(
        (cell.x * navCellSize + navCellSize / 2) * scaleFactor,
        (cell.y * navCellSize + navCellSize / 2) * scaleFactor
      );
    }

    function isNavWalkable(cell) {
      return (
        cell.x >= 0 &&
        cell.y >= 0 &&
        cell.x < navGridWidth &&
        cell.y < navGridHeight &&
        !navBlockedGrid[cell.y][cell.x]
      );
    }

    function rectsOverlap(a, b) {
      return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      );
    }

    function canOccupyMapPoint(mapX, mapY) {
      const playerRect = {
        x: mapX - playerColliderWidth / 2 + playerColliderOffsetX,
        y: mapY - playerColliderHeight / 2 + playerColliderOffsetY,
        width: playerColliderWidth,
        height: playerColliderHeight,
      };

      return !obstacleRects.some((obstacle) => rectsOverlap(playerRect, obstacle));
    }

    function rebuildNavGrid() {
      for (let y = 0; y < navGridHeight; y++) {
        for (let x = 0; x < navGridWidth; x++) {
          const mapX = x * navCellSize + navCellSize / 2;
          const mapY = y * navCellSize + navCellSize / 2;
          navBlockedGrid[y][x] = !canOccupyMapPoint(mapX, mapY);
        }
      }
    }

    function findNearestWalkableNavCell(startCell, maxRadius = 24) {
      if (isNavWalkable(startCell)) return startCell;

      for (let radius = 1; radius <= maxRadius; radius++) {
        for (let y = startCell.y - radius; y <= startCell.y + radius; y++) {
          for (let x = startCell.x - radius; x <= startCell.x + radius; x++) {
            if (
              x === startCell.x - radius ||
              x === startCell.x + radius ||
              y === startCell.y - radius ||
              y === startCell.y + radius
            ) {
              const candidate = { x, y };
              if (isNavWalkable(candidate)) return candidate;
            }
          }
        }
      }

      return null;
    }

    function findPath(startCell, targetCell) {
      const start = findNearestWalkableNavCell(startCell);
      const target = findNearestWalkableNavCell(targetCell);
      if (!start || !target) return [];

      const key = (cell) => `${cell.x},${cell.y}`;
      const cameFrom = new Map();
      const gScore = new Map();
      const fScore = new Map();
      const open = [start];

      const h = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

      gScore.set(key(start), 0);
      fScore.set(key(start), h(start, target));

      while (open.length > 0) {
        open.sort((a, b) => (fScore.get(key(a)) ?? Infinity) - (fScore.get(key(b)) ?? Infinity));
        const current = open.shift();
        if (!current) break;

        if (current.x === target.x && current.y === target.y) {
          const path = [current];
          let cursorKey = key(current);

          while (cameFrom.has(cursorKey)) {
            const previous = cameFrom.get(cursorKey);
            if (!previous) break;
            path.push(previous);
            cursorKey = key(previous);
          }

          path.reverse();
          return path;
        }

        const neighbors = [
          { x: current.x + 1, y: current.y },
          { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 },
          { x: current.x, y: current.y - 1 },
        ].filter(isNavWalkable);

        for (const neighbor of neighbors) {
          const currentKey = key(current);
          const neighborKey = key(neighbor);
          const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;

          if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
            cameFrom.set(neighborKey, current);
            gScore.set(neighborKey, tentativeG);
            fScore.set(neighborKey, tentativeG + h(neighbor, target));
            if (!open.some((cell) => cell.x === neighbor.x && cell.y === neighbor.y)) {
              open.push(neighbor);
            }
          }
        }
      }

      return [];
    }

    function isLineClear(startPos, endPos) {
      const distance = startPos.dist(endPos);
      const steps = Math.max(1, Math.ceil(distance / (navCellSize * scaleFactor * 0.5)));

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sample = k.vec2(
          startPos.x + (endPos.x - startPos.x) * t,
          startPos.y + (endPos.y - startPos.y) * t
        );
        const cell = worldToNavGrid(sample);
        if (!isNavWalkable(cell)) return false;
      }

      return true;
    }

    function getBoundaryCenter(boundary) {
      return k.vec2(
        (boundary.x + boundary.width / 2) * scaleFactor,
        (boundary.y + boundary.height / 2) * scaleFactor
      );
    }

    function getZoneCells(boundary) {
      const startX = clamp(Math.floor(boundary.x / tileWidth), 0, mapGridWidth - 1);
      const endX = clamp(
        Math.ceil((boundary.x + boundary.width) / tileWidth) - 1,
        0,
        mapGridWidth - 1
      );
      const startY = clamp(Math.floor(boundary.y / tileHeight), 0, mapGridHeight - 1);
      const endY = clamp(
        Math.ceil((boundary.y + boundary.height) / tileHeight) - 1,
        0,
        mapGridHeight - 1
      );

      return { startX, endX, startY, endY };
    }

    function getWalkableTargetForRect(rect, preferredWorldPos) {
      const startX = clamp(Math.floor(rect.x / navCellSize), 0, navGridWidth - 1);
      const endX = clamp(
        Math.ceil((rect.x + rect.width) / navCellSize) - 1,
        0,
        navGridWidth - 1
      );
      const startY = clamp(Math.floor(rect.y / navCellSize), 0, navGridHeight - 1);
      const endY = clamp(
        Math.ceil((rect.y + rect.height) / navCellSize) - 1,
        0,
        navGridHeight - 1
      );
      let bestCell = null;
      let bestDistance = Infinity;

      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const cell = { x, y };
          if (!isNavWalkable(cell)) continue;

          const worldCenter = navGridToWorldCenter(cell);
          const distance = worldCenter.dist(preferredWorldPos);

          if (distance < bestDistance) {
            bestDistance = distance;
            bestCell = cell;
          }
        }
      }

      return bestCell ? navGridToWorldCenter(bestCell) : null;
    }

    function getPreferredRoomWorldPos(roomName, fallbackWorldPos) {
      const roomZone = roomClickZones.find((zone) => zone.roomName === roomName);
      if (!roomZone || roomZone.targetX == null || roomZone.targetY == null) {
        return fallbackWorldPos;
      }

      return k.vec2(roomZone.targetX * scaleFactor, roomZone.targetY * scaleFactor);
    }

    function getWalkableTargetForRoom(roomName, preferredWorldPos) {
      const matchingRoomZones = roomClickZones.filter((zone) => zone.roomName === roomName);
      const matchingZones = interactiveZones.filter((zone) => zone.name === roomName);
      const candidateRects = [...matchingRoomZones, ...matchingZones];
      if (candidateRects.length === 0) return preferredWorldPos;
      const preferredRoomWorldPos = getPreferredRoomWorldPos(roomName, preferredWorldPos);

      let fallbackTarget = null;
      let fallbackDistance = Infinity;

      for (const zone of candidateRects) {
        const zoneCenter = getBoundaryCenter(zone);
        const zoneDistance = zoneCenter.dist(preferredRoomWorldPos);

        if (zoneDistance < fallbackDistance) {
          fallbackDistance = zoneDistance;
          fallbackTarget = zoneCenter;
        }

        const walkableTarget = getWalkableTargetForRect(zone, preferredRoomWorldPos);
        if (walkableTarget) return walkableTarget;
      }

      return fallbackTarget ?? preferredWorldPos;
    }

    function getRoomNameFromTitle(text) {
      const normalized = text.trim().toUpperCase();
      if (normalized === "SKILLS") return "Skills";
      if (normalized === "PROJECTS") return "Projects";
      if (normalized === "CONTACT") return "ContactMe";
      if (normalized === "ABOUT") return "Summary";
      if (normalized === "EDU & EXP") return "Experience";
      return null;
    }

    function findInteractiveZoneAtWorldPos(worldPos) {
      const mapX = worldPos.x / scaleFactor;
      const mapY = worldPos.y / scaleFactor;

      return interactiveZones.find(
        (zone) =>
          mapX >= zone.x &&
          mapX <= zone.x + zone.width &&
          mapY >= zone.y &&
          mapY <= zone.y + zone.height
      );
    }

    function findTitleHotspotAtWorldPos(worldPos) {
      const mapX = worldPos.x / scaleFactor;
      const mapY = worldPos.y / scaleFactor;

      return titleHotspots.find(
        (hotspot) =>
          mapX >= hotspot.x &&
          mapX <= hotspot.x + hotspot.width &&
          mapY >= hotspot.y &&
          mapY <= hotspot.y + hotspot.height
      );
    }

    function findRoomClickZoneAtWorldPos(worldPos) {
      const mapX = worldPos.x / scaleFactor;
      const mapY = worldPos.y / scaleFactor;

      return roomClickZones.find(
        (zone) =>
          mapX >= zone.x &&
          mapX <= zone.x + zone.width &&
          mapY >= zone.y &&
          mapY <= zone.y + zone.height
      );
    }

    function buildAutoMovePath(targetWorldPos, { allowExactTarget = true } = {}) {
      const startCell = worldToNavGrid(player.pos);
      const requestedTargetCell = worldToNavGrid(targetWorldPos);
      const targetCell = findNearestWalkableNavCell(requestedTargetCell);

      autoMovePath.length = 0;
      autoMoveTargetCell = targetCell;
      autoMoveTargetWorld = targetWorldPos;
      lastAutoMovePos = k.vec2(player.pos.x, player.pos.y);
      stuckSeconds = 0;

      if (!targetCell) return;

      const pathCells = findPath(startCell, targetCell);
      if (pathCells.length === 0) return;

      if (pathCells.length > 1) {
        let previousDirection = null;

        for (let i = 1; i < pathCells.length; i++) {
          const previousCell = pathCells[i - 1];
          const currentCell = pathCells[i];
          const direction = {
            x: Math.sign(currentCell.x - previousCell.x),
            y: Math.sign(currentCell.y - previousCell.y),
          };

          const isLastCell = i === pathCells.length - 1;
          if (
            previousDirection &&
            direction.x === previousDirection.x &&
            direction.y === previousDirection.y &&
            !isLastCell
          ) {
            continue;
          }

          autoMovePath.push(navGridToWorldCenter(currentCell));
          previousDirection = direction;
        }
      }

      // If the final straight segment is clear, finish at exact click point.
      if (
        allowExactTarget &&
        autoMovePath.length > 0 &&
        isNavWalkable(requestedTargetCell) &&
        isLineClear(autoMovePath[autoMovePath.length - 1], targetWorldPos) &&
        (
          Math.abs(autoMovePath[autoMovePath.length - 1].x - targetWorldPos.x) <
          navCellSize * scaleFactor * 0.5 ||
          Math.abs(autoMovePath[autoMovePath.length - 1].y - targetWorldPos.y) <
          navCellSize * scaleFactor * 0.5
        )
      ) {
        autoMovePath.push(targetWorldPos);
      }

      if (autoMovePath.length > 0) {
        setWalkAnimToward(autoMovePath[0]);
      }
    }

    function setWalkAnimToward(targetPos) {
      const dx = targetPos.x - player.pos.x;
      const dy = targetPos.y - player.pos.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        player.flipX = dx < 0;
        if (player.curAnim() !== "walk-side") player.play("walk-side");
        player.direction = dx < 0 ? "left" : "right";
        return;
      }

      if (dy < 0) {
        if (player.curAnim() !== "walk-up") player.play("walk-up");
        player.direction = "up";
      } else {
        if (player.curAnim() !== "walk-down") player.play("walk-down");
        player.direction = "down";
      }
    }

    console.log("Player created:", player);

    // Process each layer
    for (const layer of layers) {
      console.log("Processing layer:", layer.name);

      if (layer.name === "boundaries") {
        if (Array.isArray(layer.objects)) {
          for (const boundary of layer.objects) {
            const isInteractiveBoundary = Boolean(boundary.name);

            if (isInteractiveBoundary) {
              interactiveZones.push(boundary);
            } else {
              obstacleRects.push({
                x: boundary.x,
                y: boundary.y,
                width: boundary.width,
                height: boundary.height,
              });
            }

            map.add([
              k.area({
                shape: new k.Rect(k.vec2(0), boundary.width, boundary.height),
              }),
              k.pos(boundary.x, boundary.y),
              boundary.name,
              ...(isInteractiveBoundary ? [] : [k.body({ isStatic: true })]),
            ]);
            console.log("Boundary added:", boundary);

            if (boundary.name) {
              player.onCollide(boundary.name, () => {
                autoMovePath.length = 0;
                pendingRoomDialogue = null;
                player.isInDialogue = true;
                displayDialogue(
                  dialogueData[boundary.name],
                  () => (player.isInDialogue = false)
                );
              });
            }
          }
        } else {
          console.warn(`Layer "${layer.name}" does not contain an objects array.`);
        }

        continue;
      }

      if (layer.name === "SpawnPoints") {
        if (Array.isArray(layer.objects)) {
          for (const entity of layer.objects) {
            if (entity.name === "Player") {
              console.log("Found player spawn point:", entity);

              // Calculate player position and apply scale factor
              const playerPos = k.vec2(
                entity.x * scaleFactor,
                entity.y * scaleFactor
              );

              player.pos = playerPos;
              console.log("Player position set to:", playerPos);

              continue;
            }
          }
        } else {
          console.warn(`Layer "${layer.name}" does not contain an objects array.`);
        }
      }

      if (layer.name === "Title") {
        if (Array.isArray(layer.objects)) {
          for (const titleObject of layer.objects) {
            const roomName = getRoomNameFromTitle(titleObject.text?.text ?? "");
            if (!roomName) continue;

            titleHotspots.push({
              x: titleObject.x,
              y: titleObject.y,
              width: titleObject.width,
              height: titleObject.height,
              roomName,
            });
          }
        } else {
          console.warn(`Layer "${layer.name}" does not contain an objects array.`);
        }
      }
    }

    rebuildNavGrid();

    const worldMapWidth = mapWidth * scaleFactor;
    const worldMapHeight = mapHeight * scaleFactor;
    const cameraState = {
      zoomStep: 0.2,
      zoomMultiplier: 1,
      currentMode: "desktop",
      minZoomMultiplier: 0.7,
      maxZoomMultiplier: 2.6,
    };

    function getCameraMode() {
      const viewportWidth = window.innerWidth;
      if (viewportWidth <= 700) return "mobile";
      if (viewportWidth <= 1100) return "tablet";
      return "desktop";
    }

    function getBaseCameraScale(mode = getCameraMode()) {
      if (mode === "desktop") {
        return Math.min(k.width() / mapWidth, k.height() / mapHeight);
      }

      if (mode === "mobile") {
        return Math.max(k.height() / worldMapWidth, k.width() / worldMapHeight);
      }

      return Math.max(
        k.width() / worldMapWidth,
        k.height() / worldMapHeight
      );
    }

    function clampCameraPos(pos, scale) {
      const halfViewportWidth = k.width() / (2 * scale);
      const halfViewportHeight = k.height() / (2 * scale);

      return k.vec2(
        worldMapWidth <= halfViewportWidth * 2
          ? worldMapWidth / 2
          : clamp(pos.x, halfViewportWidth, worldMapWidth - halfViewportWidth),
        worldMapHeight <= halfViewportHeight * 2
          ? worldMapHeight / 2
          : clamp(pos.y, halfViewportHeight, worldMapHeight - halfViewportHeight)
      );
    }

    function applyCamera() {
      cameraState.currentMode = getCameraMode();

      if (cameraState.currentMode === "desktop") {
        k.camScale(getBaseCameraScale("desktop"));
        k.camPos(mapWidth / 1, mapHeight / 2);
        return;
      }

      if (cameraState.currentMode === "mobile") {
        k.camScale(getBaseCameraScale("mobile"));
        k.camPos(worldMapWidth / 2, worldMapHeight / 2);
        return;
      }

      const overviewScale = getBaseCameraScale(cameraState.currentMode);
      k.camScale(overviewScale);
      k.camPos(worldMapWidth / 2, worldMapHeight / 2);
    }

    function setZoomMultiplier(nextZoom) {
      if (cameraState.currentMode !== "desktop") return;
      cameraState.zoomMultiplier = clamp(
        nextZoom,
        cameraState.minZoomMultiplier,
        cameraState.maxZoomMultiplier
      );
      applyCamera();
    }

    window.portfolioZoomIn = () =>
      setZoomMultiplier(cameraState.zoomMultiplier + cameraState.zoomStep);
    window.portfolioZoomOut = () =>
      setZoomMultiplier(cameraState.zoomMultiplier - cameraState.zoomStep);
    window.portfolioZoomReset = () => {
      if (cameraState.currentMode === "desktop") return;
      setZoomMultiplier(1);
    };

    applyCamera();

    k.onResize(() => {
      applyCamera();
    });

    k.onUpdate(() => {
      applyCamera();
      if (player.isInDialogue || autoMovePath.length === 0) return;

      const nextWaypoint = autoMovePath[0];
      if (player.pos.dist(nextWaypoint) < 6) {
        autoMovePath.shift();
        if (autoMovePath.length === 0) {
          autoMoveTargetCell = null;
          autoMoveTargetWorld = null;
          lastAutoMovePos = null;
          stuckSeconds = 0;
          stopAnims();
          if (pendingRoomDialogue && !player.isInDialogue) {
            const dialogueKey = pendingRoomDialogue;
            pendingRoomDialogue = null;
            player.isInDialogue = true;
            displayDialogue(
              dialogueData[dialogueKey],
              () => (player.isInDialogue = false)
            );
          }
          return;
        }
      }

      const target = autoMovePath[0];
      setWalkAnimToward(target);

      const delta = target.sub(player.pos);
      const distance = delta.len();
      if (distance > 0.001) {
        const dir = delta.scale(1 / distance);
        player.move(dir.x * player.speed, dir.y * player.speed);
      }

      if (lastAutoMovePos) {
        const movedDistance = player.pos.dist(lastAutoMovePos);
        if (movedDistance < 0.2) {
          stuckSeconds += k.dt();
        } else {
          stuckSeconds = 0;
        }
      }

      lastAutoMovePos = k.vec2(player.pos.x, player.pos.y);

      if (stuckSeconds > 0.2 && autoMoveTargetWorld) {
        buildAutoMovePath(autoMoveTargetWorld);
      }
    });

    function navigateToMouseClick() {
      if (player.isInDialogue) return;

      const worldMousePos = getPointerWorldPos();
      const clickedInteractiveZone = findInteractiveZoneAtWorldPos(worldMousePos);
      const clickedTitleHotspot = findTitleHotspotAtWorldPos(worldMousePos);
      const clickedRoomZone = findRoomClickZoneAtWorldPos(worldMousePos);
      const targetRoomName =
        clickedInteractiveZone?.name ??
        clickedTitleHotspot?.roomName ??
        clickedRoomZone?.roomName ??
        null;
      pendingRoomDialogue =
        clickedRoomZone?.roomName ?? clickedTitleHotspot?.roomName ?? null;
      const targetWorldPos = targetRoomName
        ? getWalkableTargetForRoom(targetRoomName, worldMousePos)
        : worldMousePos;

      buildAutoMovePath(targetWorldPos, {
        allowExactTarget: !targetRoomName,
      });
    }

    // Mouse and keyboard controls for player movement
    window.addEventListener(
      "pointerdown",
      (event) => {
        lastPointerClientPos = { x: event.clientX, y: event.clientY };
      },
      { passive: true }
    );

    k.onMousePress("left", navigateToMouseClick);

    // Stop player animations on mouse release
    function stopAnims() {
      if (player.direction === "down") {
        player.play("idle-down");
      } else if (player.direction === "up") {
        player.play("idle-up");
      } else {
        player.play("idle-side");
      }
    }

    k.onMouseRelease(() => {
      if (autoMovePath.length === 0) stopAnims();
    });
    k.onKeyRelease(stopAnims);

    // Handle player movement using keyboard
    k.onKeyDown((key) => {
      if (player.isInDialogue) return;

      autoMovePath.length = 0;
      autoMoveTargetCell = null;
      autoMoveTargetWorld = null;
      lastAutoMovePos = null;
      stuckSeconds = 0;
      pendingRoomDialogue = null;

      if (k.isKeyDown("right")) {
        player.flipX = false;
        if (player.curAnim() !== "walk-side") player.play("walk-side");
        player.direction = "right";
        player.move(player.speed, 0);
      } else if (k.isKeyDown("left")) {
        player.flipX = true;
        if (player.curAnim() !== "walk-side") player.play("walk-side");
        player.direction = "left";
        player.move(-player.speed, 0);
      } else if (k.isKeyDown("up")) {
        if (player.curAnim() !== "walk-up") player.play("walk-up");
        player.direction = "up";
        player.move(0, -player.speed);
      } else if (k.isKeyDown("down")) {
        if (player.curAnim() !== "walk-down") player.play("walk-down");
        player.direction = "down";
        player.move(0, player.speed);
      } else {
        stopAnims();
      }
    });
  } catch (error) {
    console.error("Error loading or processing map data:", error);
  }
});

// Start the main scene
k.go("main");
