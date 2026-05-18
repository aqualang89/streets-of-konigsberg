/* fetch-streets.mjs — предзапекание геометрии улиц из Overpass API */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const STREETS_JSON = path.join(ROOT, 'data', 'streets.json');
const OUTPUT_JSON = path.join(ROOT, 'data', 'streets-geometry.json');

const OVERPASS_URLS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

const TOLERANCE = 0.00005; // ~5-6 метров в Калининграде

/* ---------- helpers ---------- */

function cleanStreetName(name) {
  return name.replace(/^(ул\.|улица|просп\.|проспект|пер\.|переулок)\s*/i, '').trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');
}

async function runOverpass(query) {
  let lastErr;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'streets-of-konigsberg-fetcher/1.0'
        },
        body: 'data=' + encodeURIComponent(query)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    } catch (err) {
      lastErr = err;
      console.warn('  Overpass не отвечает:', url, '- пробую следующий');
    }
  }
  throw lastErr || new Error('Все Overpass-серверы недоступны');
}

/* ---------- Douglas-Peucker ---------- */

function perpendicularDistance(p, start, end) {
  const [x, y] = p;
  const [x1, y1] = start;
  const [x2, y2] = end;

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
  }

  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const clampedT = Math.max(0, Math.min(1, t));
  const projX = x1 + clampedT * dx;
  const projY = y1 + clampedT * dy;

  return Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
}

function simplify(points, tolerance) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplify(points.slice(0, maxIdx + 1), tolerance);
    const right = simplify(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

function centroid(segments) {
  let sumLat = 0, sumLon = 0, count = 0;
  segments.forEach(seg => seg.forEach(pt => {
    sumLat += pt[0]; sumLon += pt[1]; count++;
  }));
  if (!count) return null;
  return [sumLat / count, sumLon / count];
}

/* ---------- Overpass batch ---------- */

async function fetchStreetsBatch(streetNames) {
  if (!streetNames.length) return {};

  const cleanNames = streetNames.map(cleanStreetName);
  const buildUnion = (suffix) => cleanNames.flatMap(n => [
    `way["highway"]["name"~"${escapeRe(n)}",i]${suffix};`,
    `way["highway"]["name:ru"~"${escapeRe(n)}",i]${suffix};`,
    `way["highway"]["alt_name"~"${escapeRe(n)}",i]${suffix};`
  ]).join('\n      ');

  const queryArea = `[out:json][timeout:30];
    relation["name"="Калининград"]["place"="city"];
    map_to_area->.kgd;
    (
    ${buildUnion('(area.kgd)')}
    );
    out tags geom;`;

  const KGD_NARROW_BBOX = '54.65,20.32,54.77,20.59';
  const queryBbox = `[out:json][timeout:30];
    (
    ${buildUnion(`(${KGD_NARROW_BBOX})`)}
    );
    out tags geom;`;

  let data = null;
  try {
    data = await runOverpass(queryArea);
    if (!data.elements || !data.elements.length) {
      data = await runOverpass(queryBbox);
    }
  } catch (err) {
    console.error('Overpass batch error:', err.message);
    try { data = await runOverpass(queryBbox); } catch { return {}; }
  }

  if (!data || !data.elements) return {};

  const ways = data.elements.filter(el => el.type === 'way' && el.geometry);
  const result = {};

  streetNames.forEach((streetName, idx) => {
    const cleanName = cleanNames[idx];
    const expected = [
      'улица ' + cleanName,
      'ул. ' + cleanName,
      'проспект ' + cleanName,
      'просп. ' + cleanName,
      cleanName,
      streetName,
      streetName.replace(/проспект/i, 'просп.'),
      streetName.replace(/просп\./i, 'проспект')
    ].map(s => s.toLowerCase());

    let matched = ways.filter(w => {
      const n = (w.tags && w.tags.name || '').toLowerCase();
      const nRu = (w.tags && w.tags['name:ru'] || '').toLowerCase();
      return expected.includes(n) || expected.includes(nRu);
    });

    if (!matched.length) {
      const re = new RegExp('(^|\\s)' + escapeRe(cleanName) + '($|\\s)', 'i');
      matched = ways.filter(w => {
        const n = w.tags && w.tags.name || '';
        const nRu = w.tags && w.tags['name:ru'] || '';
        return re.test(n) || re.test(nRu);
      });
    }

    result[streetName] = matched.map(w => w.geometry.map(g => [g.lat, g.lon]));
  });

  return result;
}

/* ---------- main ---------- */

async function main() {
  console.log('Читаю streets.json...');
  const streets = JSON.parse(fs.readFileSync(STREETS_JSON, 'utf-8'));
  console.log(`  Найдено улиц: ${streets.length}`);

  const names = streets.map(s => s.name);
  console.log('Запрашиваю геометрию из Overpass...');

  const fetched = await fetchStreetsBatch(names);

  const output = {};
  let found = 0;
  let totalPointsBefore = 0;
  let totalPointsAfter = 0;

  for (const street of streets) {
    const rawSegments = fetched[street.name];
    if (!rawSegments || !rawSegments.length) {
      console.warn(`  Не найдена: ${street.name}`);
      continue;
    }

    const segments = rawSegments.map(seg => {
      totalPointsBefore += seg.length;
      const simplified = simplify(seg, TOLERANCE);
      totalPointsAfter += simplified.length;
      return simplified;
    });

    const center = centroid(segments);

    output[street.name] = {
      id: street.id,
      segments,
      center
    };
    found++;
    console.log(`  ✓ ${street.name} — ${rawSegments.length} сегментов, точек: ${totalPointsBefore} → ${totalPointsAfter}`);
  }

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));
  console.log(`\nСохранено: ${OUTPUT_JSON}`);
  console.log(`Улиц найдено: ${found}/${streets.length}`);
  console.log(`Всего точек: ${totalPointsBefore} → ${totalPointsAfter} (${Math.round(totalPointsAfter / totalPointsBefore * 100)}%)`);
}

main().catch(err => {
  console.error('Ошибка:', err);
  process.exit(1);
});
