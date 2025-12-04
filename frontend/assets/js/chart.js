window.renderHistogram = function (containerSelector, values) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  const node = container.node();
  const outerWidth = node ? node.getBoundingClientRect().width : 600;
  const outerHeight = outerWidth * 0.25;

  const margin = { top: 10, right: 20, bottom: 30, left: 40 };
  const width = outerWidth - margin.left - margin.right;
  const height = outerHeight - margin.top - margin.bottom;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${outerWidth} ${outerHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain(d3.extent(values))
    .nice()
    .range([0, width]);

  const bins = d3.bin()
    .domain(x.domain())
    .thresholds(500)(values);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .nice()
    .range([height, 0]);

  svg.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", d => x(d.x0))
    .attr("y", d => y(d.length))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
    .attr("height", d => height - y(d.length))
    .attr("fill", "white")
    .attr("opacity", 0.8);

  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.selectAll("text").attr("fill", "#ffffff"))
    .call(g => g.selectAll("line").attr("stroke", "#ffffff"))
    .call(g => g.selectAll("path").attr("stroke", "#ffffff"));

  svg.append("g")
    .call(d3.axisLeft(y).ticks(5))
    .call(g => g.selectAll("text").attr("fill", "#ffffff"))
    .call(g => g.selectAll("line").attr("stroke", "#ffffff"))
    .call(g => g.selectAll("path").attr("stroke", "#ffffff"));
}
