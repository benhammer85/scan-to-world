// Real terrain: a planet's own elevation map, from NASA's Planetary Data System, averaged down to a
// 1° grid (360 × 180 heights, in metres, north first, from longitude 0 eastwards) and written as a
// module the game reads (src/volcano/real/<name>.ts). The maps are public domain.
//
//   node scripts/terrain.mjs moon ldem_4.img   (LRO LOLA, 4 px/°, 16-bit little-endian, ½ m units)
//   node scripts/terrain.mjs mars megt90n000cb.img   (MGS MOLA MEGDR, 4 px/°, 16-bit big-endian, metres)
//
// Moon: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_4.img
// Mars: https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/megt90n000cb.img
import { readFileSync, writeFileSync } from 'node:fs';

const [name, file] = process.argv.slice(2);
const FORMAT = { moon: { little: true, scale: 0.5, source: 'LRO LOLA, LDEM_4' }, mars: { little: false, scale: 1, source: 'MGS MOLA, MEGDR megt90n000cb' } }[name];
if (!FORMAT || !file) throw new Error('usage: node scripts/terrain.mjs <moon|mars> <file.img>');
const raw = readFileSync(file), W = 1440, H = 720, by = 4, w = W / by, h = H / by;
const at = (x, y) => { const i = (y * W + x) * 2; return (FORMAT.little ? raw.readInt16LE(i) : raw.readInt16BE(i)) * FORMAT.scale; };
const out = new Int16Array(w * h);
let lo = Infinity, hi = -Infinity;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  let s = 0;
  for (let j = 0; j < by; j++) for (let i = 0; i < by; i++) s += at(x * by + i, y * by + j);
  const m = Math.round(s / (by * by));
  out[y * w + x] = m; lo = Math.min(lo, m); hi = Math.max(hi, m);
}
const b64 = Buffer.from(out.buffer).toString('base64');
writeFileSync(`src/volcano/real/${name}.ts`, `// ${name[0].toUpperCase() + name.slice(1)}'s real heights (${FORMAT.source}, NASA PDS, public domain), averaged to a 1° grid by
// scripts/terrain.mjs: ${w} × ${h} heights in metres, as 16-bit integers (little-endian), north first, from
// longitude 0 eastwards. From ${lo} m to ${hi} m.
export default { w: ${w}, h: ${h}, data: '${b64}' };
`);
console.log(name, w, h, lo, hi, b64.length);
