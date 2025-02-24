require([
  "esri/Map",
  "esri/views/SceneView",
  "esri/layers/CSVLayer",
  "esri/layers/FeatureLayer",
  "esri/Basemap",
  "esri/core/watchUtils"
], function(Map, SceneView, CSVLayer, FeatureLayer, Basemap, watchUtils) {
  const countryBorders = new FeatureLayer({
    url:
      "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/World_Countries_(Generalized)/FeatureServer/0",
    renderer: {
      type: "simple",
      symbol: {
        type: "polygon-3d",
        symbolLayers: [
          {
            type: "fill",
            outline: {
              color: [255, 255, 255, 0.3],
              size: 1
            }
          }
        ]
      }
    }
  });

  const plateTectonicBorders = new FeatureLayer({
    url: "https://services2.arcgis.com/cFEFS0EWrhfDeVw9/arcgis/rest/services/plate_tectonics_boundaries/FeatureServer",
    elevationInfo: {
      mode: "on-the-ground"
    },
    renderer: {
      type: "simple",
      symbol: {
        type: "line-3d",
        symbolLayers: [
          {
            type: "line",
            material: { color: [255, 255, 255, 0.8] },
            size: 2
          }
        ]
      }
    }
  });

  const map = new Map({
    ground: {
      opacity: 0,
      navigationConstraint: "none"
    },
    basemap: new Basemap({
      baseLayers: [countryBorders, plateTectonicBorders]
    })
  });

  // the view associated with the map has a transparent background
  // so that we can apply a CSS shadow filter for the glow
  const view = new SceneView({
    container: "view-container",
    qualityProfile: "high",
    map: map,
    alphaCompositingEnabled: true,
    environment: {
      background: {
        type: "color",
        color: [0, 0, 0, 0]
      },
      starsEnabled: false,
      atmosphereEnabled: false
    },
    ui: {
      components: []
    },
    highlightOptions: {
      color: "cyan"
    },
    padding: {
      bottom: 200
    },
    popup: {
      collapseEnabled: false,
      dockEnabled: false,
      dockOptions: {
        breakpoint: false
      }
    },
    camera: {
      position: [
        -105.61273180,
        3.20596275,
        13086004.69753
      ],
      heading: 0.24,
      tilt: 0.16
    }
  });

  const exaggeratedElevation = {
    mode: "absolute-height",
    featureExpressionInfo: {
      expression: "-$feature.depth * 6"
    },
    unit: "kilometers"
  };

  const realElevation = {
    mode: "absolute-height",
    featureExpressionInfo: {
      expression: "-$feature.depth"
    },
    unit: "kilometers"
  };
  let exaggerated = true;

  // define the earthquakes layer
  const earthquakeLayer = new CSVLayer({
    url: "./eq_image.csv",
    elevationInfo: exaggeratedElevation,
    screenSizePerspectiveEnabled: false,
    renderer: {
      type: "simple",
      symbol: {
        type: "point-3d",
        symbolLayers: [
          {
            type: "object",
            resource: {
              primitive: "sphere"
            },
            material: { color: [255, 250, 239, 0.8] },
            depth: 10000,
            height: 10000,
            width: 10000
          }
        ]
      },
      visualVariables: [
        {
          type: "size",
          field: "mag",
          axis: "all",
          stops: [
            { value: 5.5, size: 70000, label: "<15%" },
            { value: 7, size: 250000, label: "25%" }
          ]
        },
        {
          type: "color",
          field: "mag",
          legendOptions: {
            title: "Magnitude"
          },
          stops: [
            { value: 6, color: [254, 240, 217], label: "4.5 - 6" },
            { value: 7, color: [179, 0, 0], label: ">7" }
          ]
        }
      ]
    },
    popupTemplate: {
      title: "Image info",
      
      content: function(feature) {
        const attributes = feature.graphic.attributes;
        const imageUrl = attributes.image;
        const timestamp = attributes.time;
        return `
          <div>
            <img src="${imageUrl}" alt="Image" style="max-width: 100%; max-height: 200px;" />
            <p>timestamp: ${timestamp}</p>
          </div>
        `;
      }
    }
  });

  map.add(earthquakeLayer);

  let earthquakeLayerView = null;
  let highlightHandler = null;

  view.whenLayerView(earthquakeLayer).then(function(lyrView) {
    earthquakeLayerView = lyrView;
    console.log("earthquakeLayerView: ", earthquakeLayerView)
  });

  function formatDate(date) {
    const fDate = new Date(date);
    const year = fDate.getFullYear();
    const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(fDate);
    const day = fDate.getDate();
    const hours = fDate.getHours();
    const minutes = fDate.getMinutes();
    const prefix = minutes < 10 ? "0" : "";
    return `${day} ${month} ${year}, at ${hours}:${prefix}${minutes}`;
  }

  let zooming = false;
  earthquakeLayer
    .queryFeatures({
      where: "mag > 7"
    })
    .then(function(result) {
      const features = result.features;
      const list = document.getElementById("earthquake-list");
      features.forEach(function(earthquake) {
        const attr = earthquake.attributes;
        const content = document.createElement("div");
        content.innerHTML = `
          <div>
            <h3>${attr.place}</h3>
            <span class="date-time"><i>${formatDate(attr.time)}</i></span>
            </br>
            Magnitude ${attr.mag} | Depth ${attr.depth} km
          </div>
        `;
        const goToButton = document.createElement("button");
        goToButton.innerText = "Zoom to earthquake";
        goToButton.addEventListener("click", function() {
          zooming = true;
          view.goTo({ target: earthquake, zoom: 4 }, { speedFactor: 0.5 });
          if (earthquakeLayerView) {
            if (highlightHandler) {
              highlightHandler.remove();
            }
            highlightHandler = earthquakeLayerView.highlight(earthquake);
          }
        });
        content.appendChild(goToButton);
        list.appendChild(content);
      });
    })
    .catch(console.error);

  document.getElementById("toggle-exaggeration").addEventListener("click", function() {
    if (exaggerated) {
      earthquakeLayer.elevationInfo = realElevation;
      exaggerated = false;
    } else {
      earthquakeLayer.elevationInfo = exaggeratedElevation;
      exaggerated = true;
    }
  });

  function rotate() {
    if (!view.interacting && !zooming) {
      const camera = view.camera.clone();
      camera.position.longitude -= 0.1;
      view.camera = camera;
      requestAnimationFrame(rotate);
    }
  }

  view.when(function() {
    view.constraints.clipDistance.far = 40000000;
    watchUtils.whenFalseOnce(view, "updating", function() {
      rotate();
    });
  });

  let legendVisible = true;
  const legendController = document.getElementById("legend-control");
  const legendContainer = document.getElementById("legend");
  legendController.addEventListener("click", function() {
    legendContainer.style.display = legendVisible ? "none" : "block";
    legendController.innerHTML = legendVisible ? "Show explanation" : "Hide explanation";
    legendVisible = !legendVisible;
  });
});
