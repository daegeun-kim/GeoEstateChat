window.renderHistogram = function (containerSelector, values) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  const node = container.node();
  const outerWidth = node ? node.getBoundingClientRect().width : 600;
  const outerHeight = outerWidth * 0.5;

  const margin = { top: 10, right: 50, bottom: 20, left: 50 };
  const width = outerWidth - margin.left - margin.right;
  const height = outerHeight - margin.top - margin.bottom;

  const clean = values.filter(v => Number.isFinite(v));
  if (!clean.length) return;

  const sortedAll = clean.slice().sort((a, b) => a - b);
  const pctAll = p => {
    const idx = (p / 100) * (sortedAll.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedAll[lo];
    const t = idx - lo;
    return sortedAll[lo] * (1 - t) + sortedAll[hi] * t;
  };
  const statsAll = {
    min: sortedAll[0],
    p20: pctAll(20),
    p35: pctAll(35),
    median: pctAll(50),
    p75: pctAll(75),
    p90: pctAll(90),
    max: sortedAll[sortedAll.length - 1]
  };



  //----------------------------------------------
  //-----Conditional log scale determination------
  //----------------------------------------------

  const positives = clean.filter(v => v > 0);
  let scaleType = "linear";

  if (positives.length >= 30 && positives.length / clean.length >= 0.8) {
    const arr = positives.slice().sort((a, b) => a - b);
    const pctPos = p => {
      const idx = (p / 100) * (arr.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return arr[lo];
      const t = idx - lo;
      return arr[lo] * (1 - t) + arr[hi] * t;
    };
    const minPos = arr[0];
    const maxPos = arr[arr.length - 1];
    const medianPos = pctPos(50);
    const ratio = (medianPos - minPos) / (maxPos - minPos || 1);
    if (ratio < 0.2) scaleType = "log";
  }

  const used = scaleType === "log" && positives.length ? positives : clean;
  let minVal = d3.min(used);
  let maxVal = d3.max(used);
  if (minVal === maxVal) maxVal = minVal * 1.01;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${outerWidth} ${outerHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x =
    scaleType === "log"
      ? d3.scaleLog().domain([minVal, maxVal]).range([0, width])
      : d3.scaleLinear().domain([minVal, maxVal]).nice().range([0, width]);

  let bins;
  if (scaleType === "log") {
    const logMin = Math.log10(minVal);
    const logMax = Math.log10(maxVal);
    const N = 200;
    const edges = d3.range(N + 1).map(i =>
      Math.pow(10, logMin + (i / N) * (logMax - logMin))
    );
    bins = [];
    for (let i = 0; i < N; i++) {
      const x0 = edges[i];
      const x1 = edges[i + 1];
      const bucket = used.filter(v => v >= x0 && (i === N - 1 ? v <= x1 : v < x1));
      bins.push(Object.assign(bucket, { x0, x1, length: bucket.length }));
    }
  } else {
    bins = d3
      .bin()
      .domain([minVal, maxVal])
      .thresholds(200)(used);
  }

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(bins, d => d.length) || 1])
    .nice()
    .range([height, 0]);

  let colorScale = null;
  if (statsAll.max > statsAll.min) {
    colorScale = d3
      .scaleLinear()
      .domain([
        statsAll.min,
        statsAll.p20,
        statsAll.p35,
        statsAll.median,
        statsAll.p75,
        statsAll.p90,
        statsAll.max
      ])
      .range([
        "#ffffffff",
        "#f8ffbbff",
        "#99ff90ff",
        "#60faffff",
        "#0099ffff",
        "#0044ffff",
        "#a300eeff"
      ]);
  }


  //---------------------------------------------------------
  //---------------------- Histogram ------------------------
  //---------------------------------------------------------

  // ------ Gridlines (Y: horizontal) ------
  svg.append("g")
    .attr("class", "grid-y")
    .call(
      d3.axisLeft(y)
        .ticks(5)
        .tickSize(-width)
        .tickFormat("")
    )
    .call(g => g.selectAll("line").attr("stroke", "#202020"))
    .call(g => g.selectAll("path").remove());

  // ------ Gridlines (X: vertical) -------
  svg.append("g")
    .attr("class", "grid-x")
    .attr("transform", `translate(0,0)`)
    .call(
      d3.axisBottom(x)
        .ticks(6)
        .tickSize(height)
        .tickFormat("")
    )
    .call(g => g.selectAll("line").attr("stroke", "#202020"))
    .call(g => g.selectAll("path").remove());

  svg
    .selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", d => x(d.x0))
    .attr("y", d => y(d.length))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
    .attr("height", d => height - y(d.length))
    .attr("fill", d => {
      if (!colorScale) return "#ffffff";
      const mid = (d.x0 + d.x1) / 2;
      return colorScale(mid);
    })
    // .attr("opacity", 0.8);

  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.selectAll("text").attr("fill", "#d6d6d6").style("font-size", "12px"))
    .call(g => g.selectAll("line").attr("stroke", "#adadad"))
    .call(g => g.selectAll("path").attr("stroke", "#adadad"));

  svg
    .append("g")
    .call(d3.axisLeft(y).ticks(5))
    .call(g => g.selectAll("text").attr("fill", "#d6d6d6").style("font-size", "12px"))
    .call(g => g.selectAll("line").attr("stroke", "#353535"))
    .call(g => g.selectAll("path").attr("stroke", "#353535"));
  
    // ---------------------- Top boundary ----------------------
  svg.append("line")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", "#353535")
    .attr("stroke-width", 1);

  // ---------------------- Right boundary --------------------
  svg.append("line")
    .attr("x1", width)
    .attr("x2", width)
    .attr("y1", 0)
    .attr("y2", height)
    .attr("stroke", "#353535")
    .attr("stroke-width", 1);
};
