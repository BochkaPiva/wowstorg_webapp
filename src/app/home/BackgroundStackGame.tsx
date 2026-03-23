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
  speed: number;
  direction: number;
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
    this.speed = Math.max(-8, -0.22 - this.index * 0.02);
    this.direction = this.speed;

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

    if (this.state === "active") {
      this.position[this.workingPlane] = Math.random() > 0.5 ? -this.moveAmount : this.moveAmount;
      this.mesh.position[this.workingPlane] = this.position[this.workingPlane];
    }
  }

  reverseDirection() {
    this.direction = this.direction > 0 ? this.speed : Math.abs(this.speed);
  }

  tick() {
    if (this.state !== "active") return;
    const value = this.position[this.workingPlane];
    if (value > this.moveAmount || value < -this.moveAmount) this.reverseDirection();
    this.position[this.workingPlane] += this.direction;
    this.mesh.position[this.workingPlane] = this.position[this.workingPlane];
  }

  place() {
    this.state = "stopped";
    if (!this.targetBlock) return { plane: this.workingPlane, direction: this.direction };

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
      direction: this.direction,
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
  const gameStateRef = React.useRef<GameState>("ready");
  const [mounted, setMounted] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);
  const [score, setScore] = React.useState(0);
  const [showHud, setShowHud] = React.useState(false);
  const [isGameActive, setIsGameActive] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    const apply = () => {
      const desktopMedia = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      setIsDesktop(desktopMedia && window.innerWidth >= 1024);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [mounted]);

  React.useEffect(() => {
    if (!mounted || !isDesktop) return;
    const gameEl = gameRef.current;
    if (!gameEl) return;

    const stage = new Stage(gameEl);
    const newBlocks = new THREE.Group();
    const placedBlocks = new THREE.Group();
    const choppedBlocks = new THREE.Group();
    stage.scene.add(newBlocks, placedBlocks, choppedBlocks);

    const blocks: Block[] = [];
    let state: GameState = "ready";
    gameStateRef.current = state;
    let raf = 0;
    let reportedBest = 0;
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
      // Force growth to go downward stronger than upward.
      const sink = Math.min(86, Math.max(0, (count - 2) * 2.2));
      gsap.to(newBlocks.position, { y: -sink, duration: 0.32, ease: "power2.out" });
      gsap.to(placedBlocks.position, { y: -sink, duration: 0.32, ease: "power2.out" });
      gsap.to(choppedBlocks.position, { y: -sink, duration: 0.32, ease: "power2.out" });
    };

    const addBlock = (updateScore = true) => {
      const last = blocks[blocks.length - 1];
      if (last && last.state === "missed") {
        state = "ended";
        gameStateRef.current = state;
        setShowHud(false);
        setIsGameActive(false);
        reportTowerScore(Math.max(0, blocks.length - 1));
        return;
      }
      const block = new Block(last ?? null);
      blocks.push(block);
      if (updateScore) setScore(Math.max(0, blocks.length - 1));
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
      gameStateRef.current = state;
      setShowHud(true);
      setIsGameActive(true);
      if (blocks.length <= 1) addBlock();
    };

    const restartGame = () => {
      state = "resetting";
      gameStateRef.current = state;
      setIsGameActive(false);
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
      setShowHud(false);
      window.setTimeout(() => {
        state = "ready";
        gameStateRef.current = state;
        startGame();
      }, cameraMove * 1000);
    };

    const resetToIdle = () => {
      state = "ready";
      gameStateRef.current = state;
      setShowHud(false);
      setIsGameActive(false);
      setScore(0);
      blocks.length = 0;
      newBlocks.clear();
      placedBlocks.clear();
      choppedBlocks.clear();
      gsap.killTweensOf([newBlocks.position, placedBlocks.position, choppedBlocks.position, stage.camera.position]);
      newBlocks.position.set(0, 0, 0);
      placedBlocks.position.set(0, 0, 0);
      choppedBlocks.position.set(0, 0, 0);
      stage.camera.position.set(2, 2, 2);
      stage.camera.lookAt(0, 0, 0);
      addBlock(false);
      addBlock(false);
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
      if (e.code === "Space") {
        e.preventDefault();
        onAction();
      }
    };
    const onPointer = () => onAction();
    const onGlobalPointerDown = (e: PointerEvent) => {
      if (state === "ready" || state === "resetting") return;
      const rect = gameEl.getBoundingClientRect();
      if (e.clientY < rect.top) resetToIdle();
    };
    const onResize = () => stage.onResize();

    addBlock();
    addBlock();

    const tick = () => {
      blocks[blocks.length - 1]?.tick();
      stage.render();
      raf = window.requestAnimationFrame(tick);
    };
    tick();

    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onGlobalPointerDown, true);
    gameEl.addEventListener("pointerdown", onPointer);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onGlobalPointerDown, true);
      gameEl.removeEventListener("pointerdown", onPointer);
      if (raf) window.cancelAnimationFrame(raf);
      stage.destroy();
    };
  }, [mounted, isDesktop]);

  if (!mounted || !isDesktop) return null;
  return createPortal(
    <>
      <div className="fixed inset-x-0 bottom-[-38px] z-[29] h-[36vh] min-h-[240px] max-h-[400px] pointer-events-none">
        <div
          className={[
            "pointer-events-none absolute inset-0 flex items-end justify-center font-black tabular-nums tracking-[-0.04em] transition-all duration-700",
            showHud ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95",
            "text-[clamp(116px,24vw,360px)] leading-none text-violet-600/24",
          ].join(" ")}
          style={{ paddingBottom: "86px" }}
          aria-hidden
        >
          <span className="select-none transition-all duration-500 [text-shadow:0_0_36px_rgba(139,92,246,0.22)]">
            {score}
          </span>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-[-38px] z-[30] h-[36vh] min-h-[240px] max-h-[400px] overflow-hidden pointer-events-none [mask-image:linear-gradient(to_top,black_0%,black_84%,transparent_100%)] [mask-repeat:no-repeat]">
        <div
          ref={gameRef}
          className={[
            "absolute inset-0 z-10 pointer-events-auto cursor-pointer transition-opacity duration-500",
            isGameActive ? "opacity-[0.94]" : "opacity-[0.48]",
          ].join(" ")}
        />
        <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-[#f6f2ff]/66 via-[#f6f2ff]/18 to-[#f6f2ff]/00" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-20 bg-gradient-to-r from-[#f6f2ff]/72 via-[#f6f2ff]/28 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-20 bg-gradient-to-l from-[#f6f2ff]/72 via-[#f6f2ff]/28 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-[-34%] z-20 h-[54%] rounded-[50%] bg-white/18 blur-3xl" />
        <div className="pointer-events-none absolute left-[10%] bottom-[8%] z-20 h-24 w-40 rounded-full bg-violet-100/30 blur-3xl" />
        <div className="pointer-events-none absolute right-[12%] bottom-[10%] z-20 h-24 w-40 rounded-full bg-amber-100/28 blur-3xl" />
      </div>
    </>,
    document.body,
  );
}

