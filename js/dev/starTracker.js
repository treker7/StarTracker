import moment from 'moment';
import TypeAhead from 'type-ahead/src/type-ahead';
import Pikaday from 'pikaday';
import AstronomicalObject from '@treker7/practical-astronomy/models/astronomicalObject';
import GeographicCoordinate from '@treker7/practical-astronomy/models/geographicCoorindate.js';
import AngleConversionService from '@treker7/practical-astronomy/services/angleConversionService';
import moon from '@treker7/practical-astronomy/services/moonService';
import { AltitudeGraph, AstronomicalObjectGraph, AstronomicalObjectProximity } from  './altitudeGraph.js';

window.onload = function () {
    var defaultUTCOffset = moment().utcOffset(); // in minutes
    var observersCurrentUTCOffset = parseInt(localStorage.getItem("observersCurrentUTCOffset") || defaultUTCOffset);    
    var timeZoneChangedCallback = null;

    var registerTimeZoneChangedCallback = function (callback) {
        timeZoneChangedCallback = callback;   
    };

    // try to guess the observer's time zone from their current location
    var setUTCOffsetFromGeographicCoordinate = function (geographicCoordinate) {
        observersCurrentUTCOffset = (Math.trunc(geographicCoordinate.longitude / 15.0) * 60);
        localStorage.setItem("observersCurrentUTCOffset", observersCurrentUTCOffset);

        document.getElementById("observersTimeZone").selectedIndex = Math.trunc(12 + (observersCurrentUTCOffset / 60));

        return observersCurrentUTCOffset;
    };

    document.getElementById("observersTimeZone").onchange = function () {
        observersCurrentUTCOffset = parseInt(this.value) * 60;
        localStorage.setItem("observersCurrentUTCOffset", observersCurrentUTCOffset);

        if (timeZoneChangedCallback) {
            timeZoneChangedCallback(observersCurrentUTCOffset);
        }
    };

    // populate the utc offsets
    for (var utcOffset = -12; utcOffset <= 12; utcOffset++) {
        var utcOffsetHour = (utcOffset < 0) ? `${utcOffset}` : `+${utcOffset}`;

        var newTimeZoneOption = document.createElement("option");    
        newTimeZoneOption.value = utcOffset;
        newTimeZoneOption.innerHTML = `UTC ${utcOffsetHour}:00`;
        document.getElementById("observersTimeZone").appendChild(newTimeZoneOption);
    }

    // set the select to the current utc offest
    document.getElementById("observersTimeZone").selectedIndex = Math.trunc(12 + (observersCurrentUTCOffset / 60));

    var DEFAULT_LOCATION = new GeographicCoordinate(41.8125, -80.0935); // Edinboro, PA
    var observersCurrentLocation = JSON.parse(localStorage.getItem("observersCurrentLocation") || null) || DEFAULT_LOCATION;

    var defaultSavedLocations = {
        "Cambridge Springs, PA": DEFAULT_LOCATION,
        "Grove City, PA": new GeographicCoordinate(41.1555, -80.0793),
        "Redmond, WA": new GeographicCoordinate(47.6739, -122.1215),
        "Amsterdam, NL": new GeographicCoordinate(52.3791, 4.9003),
    };
    var observersSavedLocations = JSON.parse(localStorage.getItem("observersSavedLocations") || null) || defaultSavedLocations;

    var locationChangedCallback = null;
    var locationAddedCallback = null;

    var registerLocationChangedCallback = function (callback) {
        locationChangedCallback = callback;        
    };

    var registerLocationAddedCallback = function (callback) {
        locationAddedCallback = callback;
    };

    // populate the location drop down
    Object.keys(observersSavedLocations).forEach((locationName) => {    
        var newLocationOption = document.createElement("option");
        newLocationOption.value = locationName;
        newLocationOption.innerHTML = locationName;

        document.getElementById("observersLocation").appendChild(newLocationOption);
    });

    // set the initial value of the drop down
    var observersCurrentLocationName = localStorage.getItem("observersCurrentLocationName") || "Cambridge Springs PA";
    document.getElementById("observersLocation").value = observersCurrentLocationName;

    document.getElementById("observersLocation").onchange = function () {
        var locationKey = this.value.trim();
        localStorage.setItem("observersCurrentLocationName", locationKey);

        observersCurrentLocation = observersSavedLocations[locationKey];
        localStorage.setItem("observersCurrentLocation", JSON.stringify(observersCurrentLocation));

        if (locationChangedCallback) {
            locationChangedCallback(observersCurrentLocation);
        }
    };

    document.getElementById("saveLocation").onclick = function () {
        var locationName = (document.getElementById("locationName").value || "").trim();

        var latitude = parseFloat(document.getElementById("locationLatitude").value || 0);
        var longitude = parseFloat(document.getElementById("locationLongitude").value || 0);
        observersCurrentLocation = new GeographicCoordinate(latitude, longitude);

        localStorage.setItem("observersCurrentLocationName", locationName);
        localStorage.setItem("observersCurrentLocation", JSON.stringify(observersCurrentLocation));
        observersSavedLocations[locationName] = observersCurrentLocation;
        localStorage.setItem("observersSavedLocations", JSON.stringify(observersSavedLocations));

        var newLocationOption = document.createElement("option");
        newLocationOption.value = locationName;
        newLocationOption.innerHTML = locationName;
        document.getElementById("observersLocation").appendChild(newLocationOption);
        document.getElementById("observersLocation").value = locationName;

        document.getElementById("addLocationDialog").classList.add("hidden");

        if (locationAddedCallback) {
            locationAddedCallback(observersCurrentLocation);
        }
    };

    document.getElementById("deleteLocation").onclick = function () {
        var locationSelect = document.getElementById("observersLocation");

        if (locationSelect.length > 1) {
            var oldLocationName = locationSelect.value;

            delete observersSavedLocations[oldLocationName];
            localStorage.setItem("observersSavedLocations", JSON.stringify(observersSavedLocations));

            locationSelect.remove(locationSelect.selectedIndex);
            var newLocationName = locationSelect.value;

            localStorage.setItem("observersCurrentLocationName", newLocationName);
            observersCurrentLocation = observersSavedLocations[newLocationName];
            localStorage.setItem("observersCurrentLocation", JSON.stringify(observersCurrentLocation));

            if (locationChangedCallback) {
                locationChangedCallback(observersCurrentLocation);
            }
        }    
    };

    document.getElementById("addLocation").onclick = function () {
        document.getElementById("addLocationDialog").classList.remove("hidden");
    };

    document.getElementById("cancelAddLocation").onclick = function () {
        document.getElementById("addLocationDialog").classList.add("hidden");
    };

    const SKY_SURVEY_SOURCE = "DSS2";
    const DSS_IMAGE_WIDTH = 520;
    const DSS_IMAGE_HEIGHT = 520;
    var currentSearchedAstronomicalObject = null;

    // get cached astronomical object searches
    var previousAstronomicalObjectSearches = JSON.parse(localStorage.getItem("previousAstronomicalObjectSearches")) || {};

    var typeAhead = new TypeAhead(document.getElementById("astronomicalObjectIdentifier"), Object.keys(previousAstronomicalObjectSearches));

    var searchAstronomicalObjects = function () {
        var objectId = document.getElementById("astronomicalObjectIdentifier").value;
        
        // has the user previously searched for this object?
        if (objectId in previousAstronomicalObjectSearches) {
            let astronomicalObject = previousAstronomicalObjectSearches[objectId];
            currentSearchedAstronomicalObject = new AstronomicalObject(astronomicalObject.rightAscension, astronomicalObject.declination, astronomicalObject.identifier);
            setAstronomicalObject(currentSearchedAstronomicalObject);
        } else {
            let simbadQueryStr = `SELECT RA, DEC, main_id FROM basic JOIN ident ON oidref = oid WHERE id = '${objectId}';`;

            fetch(`https://simbad.u-strasbg.fr/simbad/sim-tap/sync?request=doQuery&lang=adql&format=json&query=${simbadQueryStr}&phase=run`,
                {
                    method: "GET"
                }
            ).then((response) => {
                response.json().then((responseObj) => {
                    if (responseObj.data[0] != null) {
                        let ra = responseObj.data[0][0];
                        let dec = responseObj.data[0][1];
                        let id = responseObj.data[0][2];

                        currentSearchedAstronomicalObject = new AstronomicalObject(ra, dec, id);
                        setAstronomicalObject(currentSearchedAstronomicalObject);

                        // cache this object
                        previousAstronomicalObjectSearches[objectId] = currentSearchedAstronomicalObject;
                        localStorage.setItem("previousAstronomicalObjectSearches", JSON.stringify(previousAstronomicalObjectSearches));

                        // update type ahead
                        typeAhead.update(Object.keys(previousAstronomicalObjectSearches));
                    } else {
                        currentSearchedAstronomicalObject = null;
                        document.getElementById("searchResultsError").classList.remove("hidden");

                        let table = document.getElementById("astronomicalObjectSearchResults");
                        table.getElementsByClassName("id")[0].innerHTML = "";
                        table.getElementsByClassName("ra")[0].innerHTML = "";
                        table.getElementsByClassName("dec")[0].innerHTML = "";

                        document.getElementById("astronomicalObjectImage").src = "";

                        altitudeGraph.showAstronomicalObject(0, false);            
                    }
                })
            }).catch((error) => {
                console.log(error);
            });
        }
    };

    var setAstronomicalObject = function (astronomicalObject) {
        // hide errors
        document.getElementById("searchResultsError").classList.add("hidden");
        // set the html of the astronomical object table
        var table = document.getElementById("astronomicalObjectSearchResults");
        table.getElementsByClassName("id")[0].innerHTML = astronomicalObject.identifier;
        table.getElementsByClassName("ra")[0].innerHTML = AngleConversionService.displayAsHMS(astronomicalObject.rightAscension);
        table.getElementsByClassName("dec")[0].innerHTML = AngleConversionService.displayAsDMS(astronomicalObject.declination, true);

        // reset the astronomical object fov angle slider
        document.getElementById("astronomicalObjectImageFOV").value = astronomicalObjectImageFOVInitialValue;
        DSS_FOV = DSS_DEFAULT_FOV;
        document.getElementById("astronomicalObjectImageFOVLabel").innerHTML = (DSS_FOV * 60); // in arcminutes

        // display the image of this astronomical object
        document.getElementById("astronomicalObjectImage").src = `https://server1.wikisky.org/imgcut?ra=${(astronomicalObject.rightAscension / 15.0)}&de=${astronomicalObject.declination}&angle=${DSS_FOV}&img_id=all&width=${DSS_IMAGE_WIDTH}&height=${DSS_IMAGE_HEIGHT}&survey=${SKY_SURVEY_SOURCE}`;

        // update the altitude graph
        altitudeGraph.setAstronomicalObject(new AstronomicalObjectGraph(astronomicalObject, "#000F"), 0);
        altitudeGraph.showAstronomicalObject(0, true);
    };
            
    document.getElementById("searchAstronomicalObjects").onclick = searchAstronomicalObjects;

    document.getElementById("astronomicalObjectIdentifier").onkeydown = function (e) {
        // sanitize the input string            
        var objectId = this.value.replace(/[^0-9a-z\s\.\-]/ig, "");
        this.value = objectId;

        if (e.keyCode === 13) { // enter key pressed
            searchAstronomicalObjects();
        }
    };    

    document.getElementById("astronomicalObjectImage").onclick = function () {
        const DSS_ZOOM = 9;
        if (currentSearchedAstronomicalObject !== null) {
            window.open(`https://www.server3.sky-map.org/v2?ra=${(currentSearchedAstronomicalObject.rightAscension / 15.0)}&de=${currentSearchedAstronomicalObject.declination}&zoom=${DSS_ZOOM}&show_grid=0&show_constellation_lines=0&show_constellation_boundaries=0&show_const_names=0&show_galaxies=1&img_source=${SKY_SURVEY_SOURCE}`);
        }
    };

    const astronomicalObjectImageFOVInitialValue = 5;
    const DSS_DEFAULT_FOV = (20.0 / 60); // 20 arc minutes
    const FOV_SLIDER_DELTA = 2;
    var DSS_FOV = DSS_DEFAULT_FOV; // global dss angle

    document.getElementById("astronomicalObjectImageFOV").oninput = function () {
        if (currentSearchedAstronomicalObject !== null) {
            DSS_FOV = DSS_DEFAULT_FOV * Math.pow(FOV_SLIDER_DELTA, (astronomicalObjectImageFOVInitialValue - this.value));

            // set the FOV label
            document.getElementById("astronomicalObjectImageFOVLabel").innerHTML = (DSS_FOV * 60); // in arcminutes

            // set the image source
            document.getElementById("astronomicalObjectImage").src = `https://server1.wikisky.org/imgcut?ra=${(currentSearchedAstronomicalObject.rightAscension / 15.0)}&de=${currentSearchedAstronomicalObject.declination}&angle=${DSS_FOV}&img_id=all&width=${DSS_IMAGE_WIDTH}&height=${DSS_IMAGE_HEIGHT}&survey=${SKY_SURVEY_SOURCE}`;
        }
    };    

    var altitudeGraphDateStart = moment().utcOffset(observersCurrentUTCOffset).hour(12).minute(0).second(0).millisecond(0); // 12:00 p.m. by default
    var altitudeGraphDateStop = moment(altitudeGraphDateStart).clone().add(1, "days");
    // pikaday configuration
    var altitudeGraphDateStartPicker = new Pikaday({
        field: document.getElementById("altitudeGraphDateStart"),
        format: 'ddd MMM D YYYY',
        defaultDate: altitudeGraphDateStart.toDate(),
        setDefaultDate: true,
        maxDate: altitudeGraphDateStart.toDate(),
        onSelect: function () {
            var newStartDate = this.getDate();
            // make sure the dates have actually changed
            if ((altitudeGraphDateStart.year() != newStartDate.getFullYear()) || (altitudeGraphDateStart.month() != newStartDate.getMonth()) || (altitudeGraphDateStart.date() != newStartDate.getDate())) {
                altitudeGraphDateStart = moment(newStartDate).hour(12).minute(0).second(0).millisecond(0).utcOffset(observersCurrentUTCOffset);
                updateDateRange(altitudeGraphDateStart, altitudeGraphDateStop);
            }            
        }
    });
    var altitudeGraphDateStopPicker = new Pikaday({
        field: document.getElementById("altitudeGraphDateStop"),
        format: 'ddd MMM D YYYY',
        defaultDate: altitudeGraphDateStop.toDate(),
        setDefaultDate: true,
        minDate: altitudeGraphDateStop.toDate(),
        onSelect: function () {
            var newStopDate = this.getDate();
            // make sure the dates have actually changed
            if ((altitudeGraphDateStop.year() != newStopDate.getFullYear()) || (altitudeGraphDateStop.month() != newStopDate.getMonth()) || (altitudeGraphDateStop.date() != newStopDate.getDate())) {
                altitudeGraphDateStop = moment(newStopDate).hour(12).minute(0).second(0).millisecond(0).utcOffset(observersCurrentUTCOffset);
                updateDateRange(altitudeGraphDateStart, altitudeGraphDateStop);
            }            
        }
    });
    // forward one day button
    document.getElementById("altitudeGraphForwardDay").onclick = function () {
        var timeIntervalHours = moment.duration(altitudeGraphDateStop.diff(altitudeGraphDateStart)).asHours();
        altitudeGraphDateStart.add(timeIntervalHours, "hours");
        altitudeGraphDateStop.add(timeIntervalHours, "hours");

        updateDateRange(altitudeGraphDateStart, altitudeGraphDateStop);
    };
    // backward one day button
    document.getElementById("altitudeGraphBackwardDay").onclick = function () {
        var timeIntervalHours = moment.duration(altitudeGraphDateStop.diff(altitudeGraphDateStart)).asHours();
        altitudeGraphDateStart.subtract(timeIntervalHours, "hours");
        altitudeGraphDateStop.subtract(timeIntervalHours, "hours");

        updateDateRange(altitudeGraphDateStart, altitudeGraphDateStop);
    };

    var updateDateRange = function (startDate, stopDate) {
        altitudeGraphDateStartPicker.setMaxDate(stopDate.clone().subtract(1, "day").toDate());
        altitudeGraphDateStopPicker.setMinDate(startDate.clone().add(1, "day").toDate());

        altitudeGraphDateStartPicker.setMoment(startDate);
        altitudeGraphDateStopPicker.setMoment(stopDate);

        altitudeGraph.setLocationAndDateRange(observersCurrentLocation, startDate, stopDate);
    };

    // altitude map configuration
    var ctx = document.getElementById("astronomicalObjectAltitudeMap").getContext("2d");
    var altitudeGraph = new AltitudeGraph(ctx, observersCurrentLocation, altitudeGraphDateStart, altitudeGraphDateStop);
    // add dummy data for currently searched for object
    altitudeGraph.addAstronomicalObject(new AstronomicalObjectGraph(new AstronomicalObject(0, -75, ""), "#000F"));
    altitudeGraph.showAstronomicalObject(0, false);
    // add the moon
    altitudeGraph.addAstronomicalObject(new AstronomicalObjectGraph(moon, "#888F"));
    
    // add the moon to the list of astronomical objects which will be automatically checked on the altitude graph for proxmity alerts
    const MOON_ANGULAR_PROSIXIMITY_ALERT_RADIUS = 0.52; // the angular diameter of the moon in decimal degrees
    altitudeGraph.addAstronomicalObjectCheckProximity(new AstronomicalObjectProximity(moon, MOON_ANGULAR_PROSIXIMITY_ALERT_RADIUS));    

    var updateObserversLocation = function (newGeographicCoordinate) {        
        var newUTCOffset = setUTCOffsetFromGeographicCoordinate(newGeographicCoordinate);

        altitudeGraphDateStart.utcOffset(newUTCOffset);
        altitudeGraphDateStop.utcOffset(newUTCOffset);
        altitudeGraph.setLocationAndDateRange(newGeographicCoordinate, altitudeGraphDateStart, altitudeGraphDateStop);
    };

    // update the altitude graph whenever the user's location changes
    registerLocationChangedCallback((newGeographicCoordinate) => {
        updateObserversLocation(newGeographicCoordinate);        
    });

    registerLocationAddedCallback((newGeographicCoordinate) => {
        updateObserversLocation(newGeographicCoordinate);
    });

    // update the altitude graph whenever the user's time zone changes
    registerTimeZoneChangedCallback((newUTCOffset) => {
        altitudeGraphDateStart.utcOffset(newUTCOffset);
        altitudeGraphDateStop.utcOffset(newUTCOffset);
        altitudeGraph.setLocationAndDateRange(observersCurrentLocation, altitudeGraphDateStart, altitudeGraphDateStop);
    });
};
