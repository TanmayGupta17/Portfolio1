import { dialogueData, scaleFactor } from "./constants.js";
import { k } from "./kaboomCtx.js";
import { displayDialogue, setCamScale } from "./utils.js";


// Define custom scale factor for player
const customScaleFactor = 2.5; // Adjust this as needed

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
        shape: new k.Rect(k.vec2(0, 3), 10, 10),
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

    console.log("Player created:", player);

    // Process each layer
    for (const layer of layers) {
      console.log("Processing layer:", layer.name);

      if (layer.name === "boundaries") {
        if (Array.isArray(layer.objects)) {
          for (const boundary of layer.objects) {
            map.add([
              k.area({
                shape: new k.Rect(k.vec2(0), boundary.width, boundary.height),
              }),
              k.body({ isStatic: true }),
              k.pos(boundary.x, boundary.y),
              boundary.name,
            ]);
            console.log("Boundary added:", boundary);

            if (boundary.name) {
              player.onCollide(boundary.name, () => {
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
    }

    // Set camera to a fixed position and zoom out to show the entire map
    const canvasWidth = k.width();
    const canvasHeight = k.height();
    const cameraScale = Math.min(
      canvasWidth / mapWidth,
      canvasHeight / mapHeight
    );

    k.camScale(cameraScale);

    // Set the camera position to the center of the map or any fixed position
    k.camPos(mapWidth/1, mapHeight / 2); // Center camera on the map

    // Handle camera scaling on window resize
    k.onResize(() => {
      const newCanvasWidth = k.width();
      const newCanvasHeight = k.height();
      const newCameraScale = Math.min(
        newCanvasWidth / mapWidth,
        newCanvasHeight / mapHeight
      );

      k.camScale(newCameraScale);
      k.camPos(mapWidth / 2, mapHeight / 2); // Re-center camera on the map
    });

    // No update for the camera position to keep it fixed
    // Remove the k.onUpdate callback for camera

    // Mouse and keyboard controls for player movement
    k.onMouseDown((mouseBtn) => {
      if (mouseBtn !== "left" || player.isInDialogue) return;

      const worldMousePos = k.toWorld(k.mousePos());
      player.moveTo(worldMousePos, player.speed);

      const mouseAngle = player.pos.angle(worldMousePos);

      const lowerBound = 50;
      const upperBound = 125;

      if (mouseAngle > lowerBound && mouseAngle < upperBound && player.curAnim() !== "walk-up") {
        player.play("walk-up");
        player.direction = "up";
        return;
      }

      if (mouseAngle < -lowerBound && mouseAngle > -upperBound && player.curAnim() !== "walk-down") {
        player.play("walk-down");
        player.direction = "down";
        return;
      }

      if (Math.abs(mouseAngle) > upperBound) {
        player.flipX = false;
        if (player.curAnim() !== "walk-side") player.play("walk-side");
        player.direction = "right";
        return;
      }

      if (Math.abs(mouseAngle) < lowerBound) {
        player.flipX = true;
        if (player.curAnim() !== "walk-side") player.play("walk-side");
        player.direction = "left";
        return;
      }
    });

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

    k.onMouseRelease(stopAnims);
    k.onKeyRelease(stopAnims);

    // Handle player movement using keyboard
    k.onKeyDown((key) => {
      if (player.isInDialogue) return;

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