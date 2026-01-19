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

// Generate dense city lights procedurally for realistic appearance
const generateCityLights = (): [number, number][] => {
  const lights: [number, number][] = [];
  
  // Major urban centers with density weights [lat, lon, density]
  const urbanCenters: [number, number, number][] = [
    // North America - USA East Coast
    [40.71, -74.01, 25], [42.36, -71.06, 15], [38.91, -77.04, 18], [39.95, -75.16, 12],
    [41.88, -87.63, 20], [42.33, -83.05, 12], [39.96, -82.99, 10], [41.50, -81.69, 10],
    [33.75, -84.39, 15], [25.76, -80.19, 12], [27.95, -82.46, 10], [28.54, -81.38, 10],
    [35.23, -80.84, 10], [36.85, -76.29, 8], [37.54, -77.44, 8], [39.29, -76.61, 10],
    // North America - USA West Coast
    [34.05, -118.24, 25], [33.68, -117.83, 15], [32.72, -117.16, 12], [37.77, -122.42, 18],
    [37.34, -121.89, 12], [47.61, -122.33, 15], [45.52, -122.68, 10], [38.58, -121.49, 10],
    // North America - USA Central/South
    [29.76, -95.37, 18], [32.78, -96.80, 15], [29.42, -98.49, 12], [30.27, -97.74, 10],
    [33.45, -112.07, 12], [36.17, -115.14, 12], [39.74, -104.99, 12], [35.47, -97.52, 8],
    [39.10, -94.58, 10], [44.98, -93.27, 10], [36.16, -86.78, 8], [38.25, -85.76, 8],
    // Canada
    [43.65, -79.38, 18], [45.50, -73.57, 15], [49.28, -123.12, 12], [51.05, -114.07, 10],
    [53.55, -113.49, 8], [45.42, -75.70, 10], [49.90, -97.14, 8],
    // Mexico
    [19.43, -99.13, 20], [20.67, -103.35, 10], [25.67, -100.32, 10], [22.15, -100.98, 8],
    [21.16, -86.85, 8], [32.52, -117.02, 8], [20.97, -89.62, 6],
    // Central America & Caribbean
    [23.14, -82.36, 10], [18.47, -69.90, 8], [14.63, -90.51, 8], [9.93, -84.08, 6],
    [8.98, -79.52, 6], [18.00, -76.80, 6],
    // South America
    [-23.55, -46.63, 25], [-22.91, -43.17, 18], [-34.60, -58.38, 18], [-33.45, -70.67, 12],
    [-12.05, -77.04, 12], [4.71, -74.07, 10], [10.49, -66.88, 10], [-0.18, -78.47, 8],
    [-16.50, -68.15, 8], [-30.03, -51.23, 10], [-19.92, -43.94, 10], [-3.74, -38.52, 8],
    [-8.05, -34.88, 8], [-15.78, -47.93, 10], [-1.46, -48.50, 6], [-25.27, -57.64, 6],
    // Europe - Western
    [51.51, -0.13, 25], [48.86, 2.35, 22], [52.52, 13.41, 18], [41.90, 12.50, 15],
    [40.42, -3.70, 15], [52.37, 4.90, 12], [50.85, 4.35, 10], [48.21, 16.37, 12],
    [47.50, 19.04, 10], [50.08, 14.44, 10], [52.23, 21.01, 12], [59.33, 18.07, 10],
    [55.68, 12.57, 10], [53.35, -6.26, 8], [45.46, 9.19, 12], [43.77, 11.25, 8],
    [41.39, 2.17, 12], [38.72, -9.14, 10], [53.48, -2.24, 12], [53.55, 9.99, 10],
    [48.14, 11.58, 10], [50.94, 6.96, 10], [44.41, 8.95, 8], [45.44, 12.32, 8],
    [59.91, 10.75, 8], [60.17, 24.94, 8], [46.20, 6.14, 8],
    // Europe - Eastern
    [55.76, 37.62, 22], [59.93, 30.34, 15], [50.45, 30.52, 15], [44.43, 26.10, 10],
    [42.70, 23.32, 8], [44.82, 20.46, 8], [45.81, 15.98, 8], [56.84, 60.61, 8],
    [55.03, 82.92, 8], [54.99, 73.37, 6], [49.84, 24.03, 8], [47.22, 39.72, 8],
    // Asia - East China
    [31.23, 121.47, 28], [39.90, 116.41, 25], [23.13, 113.26, 22], [22.54, 114.06, 20],
    [30.57, 104.07, 15], [29.56, 106.55, 12], [34.26, 108.94, 12], [36.06, 120.38, 12],
    [32.06, 118.78, 12], [30.29, 120.16, 12], [28.23, 112.94, 10], [25.04, 102.71, 10],
    [22.82, 108.32, 10], [38.04, 114.48, 10], [41.80, 123.43, 12], [45.75, 126.65, 10],
    [43.88, 125.32, 8], [40.84, 111.75, 8], [26.07, 119.30, 10], [24.48, 118.09, 8],
    [27.99, 120.68, 8], [23.02, 113.75, 10], [37.87, 112.55, 8],
    // Asia - Japan
    [35.68, 139.69, 28], [34.69, 135.50, 20], [35.18, 136.91, 12], [43.06, 141.35, 10],
    [33.59, 130.40, 10], [34.39, 132.46, 8], [38.27, 140.87, 8], [35.01, 135.77, 10],
    [34.98, 138.39, 8], [35.62, 140.12, 8],
    // Asia - Korea
    [37.57, 126.98, 20], [35.18, 129.08, 12], [35.87, 128.60, 10], [37.46, 126.71, 8],
    // Asia - Taiwan/HK
    [22.28, 114.16, 15], [22.20, 113.55, 10], [25.03, 121.57, 12], [22.62, 120.31, 8],
    // Southeast Asia
    [13.75, 100.50, 18], [14.60, 121.00, 15], [10.82, 106.63, 15], [3.14, 101.69, 12],
    [1.35, 103.82, 15], [-6.21, 106.85, 20], [-7.25, 112.75, 12], [21.03, 105.85, 12],
    [16.07, 108.22, 8], [18.79, 98.98, 8], [5.41, 100.33, 8], [-6.97, 110.42, 8],
    [10.31, 123.89, 8], [7.07, 125.61, 6],
    // South Asia - India
    [28.61, 77.21, 22], [19.08, 72.88, 22], [13.08, 80.27, 15], [22.57, 88.36, 15],
    [12.97, 77.59, 15], [17.39, 78.49, 12], [23.02, 72.57, 12], [18.52, 73.86, 10],
    [26.85, 80.95, 10], [21.17, 72.83, 8], [26.92, 75.79, 8], [25.59, 85.14, 8],
    [15.35, 75.12, 6], [16.51, 80.62, 6], [11.02, 76.97, 6],
    // South Asia - Pakistan/Bangladesh
    [24.86, 67.01, 15], [31.56, 74.35, 12], [33.69, 73.06, 10], [23.81, 90.41, 15],
    [22.34, 91.83, 8], [25.75, 89.26, 6],
    // Middle East
    [25.28, 55.30, 15], [24.47, 54.37, 10], [25.29, 51.53, 10], [29.38, 47.99, 8],
    [24.71, 46.68, 12], [21.49, 39.19, 10], [33.31, 44.37, 10], [35.70, 51.42, 15],
    [32.09, 34.77, 12], [31.77, 35.22, 8], [33.89, 35.50, 8], [41.01, 28.98, 15],
    [38.42, 27.13, 8], [39.57, 32.87, 10],
    // Africa - North
    [30.04, 31.24, 18], [31.20, 29.92, 12], [36.75, 3.06, 10], [33.59, -7.62, 10],
    [34.03, -6.84, 8], [36.81, 10.18, 8], [32.88, 13.19, 8], [15.55, 32.53, 8],
    [9.03, 38.75, 8],
    // Africa - West
    [6.52, 3.38, 15], [9.06, 7.49, 10], [12.00, 8.52, 8], [6.69, -1.62, 8],
    [5.56, -0.20, 8], [14.69, -17.44, 6], [12.65, -8.00, 6],
    // Africa - East/South
    [-1.29, 36.82, 10], [-6.17, 35.74, 8], [-4.05, 39.66, 6], [0.32, 32.58, 6],
    [-33.93, 18.42, 15], [-26.20, 28.05, 12], [-29.86, 31.02, 10], [-25.75, 28.19, 8],
    [-18.91, 47.52, 6], [-8.84, 13.23, 8], [-15.42, 28.28, 6],
    // Australia/NZ
    [-33.87, 151.21, 18], [-37.81, 144.96, 15], [-27.47, 153.03, 12], [-31.95, 115.86, 10],
    [-34.93, 138.60, 8], [-12.46, 130.84, 6], [-35.28, 149.13, 8], [-42.88, 147.33, 6],
    [-36.85, 174.76, 10], [-41.29, 174.78, 8], [-43.53, 172.64, 6],
  ];
  
  // Generate lights around each urban center (5x density)
  urbanCenters.forEach(([lat, lon, density]) => {
    // Add the center point
    lights.push([lat, lon]);
    
    // Add surrounding points based on density (5x multiplier)
    for (let i = 0; i < density * 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 0.4 + 0.03; // Slightly wider spread
      const newLat = lat + Math.sin(angle) * distance;
      const newLon = lon + Math.cos(angle) * distance;
      lights.push([newLat, newLon]);
    }
    
    // Add extra cluster for very dense areas (5x multiplier)
    if (density > 15) {
      for (let i = 0; i < density * 2.5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 0.6 + 0.15;
        const newLat = lat + Math.sin(angle) * distance;
        const newLon = lon + Math.cos(angle) * distance;
        lights.push([newLat, newLon]);
      }
    }
  });
  
  // Add coastal/highway corridor lights (5x multiplier)
  const corridors: [number, number, number, number, number][] = [
    // US East Coast [startLat, startLon, endLat, endLon, count]
    [42.36, -71.06, 25.76, -80.19, 400],
    [40.71, -74.01, 41.88, -87.63, 250],
    // US West Coast
    [47.61, -122.33, 32.72, -117.16, 300],
    // Europe
    [51.51, -0.13, 41.90, 12.50, 400],
    [48.86, 2.35, 52.52, 13.41, 200],
    [52.52, 13.41, 55.76, 37.62, 250],
    // China coast
    [39.90, 116.41, 23.13, 113.26, 500],
    [31.23, 121.47, 22.54, 114.06, 400],
    // Japan
    [35.68, 139.69, 34.69, 135.50, 250],
    // India
    [28.61, 77.21, 19.08, 72.88, 200],
    [19.08, 72.88, 13.08, 80.27, 200],
    // Brazil coast
    [-23.55, -46.63, -22.91, -43.17, 150],
    [-22.91, -43.17, -8.05, -34.88, 200],
    // Australia
    [-33.87, 151.21, -37.81, 144.96, 150],
  ];
  
  corridors.forEach(([startLat, startLon, endLat, endLon, count]) => {
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const lat = startLat + (endLat - startLat) * t + (Math.random() - 0.5) * 0.8;
      const lon = startLon + (endLon - startLon) * t + (Math.random() - 0.5) * 0.8;
      lights.push([lat, lon]);
    }
  });
  
  // Add scattered rural/small town lights (5x multiplier)
  const regions: [number, number, number, number, number][] = [
    // Region bounding boxes [minLat, maxLat, minLon, maxLon, count]
    // Eastern US
    [30, 45, -90, -70, 750],
    // Western US
    [32, 48, -125, -105, 400],
    // Central US
    [30, 48, -105, -90, 300],
    // Western Europe
    [42, 55, -5, 15, 600],
    // Eastern Europe
    [42, 60, 15, 40, 400],
    // UK/Ireland
    [50, 58, -10, 2, 250],
    // Eastern China
    [22, 42, 105, 125, 1000],
    // Japan
    [32, 44, 128, 145, 400],
    // India
    [8, 32, 68, 92, 750],
    // Southeast Asia
    [-8, 20, 95, 125, 500],
    // Middle East
    [22, 40, 35, 60, 300],
    // North Africa
    [25, 37, -10, 35, 200],
    // Sub-Saharan Africa
    [-35, 15, -18, 50, 400],
    // Brazil
    [-30, 0, -55, -35, 400],
    // Argentina/Chile
    [-55, -20, -75, -55, 200],
    // Australia coast
    [-40, -12, 110, 155, 250],
    // New Zealand
    [-47, -35, 166, 178, 100],
    // Korea
    [34, 38, 125, 130, 200],
    // Taiwan
    [22, 26, 119, 122, 150],
  ];
  
  regions.forEach(([minLat, maxLat, minLon, maxLon, count]) => {
    for (let i = 0; i < count; i++) {
      const lat = minLat + Math.random() * (maxLat - minLat);
      const lon = minLon + Math.random() * (maxLon - minLon);
      lights.push([lat, lon]);
    }
  });
  
  return lights;
};

const cityLights = generateCityLights();


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
      groupRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      <points geometry={pointsGeometry}>
        <pointsMaterial
          size={0.008}
          color="#fbbf24"
          transparent
          opacity={0.7}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

// Network connection pairs between major cities [fromIndex, toIndex]
const networkConnections: [number, number][] = [
  // === NORTHERN HEMISPHERE ===
  // Transatlantic (North America - Europe)
  [0, 143], [8, 145], [11, 144],
  // Trans-Pacific (North America - Asia)
  [1, 157], [7, 160], [8, 165],
  // Europe-Asia
  [143, 157], [144, 160], [152, 157],
  
  // === SOUTHERN HEMISPHERE ===
  // South America - Africa
  [67, 205], [68, 196], [69, 200], [70, 205],
  // South America - Australia/NZ
  [67, 208], [69, 209], [68, 210], [70, 211],
  // Africa - Australia
  [205, 208], [200, 209], [196, 208], [201, 210],
  // South America internal
  [67, 69], [68, 70], [69, 71], [67, 72],
  // Africa internal (south)
  [205, 206], [200, 201], [202, 205], [203, 207],
  // Australia/NZ internal
  [208, 209], [208, 210], [209, 211], [210, 212],
  
  // === CROSS-HEMISPHERE ===
  // North America - South America
  [0, 67], [1, 69], [13, 68], [50, 67],
  // Europe - Africa
  [143, 190], [144, 196], [145, 200], [146, 205],
  // Asia - Australia
  [160, 208], [157, 209], [170, 208], [171, 210],
  // Middle East - Africa
  [185, 190], [185, 196], [181, 200],
  // Asia - South
  [171, 205], [160, 200], [165, 208],
];

function NetworkLines() {
  const groupRef = useRef<THREE.Group>(null);
  const pulsesRef = useRef<THREE.Mesh[]>([]);
  const pulseProgressRef = useRef<number[]>(networkConnections.map(() => Math.random()));
  
  const curves = useMemo(() => {
    const radius = 2.04;
    const curvesList: THREE.CurvePath<THREE.Vector3>[] = [];
    
    networkConnections.forEach(([fromIdx, toIdx]) => {
      if (fromIdx >= cityLights.length || toIdx >= cityLights.length) return;
      
      const [lat1, lon1] = cityLights[fromIdx];
      const [lat2, lon2] = cityLights[toIdx];
      
      const start = latLonToVector3(lat1, lon1, radius);
      const end = latLonToVector3(lat2, lon2, radius);
      
      const distance = start.distanceTo(end);
      const arcHeight = 0.4 + distance * 0.25;
      
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(radius + arcHeight);
      
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const curvePath = new THREE.CurvePath<THREE.Vector3>();
      curvePath.add(curve);
      curvesList.push(curvePath);
    });
    
    return curvesList;
  }, []);
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
    }
    
    pulseProgressRef.current.forEach((progress, idx) => {
      if (idx >= curves.length || !pulsesRef.current[idx]) return;
      
      const speed = 0.15 + (idx % 5) * 0.05;
      pulseProgressRef.current[idx] = (progress + delta * speed) % 1;
      
      const point = curves[idx].getPoint(pulseProgressRef.current[idx]);
      pulsesRef.current[idx].position.set(point.x, point.y, point.z);
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
      {curves.map((_, idx) => (
        <mesh 
          key={`pulse-${idx}`} 
          ref={(el) => { if (el) pulsesRef.current[idx] = el; }}
        >
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={1} />
        </mesh>
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
      groupRef.current.rotation.y += delta * 0.08;
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
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Solid inner sphere to block backside visibility */}
      <Sphere args={[1.85, 32, 32]} position={[0, 0, 0]}>
        <meshBasicMaterial
          color="#0c1929"
          transparent
          opacity={0.85}
        />
      </Sphere>
      {/* Outer glow sphere */}
      <Sphere args={[1.98, 32, 32]} position={[0, 0, 0]}>
        <meshBasicMaterial
          color="#06b6d4"
          transparent
          opacity={0.03}
        />
      </Sphere>
    </group>
  );
}

function NeuralNetwork() {
  const groupRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<number>(0);
  const lineMaterialsRef = useRef<THREE.LineBasicMaterial[]>([]);
  const corePulseRef = useRef<number>(0);
  
  // Core cell refs
  const nucleusRef = useRef<THREE.Mesh>(null);
  const membraneRef = useRef<THREE.Mesh>(null);
  const outerMembraneRef = useRef<THREE.Mesh>(null);
  const haloRing1Ref = useRef<THREE.Mesh>(null);
  const haloRing2Ref = useRef<THREE.Mesh>(null);
  const haloRing3Ref = useRef<THREE.Mesh>(null);
  const dataOrbitRef = useRef<THREE.Group>(null);
  const electronOrbitRef = useRef<THREE.Group>(null);
  const pulseWaveRef = useRef<THREE.Mesh>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);
  
  // Create shader material for soft radial pulse
  const pulseShaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#0ea5e9') },
        uOpacity: { value: 0.35 },
        uPhase: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uPhase;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          // Calculate distance from center (0-1 range for unit sphere)
          float dist = length(vPosition);
          // Create soft radial fade - stronger in center, fades to edges
          float centerFade = 1.0 - smoothstep(0.0, 1.0, dist);
          // Add extra softness with power curve
          centerFade = pow(centerFade, 1.5);
          // Edge fade based on phase (disperses more as it expands)
          float edgeSoftness = mix(0.3, 0.8, uPhase);
          float finalAlpha = uOpacity * centerFade * edgeSoftness;
          gl_FragColor = vec4(uColor, finalAlpha);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }, []);
  
  const { nodeGeometry, lineObjects, surfaceNodes, coreConnections } = useMemo(() => {
    // Central core at origin
    const corePosition = new THREE.Vector3(0, 0, 0);
    
    // Surface nodes - distributed on the globe surface for connection points
    const surfaceNodeCount = 80;
    const surfaceRadius = 1.95;
    const surfacePositions: THREE.Vector3[] = [];
    
    for (let i = 0; i < surfaceNodeCount; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / surfaceNodeCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      
      const x = surfaceRadius * Math.sin(phi) * Math.cos(theta);
      const y = surfaceRadius * Math.sin(phi) * Math.sin(theta);
      const z = surfaceRadius * Math.cos(phi);
      
      surfacePositions.push(new THREE.Vector3(x, y, z));
    }
    
    // Interior relay nodes
    const relayNodeCount = 30;
    const relayPositions: THREE.Vector3[] = [];
    for (let i = 0; i < relayNodeCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 0.6 + Math.random() * 1.1;
      
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      
      relayPositions.push(new THREE.Vector3(x, y, z));
    }
    
    const allNodes = [...surfacePositions, ...relayPositions];
    
    const positions = new Float32Array(allNodes.length * 3);
    allNodes.forEach((pos, i) => {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
    });
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const lines: THREE.Line[] = [];
    const materials: THREE.LineBasicMaterial[] = [];
    const maxConnectionDistance = 1.0;
    
    for (let i = 0; i < allNodes.length; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const dist = allNodes[i].distanceTo(allNodes[j]);
        if (dist < maxConnectionDistance && Math.random() > 0.5) {
          const lineGeo = new THREE.BufferGeometry().setFromPoints([allNodes[i], allNodes[j]]);
          const material = new THREE.LineBasicMaterial({ 
            color: '#06b6d4', 
            transparent: true, 
            opacity: 0.3 
          });
          materials.push(material);
          lines.push(new THREE.Line(lineGeo, material));
        }
      }
    }
    
    const coreLines: THREE.Line[] = [];
    const coreMaterials: THREE.LineBasicMaterial[] = [];
    
    surfacePositions.forEach((surfacePos) => {
      const midPoint = surfacePos.clone().multiplyScalar(0.45);
      midPoint.x += (Math.random() - 0.5) * 0.25;
      midPoint.y += (Math.random() - 0.5) * 0.25;
      midPoint.z += (Math.random() - 0.5) * 0.25;
      
      const curve = new THREE.QuadraticBezierCurve3(corePosition, midPoint, surfacePos);
      const points = curve.getPoints(25);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      
      const intensity = 0.2 + Math.random() * 0.2;
      const material = new THREE.LineBasicMaterial({ 
        color: '#22d3ee', 
        transparent: true, 
        opacity: intensity
      });
      coreMaterials.push(material);
      coreLines.push(new THREE.Line(lineGeo, material));
    });
    
    relayPositions.forEach((relayPos) => {
      if (Math.random() > 0.3) {
        const midPoint = relayPos.clone().multiplyScalar(0.25);
        midPoint.x += (Math.random() - 0.5) * 0.15;
        midPoint.y += (Math.random() - 0.5) * 0.15;
        midPoint.z += (Math.random() - 0.5) * 0.15;
        
        const curve = new THREE.QuadraticBezierCurve3(corePosition, midPoint, relayPos);
        const points = curve.getPoints(15);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        
        const material = new THREE.LineBasicMaterial({ 
          color: '#67e8f9', 
          transparent: true, 
          opacity: 0.25 + Math.random() * 0.25
        });
        coreMaterials.push(material);
        coreLines.push(new THREE.Line(lineGeo, material));
      }
    });
    
    lineMaterialsRef.current = [...materials, ...coreMaterials];
    return { 
      nodeGeometry: geo, 
      lineObjects: lines, 
      surfaceNodes: surfacePositions,
      coreConnections: coreLines 
    };
  }, []);
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.04;
      groupRef.current.rotation.x += delta * 0.016;
    }
    
    pulseRef.current += delta * 1.5;
    lineMaterialsRef.current.forEach((material, idx) => {
      const wave = Math.sin(pulseRef.current + idx * 0.12) * 0.5 + 0.5;
      const baseOpacity = idx < lineObjects.length ? 0.2 : 0.15;
      material.opacity = baseOpacity + wave * 0.4;
    });
    
    corePulseRef.current += delta;
    const t = corePulseRef.current;
    
    // Nucleus pulsing
    if (nucleusRef.current) {
      const scale = 1.0 + Math.sin(t * 3) * 0.08;
      nucleusRef.current.scale.setScalar(scale);
    }
    
    // Inner glow breathing
    if (innerGlowRef.current) {
      const scale = 1.0 + Math.sin(t * 2.5) * 0.12;
      innerGlowRef.current.scale.setScalar(scale);
      (innerGlowRef.current.material as THREE.MeshBasicMaterial).opacity = 
        0.5 + Math.sin(t * 2) * 0.2;
    }
    
    // Cell membrane pulsing
    if (membraneRef.current) {
      const scale = 1.0 + Math.sin(t * 1.8) * 0.06;
      membraneRef.current.scale.setScalar(scale);
      (membraneRef.current.material as THREE.MeshBasicMaterial).opacity = 
        0.25 + Math.sin(t * 2.2) * 0.1;
    }
    
    // Outer membrane
    if (outerMembraneRef.current) {
      const scale = 1.0 + Math.sin(t * 1.5 + 0.5) * 0.08;
      outerMembraneRef.current.scale.setScalar(scale);
      (outerMembraneRef.current.material as THREE.MeshBasicMaterial).opacity = 
        0.15 + Math.sin(t * 1.8) * 0.08;
    }
    
    // Halo rings rotation
    if (haloRing1Ref.current) {
      haloRing1Ref.current.rotation.z += delta * 0.8;
      haloRing1Ref.current.rotation.x = Math.sin(t * 0.5) * 0.2;
    }
    if (haloRing2Ref.current) {
      haloRing2Ref.current.rotation.z -= delta * 0.6;
      haloRing2Ref.current.rotation.y = Math.sin(t * 0.4) * 0.3;
    }
    if (haloRing3Ref.current) {
      haloRing3Ref.current.rotation.z += delta * 0.4;
      haloRing3Ref.current.rotation.x = Math.cos(t * 0.3) * 0.25;
    }
    
    // Data orbit
    if (dataOrbitRef.current) {
      dataOrbitRef.current.rotation.y += delta * 1.2;
      dataOrbitRef.current.rotation.z = Math.sin(t * 0.7) * 0.1;
    }
    
    // Electron orbit
    if (electronOrbitRef.current) {
      electronOrbitRef.current.rotation.x += delta * 0.9;
      electronOrbitRef.current.rotation.y += delta * 0.5;
    }
    
    // Pulse wave expanding with soft fade
    if (pulseWaveRef.current) {
      const wavePhase = (t * 0.6) % 1;
      const waveScale = 0.15 + wavePhase * 0.55;
      pulseWaveRef.current.scale.setScalar(waveScale);
      // Use eased falloff for softer dispersion
      const easedFade = Math.pow(1 - wavePhase, 2.5);
      (pulseWaveRef.current.material as THREE.ShaderMaterial).uniforms.uOpacity.value = easedFade * 0.35;
      (pulseWaveRef.current.material as THREE.ShaderMaterial).uniforms.uPhase.value = wavePhase;
    }
  });

  return (
    <group ref={groupRef}>
      {/* === INTELLIGENT CELL CORE === */}
      
      {/* Expanding pulse wave with soft radial fade */}
      <mesh ref={pulseWaveRef} position={[0, 0, 0]} material={pulseShaderMaterial}>
        <sphereGeometry args={[1, 48, 48]} />
      </mesh>
      
      {/* Outer membrane - translucent cell wall */}
      <mesh ref={outerMembraneRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.5, 48, 48]} />
        <meshBasicMaterial color="#0891b2" transparent opacity={0.15} wireframe />
      </mesh>
      
      {/* Middle membrane */}
      <mesh ref={membraneRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.38, 40, 40]} />
        <meshBasicMaterial color="#06b6d4" transparent opacity={0.25} />
      </mesh>
      
      {/* Inner glow layer */}
      <mesh ref={innerGlowRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.28, 32, 32]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.5} />
      </mesh>
      
      {/* Nucleus - bright core */}
      <mesh ref={nucleusRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.15, 24, 24]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.95} />
      </mesh>
      
      {/* Nucleus center - white hot */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      
      {/* === ORBITAL RINGS === */}
      
      {/* Halo ring 1 - equatorial */}
      <mesh ref={haloRing1Ref} position={[0, 0, 0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.42, 0.008, 16, 100]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} />
      </mesh>
      
      {/* Halo ring 2 - tilted */}
      <mesh ref={haloRing2Ref} position={[0, 0, 0]} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[0.48, 0.006, 16, 100]} />
        <meshBasicMaterial color="#06b6d4" transparent opacity={0.5} />
      </mesh>
      
      {/* Halo ring 3 - perpendicular */}
      <mesh ref={haloRing3Ref} position={[0, 0, 0]} rotation={[Math.PI / 2, Math.PI / 4, 0]}>
        <torusGeometry args={[0.55, 0.005, 16, 100]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.4} />
      </mesh>
      
      {/* === ORBITING DATA PARTICLES === */}
      
      {/* Data orbit group */}
      <group ref={dataOrbitRef}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle = (i / 6) * Math.PI * 2;
          const radius = 0.35;
          return (
            <mesh key={`data-${i}`} position={[
              Math.cos(angle) * radius,
              Math.sin(angle) * radius * 0.3,
              Math.sin(angle) * radius
            ]}>
              <sphereGeometry args={[0.025, 12, 12]} />
              <meshBasicMaterial color="#67e8f9" transparent opacity={0.9} />
            </mesh>
          );
        })}
      </group>
      
      {/* Electron orbit group */}
      <group ref={electronOrbitRef}>
        {[0, 1, 2, 3].map((i) => {
          const angle = (i / 4) * Math.PI * 2;
          const radius = 0.52;
          return (
            <mesh key={`electron-${i}`} position={[
              Math.cos(angle) * radius,
              Math.sin(angle) * radius,
              0
            ]}>
              <sphereGeometry args={[0.018, 10, 10]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
            </mesh>
          );
        })}
      </group>
      
      {/* Additional orbiting sparks */}
      <group rotation={[Math.PI / 6, 0, Math.PI / 4]}>
        {[0, 1, 2].map((i) => {
          const angle = (i / 3) * Math.PI * 2 + corePulseRef.current;
          const radius = 0.45;
          return (
            <mesh key={`spark-${i}`} position={[
              Math.cos(angle) * radius,
              0,
              Math.sin(angle) * radius
            ]}>
              <sphereGeometry args={[0.015, 8, 8]} />
              <meshBasicMaterial color="#a5f3fc" transparent opacity={0.8} />
            </mesh>
          );
        })}
      </group>
      
      {/* === NETWORK NODES AND CONNECTIONS === */}
      
      {/* Surface and relay nodes */}
      <points geometry={nodeGeometry}>
        <pointsMaterial size={0.05} color="#22d3ee" transparent opacity={0.85} sizeAttenuation />
      </points>
      
      {/* Network connections between nodes */}
      {lineObjects.map((line, idx) => (
        <primitive key={`neural-${idx}`} object={line} />
      ))}
      
      {/* Core-to-surface connections */}
      {coreConnections.map((line, idx) => (
        <primitive key={`core-${idx}`} object={line} />
      ))}
    </group>
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
  const seasonalTilt = useMemo(() => getSeasonalTilt(), []);
  
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={0.5} color="#22d3ee" />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color="#0ea5e9" />
        <group rotation={[seasonalTilt.x, 0, seasonalTilt.z]}>
          <NeuralNetwork />
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
