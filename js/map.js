/* map.js — карта улиц Кёнигсберга/Калининграда
   Leaflet + предзапечённая геометрия + кластеризация + canvas renderer */

(function () {
  'use strict';

  const STREETS_JSON = 'data/streets.json';
  const GEOMETRY_JSON = 'data/streets-geometry.json';
  const KALININGRAD = [54.7104, 20.4522];

  const statusEl = document.getElementById('map-status');
  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  /* ---------- карта ---------- */

  const map = L.map('map', {
    center: KALININGRAD,
    zoom: 13,
    zoomControl: true,
    scrollWheelZoom: true,
    attributionControl: false,
    preferCanvas: true
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  L.control.attribution({ prefix: false })
    .addAttribution('&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>')
    .addTo(map);

  /* ---------- кластеризация ---------- */

  const markers = L.markerClusterGroup({
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    animate: true,
    animateAddingMarkers: false,
    maxClusterRadius: 60,
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      const size = count < 10 ? 36 : count < 30 ? 44 : 52;
      return L.divIcon({
        className: 'street-cluster',
        html: '<div class="street-cluster-inner" style="width:' + size + 'px;height:' + size + 'px">' + count + '</div>',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
    }
  });

  /* ---------- маркер ---------- */

  function makeIcon() {
    return L.divIcon({
      className: 'street-marker',
      html: '<div class="street-marker-inner"><span>&#10070;</span></div>',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -20]
    });
  }

  /* ---------- утилиты ---------- */

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]);
    });
  }

  function popupHtml(street) {
    const oldName = street.oldName
      ? '<div class="map-popup-old">' + escapeHtml(street.oldName) + '</div>'
      : '';
    const desc = street.shortDesc
      ? '<p class="map-popup-desc">' + escapeHtml(street.shortDesc) + '</p>'
      : '';
    return '<div class="map-popup">' +
      '<div class="map-popup-name">' + escapeHtml(street.name) + '</div>' +
      oldName + desc +
      '<a class="map-popup-link" href="' + escapeHtml(street.page) + '">Читать историю &rarr;</a>' +
      '</div>';
  }

  /* ---------- подсветка улицы ---------- */

  function bindHighlight(marker, segments) {
    const lines = segments.map(function (seg) {
      return L.polyline(seg, {
        color: '#b8860b',
        weight: 8,
        opacity: 0,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      }).addTo(map);
    });

    const isMobile = window.innerWidth < 768;
    const popupOpacity = isMobile ? 0.95 : 0.85;
    const popupWeight  = isMobile ? 12   : 8;

    marker.on('mouseover', function () {
      lines.forEach(function (l) { l.setStyle({ opacity: 0.75, weight: 8 }); });
    });
    marker.on('mouseout', function () {
      lines.forEach(function (l) { l.setStyle({ opacity: 0, weight: 8 }); });
    });
    marker.on('popupopen', function () {
      lines.forEach(function (l) { l.setStyle({ opacity: popupOpacity, weight: popupWeight }); });
    });
    marker.on('popupclose', function () {
      lines.forEach(function (l) { l.setStyle({ opacity: 0, weight: 8 }); });
    });
  }

  /* ---------- инициализация ---------- */

  async function init() {
    let streets, geometry;
    try {
      const [sRes, gRes] = await Promise.all([
        fetch(STREETS_JSON),
        fetch(GEOMETRY_JSON)
      ]);
      if (!sRes.ok) throw new Error('streets.json ' + sRes.status);
      if (!gRes.ok) throw new Error('streets-geometry.json ' + gRes.status);
      streets = await sRes.json();
      geometry = await gRes.json();
    } catch (err) {
      setStatus('Не удалось загрузить данные');
      console.error('[map]', err);
      return;
    }

    const allSegments = [];
    const highlightQueue = []; // для прогрессивной прорисовки линий

    /* Фаза 1: маркеры — мгновенно */
    streets.forEach(function (street) {
      const geo = geometry[street.name];
      if (!geo || !geo.center) {
        console.warn('[map] Нет центра для:', street.name);
        return;
      }

      const marker = L.marker(geo.center, { icon: makeIcon() });
      const isMobile = window.innerWidth < 768;
      marker.bindPopup(popupHtml(street), {
        maxWidth: isMobile ? 240 : 300,
        autoPanPaddingTopLeft: [20, 80],
        autoPanPaddingBottomRight: [20, 100]
      });

      markers.addLayer(marker);

      if (geo.segments && geo.segments.length) {
        allSegments.push.apply(allSegments, geo.segments);
        highlightQueue.push({ marker: marker, segments: geo.segments });
      }
    });

    map.addLayer(markers);

    if (allSegments.length) {
      const bounds = L.latLngBounds(allSegments.flat());
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }

    setStatus('Улиц на карте: ' + streets.length);

    /* Фаза 2: полилинии — прогрессивно, после отрисовки маркеров */
    if (highlightQueue.length) {
      requestAnimationFrame(function () {
        // разбиваем на чанки чтобы не блокировать рендер
        const CHUNK = 5;
        let i = 0;
        function processChunk() {
          const end = Math.min(i + CHUNK, highlightQueue.length);
          for (; i < end; i++) {
            bindHighlight(highlightQueue[i].marker, highlightQueue[i].segments);
          }
          if (i < highlightQueue.length) {
            requestAnimationFrame(processChunk);
          }
        }
        processChunk();
      });
    }
  }

  init();
})();
