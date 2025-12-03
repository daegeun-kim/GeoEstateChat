// ----- DOM references -----
const form = document.getElementById("query-form");
const input = document.getElementById("query-input");
const outputBox = document.getElementById("output-message");

// ----- Map source / layer ids / setup -----
const buildingsSourceId = "buildings";
const buildingsLayerId = "buildings-fill";

let geojson = null;
let explanation = "";
let columnName = null;

// ----- Form submit → call backend, update map + explanation -----
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;

  outputBox.textContent = "data loading";

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
      outputBox.textContent = data.error;
      return;
    }

    geojson = data.geojson;
    explanation = data.explanation || "";
    columnName = data.column || getColumnName(geojson);

    updateView();

  } catch (err) {
    console.error(err);
    if (map.getSource(buildingsSourceId)) {
      map.removeLayer(buildingsLayerId);
      map.removeSource(buildingsSourceId);
    }
    outputBox.textContent = "failed to retrieve data (frontend)";
  }
});

function getColumnName(geojson) {
  if (!geojson || !geojson.features || !geojson.features.length) return null;
  const props = geojson.features[0].properties || {};
  const keys = Object.keys(props);
  return keys.length ? keys[0] : null;
}

function updateView() {
  if (!geojson) {
    if (map.getSource(buildingsSourceId)) {
      map.removeLayer(buildingsLayerId);
      map.removeSource(buildingsSourceId);
    }
    outputBox.textContent = "no data returned";
    return;
  }

  const col = columnName || getColumnName(geojson);
  if (!col) {
    outputBox.textContent = "no column found";
    return;
  }

  outputBox.textContent = explanation;

  if (!map.isStyleLoaded()) {
    map.once("load", () => applyData(geojson, col));
  } else {
    applyData(geojson, col);
  }
}

// ----- Basic stats from GeoJSON for color ramp -----
function getStats(geojson, columnName) {
  const values = [];
  for (const f of geojson.features) {
    const v = Number(f.properties[columnName]);
    if (Number.isFinite(v)) values.push(v);
  }
  if (!values.length) return null;

  values.sort((a, b) => a - b);

  const min = values[0];
  const max = values[values.length - 1];

  function percentile(p) {
    const idx = (p / 100) * (values.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return values[lo];
    const t = idx - lo;
    return values[lo] * (1 - t) + values[hi] * t;
  }

  return {
    min,
    p25: percentile(25),
    median: percentile(50),
    p75: percentile(75),
    max
  };
}

function applyData(geojson, columnName) {
  const stats = getStats(geojson, columnName);

  let fillColorExpr;
  if (stats) {
    fillColorExpr = [
      "interpolate",
      ["linear"],
      ["get", columnName],
      stats.min,    "#0038a0ff",
      stats.p25,    "#03d4e3ff",
      stats.median, "#edeabfff",
      stats.p75,    "#e27871ff",
      stats.max,    "#b20000ff"
    ];
  } else {
    fillColorExpr = "#555";
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
  if (bounds) map.fitBounds(bounds, { padding: 20 });
}

function getGeojsonBounds(geojson) {
  if (!geojson || !geojson.features || !geojson.features.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function extend(coords) {
    for (const c of coords) {
      if (Array.isArray(c[0])) extend(c);
      else {
        const x = c[0], y = c[1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  for (const f of geojson.features) {
    if (f.geometry && f.geometry.coordinates) extend(f.geometry.coordinates);
  }

  if (minX === Infinity) return null;
  return [[minX, minY], [maxX, maxY]];
}
