import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface EnergySphereProps {
  isActive: boolean;
}

function EnergySphere({ isActive }: EnergySphereProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const count = 2500;
    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 0.6 + Math.random() * 0.5;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      randoms[i] = Math.random();
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    return geo;
  }, []);

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
    uniform float uTime;
    uniform float uActive;
    attribute float aRandom;
    varying float vAlpha;
    varying float vDistance;
    varying vec3 vColor;
    
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
      vec3 pos = position;
      
      float speed = 0.5 + uActive * 0.3;
      float time = uTime * speed;
      
      float noise1 = snoise(pos * 1.8 + time * 0.4);
      float noise2 = snoise(pos * 3.0 + time * 0.25 + 50.0);
      
      float displacement = noise1 * 0.25 + noise2 * 0.12;
      displacement *= (0.7 + uActive * 0.4);
      
      vec3 direction = normalize(pos);
      float currentRadius = length(pos);
      float newRadius = currentRadius + displacement * (0.4 + aRandom * 0.4);
      
      float angle = time * 0.4 + aRandom * 6.28;
      float swirl = sin(angle + pos.y * 2.5) * 0.08;
      
      pos = direction * newRadius;
      pos.x += sin(time * 0.8 + aRandom * 6.28) * swirl;
      pos.z += cos(time * 0.8 + aRandom * 6.28) * swirl;
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      
      float size = (2.5 + aRandom * 3.5) * (0.8 + uActive * 0.3);
      gl_PointSize = size * (250.0 / -mvPosition.z);
      
      vAlpha = 0.5 + noise1 * 0.25 + uActive * 0.15;
      vDistance = length(pos);
      
      // Color gradient: magenta -> purple -> blue
      float colorMix = sin(time * 0.6 + aRandom * 6.28 + noise1 * 2.0) * 0.5 + 0.5;
      vec3 magenta = vec3(1.0, 0.0, 0.8);
      vec3 purple = vec3(0.55, 0.2, 0.9);
      vec3 blue = vec3(0.3, 0.5, 1.0);
      vColor = mix(mix(magenta, purple, colorMix), blue, aRandom * 0.4);
    }
  `;

  const fragmentShader = `
    varying float vAlpha;
    varying float vDistance;
    varying vec3 vColor;
    
    void main() {
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);
      if (dist > 0.5) discard;
      
      float softEdge = 1.0 - smoothstep(0.1, 0.5, dist);
      softEdge = pow(softEdge, 1.2);
      
      // Add glow near center
      float coreGlow = 1.0 - smoothstep(0.2, 1.0, vDistance);
      vec3 color = vColor * (1.0 + coreGlow * 0.5);
      
      // Add white core brightness
      color = mix(color, vec3(1.0, 0.9, 1.0), coreGlow * 0.3);
      
      float alpha = vAlpha * softEdge;
      
      gl_FragColor = vec4(color, alpha);
    }
  `;

  return (
    <points ref={pointsRef} geometry={geometry}>
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

function GlowingCore({ isActive }: { isActive: boolean }) {
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
      
      float glow = 1.0 - smoothstep(0.0, 0.5, dist);
      glow = pow(glow, 2.5);
      
      float pulse = sin(uTime * 1.5) * 0.08 + 0.92;
      pulse += uActive * 0.15;
      
      vec3 coreColor = vec3(1.0, 0.85, 1.0);
      vec3 edgeColor = vec3(0.7, 0.3, 0.9);
      
      vec3 color = mix(edgeColor, coreColor, glow);
      float alpha = glow * pulse * (0.5 + uActive * 0.3);
      
      gl_FragColor = vec4(color, alpha);
    }
  `;

  return (
    <mesh>
      <sphereGeometry args={[0.25, 32, 32]} />
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
        camera={{ position: [0, 0, 2.8], fov: 50 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <GlowingCore isActive={isActive} />
        <EnergySphere isActive={isActive} />
      </Canvas>
    </div>
  );
}
