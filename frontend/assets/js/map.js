const map = new maplibregl.Map({
        container: 'map',
        style: 'assets/js/style.json',
        center: [-74, 40.7],
        zoom: 9.5
    });

const mapLeft = new maplibregl.Map({
        container: 'map-left',
        style: 'assets/js/style.json',
        center: [-74, 40.7],
        zoom: 9.5
    });

const mapRight = new maplibregl.Map({
        container: 'map-right',
        style: 'assets/js/style.json',
        center: [-74, 40.7],
        zoom: 9.5
    });

// map.scrollZoom.disable();
// map.boxZoom.disable();
// map.dragRotate.disable();
// map.dragPan.disable();
// map.keyboard.disable();
// map.doubleClickZoom.disable();
// map.touchZoomRotate.disable();

window.map = map;