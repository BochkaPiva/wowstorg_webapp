"use client";

import React from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import "./tower-game.css";

type GameState = "ready" | "playing" | "ended" | "resetting";

type BlockState = "active" | "stopped" | "missed";
type PlacementQuality = "perfect" | "good" | "placed" | "missed";
type PlacementResult = {
  plane: "x" | "z";
  direction: number;
  bonus?: boolean;
  quality: PlacementQuality;
  placed?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  chopped?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
};

const BLOCK_HEIGHT = 1.45;
const BLOCK_SIZE = 10.6;
const BLOCK_TRAVEL = 8.8;
const BLOCK_PALETTE = [0x4f2394, 0x6731b5, 0x8050ca, 0xf1c84b, 0x7340bd] as const;

function createBlockMesh(
  dimension: { width: number; height: number; depth: number },
  material: THREE.MeshPhysicalMaterial,
) {
  const radius = Math.max(0.025, Math.min(0.12, dimension.width / 5, dimension.height / 5, dimension.depth / 5));
  const geometry = new RoundedBoxGeometry(dimension.width, dimension.height, dimension.depth, 4, radius);
  geometry.translate(dimension.width / 2, dimension.height / 2, dimension.depth / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

class Stage {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  container: HTMLDivElement;
  viewSize: number;
  reducedMotion: boolean;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    this.viewSize = 8.6;
    this.camera = new THREE.OrthographicCamera(
      -this.viewSize * aspect,
      this.viewSize * aspect,
      this.viewSize,
      -this.viewSize,
      -100,
      1000,
    );
    this.camera.position.set(14.5, 12.5, 14.5);
    this.camera.lookAt(BLOCK_SIZE / 2, 2.35, BLOCK_SIZE / 2);

    const key = new THREE.DirectionalLight(0xfff6df, 3.3);
    key.position.set(-7, 18, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -18;
    key.shadow.camera.right = 18;
    key.shadow.camera.top = 18;
    key.shadow.camera.bottom = -18;
    key.shadow.bias = -0.0008;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x9f7aea, 1.65);
    rim.position.set(13, 8, -10);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xe9ddff, 0x160d20, 1.25));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.42));

    const lowerBase = new THREE.Mesh(
      new RoundedBoxGeometry(BLOCK_SIZE + 2.2, 0.34, BLOCK_SIZE + 2.2, 5, 0.16),
      new THREE.MeshPhysicalMaterial({ color: 0x241333, roughness: 0.3, metalness: 0.22, clearcoat: 0.5 }),
    );
    lowerBase.position.set(BLOCK_SIZE / 2, -0.65, BLOCK_SIZE / 2);
    lowerBase.castShadow = true;
    lowerBase.receiveShadow = true;
    this.scene.add(lowerBase);

    const upperBase = new THREE.Mesh(
      new RoundedBoxGeometry(BLOCK_SIZE + 1.25, 0.48, BLOCK_SIZE + 1.25, 5, 0.18),
      new THREE.MeshPhysicalMaterial({
        color: 0x6d3fba,
        roughness: 0.28,
        metalness: 0.08,
        clearcoat: 0.72,
        clearcoatRoughness: 0.24,
      }),
    );
    upperBase.position.set(BLOCK_SIZE / 2, -0.24, BLOCK_SIZE / 2);
    upperBase.castShadow = true;
    upperBase.receiveShadow = true;
    this.scene.add(upperBase);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(45, 45),
      new THREE.ShadowMaterial({ color: 0x0d0712, opacity: 0.3 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(BLOCK_SIZE / 2, -0.84, BLOCK_SIZE / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    const aspect = width / Math.max(1, height);
    this.camera.left = -this.viewSize * aspect;
    this.camera.right = this.viewSize * aspect;
    this.camera.top = this.viewSize;
    this.camera.bottom = -this.viewSize;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}

class Block {
  index: number;
  state: BlockState;
  targetBlock: Block | null;
  mesh: THREE.Mesh;
  material: THREE.MeshPhysicalMaterial;
  dimension: { width: number; height: number; depth: number };
  position: { x: number; y: number; z: number };
  /** Положительное |скорость| в координатах сцены за кадр при 60 FPS (до перевода на u/s). */
  moveMagPerFrameRef: number;
  /** Единицы сцены в секунду — движение не зависит от FPS монитора. */
  speedPerSecond: number;
  directionSign: number;
  workingPlane: "x" | "z";
  workingDimension: "width" | "depth";
  readonly moveAmount = BLOCK_TRAVEL;
  colorOffset: number;

  constructor(block: Block | null) {
    this.targetBlock = block;
    this.index = (this.targetBlock ? this.targetBlock.index : 0) + 1;
    this.workingPlane = this.index % 2 ? "x" : "z";
    this.workingDimension = this.index % 2 ? "width" : "depth";
    this.dimension = {
      width: this.targetBlock ? this.targetBlock.dimension.width : BLOCK_SIZE,
      height: this.targetBlock ? this.targetBlock.dimension.height : BLOCK_HEIGHT,
      depth: this.targetBlock ? this.targetBlock.dimension.depth : BLOCK_SIZE,
    };
    this.position = {
      x: this.targetBlock ? this.targetBlock.position.x : 0,
      y: this.dimension.height * (this.index - 1),
      z: this.targetBlock ? this.targetBlock.position.z : 0,
    };
    this.colorOffset = this.targetBlock ? this.targetBlock.colorOffset : Math.round(Math.random() * 100);

    const paletteIndex = (this.index + this.colorOffset) % BLOCK_PALETTE.length;
    const color = new THREE.Color(BLOCK_PALETTE[paletteIndex]);

    this.state = this.index > 1 ? "active" : "stopped";
    // Как раньше: ускоряется с уровнем, потолок сохранён.
    this.moveMagPerFrameRef = Math.min(8, 0.22 + this.index * 0.02);
    this.speedPerSecond = this.moveMagPerFrameRef * 60;

    this.material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: paletteIndex === 3 ? 0.34 : 0.28,
      metalness: paletteIndex === 3 ? 0.12 : 0.05,
      clearcoat: 0.78,
      clearcoatRoughness: 0.22,
      emissive: color.clone().multiplyScalar(0.055),
      emissiveIntensity: 1,
    });
    this.mesh = createBlockMesh(this.dimension, this.material);
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);

    this.directionSign = 1;
    if (this.state === "active") {
      this.position[this.workingPlane] = Math.random() > 0.5 ? -this.moveAmount : this.moveAmount;
      this.mesh.position[this.workingPlane] = this.position[this.workingPlane];
      // К центру платформы: с «+края» в сторону нуля — знак минус; с «−края» — плюс.
      this.directionSign = this.position[this.workingPlane] > 0 ? -1 : 1;
    }
  }

  tick(deltaSeconds: number) {
    if (this.state !== "active") return;
    const p = this.workingPlane;
    const B = this.moveAmount;
    let v = this.position[p];
    const dt = Math.min(1 / 15, Math.max(0, deltaSeconds));
    v += this.directionSign * this.speedPerSecond * dt;
    let guard = 0;
    while ((v > B || v < -B) && guard++ < 48) {
      if (v > B) {
        v = 2 * B - v;
        this.directionSign = -1;
      } else {
        v = -2 * B - v;
        this.directionSign = 1;
      }
    }
    this.position[p] = v;
    this.mesh.position[p] = v;
  }

  place(): PlacementResult {
    this.state = "stopped";
    const impulseDir = this.directionSign * this.moveMagPerFrameRef;

    if (!this.targetBlock) {
      return { plane: this.workingPlane, direction: impulseDir, quality: "placed" };
    }

    let overlap =
      this.targetBlock.dimension[this.workingDimension] -
      Math.abs(this.position[this.workingPlane] - this.targetBlock.position[this.workingPlane]);
    const result: PlacementResult = {
      plane: this.workingPlane,
      direction: impulseDir,
      quality: "placed",
    };

    if (this.dimension[this.workingDimension] - overlap < 0.1) {
      overlap = this.dimension[this.workingDimension];
      result.bonus = true;
      result.quality = "perfect";
      this.position.x = this.targetBlock.position.x;
      this.position.z = this.targetBlock.position.z;
      this.dimension.width = this.targetBlock.dimension.width;
      this.dimension.depth = this.targetBlock.dimension.depth;
    }

    if (overlap <= 0) {
      this.state = "missed";
      this.dimension[this.workingDimension] = overlap;
      result.quality = "missed";
      return result;
    }

    if (!result.bonus && overlap / this.targetBlock.dimension[this.workingDimension] >= 0.82) {
      result.quality = "good";
    }

    const choppedDimensions = {
      width: this.dimension.width,
      height: this.dimension.height,
      depth: this.dimension.depth,
    };
    choppedDimensions[this.workingDimension] -= overlap;
    this.dimension[this.workingDimension] = overlap;

    const placedMesh = createBlockMesh(this.dimension, this.material);
    const choppedMesh = createBlockMesh(choppedDimensions, this.material.clone());

    const choppedPosition = { ...this.position };
    if (this.position[this.workingPlane] < this.targetBlock.position[this.workingPlane]) {
      this.position[this.workingPlane] = this.targetBlock.position[this.workingPlane];
    } else {
      choppedPosition[this.workingPlane] += overlap;
    }
    placedMesh.position.set(this.position.x, this.position.y, this.position.z);
    choppedMesh.position.set(choppedPosition.x, choppedPosition.y, choppedPosition.z);

    result.placed = placedMesh;
    if (!result.bonus) result.chopped = choppedMesh;
    return result;
  }
}

export function BackgroundStackGame() {
  const gameRef = React.useRef<HTMLDivElement | null>(null);
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [score, setScore] = React.useState(0);
  const [gameStatus, setGameStatus] = React.useState<GameState>("ready");
  const [feedback, setFeedback] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!mounted || !open) return;
    const gameEl = gameRef.current;
    if (!gameEl) return;

    const stage = new Stage(gameEl);
    const newBlocks = new THREE.Group();
    const placedBlocks = new THREE.Group();
    const choppedBlocks = new THREE.Group();
    stage.scene.add(newBlocks, placedBlocks, choppedBlocks);

    const blocks: Block[] = [];
    let state: GameState = "ready";
    let raf = 0;
    let restartTimer = 0;
    let feedbackTimer = 0;
    let lastFrameTime = performance.now();
    let reportedBest = 0;
    setScore(0);
    setGameStatus("ready");
    setFeedback(null);

    const reportTowerScore = (score: number) => {
      if (score <= 0) return;
      if (score <= reportedBest) return;
      reportedBest = score;
      void fetch("/api/greenwich/tower-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      }).catch(() => {
        // Silent fail: game UX must never depend on network.
      });
    };
    const applyVerticalShift = (count: number) => {
      const linear = Math.max(0, (count - 4) * (BLOCK_HEIGHT * 0.9));
      const extra = Math.max(0, count - 20) * 0.28;
      const sink = Math.min(96, linear + extra);
      const duration = stage.reducedMotion ? 0 : 0.24;
      gsap.to(newBlocks.position, { y: -sink, duration, ease: "power2.out" });
      gsap.to(placedBlocks.position, { y: -sink, duration, ease: "power2.out" });
      gsap.to(choppedBlocks.position, { y: -sink, duration, ease: "power2.out" });
    };

    const showFeedback = (quality: PlacementQuality) => {
      if (feedbackTimer) window.clearTimeout(feedbackTimer);
      const message = quality === "perfect" ? "Идеально" : quality === "good" ? "Точно" : quality === "missed" ? "Мимо" : null;
      setFeedback(message);
      if (message && quality !== "missed") {
        feedbackTimer = window.setTimeout(() => setFeedback(null), 720);
      }
    };

    const addBlock = (updateScore = true) => {
      const last = blocks[blocks.length - 1];
      if (last && last.state === "missed") {
        state = "ended";
        setGameStatus("ended");
        reportTowerScore(Math.max(0, blocks.length - 2));
        return;
      }
      const block = new Block(last ?? null);
      blocks.push(block);
      if (updateScore) setScore(Math.max(0, blocks.length - 2));
      newBlocks.add(block.mesh);
      applyVerticalShift(blocks.length);
    };

    const placeBlock = () => {
      const current = blocks[blocks.length - 1];
      if (!current) return;
      const parts = current.place();
      showFeedback(parts.quality);
      newBlocks.remove(current.mesh);
      current.mesh.geometry.dispose();
      if (!parts.placed) current.material.dispose();
      if (parts.placed) {
        placedBlocks.add(parts.placed);
        if (!stage.reducedMotion) {
          parts.placed.scale.y = 0.93;
          gsap.to(parts.placed.scale, { y: 1, duration: 0.16, ease: "power2.out" });
          if (parts.quality === "perfect") {
            parts.placed.material.emissiveIntensity = 1.75;
            gsap.to(parts.placed.material, { emissiveIntensity: 1, duration: 0.38, ease: "power2.out" });
          }
        }
      }
      if (parts.chopped) {
        choppedBlocks.add(parts.chopped);
        const dirVal = 40 * Math.abs(parts.direction);
        const position = parts.chopped.position;
        const fallDuration = stage.reducedMotion ? 0.22 : 0.72;
        gsap.to(position, {
          duration: fallDuration,
          y: position.y - 26,
          [parts.plane]: position[parts.plane] + (position[parts.plane] > (parts.placed?.position[parts.plane] ?? 0) ? dirVal : -dirVal),
          ease: "power1.in",
          onComplete: () => {
            choppedBlocks.remove(parts.chopped!);
            parts.chopped!.geometry.dispose();
            parts.chopped!.material.dispose();
          },
        });
        if (!stage.reducedMotion) {
          gsap.to(parts.chopped.rotation, {
            duration: fallDuration,
            x: parts.plane === "z" ? (Math.random() * 5 - 2.5) : 0.2,
            z: parts.plane === "x" ? (Math.random() * 5 - 2.5) : 0.2,
            y: Math.random() * 0.15,
          });
        }
      }
      addBlock();
    };

    const startGame = () => {
      if (state === "playing") return;
      state = "playing";
      setGameStatus("playing");
      if (blocks.length <= 1) addBlock();
    };

    const restartGame = () => {
      state = "resetting";
      setGameStatus("resetting");
      setFeedback(null);
      const old = [...placedBlocks.children];
      const removeSpeed = stage.reducedMotion ? 0 : 0.18;
      const delayAmount = stage.reducedMotion ? 0 : 0.018;
      old.forEach((obj, i) => {
        gsap.to(obj.scale, {
          duration: removeSpeed,
          x: 0,
          y: 0,
          z: 0,
          delay: (old.length - i) * delayAmount,
          ease: "power1.in",
          onComplete: () => {
            placedBlocks.remove(obj);
            if (obj instanceof THREE.Mesh) {
              obj.geometry.dispose();
              const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
              materials.forEach((material) => material.dispose());
            }
          },
        });
      });
      const cameraMove = removeSpeed * 2 + old.length * delayAmount;
      blocks.splice(1);
      applyVerticalShift(blocks.length);
      setScore(0);
      restartTimer = window.setTimeout(() => {
        state = "ready";
        setGameStatus("ready");
        startGame();
      }, cameraMove * 1000);
    };

    const onAction = () => {
      if (state === "ready") {
        startGame();
        placeBlock();
      } else if (state === "playing") {
        placeBlock();
      } else if (state === "ended") {
        restartGame();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        onAction();
      }
    };
    const onPointer = () => onAction();
    const onResize = () => stage.onResize();

    addBlock();
    addBlock();

    const tickLoop = (now: number) => {
      const deltaSeconds = Math.min(1 / 20, Math.max(0, (now - lastFrameTime) / 1000));
      lastFrameTime = now;
      blocks[blocks.length - 1]?.tick(deltaSeconds);
      stage.render();
      raf = window.requestAnimationFrame(tickLoop);
    };
    tickLoop(lastFrameTime);

    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    gameEl.addEventListener("pointerdown", onPointer);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      gameEl.removeEventListener("pointerdown", onPointer);
      if (restartTimer) window.clearTimeout(restartTimer);
      if (feedbackTimer) window.clearTimeout(feedbackTimer);
      if (raf) window.cancelAnimationFrame(raf);
      gsap.killTweensOf([
        newBlocks.position,
        placedBlocks.position,
        choppedBlocks.position,
      ]);
      stage.destroy();
    };
  }, [mounted, open]);

  if (!mounted) return null;

  const scoreUnit =
    score % 10 === 1 && score % 100 !== 11
      ? "блок"
      : score % 10 >= 2 && score % 10 <= 4 && (score % 100 < 12 || score % 100 > 14)
        ? "блока"
        : "блоков";

  const statusText =
    gameStatus === "ended"
      ? "Попытка завершена. Нажмите, чтобы собрать новую башню"
      : gameStatus === "resetting"
        ? "Готовим новую попытку"
        : gameStatus === "playing"
          ? "Остановите плитку точно над предыдущей"
          : "Первый блок уже в движении — поймайте момент";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="tower-launcher">
        <span className="tower-launcher__main">
          <span className="tower-launcher__mark" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="tower-launcher__copy">
            <strong>Башня надёжности</strong>
            <span>Проверьте точность и обновите личный рекорд</span>
          </span>
        </span>
        <span className="tower-launcher__action">Открыть игру <span aria-hidden>↗</span></span>
      </button>

      {open
        ? createPortal(
            <div
              className="tower-modal"
              onPointerDown={(event) => {
                if (event.currentTarget === event.target) setOpen(false);
              }}
            >
              <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tower-game-title"
                tabIndex={-1}
                className="tower-dialog"
              >
                <header className="tower-header">
                  <div className="tower-header__copy">
                    <span className="tower-eyebrow"><i aria-hidden /> Игра на точность</span>
                    <h2 id="tower-game-title">Башня надёжности</h2>
                  </div>
                  <div className="tower-header__tools">
                    <div className="tower-score" aria-label={`Высота башни: ${score} ${scoreUnit}`}>
                      <span>Высота</span>
                      <strong>{String(score).padStart(2, "0")}</strong>
                      <small>{scoreUnit}</small>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="tower-close"
                      aria-label="Закрыть игру"
                    >
                      <span aria-hidden>×</span>
                    </button>
                  </div>
                </header>

                <div className="tower-stage">
                  <div className="tower-stage__glow" aria-hidden />
                  <div className="tower-stage__horizon" aria-hidden />
                  <div
                    ref={gameRef}
                    className="tower-canvas"
                    role="button"
                    tabIndex={0}
                    aria-label={gameStatus === "ended" ? "Начать новую попытку" : "Остановить движущийся блок"}
                  />
                  <div className={`tower-feedback${feedback ? " is-visible" : ""}`} aria-live="polite">
                    {feedback}
                  </div>
                  <div className="tower-controls" aria-live="polite">
                    <span className="tower-controls__keys" aria-hidden>
                      <kbd>Пробел</kbd>
                      <i>или</i>
                      <kbd>Клик</kbd>
                    </span>
                    <span className="tower-controls__status">{statusText}</span>
                    <span className="tower-controls__signal" aria-hidden><i /></span>
                  </div>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
