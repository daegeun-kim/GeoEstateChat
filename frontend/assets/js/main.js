const form = document.getElementById("query-form");
const input = document.getElementById("query-input");
const messageBox = document.getElementById("message-box");

const buildingsSourceId = "buildings";
const buildingsLayerId = "buildings-fill";

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;

  messageBox.textContent = "data loading";

  try {
    const res = await fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q })
    });

    const data = await res.json();

    if (data.error) {
      if (map.getSource(buildingsSourceId)) {
        map.removeLayer(buildingsLayerId);
        map.removeSource(buildingsSourceId);
      }
      messageBox.textContent = data.error;
      return;
    }

    messageBox.textContent = "";

    const geojson = data.geojson;

    const applyData = () => {
      if (map.getSource(buildingsSourceId)) {
        map.getSource(buildingsSourceId).setData(geojson);
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
            "fill-color": "#555555",
            "fill-opacity": 0.7
          }
        });
      }

      const bounds = getGeojsonBounds(geojson);
      if (bounds) {
        map.fitBounds(bounds, { padding: 20 });
      }
    };

    if (!map.isStyleLoaded()) {
      map.once("load", applyData);
    } else {
      applyData();
    }
  } catch (err) {
    if (map.getSource(buildingsSourceId)) {
      map.removeLayer(buildingsLayerId);
      map.removeSource(buildingsSourceId);
    }
    messageBox.textContent = "failed to retrieve data";
  }
});

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
