//--------------------------------------------------------------------
//-------------------------- DOM references --------------------------
//--------------------------------------------------------------------
const form = document.getElementById("query-form");
const input = document.getElementById("query-input");
const outputBox = document.getElementById("output-message");
const resetBtn = document.getElementById("reset");

const singleMapDiv = document.getElementById("map");
const mapLeftDiv = document.getElementById("map-left");
const mapRightDiv = document.getElementById("map-right");
const singleMapContainer = document.getElementById("single-map-container");
const compareMapContainer = document.getElementById("compare-map-container");



//--------------------------------------------------------------------
//---------------------- Map source / layer ids ----------------------
//--------------------------------------------------------------------
const buildingsSourceId = "buildings";
const buildingsLayerId = "buildings-fill";
const leftSourceId = "buildings-left";
const rightSourceId = "buildings-right";
const leftLayerId = "buildings-fill-left";
const rightLayerId = "buildings-fill-right";

//--------------------------------------------------------------------
//--------------------------- Global state ---------------------------
//--------------------------------------------------------------------
let currentMode = null;
let geojson = null;
let geojsonList = null;
let explanation = "";
let columnName = null;
let scale = null;
let chatHistory = [];
let dtype = null;

//--------------------------------------------------------------------
//------------------------- Chat UI helpers --------------------------
//--------------------------------------------------------------------
function appendMessage(text, type) {
  console.log("[appendMessage]", { type, text });
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

//--------------------------------------------------------------------
//---------------- Debug cache restore (charts only) -----------------
//--------------------------------------------------------------------
const analyzeCache = localStorage.getItem("analyzeCache");
console.log("[cache] analyzeCache raw:", analyzeCache);

if (analyzeCache) {
  const cache = JSON.parse(analyzeCache);
  console.log("[cache] parsed:", cache);
  currentMode = cache.mode || "analyze";
  columnName = cache.column || null;
  explanation = cache.explanation || "";
  scale = cache.scale || null;
  dtype = cache.dtype || null;

  console.log("[cache] restoring UI from cache", {
    currentMode,
    columnName,
    scale,
    dtype
  });

  enableSingleLayout();
  if (explanation) {
    appendMessage(explanation, "bot");
  }

  if (window.renderChart1 && Array.isArray(cache.values) && cache.values.length && dtype) {
    console.log("[cache] restoring chart1 with", cache.values.length, "values");
    window.renderChart1("#chart1", cache.values, currentMode, dtype);
  }
  if (window.renderChart2 && Array.isArray(cache.values) && cache.values.length && scale) {
    console.log("[cache] restoring chart2 with", cache.values.length, "values");
    window.renderChart2("#chart2", cache.values, columnName || cache.column, scale, currentMode, dtype);
  }
} else {
  console.log("[cache] no analyzeCache found");
}



//--------------------------------------------------------------------
//----------------------- Form submit handler ------------------------
//--------------------------------------------------------------------
form.addEventListener("submit", async e => {
  e.preventDefault();
  const q = input.value.trim();
  console.log("[submit] form submitted with query:", q);
  if (!q) {
    console.warn("[submit] empty query, ignoring");
    return;
  }

  appendMessage(q, "user");
  input.value = "";

  try {
    console.log("[submit] sending request to backend /analyze");
    const res = await fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, history: chatHistory })
    });

    console.log("[submit] response status:", res.status);
    const data = await res.json();
    console.log("[submit] DATA FROM BACKEND:", data);

    if (data.error) {
      console.warn("[submit] backend returned error:", data.error);
      clearAllSources();
      appendMessage(data.error, "bot");
      return;
    }

    const mode = data.mode || "analyze";
    currentMode = mode;
    console.log("[submit] mode from backend:", mode);

    if (mode === "compare") {
      enableCompareLayout();
      handleCompareData(data);
    } else {
      enableSingleLayout();
      handleSingleData(data);
    }
  } catch (err) {
    console.error("[submit] fetch error:", err);
    clearAllSources();
    appendMessage("failed to retrieve data (frontend)", "bot");
  }
});

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    console.log("[reset] reset button clicked");
    if (outputBox) {
      outputBox.innerHTML = "";
    }
    chatHistory = [];
    currentMode = null;
    geojson = null;
    geojsonList = null;
    explanation = "";
    columnName = null;
    scale = null;
    dtype = null;

    try {
      console.log("[reset] removing analyzeCache from localStorage");
      localStorage.removeItem("analyzeCache");
    } catch (e) {
      console.warn("[reset] Failed to clear analyzeCache:", e);
    }
    clearAllSources();
    const chart1 = document.getElementById("chart1");
    if (chart1) chart1.innerHTML = "";
    const chart2 = document.getElementById("chart2");
    if (chart2) chart2.innerHTML = "";
  });
} else {
  console.warn("[reset] resetBtn not found in DOM");
}


//--------------------------------------------------------------------
//-------------------------- Layout toggles --------------------------
//--------------------------------------------------------------------
function enableSingleLayout() {
  console.log("[layout] enableSingleLayout");
  if (typeof singleMapContainer !== "undefined" && singleMapContainer) {
    singleMapContainer.style.display = "block";
  }
  if (compareMapContainer) compareMapContainer.style.display = "none";
  if (singleMapDiv) singleMapDiv.style.display = "block";
  if (mapLeftDiv) mapLeftDiv.style.display = "none";
  if (mapRightDiv) mapRightDiv.style.display = "none";
  if (typeof map !== "undefined" && map) {
    console.log("[layout] resizing single map");
    map.resize();
  } else {
    console.warn("[layout] map not available in enableSingleLayout");
  }
}

function enableCompareLayout() {
  console.log("[layout] enableCompareLayout");
  if (typeof singleMapContainer !== "undefined" && singleMapContainer) {
    singleMapContainer.style.display = "none";
  }
  if (compareMapContainer) compareMapContainer.style.display = "flex";
  if (singleMapDiv) singleMapDiv.style.display = "none";
  if (mapLeftDiv) mapLeftDiv.style.display = "block";
  if (mapRightDiv) mapRightDiv.style.display = "block";
  if (typeof mapLeft !== "undefined" && mapLeft) {
    console.log("[layout] resizing left map");
    mapLeft.resize();
  } else {
    console.warn("[layout] mapLeft not available in enableCompareLayout");
  }
  if (typeof mapRight !== "undefined" && mapRight) {
    console.log("[layout] resizing right map");
    mapRight.resize();
  } else {
    console.warn("[layout] mapRight not available in enableCompareLayout");
  }
}



//--------------------------------------------------------------------
//---------------------- Clear all map sources -----------------------
//--------------------------------------------------------------------
function clearAllSources() {
  console.log("[map] clearAllSources called");
  if (typeof map !== "undefined" && map && map.getSource(buildingsSourceId)) {
    console.log("[map] clearing main map source/layer");
    if (map.getLayer(buildingsLayerId)) map.removeLayer(buildingsLayerId);
    map.removeSource(buildingsSourceId);
  }
  if (typeof mapLeft !== "undefined" && mapLeft && mapLeft.getSource(leftSourceId)) {
    console.log("[map] clearing left map source/layer");
    if (mapLeft.getLayer(leftLayerId)) mapLeft.removeLayer(leftLayerId);
    mapLeft.removeSource(leftSourceId);
  }
  if (typeof mapRight !== "undefined" && mapRight && mapRight.getSource(rightSourceId)) {
    console.log("[map] clearing right map source/layer");
    if (mapRight.getLayer(rightLayerId)) mapRight.removeLayer(rightLayerId);
    mapRight.removeSource(rightSourceId);
  }
}

//--------------------------------------------------------------------
//----------------------- Single-mode handler ------------------------
//--------------------------------------------------------------------
function handleSingleData(data) {
  console.log("[single] handleSingleData", data);
  geojson = data.geojson;
  explanation = data.explanation || "";
  columnName = data.column || getColumnName(geojson);
  scale = data.scale || null;
  dtype = data.dtype || null;
  console.log("[single] parsed fields", {
    columnName,
    scale,
    dtype,
    explanationExists: !!explanation
  });
  updateSingleView();
}

//--------------------------------------------------------------------
//---------------------- Compare-mode handler ------------------------
//--------------------------------------------------------------------
function handleCompareData(data) {
  console.log("[compare] data.geojson shape:", Array.isArray(data.geojson), data.geojson);
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
  dtype = data.dtype || null;

  console.log("[compare] parsed fields", {
    geojsonListLength: geojsonList.length,
    columnName,
    dtype,
    explanationExists: !!explanation
  });
  updateCompareView();
}

//--------------------------------------------------------------------
//-------------------- Helper: infer column name ---------------------
//--------------------------------------------------------------------
function getColumnName(geojsonObj) {
  console.log("[helper] getColumnName called");
  if (!geojsonObj || !geojsonObj.features || !geojsonObj.features.length) {
    console.warn("[helper] getColumnName: invalid geojsonObj");
    return null;
  }
  const props = geojsonObj.features[0].properties || {};
  const keys = Object.keys(props);
  const col = keys.length ? keys[0] : null;
  console.log("[helper] inferred column name:", col);
  return col;
}

//---------------------- Update single view (map + charts) ----------------------
function updateSingleView() {
  console.log("[single] updateSingleView start", {
    hasGeojson: !!geojson,
    currentMode,
    dtype,
    columnName
  });

  if (!geojson) {
    console.warn("[single] no geojson in updateSingleView");
    if (typeof map !== "undefined" && map && map.getSource(buildingsSourceId)) {
      if (map.getLayer(buildingsLayerId)) map.removeLayer(buildingsLayerId);
      map.removeSource(buildingsSourceId);
    }
    appendMessage("no data returned", "bot");
    return;
  }

  const col = columnName || getColumnName(geojson);
  if (!col) {
    console.warn("[single] no column found for styling");
    appendMessage("no column found", "bot");
    return;
  }

  if (explanation) {
    appendMessage(explanation, "bot");
  }

  let valuesForCache = [];

  if ((currentMode === "analyze" || currentMode === "search") && window.renderChart1 && dtype) {
    console.log("[single] preparing data for chart1");
    const rawValues = geojson.features
      .map(f => f.properties && f.properties[col]);

    let valuesForChart = [];

    if (dtype === "numeric") {
      valuesForChart = rawValues.filter(v => typeof v === "number" && Number.isFinite(v));
    }
    if (dtype === "categorical") {
      valuesForChart = rawValues.filter(v => v != null && v !== "");
    }

    console.log("[single] chart1 values length:", valuesForChart.length);

    if (valuesForChart.length) {
      window.renderChart1("#chart1", valuesForChart, currentMode, dtype);
      valuesForCache = valuesForChart.slice(0, 5000);
    }
  }

  if (
    (currentMode === "analyze" || currentMode === "search") &&
    window.renderChart2 &&
    geojson &&
    Array.isArray(geojson.features) &&
    col &&
    scale
  ) {
    console.log("[single] rendering chart2", {
      featuresLength: geojson.features.length,
      col,
      scale,
      currentMode
    });
    window.renderChart2(
      "#chart2",
      geojson.features,
      col,
      scale,
      currentMode,
      dtype
    );
  }

  if ((currentMode === "analyze" || currentMode === "search")) {
    const cacheObj = {
      column: col,
      values: valuesForCache,
      explanation: explanation,
      scale: scale,
      mode: currentMode,
      dtype: dtype
    };
    console.log("[single] updating analyzeCache", cacheObj);
    try {
      localStorage.setItem("analyzeCache", JSON.stringify(cacheObj));
    } catch (e) {
      console.warn("[single] Failed to update analyzeCache:", e);
    }
  }

  if (typeof map !== "undefined" && map) {
    console.log("[single] applying data to map, styleLoaded:", map.isStyleLoaded());
    if (!map.isStyleLoaded()) {
      map.once("load", () => {
        console.log("[single] map load event fired, applying data");
        applyDataSingle(geojson, col, currentMode, dtype);
      });
    } else {
      applyDataSingle(geojson, col, currentMode, dtype);
    }
  } else {
    console.warn("[single] Map instance not available when updateSingleView ran");
  }
}

//--------------------------------------------------------------------
//------------------ Update compare view (maps only) -----------------
//--------------------------------------------------------------------

function updateCompareView() {
  console.log("[compare] updateCompareView start", {
    geojsonListLength: geojsonList ? geojsonList.length : 0,
    columnName,
    dtype
  });

  if (!geojsonList || geojsonList.length < 3) {
    console.warn("[compare] insufficient geojsonList");
    clearAllSources();
    appendMessage("no data returned for compare mode", "bot");
    return;
  }

  const statsSource = geojsonList[0];
  const col = columnName;
  if (!col || !statsSource) {
    console.warn("[compare] no column or statsSource");
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
    console.log("[compare] stats for color ramp:", stats);
    const rampExpr = [
      "interpolate",
      ["linear"],
      ["get", col],
      stats.min, "#ffffffff",
      stats.p20, "#fffd9cff",
      stats.p35, "#7dff7dff",
      stats.median, "#60faffff",
      stats.p80, "#27a9ffff",
      stats.p90, "#0044ffff",
      stats.p97, "#7300ffff",
      stats.max, "#b600eeff"
    ];
    fillColorExpr = [
      "case",
      ["==", ["get", col], 0],
      "#002555ff",
      rampExpr
    ];
  } else {
    console.warn("[compare] getStats returned null, using flat color");
    fillColorExpr = "#555";
  }

  const gLeft = geojsonList[1];
  const gRight = geojsonList[2];

  if (!gLeft || !gRight) {
    console.warn("[compare] invalid left/right geojson");
    clearAllSources();
    appendMessage("invalid geojson payload for compare mode", "bot");
    return;
  }

  if (window.renderChart1 && dtype === "numeric") {
    const values1 = gLeft.features
      .map(f => f.properties && f.properties[col])
      .filter(v => typeof v === "number" && Number.isFinite(v));

    const values2 = gRight.features
      .map(f => f.properties && f.properties[col])
      .filter(v => typeof v === "number" && Number.isFinite(v));

    console.log("[compare] chart1 values lengths:", {
      values1: values1.length,
      values2: values2.length
    });

    if (values1.length && values2.length) {
      window.renderChart1("#chart1", [values1, values2], "compare", dtype);
    }
  }

  applyDataCompare(gLeft, gRight, col, fillColorExpr);
}


//--------------------------------------------------------------------
//------------------- Helper: stats for color ramp -------------------
//--------------------------------------------------------------------
function getStats(geojsonObj, col) {
  console.log("[stats] getStats called for column:", col);
  const positiveValues = [];
  for (const f of geojsonObj.features) {
    const v = Number(f.properties[col]);
    if (Number.isFinite(v) && v > 0) positiveValues.push(v);
  }
  console.log("[stats] positiveValues length:", positiveValues.length);
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

  const result = {
    min: positiveValues[0],
    p20: percentile(20),
    p35: percentile(35),
    median: percentile(50),
    p80: percentile(75),
    p90: percentile(90),
    p97: percentile(97),
    max: positiveValues[positiveValues.length - 1]
  };
  console.log("[stats] computed stats:", result);
  return result;
}

//--------------------------------------------------------------------
//---------------------- Apply data: map -----------------------------
//--------------------------------------------------------------------

function applyDataSingle(geojsonObj, col, mode, dtype) {
  console.log("[map] applyDataSingle", {
    col,
    mode,
    dtype,
    featureCount: geojsonObj && geojsonObj.features ? geojsonObj.features.length : 0
  });

  let fillColorExpr = "#555";

  //------------------ ANALYZE or SEARCH + NUMERIC ------------------------
  if ((mode === "analyze" || mode === "search") && dtype === "numeric") {
    const stats = getStats(geojsonObj, col);

    if (stats) {
      console.log("[map] using numeric ramp with stats:", stats);
      const rampExpr = [
        "interpolate",
        ["linear"],
        ["get", col],
        stats.min, "#ffffffff",
        stats.p20, "#fffd9cff",
        stats.p35, "#7dff7dff",
        stats.median, "#60faffff",
        stats.p80, "#27a9ffff",
        stats.p90, "#0044ffff",
        stats.p97, "#7300ffff",
        stats.max, "#b600eeff"
      ];

      fillColorExpr = [
        "case",
        ["==", ["get", col], 0],
        "#757575ff",
        rampExpr
      ];
    } else {
      console.warn("[map] stats is null for numeric analyze, keeping default fillColorExpr");
    }
  }


  //---------------- ANALYZE or SEARCH + CATEGORICAL ----------------------
  if ((mode === "analyze" || mode === "search" ) && dtype === "categorical") {
    console.log("[map] building categorical match expression");
    const countsMap = new Map();
    for (const f of geojsonObj.features || []) {
      if (!f.properties) continue;
      const v = f.properties[col];
      if (v == null || v === "") continue;
      countsMap.set(v, (countsMap.get(v) || 0) + 1);
    }

    const counts = Array.from(countsMap.entries()).sort((a, b) => b[1] - a[1]);
    console.log("[map] category counts:", counts);

    if (counts.length) {
      const baseColors = [
        "#ff7474ff",
        "#55dce6ff",
        "#3986ebff",
        "#ddc763ff",
        "#76df84ff",
        "#7652b9ff",
        "#a300eeff",
        "#ff7a62ff",
        "#f3e962ff",
        "#00c896ff"
      ];

      const matchExpr = ["match", ["to-string", ["get", col]]];

      counts.forEach((pair, i) => {
        const cat = pair[0];
        const key = String(cat);
        let color;
        if (i < baseColors.length) {
          color = baseColors[i];
        } else {
          const r = Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
          const g = Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
          const b = Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
          color = `#${r}${g}${b}ff`;
        }
        matchExpr.push(key, color);
      });

      matchExpr.push("#757575ff");
      fillColorExpr = matchExpr;
    } else {
      console.warn("[map] no categories found, keeping default fillColorExpr");
    }
  }


  //---------------- APPLY SOURCE + LAYER -----------------------
  if (map.getSource(buildingsSourceId)) {
    console.log("[map] updating existing buildings source");
    map.getSource(buildingsSourceId).setData(geojsonObj);
    map.setPaintProperty(buildingsLayerId, "fill-color", fillColorExpr);
  } else {
    console.log("[map] adding new buildings source/layer");
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

  //---------------------- FIT TO DATA ---------------------------
  const bounds = getGeojsonBounds(geojsonObj);
  console.log("[map] computed bounds:", bounds);
  if (bounds) map.fitBounds(bounds, { padding: 20 });
}

//--------------------------------------------------------------------
//---------------------- Apply data: compare maps --------------------
//--------------------------------------------------------------------
function applyDataCompare(geojsonLeftData, geojsonRightData, col, fillColorExpr) {
  console.log("[compare] applyDataCompare entered", {
    col,
    leftFeatures: geojsonLeftData && geojsonLeftData.features ? geojsonLeftData.features.length : 0,
    rightFeatures: geojsonRightData && geojsonRightData.features ? geojsonRightData.features.length : 0,
    hasMapLeft: typeof mapLeft !== "undefined" && !!mapLeft,
    hasMapRight: typeof mapRight !== "undefined" && !!mapRight
  });

  if (!mapLeft || !mapRight) {
    console.warn("[compare] mapLeft or mapRight missing");
    return;
  }

  if (mapLeft.getSource(leftSourceId)) {
    console.log("[compare] updating left source");
    mapLeft.getSource(leftSourceId).setData(geojsonLeftData);
    mapLeft.setPaintProperty(leftLayerId, "fill-color", fillColorExpr);
  } else {
    console.log("[compare] adding left source/layer");
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
    console.log("[compare] updating right source");
    mapRight.getSource(rightSourceId).setData(geojsonRightData);
    mapRight.setPaintProperty(rightLayerId, "fill-color", fillColorExpr);
  } else {
    console.log("[compare] adding right source/layer");
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
  console.log("[compare] boundsLeft:", boundsLeft, "boundsRight:", boundsRight);

  if (boundsLeft) mapLeft.fitBounds(boundsLeft, { padding: 20 });
  if (boundsRight) mapRight.fitBounds(boundsRight, { padding: 20 });
}



//--------------------------------------------------------------------
//---------------------- Helper: GeoJSON bounds ----------------------
//--------------------------------------------------------------------
function getGeojsonBounds(geojsonObj) {
  console.log("[bounds] getGeojsonBounds called");
  if (!geojsonObj || !geojsonObj.features || !geojsonObj.features.length) {
    console.warn("[bounds] invalid or empty geojsonObj");
    return null;
  }

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

  if (minX === Infinity) {
    console.warn("[bounds] no valid coordinates found");
    return null;
  }
  const result = [[minX, minY], [maxX, maxY]];
  console.log("[bounds] computed bounds:", result);
  return result;
}
