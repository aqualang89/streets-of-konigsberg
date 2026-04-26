/* map.js — карта улиц Кёнигсберга/Калининграда на Leaflet + Overpass API */

(function () {
  'use strict';

  const STREETS_JSON = 'data/streets.json';
  const KALININGRAD = [54.7104, 20.4522];
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

  const statusEl = document.getElementById('map-status');
  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  // Карта
  const map = L.map('map', {
    center: KALININGRAD,
    zoom: 13,
    zoomControl: true,
    scrollWheelZoom: true,
    attributionControl: false
  });

  // OSM Standard — русские названия. Сепия-фильтр через CSS.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  // Своя атрибуция без флага Leaflet
  L.control.attribution({ prefix: false })
    .addAttribution('&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>')
    .addTo(map);

  // Готический маркер — стилизованная инициал/корона
  function makeIcon() {
    return L.divIcon({
      className: 'street-marker',
      html: '<div class="street-marker-inner"><span>&#10070;</span></div>',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -20]
    });
  }

  // Чистка названия улицы для Overpass
  function cleanStreetName(name) {
    return name.replace(/^(ул\.|улица|просп\.|проспект|пер\.|переулок)\s*/i, '').trim();
  }

  async function runOverpass(query) {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    if (!res.ok) throw new Error('Overpass HTTP ' + res.status);
    return res.json();
  }

  async function fetchStreetGeometry(streetName) {
    const cleanName = cleanStreetName(streetName);

    // Через relation города (надёжно)
    const queryArea = `[out:json][timeout:25];
      relation["name"="Калининград"]["place"="city"];
      map_to_area->.kgd;
      way["highway"]["name"~"${cleanName}",i](area.kgd);
      out tags geom;`;

    // Fallback: узкий bbox самого города
    const KGD_NARROW_BBOX = '54.65,20.32,54.77,20.59';
    const queryBbox = `[out:json][timeout:25];
      way["highway"]["name"~"${cleanName}",i](${KGD_NARROW_BBOX});
      out tags geom;`;

    let data = null;
    try {
      data = await runOverpass(queryArea);
      if (!data.elements || !data.elements.length) {
        data = await runOverpass(queryBbox);
      }
    } catch (err) {
      console.error('Overpass error for', streetName, err);
      try { data = await runOverpass(queryBbox); } catch (e) { return null; }
    }

    if (!data || !data.elements || !data.elements.length) return null;

    const ways = data.elements.filter(el => el.type === 'way' && el.geometry);

    // Точное совпадение названия — отсекает похожие улицы
    const expected = [
      'улица ' + cleanName,
      'ул. ' + cleanName,
      'проспект ' + cleanName,
      'просп. ' + cleanName,
      cleanName
    ].map(s => s.toLowerCase());

    let matched = ways.filter(w => {
      const n = (w.tags && w.tags.name || '').toLowerCase();
      return expected.includes(n);
    });

    if (!matched.length) {
      const re = new RegExp('(^|\\s)' + cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|\\s)', 'i');
      matched = ways.filter(w => re.test(w.tags && w.tags.name || ''));
    }

    if (!matched.length) return null;
    return matched.map(w => w.geometry.map(g => [g.lat, g.lon]));
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

  async function init() {
    let streets;
    try {
      const res = await fetch(STREETS_JSON);
      streets = await res.json();
    } catch (err) {
      setStatus('Не удалось загрузить данные об улицах');
      return;
    }

    setStatus(`Поиск улиц на карте (${streets.length})...`);

    let plotted = 0;
    const allSegments = [];

    for (const street of streets) {
      const segments = await fetchStreetGeometry(street.name);
      if (!segments || !segments.length) {
        console.warn('Улица не найдена:', street.name);
        continue;
      }

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
      if (!center) continue;
      allSegments.push(...segments);

      const marker = L.marker(center, { icon: makeIcon() }).addTo(map);
      marker.bindPopup(popupHtml(street), { maxWidth: 300 });

      marker.on('mouseover', () => lines.forEach(l => l.setStyle({ opacity: 0.75 })));
      marker.on('mouseout',  () => lines.forEach(l => l.setStyle({ opacity: 0 })));
      marker.on('popupopen',  () => lines.forEach(l => l.setStyle({ opacity: 0.85 })));
      marker.on('popupclose', () => lines.forEach(l => l.setStyle({ opacity: 0 })));

      plotted++;
    }

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
