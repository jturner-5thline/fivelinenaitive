import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// More accurate continent outline coordinates [lat, lon] pairs
const continentOutlines = {
  northAmerica: [
    [49, -125], [50, -127], [54, -130], [57, -135], [59, -139], [60, -141],
    [60, -147], [59, -152], [58, -153], [56, -154], [55, -160], [57, -163],
    [59, -163], [62, -166], [64, -166], [66, -164], [68, -166], [70, -163],
    [71, -157], [71, -152], [70, -148], [69, -141], [70, -139], [70, -130],
    [69, -125], [71, -118], [73, -114], [75, -95], [75, -85], [72, -78],
    [70, -70], [67, -63], [63, -58], [60, -64], [55, -56], [50, -56],
    [47, -53], [45, -61], [43, -66], [41, -70], [40, -74], [39, -75],
    [37, -76], [35, -75], [32, -79], [30, -81], [28, -82], [26, -80],
    [25, -80], [24, -82], [22, -84], [19, -87], [18, -88], [16, -88],
    [15, -92], [16, -95], [19, -96], [21, -97], [22, -98], [24, -98],
    [26, -99], [27, -97], [26, -97], [25, -99], [28, -105], [29, -108],
    [31, -111], [31, -114], [32, -117], [34, -119], [36, -122], [38, -123],
    [40, -124], [43, -124], [46, -124], [49, -125]
  ],
  southAmerica: [
    [12, -72], [11, -74], [9, -77], [7, -77], [4, -77], [1, -79],
    [-1, -80], [-4, -81], [-6, -81], [-5, -79], [-4, -78], [-6, -77],
    [-14, -76], [-18, -70], [-23, -70], [-27, -71], [-33, -72], [-38, -73],
    [-42, -73], [-46, -75], [-50, -74], [-52, -71], [-54, -68], [-55, -66],
    [-55, -64], [-53, -68], [-51, -69], [-48, -66], [-46, -67], [-42, -65],
    [-39, -62], [-36, -57], [-34, -54], [-32, -52], [-28, -49], [-25, -47],
    [-22, -41], [-18, -39], [-13, -38], [-10, -35], [-7, -35], [-5, -37],
    [-2, -42], [0, -50], [2, -54], [5, -55], [6, -58], [8, -60],
    [10, -62], [11, -68], [12, -72]
  ],
  europe: [
    [71, 28], [70, 32], [68, 42], [67, 44], [66, 34], [64, 30],
    [62, 31], [60, 28], [59, 31], [56, 32], [54, 28], [55, 22],
    [54, 14], [54, 10], [56, 8], [58, 10], [57, 7], [55, 8],
    [54, 8], [53, 5], [52, 4], [51, 4], [51, 2], [50, 0],
    [49, -1], [48, -5], [47, -2], [44, -1], [43, -2], [42, -9],
    [37, -9], [36, -6], [36, -2], [38, 0], [40, 0], [41, 1],
    [42, 3], [43, 5], [44, 8], [44, 12], [41, 14], [38, 16],
    [36, 22], [38, 24], [40, 26], [41, 29], [44, 28], [45, 30],
    [46, 17], [47, 15], [48, 17], [49, 18], [50, 20], [52, 21],
    [54, 19], [55, 21], [56, 21], [58, 24], [60, 21], [63, 20],
    [66, 24], [68, 26], [71, 28]
  ],
  africa: [
    [37, -6], [36, 0], [37, 10], [33, 12], [32, 25], [31, 32],
    [27, 34], [22, 37], [15, 43], [12, 45], [11, 51], [2, 51],
    [-1, 43], [-5, 41], [-11, 40], [-16, 38], [-19, 35], [-25, 33],
    [-29, 32], [-33, 28], [-35, 20], [-34, 18], [-31, 17], [-29, 16],
    [-26, 15], [-22, 14], [-17, 12], [-13, 14], [-8, 14], [-5, 12],
    [-5, 8], [-4, 5], [2, 1], [5, -4], [5, -8], [10, -15],
    [15, -17], [19, -17], [21, -17], [26, -15], [28, -13], [32, -9],
    [35, -6], [37, -6]
  ],
  asia: [
    [42, 29], [41, 35], [37, 36], [33, 35], [29, 35], [27, 34],
    [22, 60], [24, 68], [20, 73], [8, 77], [6, 80], [8, 93],
    [16, 96], [21, 93], [23, 89], [22, 88], [21, 91], [18, 97],
    [10, 99], [1, 103], [-3, 104], [-7, 106], [-8, 114], [-8, 117],
    [-6, 120], [-3, 129], [1, 128], [5, 120], [7, 117], [10, 119],
    [18, 110], [22, 107], [22, 114], [30, 122], [35, 129], [38, 124],
    [42, 130], [45, 136], [46, 143], [50, 143], [53, 143], [51, 155],
    [57, 153], [59, 163], [62, 165], [65, 169], [66, 179], [69, -180],
    [71, -180], [68, 165], [70, 160], [73, 140], [77, 105], [76, 97],
    [73, 85], [73, 70], [70, 60], [68, 55], [66, 60], [62, 65],
    [55, 73], [54, 70], [50, 80], [46, 82], [44, 80], [42, 75],
    [43, 52], [40, 50], [38, 48], [40, 44], [42, 42], [42, 35],
    [42, 29]
  ],
  australia: [
    [-12, 130], [-14, 127], [-15, 124], [-17, 123], [-19, 121],
    [-21, 114], [-26, 113], [-29, 114], [-32, 115], [-34, 116],
    [-35, 117], [-35, 119], [-34, 124], [-32, 127], [-32, 133],
    [-34, 135], [-35, 137], [-36, 140], [-39, 146], [-38, 148],
    [-36, 150], [-34, 151], [-32, 153], [-28, 154], [-25, 153],
    [-20, 149], [-18, 146], [-16, 145], [-14, 144], [-12, 142],
    [-11, 136], [-12, 130]
  ],
  antarctica: [
    [-65, -60], [-70, -60], [-75, -70], [-78, -80], [-80, -100],
    [-78, -120], [-75, -140], [-70, -150], [-68, -160], [-70, -170],
    [-75, 180], [-78, 160], [-80, 140], [-78, 100], [-75, 80],
    [-70, 60], [-68, 40], [-70, 20], [-75, 0], [-70, -20],
    [-68, -40], [-65, -60]
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
