const form = document.getElementById("query-form");
const input = document.getElementById("query-input");
const outputBox = document.getElementById("output-message");

const singleMapDiv = document.getElementById("map");
const mapLeftDiv = document.getElementById("map-left");
const mapRightDiv = document.getElementById("map-right");

const buildingsSourceId = "buildings";
const buildingsLayerId = "buildings-fill";
const leftSourceId = "buildings-left";
const rightSourceId = "buildings-right";
const leftLayerId = "buildings-fill-left";
const rightLayerId = "buildings-fill-right";

let currentMode = null;
let geojson = null;
let geojsonList = null;
let explanation = "";
let columnName = null;

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
      clearAllSources();
      outputBox.textContent = data.error;
      return;
    }

    const mode = data.mode || "analyze";
    currentMode = mode;

    if (mode === "compare") {
      enableCompareLayout();
      handleCompareData(data);
    } else {
      enableSingleLayout();
      handleSingleData(data);
    }

  } catch (err) {
    console.error(err);
    clearAllSources();
    outputBox.textContent = "failed to retrieve data (frontend)";
  }
});

function enableSingleLayout() {
  if (singleMapDiv) singleMapDiv.style.display = "block";
  if (mapLeftDiv) mapLeftDiv.style.display = "none";
  if (mapRightDiv) mapRightDiv.style.display = "none";
  if (map) map.resize();
}

function enableCompareLayout() {
  if (singleMapDiv) singleMapDiv.style.display = "none";
  if (mapLeftDiv) mapLeftDiv.style.display = "block";
  if (mapRightDiv) mapRightDiv.style.display = "block";
  if (mapLeft) mapLeft.resize();
  if (mapRight) mapRight.resize();
}

function clearAllSources() {
  if (typeof map !== "undefined" && map && map.getSource(buildingsSourceId)) {
    map.removeLayer(buildingsLayerId);
    map.removeSource(buildingsSourceId);
  }
  if (typeof mapLeft !== "undefined" && mapLeft && mapLeft.getSource(leftSourceId)) {
    mapLeft.removeLayer(leftLayerId);
    mapLeft.removeSource(leftSourceId);
  }
  if (typeof mapRight !== "undefined" && mapRight && mapRight.getSource(rightSourceId)) {
    mapRight.removeLayer(rightLayerId);
    mapRight.removeSource(rightSourceId);
  }
}

function handleSingleData(data) {
  geojson = data.geojson;
  explanation = data.explanation || "";
  columnName = data.column || getColumnName(geojson);
  updateSingleView();
}

function handleCompareData(data) {
  geojsonList = data.geojson || [];
  const expl = data.explanation || [];
  explanation = Array.isArray(expl) ? expl.join("\n\n") : expl || "";
  const g0 = geojsonList[0];
  const g1 = geojsonList[1];
  columnName =
    data.column ||
    (g0 && getColumnName(g0)) ||
    (g1 && getColumnName(g1)) ||
    null;
  updateCompareView();
}

function getColumnName(geojsonObj) {
  if (!geojsonObj || !geojsonObj.features || !geojsonObj.features.length) return null;
  const props = geojsonObj.features[0].properties || {};
  const keys = Object.keys(props);
  return keys.length ? keys[0] : null;
}

function updateSingleView() {
  if (!geojson) {
    if (typeof map !== "undefined" && map && map.getSource(buildingsSourceId)) {
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
    map.once("load", () => applyDataSingle(geojson, col));
  } else {
    applyDataSingle(geojson, col);
  }
}

function updateCompareView() {
  if (!geojsonList || geojsonList.length < 3) {
    clearAllSources();
    outputBox.textContent = "no data returned for compare mode";
    return;
  }

  const statsSource = geojsonList[0];
  const col = columnName;
  if (!col || !statsSource) {
    clearAllSources();
    outputBox.textContent = "no column found for compare mode";
    return;
  }

  outputBox.textContent = explanation;

  const stats = getStats(statsSource, col);
  let fillColorExpr;

  if (stats) {
    fillColorExpr = [
      "interpolate",
      ["linear"],
      ["get", col],
      stats.min,    "#0038a0ff",
      stats.p25,    "#03d4e3ff",
      stats.median, "#edeabfff",
      stats.p75,    "#e27871ff",
      stats.max,    "#b20000ff"
    ];
  } else {
    fillColorExpr = "#555";
  }

  const gLeft = geojsonList[1];
  const gRight = geojsonList[2];

  if (!gLeft || !gRight) {
    clearAllSources();
    outputBox.textContent = "invalid geojson payload for compare mode";
    return;
  }

  applyDataCompare(gLeft, gRight, col, fillColorExpr);
}

function getStats(geojsonObj, col) {
  const values = [];
  for (const f of geojsonObj.features) {
    const v = Number(f.properties[col]);
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

function applyDataSingle(geojsonObj, col) {
  const stats = getStats(geojsonObj, col);

  let fillColorExpr;
  if (stats) {
    fillColorExpr = [
      "interpolate",
      ["linear"],
      ["get", col],
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
    map.getSource(buildingsSourceId).setData(geojsonObj);
    map.setPaintProperty(buildingsLayerId, "fill-color", fillColorExpr);
  } else {
    map.addSource(buildingsSourceId, {
      type: "geojson",
      data: geojsonObj
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

  const bounds = getGeojsonBounds(geojsonObj);
  if (bounds) map.fitBounds(bounds, { padding: 20 });
}

function applyDataCompare(geojsonLeftData, geojsonRightData, col, fillColorExpr) {
  if (mapLeft.getSource(leftSourceId)) {
    mapLeft.getSource(leftSourceId).setData(geojsonLeftData);
    mapLeft.setPaintProperty(leftLayerId, "fill-color", fillColorExpr);
  } else {
    mapLeft.addSource(leftSourceId, {
      type: "geojson",
      data: geojsonLeftData
    });
    mapLeft.addLayer({
      id: leftLayerId,
      type: "fill",
      source: leftSourceId,
      paint: {
        "fill-color": fillColorExpr,
        "fill-opacity": 0.7
      }
    });
  }

  if (mapRight.getSource(rightSourceId)) {
    mapRight.getSource(rightSourceId).setData(geojsonRightData);
    mapRight.setPaintProperty(rightLayerId, "fill-color", fillColorExpr);
  } else {
    mapRight.addSource(rightSourceId, {
      type: "geojson",
      data: geojsonRightData
    });
    mapRight.addLayer({
      id: rightLayerId,
      type: "fill",
      source: rightSourceId,
      paint: {
        "fill-color": fillColorExpr,
        "fill-opacity": 0.7
      }
    });
  }

  const boundsLeft = getGeojsonBounds(geojsonLeftData);
  const boundsRight = getGeojsonBounds(geojsonRightData);

  if (boundsLeft) mapLeft.fitBounds(boundsLeft, { padding: 20 });
  if (boundsRight) mapRight.fitBounds(boundsRight, { padding: 20 });
}

function getGeojsonBounds(geojsonObj) {
  if (!geojsonObj || !geojsonObj.features || !geojsonObj.features.length) return null;

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

  for (const f of geojsonObj.features) {
    if (f.geometry && f.geometry.coordinates) extend(f.geometry.coordinates);
  }

  if (minX === Infinity) return null;
  return [[minX, minY], [maxX, maxY]];
}
