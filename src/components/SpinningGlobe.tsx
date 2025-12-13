import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

function Globe() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <Sphere ref={meshRef} args={[2, 64, 64]} position={[0, 0, 0]}>
      <meshStandardMaterial
        color="#0ea5e9"
        wireframe
        transparent
        opacity={0.15}
      />
    </Sphere>
  );
}

function GlobeLines() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.08;
      meshRef.current.rotation.x += delta * 0.015;
    }
  });

  return (
    <Sphere ref={meshRef} args={[2.05, 48, 48]} position={[0, 0, 0]}>
      <meshBasicMaterial
        color="#22d3ee"
        wireframe
        transparent
        opacity={0.08}
      />
    </Sphere>
  );
}

function GlobeGlow() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <Sphere ref={meshRef} args={[1.98, 32, 32]} position={[0, 0, 0]}>
      <meshBasicMaterial
        color="#06b6d4"
        transparent
        opacity={0.03}
      />
    </Sphere>
  );
}

function Particles() {
  const points = useRef<THREE.Points>(null);
  
  const particleCount = 300;
  const positions = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 2.2 + Math.random() * 0.8;
    
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }
  
  useFrame((state, delta) => {
    if (points.current) {
      points.current.rotation.y += delta * 0.03;
    }
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        color="#22d3ee"
        transparent
        opacity={0.7}
        sizeAttenuation
      />
    </points>
  );
}

export function SpinningGlobe() {
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={0.5} color="#22d3ee" />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color="#0ea5e9" />
        <Globe />
        <GlobeLines />
        <GlobeGlow />
        <Particles />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.3}
        />
      </Canvas>
    </div>
  );
}
