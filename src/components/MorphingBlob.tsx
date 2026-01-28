import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface BlobMeshProps {
  isActive: boolean;
}

function BlobMesh({ isActive }: BlobMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.elapsedTime;
      const speed = isActive ? 1.5 : 0.8;
      
      // Gentle rotation
      meshRef.current.rotation.x = Math.sin(time * speed * 0.3) * 0.2;
      meshRef.current.rotation.y = time * speed * 0.2;
      
      // Subtle scale pulsing
      const scale = 1 + Math.sin(time * speed) * 0.05;
      meshRef.current.scale.setScalar(scale);
      
      // Update morph targets for organic movement
      const geometry = meshRef.current.geometry as THREE.IcosahedronGeometry;
      const positionAttribute = geometry.getAttribute('position');
      const originalPositions = geometry.userData.originalPositions;
      
      if (originalPositions) {
        for (let i = 0; i < positionAttribute.count; i++) {
          const x = originalPositions[i * 3];
          const y = originalPositions[i * 3 + 1];
          const z = originalPositions[i * 3 + 2];
          
          // Create organic displacement using noise-like function
          const noiseScale = 0.3 + (isActive ? 0.15 : 0);
          const noise = Math.sin(x * 2 + time * speed) * 
                       Math.cos(y * 2 + time * speed * 0.7) * 
                       Math.sin(z * 2 + time * speed * 0.5);
          
          const displacement = noise * noiseScale;
          const length = Math.sqrt(x * x + y * y + z * z);
          const normalizedX = x / length;
          const normalizedY = y / length;
          const normalizedZ = z / length;
          
          positionAttribute.setXYZ(
            i,
            x + normalizedX * displacement,
            y + normalizedY * displacement,
            z + normalizedZ * displacement
          );
        }
        positionAttribute.needsUpdate = true;
      }
    }
  });

  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.8, 4);
    // Store original positions for morphing
    const positions = geo.getAttribute('position');
    geo.userData.originalPositions = new Float32Array(positions.array);
    return geo;
  }, []);

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color="#9333ea"
        emissive="#7c3aed"
        emissiveIntensity={isActive ? 0.8 : 0.5}
        roughness={0.3}
        metalness={0.7}
      />
    </mesh>
  );
}

// Glowing aura around the blob
function GlowAura({ isActive }: { isActive: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.elapsedTime;
      const material = meshRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.15 + Math.sin(time * 2) * 0.05 + (isActive ? 0.1 : 0);
      
      const scale = 1.3 + Math.sin(time * 1.5) * 0.1;
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.9, 32, 32]} />
      <meshBasicMaterial
        color="#a855f7"
        transparent
        opacity={0.2}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

interface MorphingBlobProps {
  isActive: boolean;
  onClick: () => void;
}

export function MorphingBlob({ isActive, onClick }: MorphingBlobProps) {
  return (
    <div 
      className="w-14 h-14 cursor-pointer transition-transform duration-200 hover:scale-110"
      onClick={onClick}
      style={{ background: 'transparent' }}
    >
      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 50 }}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
        <pointLight position={[-5, -5, -5]} intensity={0.5} color="#a855f7" />
        <GlowAura isActive={isActive} />
        <BlobMesh isActive={isActive} />
      </Canvas>
    </div>
  );
}
