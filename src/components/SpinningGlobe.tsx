import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Simplified continent outline coordinates [lat, lon] pairs
const continentOutlines = {
  northAmerica: [
    [70, -170], [70, -140], [68, -135], [60, -140], [55, -130], [50, -125],
    [45, -125], [40, -125], [35, -120], [30, -117], [25, -110], [20, -105],
    [15, -95], [20, -87], [25, -80], [30, -82], [35, -75], [40, -70],
    [45, -65], [50, -55], [55, -60], [60, -65], [65, -70], [70, -80],
    [75, -90], [80, -100], [75, -140], [70, -170]
  ],
  southAmerica: [
    [10, -75], [5, -77], [0, -80], [-5, -80], [-10, -77], [-15, -75],
    [-20, -70], [-25, -70], [-30, -72], [-35, -72], [-40, -73], [-45, -75],
    [-50, -75], [-55, -68], [-55, -65], [-50, -58], [-45, -65], [-40, -62],
    [-35, -55], [-30, -50], [-25, -45], [-20, -40], [-15, -38], [-10, -35],
    [-5, -35], [0, -50], [5, -60], [10, -75]
  ],
  europe: [
    [70, -10], [70, 30], [65, 30], [60, 30], [55, 20], [50, 5],
    [45, -10], [40, -10], [35, -5], [35, 25], [40, 25], [45, 15],
    [50, 15], [55, 10], [60, 10], [65, 5], [70, -10]
  ],
  africa: [
    [35, -5], [35, 10], [30, 32], [25, 35], [20, 40], [15, 50],
    [10, 50], [5, 45], [0, 42], [-5, 40], [-10, 40], [-15, 35],
    [-20, 35], [-25, 32], [-30, 30], [-35, 20], [-35, 18], [-30, 15],
    [-25, 15], [-20, 12], [-15, 12], [-10, 8], [-5, 5], [0, 0],
    [5, -5], [10, -15], [15, -17], [20, -17], [25, -15], [30, -10], [35, -5]
  ],
  asia: [
    [70, 30], [70, 180], [65, 180], [60, 170], [55, 160], [50, 145],
    [45, 140], [40, 130], [35, 130], [30, 120], [25, 120], [20, 110],
    [15, 100], [10, 100], [5, 105], [0, 105], [-5, 105], [-10, 120],
    [-5, 135], [0, 130], [5, 125], [10, 125], [15, 120], [20, 120],
    [25, 120], [30, 130], [35, 135], [40, 140], [45, 145], [50, 155],
    [55, 160], [60, 170], [65, 175], [70, 180]
  ],
  australia: [
    [-10, 142], [-15, 130], [-20, 115], [-25, 115], [-30, 115],
    [-35, 117], [-35, 138], [-38, 145], [-40, 148], [-35, 150],
    [-30, 153], [-25, 153], [-20, 148], [-15, 145], [-10, 142]
  ]
};

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  
  return new THREE.Vector3(x, y, z);
}

function ContinentOutlines() {
  const groupRef = useRef<THREE.Group>(null);
  
  const lineGeometries = useMemo(() => {
    const radius = 2.02;
    const geometries: THREE.BufferGeometry[] = [];
    
    Object.values(continentOutlines).forEach((coords) => {
      const points: THREE.Vector3[] = [];
      coords.forEach(([lat, lon]) => {
        points.push(latLonToVector3(lat, lon, radius));
      });
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      geometries.push(geometry);
    });
    
    return geometries;
  }, []);
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      {lineGeometries.map((geometry, index) => (
        <primitive key={index} object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.4 }))} />
      ))}
    </group>
  );
}

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
        <ContinentOutlines />
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
