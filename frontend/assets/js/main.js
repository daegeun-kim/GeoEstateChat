//---------------------- DOM references ----------------------
const form = document.getElementById("query-form");
const input = document.getElementById("query-input");
const outputBox = document.getElementById("output-message");

const singleMapDiv = document.getElementById("map");
const mapLeftDiv = document.getElementById("map-left");
const mapRightDiv = document.getElementById("map-right");

//---------------------- Map source / layer ids ----------------------
const buildingsSourceId = "buildings";
const buildingsLayerId = "buildings-fill";
const leftSourceId = "buildings-left";
const rightSourceId = "buildings-right";
const leftLayerId = "buildings-fill-left";
const rightLayerId = "buildings-fill-right";

//---------------------- Global state ----------------------
let currentMode = null;
let geojson = null;
let geojsonList = null;
let explanation = "";
let columnName = null;
let scale = null;

//---------------------- Chat UI helpers ----------------------
function appendMessage(text, type) {
  const msg = document.createElement("div");
  msg.classList.add("chat-message");
  if (type === "user") {
    msg.classList.add("chat-message-user");
  } else {
    msg.classList.add("chat-message-bot");
  }
  msg.textContent = text;
  outputBox.appendChild(msg);
  outputBox.scrollTop = outputBox.scrollHeight;
}

//---------------------- Debug cache restore (charts only) ----------------------
const analyzeCache = localStorage.getItem("analyzeCache");

if (analyzeCache) {
  const cache = JSON.parse(analyzeCache);
  currentMode = "analyze";
  columnName = cache.column || null;
  explanation = cache.explanation || "";
  scale = cache.scale || null;
  enableSingleLayout();
  if (explanation) {
    appendMessage(explanation, "bot");
  }

  if (window.renderHistogram && Array.isArray(cache.values) && cache.values.length) {
    window.renderHistogram("#chart1", cache.values);
  }
}

//---------------------- Form submit handler ----------------------
form.addEventListener("submit", async e => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;

  appendMessage(q, "user");
  input.value = "";

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
      appendMessage(data.error, "bot");
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
    appendMessage("failed to retrieve data (frontend)", "bot");
  }
});

//---------------------- Layout toggles ----------------------
function enableSingleLayout() {
  if (singleMapDiv) singleMapDiv.style.display = "block";
  if (mapLeftDiv) mapLeftDiv.style.display = "none";
  if (mapRightDiv) mapRightDiv.style.display = "none";
  if (typeof map !== "undefined" && map) map.resize();
}

function enableCompareLayout() {
  if (singleMapDiv) singleMapDiv.style.display = "none";
  if (mapLeftDiv) mapLeftDiv.style.display = "block";
  if (mapRightDiv) mapRightDiv.style.display = "block";
  if (typeof mapLeft !== "undefined" && mapLeft) mapLeft.resize();
  if (typeof mapRight !== "undefined" && mapRight) mapRight.resize();
}

//---------------------- Clear all map sources ----------------------
function clearAllSources() {
  if (typeof map !== "undefined" && map && map.getSource(buildingsSourceId)) {
    if (map.getLayer(buildingsLayerId)) map.removeLayer(buildingsLayerId);
    map.removeSource(buildingsSourceId);
  }
  if (typeof mapLeft !== "undefined" && mapLeft && mapLeft.getSource(leftSourceId)) {
    if (mapLeft.getLayer(leftLayerId)) mapLeft.removeLayer(leftLayerId);
    mapLeft.removeSource(leftSourceId);
  }
  if (typeof mapRight !== "undefined" && mapRight && mapRight.getSource(rightSourceId)) {
    if (mapRight.getLayer(rightLayerId)) mapRight.removeLayer(rightLayerId);
    mapRight.removeSource(rightSourceId);
  }
}

//---------------------- Single-mode handler ----------------------
function handleSingleData(data) {
  geojson = data.geojson;
  explanation = data.explanation || "";
  columnName = data.column || getColumnName(geojson);
  scale = data.scale || null;
  updateSingleView();
}

//---------------------- Compare-mode handler ----------------------
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

//---------------------- Helper: infer column name ----------------------
function getColumnName(geojsonObj) {
  if (!geojsonObj || !geojsonObj.features || !geojsonObj.features.length) return null;
  const props = geojsonObj.features[0].properties || {};
  const keys = Object.keys(props);
  return keys.length ? keys[0] : null;
}

//---------------------- Update single view (map + charts) ----------------------
function updateSingleView() {
  if (!geojson) {
    if (typeof map !== "undefined" && map && map.getSource(buildingsSourceId)) {
      if (map.getLayer(buildingsLayerId)) map.removeLayer(buildingsLayerId);
      map.removeSource(buildingsSourceId);
    }
    appendMessage("no data returned", "bot");
    return;
  }

  const col = columnName || getColumnName(geojson);
  if (!col) {
    appendMessage("no column found", "bot");
    return;
  }

  if (explanation) {
    appendMessage(explanation, "bot");
  }

  let valuesForCache = [];

  if (currentMode === "analyze" && window.renderHistogram) {
    const values = geojson.features
      .map(f => f.properties && f.properties[col])
      .filter(v => typeof v === "number" && !Number.isNaN(v));

    if (values.length) {
      window.renderHistogram("#chart1", values);
      valuesForCache = values.slice(0, 5000);
    }
  }

  if (
    currentMode === "analyze" &&
    window.renderNeighborhoodRanking &&
    geojson &&
    Array.isArray(geojson.features) &&
    col &&
    scale
  ) {
    window.renderNeighborhoodRanking(
      "#chart2",
      geojson.features,
      col,
      scale
    );
  }

  if (currentMode === "analyze") {
    const cacheObj = {
      column: col,
      values: valuesForCache,
      explanation: explanation,
      scale: scale
    };
    try {
      localStorage.setItem("analyzeCache", JSON.stringify(cacheObj));
    } catch (e) {
      console.warn("Failed to update analyzeCache:", e);
    }
  }

  if (typeof map !== "undefined" && map) {
    if (!map.isStyleLoaded()) {
      map.once("load", () => applyDataSingle(geojson, col));
    } else {
      applyDataSingle(geojson, col);
    }
  } else {
    console.warn("Map instance not available when updateSingleView ran");
  }
}

//---------------------- Update compare view (maps only) ----------------------
function updateCompareView() {
  if (!geojsonList || geojsonList.length < 3) {
    clearAllSources();
    appendMessage("no data returned for compare mode", "bot");
    return;
  }

  const statsSource = geojsonList[0];
  const col = columnName;
  if (!col || !statsSource) {
    clearAllSources();
    appendMessage("no column found for compare mode", "bot");
    return;
  }

  if (explanation) {
    appendMessage(explanation, "bot");
  }

  const stats = getStats(statsSource, col);
  let fillColorExpr;

  if (stats) {
    const rampExpr = [
      "interpolate",
      ["linear"],
      ["get", col],
      stats.min, "#ffffffff",
      stats.p20, "#f8ffbbff",
      stats.p35, "#99ff90ff",
      stats.median, "#60faffff",
      stats.p75, "#0099ffff",
      stats.p90, "#0044ffff",
      stats.max, "#a300eeff"
    ];
    fillColorExpr = [
      "case",
      ["==", ["get", col], 0],
      "#002555ff",
      rampExpr
    ];
  } else {
    fillColorExpr = "#555";
  }

  const gLeft = geojsonList[1];
  const gRight = geojsonList[2];

  if (!gLeft || !gRight) {
    clearAllSources();
    appendMessage("invalid geojson payload for compare mode", "bot");
    return;
  }

  applyDataCompare(gLeft, gRight, col, fillColorExpr);
}

//---------------------- Helper: stats for color ramp ----------------------
function getStats(geojsonObj, col) {
  const positiveValues = [];
  for (const f of geojsonObj.features) {
    const v = Number(f.properties[col]);
    if (Number.isFinite(v) && v > 0) positiveValues.push(v);
  }
  if (!positiveValues.length) return null;

  positiveValues.sort((a, b) => a - b);

  function percentile(p) {
    const idx = (p / 100) * (positiveValues.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return positiveValues[lo];
    const t = idx - lo;
    return positiveValues[lo] * (1 - t) + positiveValues[hi] * t;
  }

  return {
    min: positiveValues[0],
    p20: percentile(20),
    p35: percentile(35),
    median: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
    max: positiveValues[positiveValues.length - 1]
  };
}

//---------------------- Apply data: single map ----------------------
function applyDataSingle(geojsonObj, col) {
  const stats = getStats(geojsonObj, col);

  let fillColorExpr;
  if (stats) {
    const rampExpr = [
      "interpolate",
      ["linear"],
      ["get", col],
      stats.min, "#ffffffff",
      stats.p20, "#f8ffbbff",
      stats.p35, "#99ff90ff",
      stats.median, "#60faffff",
      stats.p75, "#0099ffff",
      stats.p90, "#0044ffff",
      stats.max, "#a300eeff"
    ];
    fillColorExpr = [
      "case",
      ["==", ["get", col], 0],
      "#757575ff",
      rampExpr
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

//---------------------- Apply data: compare maps ----------------------
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

//---------------------- Helper: GeoJSON bounds ----------------------
function getGeojsonBounds(geojsonObj) {
  if (!geojsonObj || !geojsonObj.features || !geojsonObj.features.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function extend(coords) {
    for (const c of coords) {
      if (Array.isArray(c[0])) {
        extend(c);
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

  for (const f of geojsonObj.features) {
    if (f.geometry && f.geometry.coordinates) extend(f.geometry.coordinates);
  }

  if (minX === Infinity) return null;
  return [[minX, minY], [maxX, maxY]];
}
