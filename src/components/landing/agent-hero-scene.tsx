"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function AgentHeroScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0.2, 8);

    const rig = new THREE.Group();
    rig.position.set(2.2, -0.1, 0);
    scene.add(rig);

    const keyLight = new THREE.PointLight(0xffffff, 3.2, 18);
    keyLight.position.set(3, 3, 4);
    scene.add(keyLight);

    const coolLight = new THREE.PointLight(0x60a5fa, 2.4, 16);
    coolLight.position.set(-4, -2, 3);
    scene.add(coolLight);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 4),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0x7dd3fc,
        emissiveIntensity: 0.28,
        metalness: 0.12,
        roughness: 0.18,
        transmission: 0.45,
        transparent: true,
        opacity: 0.72,
        wireframe: true,
      }),
    );
    rig.add(core);

    const nucleus = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.52, 0.12, 160, 18),
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: 0x22d3ee,
        emissiveIntensity: 0.42,
        metalness: 0.4,
        roughness: 0.22,
      }),
    );
    rig.add(nucleus);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.18,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const rings = [1.55, 2.05, 2.55].map((radius, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.006, 8, 180), ringMaterial.clone());
      ring.rotation.x = Math.PI / 2.4;
      ring.rotation.y = index * 0.62;
      rig.add(ring);
      return ring;
    });

    const nodeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });

    const nodes = Array.from({ length: 12 }, (_, index) => {
      const node = new THREE.Mesh(new THREE.SphereGeometry(index % 3 === 0 ? 0.055 : 0.038, 18, 18), nodeMaterial);
      rig.add(node);
      return node;
    });

    const particleCount = 220;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      const radius = 2.2 + Math.random() * 2.7;
      const angle = Math.random() * Math.PI * 2;
      particlePositions[index * 3] = Math.cos(angle) * radius;
      particlePositions[index * 3 + 1] = (Math.random() - 0.5) * 3.7;
      particlePositions[index * 3 + 2] = Math.sin(angle) * radius * 0.55;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0xdbeafe,
        size: 0.024,
        opacity: 0.62,
        transparent: true,
        depthWrite: false,
      }),
    );
    rig.add(particles);

    let frameId = 0;
    const clock = new THREE.Clock();

    function resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      rig.scale.setScalar(width < 768 ? 0.44 : 0.92);
      rig.position.x = width < 768 ? 1.25 : 2.25;
      rig.position.y = width < 768 ? 1.15 : -0.1;
    }

    function animate() {
      const elapsed = clock.getElapsedTime();

      core.rotation.x = elapsed * 0.18;
      core.rotation.y = elapsed * 0.24;
      nucleus.rotation.x = elapsed * 0.48;
      nucleus.rotation.y = elapsed * 0.62;
      particles.rotation.y = elapsed * 0.035;

      rings.forEach((ring, index) => {
        ring.rotation.z = elapsed * (0.18 + index * 0.07);
        ring.rotation.y = index * 0.62 + Math.sin(elapsed * 0.5 + index) * 0.12;
      });

      nodes.forEach((node, index) => {
        const orbit = 1.55 + (index % 4) * 0.28;
        const speed = 0.32 + (index % 5) * 0.035;
        const phase = elapsed * speed + index * 0.72;
        node.position.set(Math.cos(phase) * orbit, Math.sin(phase * 1.3) * 0.88, Math.sin(phase) * orbit * 0.48);
      });

      rig.rotation.y = Math.sin(elapsed * 0.22) * 0.12;
      rig.rotation.x = Math.cos(elapsed * 0.18) * 0.04;

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    }

    resize();
    animate();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frameId);
      renderer.dispose();
      core.geometry.dispose();
      core.material.dispose();
      nucleus.geometry.dispose();
      nucleus.material.dispose();
      rings.forEach((ring) => {
        ring.geometry.dispose();
        ring.material.dispose();
      });
      nodes.forEach((node) => node.geometry.dispose());
      nodeMaterial.dispose();
      particleGeometry.dispose();
      (particles.material as THREE.Material).dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[3] h-screen w-screen opacity-40 md:opacity-90"
    />
  );
}
