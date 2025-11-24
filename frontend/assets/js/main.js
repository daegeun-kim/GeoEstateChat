// ----- DOM references -----
const form = document.getElementById("query-form");
const input = document.getElementById("query-input");
const messageBox = document.getElementById("message-box");
const outputBox = document.getElementById("output-message");

// ----- Map source / layer ids -----
const buildingsSourceId = "buildings";
const buildingsLayerId = "buildings-fill";

// ----- Form submit → call backend, update map + explanation -----
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;

  messageBox.textContent = "data loading";
  outputBox.textContent = "";

  try {
    const res = await fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q })
    });

    const data = await res.json();
    console.log("DATA FROM BACKEND:", data);

    if (data.error) {
      if (map.getSource(buildingsSourceId)) {
        map.removeLayer(buildingsLayerId);
        map.removeSource(buildingsSourceId);
      }
      messageBox.textContent = data.error;
      outputBox.textContent = "";
      return;
    }

    const geojson = data.geojson;
    const explanation = data.explanation || "";
    messageBox.textContent = "";
    outputBox.textContent = explanation;

    let columnName = null;
    if (geojson && geojson.features && geojson.features.length > 0) {
      const props = geojson.features[0].properties || {};
      const keys = Object.keys(props);
      columnName = keys.length > 0 ? keys[0] : null;
    }

    if (!geojson || !columnName) {
      if (map.getSource(buildingsSourceId)) {
        map.removeLayer(buildingsLayerId);
        map.removeSource(buildingsSourceId);
      }
      messageBox.textContent = "no data returned";
      outputBox.textContent = "";
      return;
    }

    if (!map.isStyleLoaded()) {
      map.once("load", () => applyData(geojson, columnName));
    } else {
      applyData(geojson, columnName);
    }
  } catch (err) {
    console.error(err);
    if (map.getSource(buildingsSourceId)) {
      map.removeLayer(buildingsLayerId);
      map.removeSource(buildingsSourceId);
    }
    messageBox.textContent = "failed to retrieve data (frontend)";
    outputBox.textContent = "";
  }
});

// ----- Basic stats from GeoJSON for color ramp -----
function getStats(geojson, columnName) {
  const values = [];

  for (const f of geojson.features) {
    const v = Number(f.properties[columnName]);
    if (Number.isFinite(v)) values.push(v);
  }

  if (values.length === 0) return null;

  values.sort((a, b) => a - b);

  const min = values[0];
  const max = values[values.length - 1];

  function percentile(p) {
    const idx = (p / 100) * (values.length - 1);
    const low = Math.floor(idx);
    const high = Math.ceil(idx);

    if (low === high) return values[low];

    const t = idx - low;
    return values[low] * (1 - t) + values[high] * t;
  }

  const p25 = percentile(25);
  const p75 = percentile(75);
  const median = percentile(50);

  return { min, p25, median, p75, max };
}

// ----- Add / update buildings layer + color ramp -----
function applyData(geojson, columnName) {
  const stats = getStats(geojson, columnName);

  let fillColorExpr;
  if (stats) {
    fillColorExpr = [
      "interpolate",
      ["linear"],
      ["get", columnName],

      stats.min,    "#113579ff",
      stats.p25,    "#0eb3b3ff",
      stats.median, "#f3e962ff",
      stats.p75,    "#d62708ff",
      stats.max,    "#910000ff"
    ];
  } else {
    fillColorExpr = "#555555";
  }

  if (map.getSource(buildingsSourceId)) {
    map.getSource(buildingsSourceId).setData(geojson);
    map.setPaintProperty(buildingsLayerId, "fill-color", fillColorExpr);
  } else {
    map.addSource(buildingsSourceId, {
      type: "geojson",
      data: geojson
    });
    map.addLayer({
      id: buildingsLayerId,
      type: "fill",
      source: buildingsSourceId,
      paint: {
        "fill-color": fillColorExpr,
        "fill-opacity": 0.7
      }
    });
  }

  const bounds = getGeojsonBounds(geojson);
  if (bounds) {
    map.fitBounds(bounds, { padding: 20 });
  }
}

// ----- Compute bbox from GeoJSON -----
function getGeojsonBounds(geojson) {
  if (!geojson || !geojson.features || !geojson.features.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function extendCoords(coords) {
    for (const c of coords) {
      if (Array.isArray(c[0])) {
        extendCoords(c);
      } else {
        const x = c[0];
        const y = c[1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  for (const f of geojson.features) {
    if (!f.geometry || !f.geometry.coordinates) continue;
    extendCoords(f.geometry.coordinates);
  }

  if (minX === Infinity) return null;
  return [[minX, minY], [maxX, maxY]];
}
