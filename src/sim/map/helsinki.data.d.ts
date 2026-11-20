// The shape of helsinki.data.js, which tools/bake_helsinki.py generates from OpenStreetMap (map data © OpenStreetMap
// contributors, ODbL 1.0). Typed by hand so the compiler never has to read 600 KB of numbers.
// All coordinates are game px: 16 px per metre, x east, y south, (0, 0) at the north-west corner.
export declare const HKI: {
  credit: string; // the attribution ODbL asks for; it ships inside the data, where a minifier cannot strip it
  W: number; H: number; ppm: number; center: [lat: number, lon: number];
  roads: number[][];     // [width, flags, x, y, x, y, …]; flags: 1 = cars drive here, 2 = one way, 4 = one way against the drawn direction
  walks: number[][];     // footways and paths: [width, x, y, …]
  areas: number[][];     // paved squares: [x, y, …]
  rails: number[][];     // [1 for a tram track (0: railway), x, y, …]
  buildings: number[][]; // [height, x, y, …], the outline not closed
  water: number[][]; coast: number[][]; parks: number[][]; piers: number[][];
  seaSeeds: number[];    // x, y, …: points on the sea side of the coastlines
  trees: number[]; lamps: number[]; crossings: number[]; // x, y, …
  shops: [brand: string, street: string, no: string, x: number, y: number, nx: number, ny: number][]; // the door, and the wall's outward normal
  houses: [street: string, no: string, x: number, y: number, nx: number, ny: number][];
  kidsHome: number;      // index into houses
  avanto: [x: number, y: number]; statue: [x: number, y: number];
};
