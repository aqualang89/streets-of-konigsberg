/* map.js — карта улиц Кёнигсберга/Калининграда на Leaflet + Overpass API */

(function () {
  'use strict';

  const STREETS_JSON = 'data/streets.json';
  const KALININGRAD = [54.7104, 20.4522];
  const OVERPASS_URLS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];

  // Кеш в localStorage — экономит запросы
  const CACHE_PREFIX = 'kgsbrg_streets_v1_';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

  function getCached(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > CACHE_TTL) return null;
      return obj.data;
    } catch { return null; }
  }
  function setCached(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }

  const statusEl = document.getElementById('map-status');
  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  const map = L.map('map', {
    center: KALININGRAD,
    zoom: 13,
    zoomControl: true,
    scrollWheelZoom: true,
    attributionControl: false
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  L.control.attribution({ prefix: false })
    .addAttribution('&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>')
    .addTo(map);

  function makeIcon() {
    return L.divIcon({
      className: 'street-marker',
      html: '<div class="street-marker-inner"><span>&#10070;</span></div>',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -20]
    });
  }

  function cleanStreetName(name) {
    return name.replace(/^(ул\.|улица|просп\.|проспект|пер\.|переулок)\s*/i, '').trim();
  }

  async function runOverpass(query) {
    let lastErr;
    for (const url of OVERPASS_URLS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      } catch (err) {
        lastErr = err;
        console.warn('[map] Overpass ' + url + ' не отвечает, пробую следующий');
      }
    }
    throw lastErr || new Error('Все Overpass-серверы недоступны');
  }

  // Один запрос на все улицы сразу через union
  async function fetchStreetsBatch(streetNames) {
    if (!streetNames.length) return {};

    const cleanNames = streetNames.map(cleanStreetName);
    const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');

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
      console.error('[map] Overpass batch error:', err);
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

  function centroid(segments) {
    let sumLat = 0, sumLon = 0, count = 0;
    segments.forEach(seg => seg.forEach(pt => {
      sumLat += pt[0]; sumLon += pt[1]; count++;
    }));
    if (!count) return null;
    return [sumLat / count, sumLon / count];
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"]/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    }[c]));
  }

  function popupHtml(street) {
    const oldName = street.oldName
      ? `<div class="map-popup-old">${escapeHtml(street.oldName)}</div>`
      : '';
    const desc = street.shortDesc
      ? `<p class="map-popup-desc">${escapeHtml(street.shortDesc)}</p>`
      : '';
    return `
      <div class="map-popup">
        <div class="map-popup-name">${escapeHtml(street.name)}</div>
        ${oldName}
        ${desc}
        <a class="map-popup-link" href="${escapeHtml(street.page)}">Читать историю &rarr;</a>
      </div>
    `;
  }

  function plotStreet(street, segments, allSegments) {
    if (!segments || !segments.length) return false;

    const lines = segments.map(seg =>
      L.polyline(seg, {
        color: '#b8860b',
        weight: 8,
        opacity: 0,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      }).addTo(map)
    );

    const center = centroid(segments);
    if (!center) return false;
    allSegments.push(...segments);

    const marker = L.marker(center, { icon: makeIcon() }).addTo(map);
    const isMobile = window.innerWidth < 768;
    marker.bindPopup(popupHtml(street), {
      maxWidth: isMobile ? 240 : 300,
      autoPanPaddingTopLeft: [20, 80],
      autoPanPaddingBottomRight: [20, 100]
    });

    const popupOpacity = isMobile ? 0.95 : 0.85;
    const popupWeight  = isMobile ? 12   : 8;

    marker.on('mouseover', () => lines.forEach(l => l.setStyle({ opacity: 0.75, weight: 8 })));
    marker.on('mouseout',  () => lines.forEach(l => l.setStyle({ opacity: 0, weight: 8 })));
    marker.on('popupopen',  () => lines.forEach(l => l.setStyle({ opacity: popupOpacity, weight: popupWeight })));
    marker.on('popupclose', () => lines.forEach(l => l.setStyle({ opacity: 0, weight: 8 })));

    return true;
  }

  async function init() {
    let streets;
    try {
      const res = await fetch(STREETS_JSON);
      streets = await res.json();
    } catch (err) {
      setStatus('Не удалось загрузить данные об улицах');
      return;
    }

    const allSegments = [];
    let plotted = 0;
    const needFetch = [];

    // Кеш — мгновенный рендер
    for (const street of streets) {
      const cached = getCached(street.name);
      if (cached) {
        if (plotStreet(street, cached, allSegments)) plotted++;
      } else {
        needFetch.push(street.name);
      }
    }

    if (!needFetch.length) {
      finishInit(plotted, allSegments);
      return;
    }

    setStatus(plotted > 0
      ? `Загрузка ${needFetch.length} улиц...`
      : `Поиск улиц на карте (${needFetch.length})...`);

    const fetched = await fetchStreetsBatch(needFetch);

    for (const street of streets) {
      if (!needFetch.includes(street.name)) continue;
      const segments = fetched[street.name];
      if (segments && segments.length) {
        setCached(street.name, segments);
        if (plotStreet(street, segments, allSegments)) plotted++;
      } else {
        console.warn('[map] Улица не найдена:', street.name);
      }
    }

    finishInit(plotted, allSegments);
  }

  function finishInit(plotted, allSegments) {
    if (plotted === 0) {
      setStatus('Улицы пока не найдены на карте');
      return;
    }
    setStatus(`Улиц на карте: ${plotted}`);
    if (allSegments.length) {
      const bounds = L.latLngBounds(allSegments.flat());
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
  }

  init();
})();
