import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Earth's axial tilt is 23.5 degrees
const AXIAL_TILT = 23.5 * (Math.PI / 180);

// Calculate the seasonal tilt direction based on current date
// Summer solstice (June 21) = day 172, North Pole tilts toward sun
// Winter solstice (Dec 21) = day 355, North Pole tilts away from sun
function getSeasonalTilt(): { x: number; z: number } {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  // Summer solstice is around day 172 (June 21)
  // We want the tilt to rotate through the year
  // At summer solstice, North Pole tilts toward viewer (positive X tilt)
  // At winter solstice, North Pole tilts away (negative X tilt)
  const summerSolsticeDay = 172;
  const daysFromSolstice = dayOfYear - summerSolsticeDay;
  const yearProgress = (daysFromSolstice / 365) * Math.PI * 2;
  
  // The tilt rotates around the Y axis through the year
  return {
    x: Math.cos(yearProgress) * AXIAL_TILT,
    z: Math.sin(yearProgress) * AXIAL_TILT,
  };
}

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

// Major city coordinates [lat, lon] for city lights - comprehensive list
const cityLights: [number, number][] = [
  // North America - USA
  [40.71, -74.01], [34.05, -118.24], [41.88, -87.63], [29.76, -95.37], [33.45, -112.07],
  [29.42, -98.49], [32.78, -96.80], [37.77, -122.42], [47.61, -122.33], [39.74, -104.99],
  [38.91, -77.04], [42.36, -71.06], [33.75, -84.39], [25.76, -80.19], [36.17, -115.14],
  [35.23, -80.84], [32.72, -117.16], [45.52, -122.68], [30.27, -97.74], [39.10, -94.58],
  [36.16, -86.78], [39.96, -82.99], [35.47, -97.52], [44.98, -93.27], [38.25, -85.76],
  [43.04, -87.91], [35.15, -90.05], [42.33, -83.05], [27.95, -82.46], [26.12, -80.14],
  [33.52, -86.80], [36.85, -76.29], [37.54, -77.44], [41.50, -81.69], [32.08, -81.09],
  [28.54, -81.38], [36.07, -79.79], [39.29, -76.61], [40.44, -79.99], [21.31, -157.86],
  // North America - Canada
  [43.65, -79.38], [45.50, -73.57], [49.28, -123.12], [51.05, -114.07], [53.55, -113.49],
  [45.42, -75.70], [49.90, -97.14], [44.65, -63.58], [43.26, -79.87], [42.98, -81.25],
  // North America - Mexico
  [19.43, -99.13], [20.67, -103.35], [25.67, -100.32], [32.52, -117.02], [31.87, -116.60],
  [22.15, -100.98], [20.97, -89.62], [21.16, -86.85], [17.07, -96.72], [19.18, -96.14],
  // Central America & Caribbean
  [23.14, -82.36], [18.47, -69.90], [18.50, -69.99], [14.63, -90.51], [13.69, -89.19],
  [12.11, -86.27], [9.93, -84.08], [8.98, -79.52], [17.50, -88.20], [18.00, -76.80],
  // South America
  [-23.55, -46.63], [-22.91, -43.17], [-34.60, -58.38], [-33.45, -70.67], [-12.05, -77.04],
  [4.71, -74.07], [10.49, -66.88], [-0.18, -78.47], [-16.50, -68.15], [-25.27, -57.64],
  [-34.88, -56.17], [5.02, -60.73], [-3.74, -38.52], [-19.92, -43.94], [-30.03, -51.23],
  [-1.46, -48.50], [-8.05, -34.88], [-27.59, -48.55], [-15.78, -47.93], [-2.50, -44.26],
  [-23.21, -45.90], [-20.32, -40.34], [-3.10, -60.02], [-22.82, -47.06], [-21.23, -50.43],
  // Europe - Western
  [51.51, -0.13], [48.86, 2.35], [52.52, 13.41], [41.90, 12.50], [40.42, -3.70],
  [52.37, 4.90], [50.85, 4.35], [46.20, 6.14], [48.21, 16.37], [47.50, 19.04],
  [50.08, 14.44], [52.23, 21.01], [59.33, 18.07], [59.91, 10.75], [55.68, 12.57],
  [60.17, 24.94], [53.35, -6.26], [55.95, -3.19], [53.48, -2.24], [51.45, -2.59],
  [45.46, 9.19], [43.77, 11.25], [44.41, 8.95], [45.44, 12.32], [40.85, 14.27],
  [41.39, 2.17], [39.47, -0.38], [37.39, -5.99], [38.72, -9.14], [41.16, -8.63],
  [43.30, -1.98], [48.58, 7.75], [50.94, 6.96], [53.55, 9.99], [48.14, 11.58],
  [51.23, 6.78], [49.45, 11.08], [51.34, 12.37], [54.09, 12.13], [50.11, 8.68],
  // Europe - Eastern
  [55.76, 37.62], [59.93, 30.34], [56.84, 60.61], [55.03, 82.92], [54.99, 73.37],
  [53.20, 50.15], [51.67, 39.18], [47.22, 39.72], [48.47, 35.04], [50.45, 30.52],
  [49.84, 24.03], [46.48, 30.73], [48.00, 37.80], [44.43, 26.10], [42.70, 23.32],
  [44.82, 20.46], [45.81, 15.98], [46.06, 14.51], [41.33, 19.82], [42.44, 19.26],
  // Asia - East
  [35.68, 139.69], [34.69, 135.50], [35.18, 136.91], [43.06, 141.35], [33.59, 130.40],
  [34.39, 132.46], [35.01, 135.77], [38.27, 140.87], [34.67, 133.92], [36.57, 136.66],
  [31.23, 121.47], [39.90, 116.41], [23.13, 113.26], [22.54, 114.06], [30.57, 104.07],
  [29.56, 106.55], [34.26, 108.94], [36.06, 120.38], [32.06, 118.78], [30.29, 120.16],
  [28.23, 112.94], [23.02, 113.75], [25.04, 102.71], [22.82, 108.32], [38.04, 114.48],
  [37.87, 112.55], [41.80, 123.43], [45.75, 126.65], [43.88, 125.32], [40.84, 111.75],
  [22.28, 114.16], [22.20, 113.55], [25.03, 121.57], [22.62, 120.31], [24.15, 120.67],
  [37.57, 126.98], [35.18, 129.08], [35.87, 128.60], [37.46, 126.71], [35.53, 129.31],
  [21.03, 105.85], [10.82, 106.63], [16.07, 108.22], [21.22, 106.65], [10.03, 105.77],
  [13.75, 100.50], [18.79, 98.98], [7.88, 98.39], [13.36, 103.86], [11.56, 104.92],
  [14.60, 121.00], [10.31, 123.89], [7.07, 125.61], [14.65, 121.03], [10.32, 123.95],
  [3.14, 101.69], [1.35, 103.82], [5.41, 100.33], [1.49, 110.35], [4.60, 103.42],
  [-6.21, 106.85], [-7.25, 112.75], [-6.97, 110.42], [-7.80, 110.36], [-8.65, 115.22],
  // Asia - South
  [28.61, 77.21], [19.08, 72.88], [13.08, 80.27], [22.57, 88.36], [12.97, 77.59],
  [17.39, 78.49], [23.02, 72.57], [18.52, 73.86], [26.85, 80.95], [21.17, 72.83],
  [26.92, 75.79], [22.72, 75.86], [21.15, 79.09], [19.99, 73.78], [25.59, 85.14],
  [30.73, 76.77], [28.63, 77.22], [22.31, 73.18], [11.02, 76.97], [9.93, 76.26],
  [23.81, 91.28], [22.34, 91.83], [24.90, 91.87], [25.75, 89.26], [23.70, 90.41],
  [27.70, 85.32], [28.21, 83.99], [26.82, 87.28], [6.93, 79.85], [7.29, 80.63],
  [24.86, 67.01], [31.56, 74.35], [33.69, 73.06], [25.40, 68.37], [30.20, 71.46],
  // Asia - Central & West
  [41.30, 69.28], [39.65, 66.96], [37.58, 68.77], [40.78, 72.34], [42.87, 74.59],
  [38.56, 68.77], [43.24, 76.95], [51.17, 71.43], [43.65, 51.17], [47.10, 51.92],
  [35.70, 51.42], [32.65, 51.68], [36.30, 59.61], [38.07, 46.29], [29.61, 52.53],
  [40.18, 44.51], [40.41, 49.87], [41.69, 44.83], [39.57, 32.87], [41.01, 28.98],
  [38.42, 27.13], [37.87, 32.49], [36.90, 30.69], [40.99, 29.02], [36.20, 36.16],
  // Middle East
  [25.28, 55.30], [24.47, 54.37], [25.29, 51.53], [26.23, 50.59], [29.38, 47.99],
  [24.71, 46.68], [21.49, 39.19], [21.43, 39.83], [23.59, 58.38], [33.31, 44.37],
  [36.19, 44.01], [31.95, 35.93], [32.09, 34.77], [31.77, 35.22], [33.89, 35.50],
  [34.80, 38.99], [33.51, 36.29], [15.35, 44.21], [12.78, 45.04],
  // Africa - North
  [30.04, 31.24], [31.20, 29.92], [27.18, 31.17], [30.80, 29.99], [36.75, 3.06],
  [36.37, 6.61], [35.69, -0.64], [33.59, -7.62], [34.03, -6.84], [31.63, -8.01],
  [36.81, 10.18], [33.89, 10.10], [32.88, 13.19], [32.90, 13.10], [15.55, 32.53],
  [19.17, 37.22], [15.60, 32.54], [11.59, 37.39], [9.03, 38.75], [4.36, 18.56],
  // Africa - West
  [6.52, 3.38], [6.46, 3.39], [9.06, 7.49], [12.00, 8.52], [11.85, 13.16],
  [6.69, -1.62], [5.56, -0.20], [5.35, -4.01], [6.82, -5.28], [14.69, -17.44],
  [12.65, -8.00], [13.45, -16.58], [11.86, -15.60], [9.54, -13.68], [8.48, -13.23],
  [6.30, -10.80], [4.89, -1.76], [6.13, 1.22], [12.37, -1.52], [13.52, 2.11],
  // Africa - East
  [-1.29, 36.82], [-6.17, 35.74], [-3.39, 36.68], [-4.05, 39.66], [0.32, 32.58],
  [-15.79, 35.01], [-13.98, 33.78], [-17.83, 31.05], [-20.15, 28.58], [-19.83, 34.84],
  [-25.97, 32.58], [15.50, 38.93], [11.59, 43.15], [2.04, 45.34], [-18.91, 47.52],
  // Africa - South
  [-33.93, 18.42], [-29.86, 31.02], [-26.20, 28.05], [-25.75, 28.19], [-33.96, 25.60],
  [-31.58, 28.79], [-29.12, 26.21], [-23.35, 27.13], [-22.57, 17.08], [-17.86, 25.85],
  [-8.84, 13.23], [-4.44, 15.27], [-11.66, 27.48], [-15.42, 28.28], [-12.97, 28.63],
  // Australia & New Zealand
  [-33.87, 151.21], [-37.81, 144.96], [-27.47, 153.03], [-31.95, 115.86], [-34.93, 138.60],
  [-12.46, 130.84], [-42.88, 147.33], [-35.28, 149.13], [-32.93, 151.78], [-28.00, 153.43],
  [-36.85, 174.76], [-41.29, 174.78], [-43.53, 172.64], [-45.87, 170.50], [-37.79, 175.28],
  [-19.26, 146.82], [-16.92, 145.77], [-23.70, 133.88], [-20.73, 139.49], [-38.14, 144.36],
];


function CityLights() {
  const groupRef = useRef<THREE.Group>(null);
  
  const pointsGeometry = useMemo(() => {
    const radius = 2.03;
    const positions = new Float32Array(cityLights.length * 3);
    
    cityLights.forEach(([lat, lon], i) => {
      const vec = latLonToVector3(lat, lon, radius);
      positions[i * 3] = vec.x;
      positions[i * 3 + 1] = vec.y;
      positions[i * 3 + 2] = vec.z;
    });
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, []);
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y -= delta * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      <points geometry={pointsGeometry}>
        <pointsMaterial
          size={0.025}
          color="#fbbf24"
          transparent
          opacity={0.6}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

// Network connection pairs between major cities [fromIndex, toIndex]
const networkConnections: [number, number][] = [
  // Transatlantic
  [0, 143], [6, 143], [4, 144], [8, 145],
  // Trans-Pacific
  [1, 157], [7, 160], [8, 165], [0, 157],
  // Europe-Asia
  [143, 157], [144, 160], [145, 162], [152, 157],
  // Americas
  [0, 67], [1, 69], [0, 40], [1, 50],
  // Africa connections
  [143, 196], [144, 190], [145, 200],
  // Australia
  [160, 208], [157, 209], [7, 208],
  // Middle East
  [143, 185], [152, 181],
  // South America internal
  [67, 68], [67, 69],
  // Additional global routes
  [40, 143], [5, 185], [160, 185],
];

function NetworkLines() {
  const groupRef = useRef<THREE.Group>(null);
  const pulsesRef = useRef<THREE.Points[]>([]);
  const pulseProgressRef = useRef<number[]>(networkConnections.map(() => Math.random()));
  
  const { curves, pulseGeometries } = useMemo(() => {
    const radius = 2.04;
    const curvesList: THREE.CurvePath<THREE.Vector3>[] = [];
    const pulseGeos: THREE.BufferGeometry[] = [];
    
    networkConnections.forEach(([fromIdx, toIdx]) => {
      if (fromIdx >= cityLights.length || toIdx >= cityLights.length) return;
      
      const [lat1, lon1] = cityLights[fromIdx];
      const [lat2, lon2] = cityLights[toIdx];
      
      const start = latLonToVector3(lat1, lon1, radius);
      const end = latLonToVector3(lat2, lon2, radius);
      
      const distance = start.distanceTo(end);
      const arcHeight = 0.15 + distance * 0.12;
      
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(radius + arcHeight);
      
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const curvePath = new THREE.CurvePath<THREE.Vector3>();
      curvePath.add(curve);
      curvesList.push(curvePath);
      
      const pulseGeo = new THREE.BufferGeometry();
      pulseGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
      pulseGeos.push(pulseGeo);
    });
    
    return { curves: curvesList, pulseGeometries: pulseGeos };
  }, []);
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y -= delta * 0.08;
    }
    
    pulseProgressRef.current.forEach((progress, idx) => {
      if (idx >= curves.length || !pulsesRef.current[idx]) return;
      
      const speed = 0.15 + (idx % 5) * 0.05;
      pulseProgressRef.current[idx] = (progress + delta * speed) % 1;
      
      const point = curves[idx].getPoint(pulseProgressRef.current[idx]);
      const positions = pulsesRef.current[idx].geometry.attributes.position.array as Float32Array;
      positions[0] = point.x;
      positions[1] = point.y;
      positions[2] = point.z;
      pulsesRef.current[idx].geometry.attributes.position.needsUpdate = true;
    });
  });

  return (
    <group ref={groupRef}>
      {curves.map((curvePath, idx) => {
        const points = curvePath.getPoints(30);
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        return (
          <primitive key={`line-${idx}`} object={new THREE.Line(
            lineGeometry,
            new THREE.LineBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.5, linewidth: 2 })
          )} />
        );
      })}
      {pulseGeometries.map((geo, idx) => (
        <points 
          key={`pulse-${idx}`} 
          ref={(el) => { if (el) pulsesRef.current[idx] = el; }}
          geometry={geo}
        >
          <pointsMaterial
            size={0.06}
            color="#67e8f9"
            transparent
            opacity={1}
            sizeAttenuation
          />
        </points>
      ))}
    </group>
  );
}

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  
  return new THREE.Vector3(x, y, z);
}

function createContinentMesh(coords: number[][], radius: number): THREE.Mesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  
  // Create vertices on sphere surface
  coords.forEach(([lat, lon]) => {
    const vec = latLonToVector3(lat, lon, radius);
    vertices.push(vec.x, vec.y, vec.z);
  });
  
  // Simple fan triangulation from first vertex
  for (let i = 1; i < coords.length - 1; i++) {
    indices.push(0, i, i + 1);
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  const material = new THREE.MeshBasicMaterial({
    color: '#0ea5e9',
    transparent: true,
    opacity: 0.08,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  
  return new THREE.Mesh(geometry, material);
}

function ContinentOutlines() {
  const groupRef = useRef<THREE.Group>(null);
  
  const { lineObjects, fillMeshes } = useMemo(() => {
    const outlineRadius = 2.02;
    const fillRadius = 2.01;
    const lines: THREE.Line[] = [];
    const fills: THREE.Mesh[] = [];
    
    Object.values(continentOutlines).forEach((coords) => {
      // Create outline
      const points: THREE.Vector3[] = [];
      coords.forEach(([lat, lon]) => {
        points.push(latLonToVector3(lat, lon, outlineRadius));
      });
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.4 });
      lines.push(new THREE.Line(lineGeometry, lineMaterial));
      
      // Create fill
      fills.push(createContinentMesh(coords, fillRadius));
    });
    
    return { lineObjects: lines, fillMeshes: fills };
  }, []);
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y -= delta * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      {lineObjects.map((line, index) => (
        <primitive key={`line-${index}`} object={line} />
      ))}
      {fillMeshes.map((mesh, index) => (
        <primitive key={`fill-${index}`} object={mesh} />
      ))}
    </group>
  );
}

function Globe() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y -= delta * 0.08;
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
      meshRef.current.rotation.y -= delta * 0.08;
      meshRef.current.rotation.x -= delta * 0.015;
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
      meshRef.current.rotation.y -= delta * 0.08;
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
      points.current.rotation.y -= delta * 0.03;
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
  const seasonalTilt = useMemo(() => getSeasonalTilt(), []);
  
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={0.5} color="#22d3ee" />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color="#0ea5e9" />
        <group rotation={[seasonalTilt.x, 0, seasonalTilt.z]}>
          <Globe />
          <GlobeLines />
          <GlobeGlow />
          <ContinentOutlines />
          <CityLights />
          <NetworkLines />
        </group>
        <Particles />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={-0.3}
        />
      </Canvas>
      <div className="absolute inset-0 bg-background/40 pointer-events-none" />
    </div>
  );
}
