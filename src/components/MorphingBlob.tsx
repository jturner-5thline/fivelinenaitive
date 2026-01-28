import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface EnergySphereProps {
  isActive: boolean;
}

function EnergySphere({ isActive }: EnergySphereProps) {
  const meshRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const { positions, randoms } = useMemo(() => {
    const count = 3000;
    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      // Distribute points on a sphere surface with some variance
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 0.8 + Math.random() * 0.4;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      randoms[i] = Math.random();
    }
    
    return { positions, randoms };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActive: { value: isActive ? 1.0 : 0.0 },
      uColor1: { value: new THREE.Color('#ff00ff') }, // Bright magenta
      uColor2: { value: new THREE.Color('#8b5cf6') }, // Purple
      uColor3: { value: new THREE.Color('#3b82f6') }, // Blue
      uCoreColor: { value: new THREE.Color('#ffffff') }, // White core glow
    }),
    []
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uActive.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uActive.value,
        isActive ? 1.0 : 0.0,
        0.08
      );
    }
  });

  const vertexShader = `
    uniform float uTime;
    uniform float uActive;
    attribute float aRandom;
    varying float vAlpha;
    varying float vDistance;
    varying float vRandom;
    
    // Simplex noise functions
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

    float snoise(vec3 v){ 
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + 2.0 * C.xxx;
      vec3 x3 = x0 - 0.5;
      i = mod(i, 289.0);
      vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 1.0/7.0;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }
    
    void main() {
      vRandom = aRandom;
      vec3 pos = position;
      
      float speed = 0.6 + uActive * 0.4;
      float time = uTime * speed;
      
      // Create flowing wave motion
      float noise1 = snoise(pos * 1.5 + time * 0.5);
      float noise2 = snoise(pos * 3.0 + time * 0.3 + 100.0);
      float noise3 = snoise(pos * 0.8 + time * 0.7 + 200.0);
      
      // Displacement creates flowing tendrils
      float displacement = noise1 * 0.3 + noise2 * 0.15 + noise3 * 0.2;
      displacement *= (0.8 + uActive * 0.4);
      
      // Apply displacement along the radius
      vec3 direction = normalize(pos);
      float currentRadius = length(pos);
      float newRadius = currentRadius + displacement * (0.5 + aRandom * 0.5);
      
      // Add swirling motion
      float angle = time * 0.5 + aRandom * 6.28;
      float swirl = sin(angle + pos.y * 2.0) * 0.1 * (1.0 + uActive * 0.5);
      
      pos = direction * newRadius;
      pos.x += sin(time + aRandom * 6.28) * swirl;
      pos.z += cos(time + aRandom * 6.28) * swirl;
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      
      // Particle size varies with distance from center and activity
      float size = (3.0 + aRandom * 4.0) * (0.8 + uActive * 0.4);
      size *= (1.0 + displacement * 0.5);
      gl_PointSize = size * (300.0 / -mvPosition.z);
      
      // Alpha based on noise and position
      vAlpha = 0.4 + noise1 * 0.3 + uActive * 0.2;
      vAlpha *= (0.7 + aRandom * 0.3);
      vDistance = length(pos);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform float uActive;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;
    uniform vec3 uCoreColor;
    varying float vAlpha;
    varying float vDistance;
    varying float vRandom;
    
    void main() {
      // Soft circular particle
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);
      if (dist > 0.5) discard;
      
      float softEdge = 1.0 - smoothstep(0.0, 0.5, dist);
      softEdge = pow(softEdge, 1.5);
      
      // Color gradient based on distance from center and time
      float colorMix1 = sin(uTime * 0.5 + vRandom * 6.28) * 0.5 + 0.5;
      float colorMix2 = cos(uTime * 0.3 + vDistance * 2.0) * 0.5 + 0.5;
      
      vec3 color = mix(uColor1, uColor2, colorMix1);
      color = mix(color, uColor3, colorMix2 * 0.5);
      
      // Add bright core glow for particles near center
      float coreGlow = 1.0 - smoothstep(0.3, 1.2, vDistance);
      coreGlow = pow(coreGlow, 2.0);
      color = mix(color, uCoreColor, coreGlow * 0.6);
      
      // Enhance brightness
      float brightness = 1.2 + uActive * 0.3 + coreGlow * 0.5;
      color *= brightness;
      
      float alpha = vAlpha * softEdge;
      
      gl_FragColor = vec4(color, alpha);
    }
  `;

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aRandom"
          count={randoms.length}
          array={randoms}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Inner glowing core
function GlowingCore({ isActive }: { isActive: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uActive: { value: isActive ? 1.0 : 0.0 },
    }),
    []
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uActive.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uActive.value,
        isActive ? 1.0 : 0.0,
        0.08
      );
    }
  });

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform float uActive;
    varying vec2 vUv;
    
    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);
      
      // Radial gradient for core glow
      float glow = 1.0 - smoothstep(0.0, 0.5, dist);
      glow = pow(glow, 2.0);
      
      // Pulsing effect
      float pulse = sin(uTime * 2.0) * 0.1 + 0.9;
      pulse += uActive * 0.2;
      
      // Core colors
      vec3 coreColor = vec3(1.0, 0.8, 1.0); // Slight pink-white
      vec3 edgeColor = vec3(0.8, 0.4, 1.0); // Purple edge
      
      vec3 color = mix(edgeColor, coreColor, glow);
      float alpha = glow * pulse * (0.6 + uActive * 0.3);
      
      gl_FragColor = vec4(color, alpha);
    }
  `;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.35, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
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
    >
      <Canvas
        camera={{ position: [0, 0, 3], fov: 50 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <GlowingCore isActive={isActive} />
        <EnergySphere isActive={isActive} />
      </Canvas>
    </div>
  );
}
