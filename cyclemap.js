
class CycleMap {

  constructor() {
    this.map = this.elevator = this.directionsService = null;
    this.routePaths = [];
    this.origin = { lat: 52.5200518, lng: 13.4048419 };
    this.markers = [];
    this.markerCounter = 0;
  }

  initMap() {

    let self = this;

    this.map = new google.maps.Map(document.getElementById('map'), {
      zoom: 14,
      center: this.origin,
      mapTypeId: 'terrain'
    });

    this.elevator = new google.maps.ElevationService;
    this.directionsService = new google.maps.DirectionsService;

    navigator.geolocation.getCurrentPosition(position => {
      self.origin.lat = position.coords.latitude
      self.origin.lng = position.coords.longitude;
      self.map.setCenter(self.origin);
    });

  }

  addWaypoint() {

    let self = this;
    let title = 'Waypoint ' + this.markerCounter;
    let id = 'wp_' + this.markerCounter;

    // Create waypoint marker
    let marker = new google.maps.Marker({
      position: this.map.getCenter(),
      map: this.map,
      draggable: true,
      animation: google.maps.Animation.DROP,
      icon: {
        path: google.maps.SymbolPath.BACKWARD_OPEN_ARROW,
        scale: 3
      }
    });

    if(this.markerCounter == 0) {
      title = 'Start';
      marker.setIcon({
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        scale: 5
      });
    }

    let infoWindow = new google.maps.InfoWindow({
      content: title + ' - <a href="javascript:void(0)" onclick="cycleMap.removeWaypoint(\'' + id + '\'); return false;">Remove</a>'
    });

    marker.addListener('click', function() {
      infoWindow.open(self.map, marker);
    });

    marker.addListener('dragend', function() {
      if(self.markers.length > 1) {
        self.drawMap();
      }
    });

    this.markers.push({
      list_id: id,
      marker: marker
    });

    // Add waypoint to the list

    let html = '<div id="' + id + '" class="item">' + 
        '<i class="large flag ' + (title == 'Start' ? ' outline' : '') + ' middle aligned icon"></i>' + 
        '<div class="content">' + 
          '<div class="header">' + title + '</div>' + 
          '<div class="description"><a href="javascript:void(0)" onclick="cycleMap.removeWaypoint(\'' + id + '\')">Remove</a></div>' + 
        '</div>' + 
      '</div>';

    $('#waypoints').append(html);

    if(this.markers.length > 1) {
      this.drawMap();
    }

    this.markerCounter++;
  }

  removeWaypoint(id) {

    this.markers.forEach((marker, index) => {
      if(marker.list_id == id) {
        marker.marker.setMap(null);
        this.markers.splice(index, 1);
        $('#' + id).remove();
        return;
      }
    });

    if(this.markers.length == 0) {
      this.markerCounter = 0;
    } else if(this.markers.length < 2) {
      this.clearRoutePaths();
      this.clearChart();
    } else {
      this.drawMap();
    }

  }

  clearRoutePaths() {
    if(this.routePaths) {
      this.routePaths.forEach(routePath => {
        routePath.setMap(null);
      });
      this.routePaths = [];
    }
  }

  drawMap() {

    this.clearRoutePaths();

    let waypoints = [];
    let self = this;

    this.markers.forEach(marker => {
      waypoints.push({
        location: marker.marker.getPosition().lat() + ', ' + marker.marker.getPosition().lng(),
        stopover: true
      });
    });

    if(waypoints.length < 2) {
      console.error('Give me at least two waypoints to draw');
      return;
    }

    this.directionsService.route({
      origin: waypoints[0].location,
      destination: waypoints[ waypoints.length - 1 ].location,
      waypoints: waypoints,
      optimizeWaypoints: true,
      travelMode: 'BICYCLING',
      unitSystem: google.maps.UnitSystem.METRIC,
    }, (response, status) => {

      if(status === 'OK') {
        
        let route = response.routes[0];

        let samples = 256;

        self.elevator.getElevationAlongPath({
          'path': route.overview_path,
          'samples': samples
        }, (elevations, status) => {

          let maxElevation = elevations.reduce((prev, current) => {
            return prev.elevation > current.elevation ? prev : current
          }).elevation;

          let minElevation = elevations.reduce((prev, current) => {
            return prev.elevation < current.elevation ? prev : current
          }).elevation;

          let path = []
          let colors = [ '#ccc' ];
          let currentPair = [];

          elevations.forEach(elevation => {

            let color = self.getElevationColor(elevation.elevation, minElevation);

            if(currentPair.length < 2) {
              currentPair.push(elevation.location);
            } else {

              if(path.length > 1) {
                path.push([ 
                  path[ path.length - 1 ][1],
                  currentPair[0]
                ]);
                colors.push(color);
              }

              colors.push(color);
              path.push(currentPair);
              currentPair = [];
            }

          });

          path.forEach((pair, i) => {
            self.routePaths.push(new google.maps.Polyline({
              path: pair,
              strokeColor: colors[i],
              map: self.map
            }));
          });

          self.plotElevation(elevations);
        });

      } else {
        alert('Failed to request directions :(');
      }

    });
  }

  getElevationColor(elevation, minElevation) {

    let color = '';

    if(elevation - minElevation <= 10) {
      color = '#16ce25';
    } else if(elevation <= 30) {
      color = '#ffe92c';
    } else if(elevation <= 75) {
      color = '#ffb51d';
    } else if(elevation > 75) {
      color = '#ff0000';
    }  

    return color;
  }

  plotElevation(elevations) {

    let self = this;
    let chartElement = $('#elevation_chart');

    if(elevations.length == 0) {
      chartElement.html('');
      return;
    }

    let chart = new google.visualization.ColumnChart(chartElement.get(0));
    let data = new google.visualization.DataTable();

    data.addColumn('string', 'Sample');
    data.addColumn('number', 'Elevation');
    data.addColumn({ type: 'string', role: 'style' });

    let minElevation = elevations.reduce((prev, current) => {
      return prev.elevation < current.elevation ? prev : current
    }).elevation;

    elevations.forEach(elevation => {
      let color = self.getElevationColor(elevation.elevation, minElevation);
      data.addRow([ '', elevation.elevation, 'color: ' + color ]);
    });

    chart.draw(data, {
      height: 150,
      legend: 'none',
      titleY: 'Elevation (m)'
    });
  }

  clearChart() {
    this.plotElevation([]);
  }

}
