"use client";

import React from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import * as THREE from "three";

type GameState = "ready" | "playing" | "ended" | "resetting";

type BlockState = "active" | "stopped" | "missed";

class Stage {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  container: HTMLDivElement;
  viewSize: number;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    this.viewSize = 12;
    this.camera = new THREE.OrthographicCamera(
      -this.viewSize * aspect,
      this.viewSize * aspect,
      this.viewSize,
      -this.viewSize,
      -100,
      1000,
    );
    this.camera.position.set(2, 2, 2);
    this.camera.lookAt(0, 0, 0);

    const light = new THREE.DirectionalLight(0xffffff, 0.7);
    light.position.set(0, 499, 0);
    this.scene.add(light);
    this.scene.add(new THREE.HemisphereLight(0xfacc15, 0x8b5cf6, 0.95));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
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

  setCamera(y: number, speed = 0.3) {
    gsap.to(this.camera.position, { y: y + 0.8, duration: speed, ease: "power1.inOut" });
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}

class Block {
  index: number;
  state: BlockState;
  targetBlock: Block | null;
  mesh: THREE.Mesh;
  material: THREE.MeshPhongMaterial;
  dimension: { width: number; height: number; depth: number };
  position: { x: number; y: number; z: number };
  /** Положительное |скорость| в координатах сцены за кадр при 60 FPS (до перевода на u/s). */
  moveMagPerFrameRef: number;
  /** Единицы сцены в секунду — движение не зависит от FPS монитора. */
  speedPerSecond: number;
  directionSign: number;
  workingPlane: "x" | "z";
  workingDimension: "width" | "depth";
  readonly moveAmount = 12;
  colorOffset: number;

  constructor(block: Block | null) {
    this.targetBlock = block;
    this.index = (this.targetBlock ? this.targetBlock.index : 0) + 1;
    this.workingPlane = this.index % 2 ? "x" : "z";
    this.workingDimension = this.index % 2 ? "width" : "depth";
    this.dimension = {
      width: this.targetBlock ? this.targetBlock.dimension.width : 14,
      height: this.targetBlock ? this.targetBlock.dimension.height : 2.8,
      depth: this.targetBlock ? this.targetBlock.dimension.depth : 14,
    };
    this.position = {
      x: this.targetBlock ? this.targetBlock.position.x : 0,
      y: this.dimension.height * this.index,
      z: this.targetBlock ? this.targetBlock.position.z : 0,
    };
    this.colorOffset = this.targetBlock ? this.targetBlock.colorOffset : Math.round(Math.random() * 100);

    let color = new THREE.Color(0xa78bfa);
    if (this.targetBlock) {
      const offset = this.index + this.colorOffset;
      const mix = (Math.sin(0.34 * offset) + 1) * 0.5;
      const violet = new THREE.Color(0x8b5cf6);
      const yellow = new THREE.Color(0xfde047);
      color = violet.clone().lerp(yellow, mix);
      const coolShift = (Math.sin(0.21 * offset + 1.2) + 1) * 0.06;
      color.offsetHSL(-0.01, 0.02, coolShift - 0.03);
    }

    this.state = this.index > 1 ? "active" : "stopped";
    // Как раньше: ускоряется с уровнем, потолок сохранён.
    this.moveMagPerFrameRef = Math.min(8, 0.22 + this.index * 0.02);
    this.speedPerSecond = this.moveMagPerFrameRef * 60;

    const geometry = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
    geometry.translate(this.dimension.width / 2, this.dimension.height / 2, this.dimension.depth / 2);
    this.material = new THREE.MeshPhongMaterial({
      color,
      shininess: 36,
      specular: new THREE.Color(0xf3e8ff),
      emissive: color.clone().multiplyScalar(0.12),
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
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

  place() {
    this.state = "stopped";
    const impulseDir = this.directionSign * this.moveMagPerFrameRef;

    if (!this.targetBlock) return { plane: this.workingPlane, direction: impulseDir };

    let overlap =
      this.targetBlock.dimension[this.workingDimension] -
      Math.abs(this.position[this.workingPlane] - this.targetBlock.position[this.workingPlane]);
    const result: {
      plane: "x" | "z";
      direction: number;
      bonus?: boolean;
      placed?: THREE.Mesh;
      chopped?: THREE.Mesh;
    } = {
      plane: this.workingPlane,
      direction: impulseDir,
    };

    if (this.dimension[this.workingDimension] - overlap < 0.1) {
      overlap = this.dimension[this.workingDimension];
      result.bonus = true;
      this.position.x = this.targetBlock.position.x;
      this.position.z = this.targetBlock.position.z;
      this.dimension.width = this.targetBlock.dimension.width;
      this.dimension.depth = this.targetBlock.dimension.depth;
    }

    if (overlap <= 0) {
      this.state = "missed";
      this.dimension[this.workingDimension] = overlap;
      return result;
    }

    const choppedDimensions = {
      width: this.dimension.width,
      height: this.dimension.height,
      depth: this.dimension.depth,
    };
    choppedDimensions[this.workingDimension] -= overlap;
    this.dimension[this.workingDimension] = overlap;

    const placedGeometry = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
    placedGeometry.translate(this.dimension.width / 2, this.dimension.height / 2, this.dimension.depth / 2);
    const placedMesh = new THREE.Mesh(placedGeometry, this.material);

    const choppedGeometry = new THREE.BoxGeometry(
      choppedDimensions.width,
      choppedDimensions.height,
      choppedDimensions.depth,
    );
    choppedGeometry.translate(choppedDimensions.width / 2, choppedDimensions.height / 2, choppedDimensions.depth / 2);
    const choppedMesh = new THREE.Mesh(choppedGeometry, this.material);

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
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [score, setScore] = React.useState(0);
  const [gameStatus, setGameStatus] = React.useState<GameState>("ready");

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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
    let lastFrameTime = performance.now();
    let reportedBest = 0;
    setScore(0);
    setGameStatus("ready");

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
      // Рост блока по Y ~dimension.height (~2.8); смещение чуть ниже — верх медленнее уходит к меню, зона падения почти стабильна.
      const linear = Math.max(0, (count - 2) * 2.5);
      const extra = Math.max(0, count - 17) * 0.58;
      const sink = Math.min(158, linear + extra);
      gsap.to(newBlocks.position, { y: -sink, duration: 0.32, ease: "power2.out" });
      gsap.to(placedBlocks.position, { y: -sink, duration: 0.32, ease: "power2.out" });
      gsap.to(choppedBlocks.position, { y: -sink, duration: 0.32, ease: "power2.out" });
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
      const followY = Math.min(0.95, blocks.length * 0.026);
      stage.setCamera(followY);
    };

    const placeBlock = () => {
      const current = blocks[blocks.length - 1];
      if (!current) return;
      const parts = current.place();
      newBlocks.remove(current.mesh);
      if (parts.placed) placedBlocks.add(parts.placed);
      if (parts.chopped) {
        choppedBlocks.add(parts.chopped);
        const dirVal = 40 * Math.abs(parts.direction);
        const position = parts.chopped.position;
        gsap.to(position, {
          duration: 0.95,
          y: position.y - 26,
          [parts.plane]: position[parts.plane] + (position[parts.plane] > (parts.placed?.position[parts.plane] ?? 0) ? dirVal : -dirVal),
          ease: "power1.in",
          onComplete: () => {
            choppedBlocks.remove(parts.chopped!);
          },
        });
        gsap.to(parts.chopped.rotation, {
          duration: 0.95,
          x: parts.plane === "z" ? (Math.random() * 8 - 4) : 0.3,
          z: parts.plane === "x" ? (Math.random() * 8 - 4) : 0.3,
          y: Math.random() * 0.2,
        });
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
      const old = [...placedBlocks.children];
      const removeSpeed = 0.2;
      const delayAmount = 0.02;
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
          },
        });
      });
      const cameraMove = removeSpeed * 2 + old.length * delayAmount;
      stage.setCamera(2, cameraMove);
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
      if (raf) window.cancelAnimationFrame(raf);
      gsap.killTweensOf([
        newBlocks.position,
        placedBlocks.position,
        choppedBlocks.position,
        stage.camera.position,
      ]);
      stage.destroy();
    };
  }, [mounted, open]);

  if (!mounted) return null;

  const statusText =
    gameStatus === "ended"
      ? "Башня упала — нажмите на поле, чтобы начать заново"
      : gameStatus === "resetting"
        ? "Готовим новую попытку"
        : gameStatus === "playing"
          ? "Нажимайте в момент, когда блок точно над башней"
          : "Кликните по полю или нажмите пробел";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-violet-200 bg-white px-4 py-3 text-left text-zinc-950 transition-colors duration-200 hover:border-violet-400 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 motion-reduce:transition-none"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="relative block h-8 w-9 shrink-0" aria-hidden>
            <span className="absolute bottom-0 left-0 h-2 w-7 rounded-sm bg-violet-300" />
            <span className="absolute bottom-2 left-1 h-2 w-7 rounded-sm bg-yellow-300" />
            <span className="absolute bottom-4 left-2 h-2 w-7 rounded-sm bg-violet-700" />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-black">Башня надёжности</strong>
            <span className="block truncate text-xs text-zinc-600">Соберите самую высокую башню и улучшайте личный рекорд</span>
          </span>
        </span>
        <span className="shrink-0 text-xs font-black text-violet-700">Играть →</span>
      </button>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm md:p-6"
              onPointerDown={(event) => {
                if (event.currentTarget === event.target) setOpen(false);
              }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="tower-game-title"
                className="flex h-[min(760px,calc(100dvh-24px))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[#f6f2ff] shadow-[0_8px_32px_rgba(0,0,0,0.34)] md:h-[min(760px,calc(100dvh-48px))]"
              >
                <header className="flex items-center justify-between gap-4 border-b border-violet-200 bg-white px-4 py-3 md:px-5">
                  <div className="min-w-0">
                    <h2 id="tower-game-title" className="text-base font-black text-zinc-950">Башня надёжности</h2>
                    <p className="truncate text-xs text-zinc-600">{statusText}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-zinc-500">Результат</div>
                      <div className="text-xl font-black tabular-nums text-violet-800">{score}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-lg text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                      aria-label="Закрыть игру"
                    >
                      ×
                    </button>
                  </div>
                </header>

                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_100%,rgba(139,92,246,0.16),transparent_70%)]" />
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center text-[clamp(120px,28vw,360px)] font-black leading-none tabular-nums text-violet-700/[0.07]"
                    aria-hidden
                  >
                    {score}
                  </div>
                  <div ref={gameRef} className="absolute inset-0 cursor-pointer touch-manipulation" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
                    <span className="rounded-full bg-zinc-950/86 px-4 py-2 text-center text-xs font-semibold text-white shadow-sm">
                      {statusText}
                    </span>
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
