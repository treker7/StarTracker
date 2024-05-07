import moment from 'moment';
import Chart from 'chart.js/dist/Chart';
import 'chartjs-plugin-annotation';
import TimeService from '@treker7/practical-astronomy/services/timeService';
import AngleConversionService from '@treker7/practical-astronomy/services/angleConversionService';
import MathService from '@treker7/practical-astronomy/services/mathService';
import CoordinateSystemService from '@treker7/practical-astronomy/services/coordinateSystemService';
import sun from '@treker7/practical-astronomy/services/sunService';

/**
 * Class for the graph of an astronomical object's altitude over time.
 */
export class AltitudeGraph {
    /**
     * Create an altitude graph for an astronomical object.
     * @param {HTMLElement} canvasCtx - the canvas that this altitude graph will be drawn on
     * @param {GeographicCoordinate} geographicCoordinate - the location of the observer
     * @param {Moment} startDate - the starting date of the graph
     * @param {Moment} stopDate - the stopping date of the graph
     */
    constructor(canvasCtx, geographicCoordinate, startDate, stopDate) {
        this.astronomicalObjectGraphs = [];

        this.startDate = startDate.clone().hour(12).minute(0).second(0).millisecond(0);
        this.stopDate = stopDate.clone().hour(12).minute(0).second(0).millisecond(0);
        this.geographicCoordinate = geographicCoordinate;

        this.checkAstronomicalObjectProximities = [];

        this.setHourDiff();

        this.altitudeGraph = new Chart(canvasCtx, {
            type: "line",
            options: {
                scales: {
                    xAxes: [{ // local time axis
                        id: "x-axis-0",
                        display: true,
                        type: "linear",
                        position: "bottom",
                        ticks: {
                            display: true,
                            min: 0,
                            max: this.hourDiff,
                            stepSize: this.hourDiff / this.numTicks,
                            // display as a local date
                            callback: (hours) => {
                                var currDate = this.startDate.clone().add(hours, "hours");
                                return AltitudeGraph.formatDate(currDate);
                            }
                        },
                        scaleLabel: {
                            display: true,
                            labelString: "Local Date/Time"
                        }
                    },
                    { // LST time axis
                        display: true,                        
                        type: "linear",
                        position: "top",
                        ticks: {
                            display: true,
                            min: 0,
                            max: this.hourDiff,
                            stepSize: this.hourDiff / this.numTicks,
                            // display as a date
                            callback: (hours) => {
                                var currDate = this.startDate.clone().add(hours, "hours");

                                var lstDate = TimeService.getLST(this.geographicCoordinate, currDate);
                                lstDate = AngleConversionService.displayAsDMS(lstDate);
                                return `${lstDate}`;
                            }
                        },
                        scaleLabel: {
                            display: true,
                            labelString: "Local Sidereal Time"
                        }
                    }],
                    yAxes: [{
                        id: "y-axis-0",
                        display: true,
                        type: "linear",
                        ticks: {
                            display: true,
                            min: 0,
                            max: 90,
                            stepSize: 15
                        },
                        scaleLabel: {
                            display: true,
                            labelString: "Altitude (degrees)"
                        }
                    }]
                },
                legend: {
                    display: true,
                    onClick: (e) => { e.stopPropagation(); } // disable hidding datasets by clicking them
                },
                tooltips: {
                    enabled: true,
                    callbacks: {
                        title: (tooltipItem) => {
                            var astronomicalObjectGraphIndex = tooltipItem[0].datasetIndex;
                            var astronomicalObject = this.astronomicalObjectGraphs[astronomicalObjectGraphIndex].astronomicalObject;
                            var astronomicalObjectIdentifier = astronomicalObject.identifier;

                            if (typeof astronomicalObject.getPhase === "function") { // moon; show the phase in the tooltip
                                var currDate = this.startDate.clone().add(tooltipItem[0].xLabel, "hours");
                                var currMoonPhase = (astronomicalObject.getPhase(currDate) * 100);

                                return [`${astronomicalObjectIdentifier}`, `Phase: ${currMoonPhase.toFixed(2)}%`];
                            } else {
                                return [`${astronomicalObjectIdentifier}`];
                            }                            
                        },
                        label: (tooltipItem) => {
                            var astronomicalObjectGraphIndex = tooltipItem.datasetIndex;
                            var astronomicalObject = this.astronomicalObjectGraphs[astronomicalObjectGraphIndex].astronomicalObject;

                            var currDate = this.startDate.clone().add(tooltipItem.xLabel, "hours");
                            var currDateFormatted = AltitudeGraph.formatDate(currDate);

                            var lstDate = TimeService.getLST(this.geographicCoordinate, currDate);
                            lstDate = AngleConversionService.displayAsDMS(lstDate);

                            var currEquatorialCoordinate = astronomicalObject.getEquatorialCoordinate(currDate);
                            var currHorizonCoordinate = CoordinateSystemService.convertFromEquatorialToHorizonCoordinate(currEquatorialCoordinate, this.geographicCoordinate, currDate);

                            var currAirMass = (1 / Math.cos(AngleConversionService.d2r(90 - currHorizonCoordinate.altitude)));

                            return [`Date: ${currDateFormatted}`, `LST: ${lstDate}`, `Alt/Az: ${currHorizonCoordinate.altitude.toFixed(1)}/${currHorizonCoordinate.azimuth.toFixed(1)}`, `Air mass: ${currAirMass.toPrecision(4)}`];
                        }
                    }
                },
                elements: {
                    line: {
                        tension: 0 // bezier curve tension (0 for no bezier curves)
                    },
                    point: {
                        radius: 2,
                        hitRadius: 15,
                        hoverRadius: 0
                    }
                },
                annotation: {
                    drawTime: "beforeDatasetsDraw",
                    annotations: [ ]
                }
            },                                 
            data: {}
        });
        this.displayDayTimes(this.startDate, this.stopDate);
    }

    /**
     * Sets the hour difference between the start and stop dates and calculates the optimal number of ticks for the graph.
     * This function is not meant to be called by user's of the class.
     */
    setHourDiff() {
        this.hourDiff = moment.duration(this.stopDate.diff(this.startDate)).asHours();
        if (this.hourDiff >= (7 * 24)) { // if the hour difference is greater than one week
            this.numTicks = 7;
        } else {
            this.numTicks = 12;
        }
    }

    /**
     * Format a moment for displaying on the altitude graph.
     * @param {Moment} date - the moment to be formatted
     */
    static formatDate(date) {
        var month = (date.get("month") + 1);
        var day = date.get("date");
        var hour = date.get("hour");
        var minute = (date.get("minute") < 10) ? `0${date.get("minute")}` : date.get("minute");
        return `${month}/${day} ${hour}:${minute}`;
    }

    /**
     * Add horizon coordinate data from an astronomical object to the altitude graph.
     * @param {AstronomicalObjectGraph} astronomicalObjectGraph - the astronomical object graph to display
     * @returns {number} - the index of the astronomical object that was added
     */
    addAstronomicalObject(astronomicalObjectGraph) {
        this.setAstronomicalObject(astronomicalObjectGraph, this.astronomicalObjectGraphs.length);
    }

    /**
     * Remove the astronomical object graph at the specified index from the graph.
     * @param {number} index - the index of the astronomical object to remove
     */
    removeAstronomicalObject(index = (this.astronomicalObjectGraphs.length - 1)) {
        if ((index >= 0) && (index < this.astronomicalObjectGraphs.length)) {
            this.astronomicalObjectGraphs.splice(index, 1);

            this.altitudeGraph.data.datasets.splice(index, 1);
            this.refreshAllProximityAlertAnnotations();
            this.altitudeGraph.update(0);
        }        
    }

    /**
     * Remove all astronomical objects from the altitude graph.
     * @param {number} startIndex - the index after which to remove all astronomical objects
     */
    removeAllAstronomicalObjects(startIndex = 0) {
        var numToRemove = this.astronomicalObjectGraphs.length - startIndex;

        this.astronomicalObjectGraphs.splice(startIndex, numToRemove);
        this.altitudeGraph.data.datasets.splice(startIndex, numToRemove);

        this.refreshAllProximityAlertAnnotations();
        this.altitudeGraph.update(0);
    }

    /**
     * Show or hide the astronomical object graph at the specified index
     * @param {number} index - the index of the astronomical object graph to show/hide
     * @param {boolean} show - whether or not to show the specified astronomical object graph
     */
    showAstronomicalObject(index, show = true) {
        if ((index >= 0) && (index < this.astronomicalObjectGraphs.length)) {
            this.altitudeGraph.data.datasets[index].hidden = (!show);
            this.refreshAllProximityAlertAnnotations();
            this.altitudeGraph.update(0);
        }
    }

    /**
     * Update horizon coordinate data at the given index with data from the given astronomical object.
     * @param {AstronomicalObjectGraph} astronomicalObject - the astronomical graph to display
     * @param {number} index - the index of the data to update
     */
    setAstronomicalObject(astronomicalObjectGraph, index = this.astronomicalObjectGraphs.length) {
        this.astronomicalObjectGraphs[index] = astronomicalObjectGraph;

        var horizonCoords = CoordinateSystemService.getHorizonCoordinates(astronomicalObjectGraph.astronomicalObject, this.geographicCoordinate, this.startDate, this.stopDate); // get the celestial coordinates of this object over time
        var hourDelta = ((moment.duration(this.stopDate.diff(this.startDate)).asHours()) / horizonCoords.length);

        // convert to chartjs format
        var astronomicalObjectAltitudeData = horizonCoords.map((horizonCoord, i) => {
            return {
                x: i * hourDelta,
                y: horizonCoord.altitude
            };
        });
        
        // set the chart data
        this.altitudeGraph.data.datasets[index] = {
            backgroundColor: "#FFF0",
            label: astronomicalObjectGraph.astronomicalObject.identifier,
            borderColor: astronomicalObjectGraph.color,
            data: astronomicalObjectAltitudeData,
            hidden: (this.altitudeGraph.data.datasets[index] != null) ? this.altitudeGraph.data.datasets[index].hidden : false
        };
        // update the proximity alert annotations
        this.checkAstronomicalObjectProximities.forEach((checkAstronomicalObjectProximity) => {
            this.annotateAstronomicalObjectProximity(checkAstronomicalObjectProximity, astronomicalObjectGraph.astronomicalObject, this.startDate, this.stopDate);
        });

        this.altitudeGraph.update(100);        
    }

    /**
     * Set the location and date rage of this altitude graph to span from dateStart to dateStop.
     * @param {GepgraphicCoordinate} geographicCoordinate - the new location
     * @param {Moment} dateStart - the starting date
     * @param {Moment} dateStop - the ending date
     */
    setLocationAndDateRange(geographicCoordinate, startDate, stopDate) {
        this.geographicCoordinate = geographicCoordinate;

        this.startDate = startDate.clone().hour(12).minute(0).second(0).millisecond(0);
        this.stopDate = stopDate.clone().hour(12).minute(0).second(0).millisecond(0);

        this.setHourDiff();

        this.altitudeGraph.options.scales.xAxes.forEach((xAxis) => {
            xAxis.ticks.max = this.hourDiff;
            xAxis.ticks.stepSize = this.hourDiff / this.numTicks;
        });

        // clear the annotations
        this.altitudeGraph.options.annotation.annotations = [];
        // show sun rise/set areas
        this.displayDayTimes(this.startDate, this.stopDate);
        // redraw all relevant graph data
        if (this.astronomicalObjectGraphs.length == 0) {
            this.altitudeGraph.update(100);
        } else {
            this.astronomicalObjectGraphs.forEach((astronomicalObjectGraph, index) => {
                this.setAstronomicalObject(astronomicalObjectGraph, index);
            });
        }
    }

    /**
     * Show the periods of nighttime and daytime on the altitude graph.
     * @param {Moment} dateStart - the starting date
     * @param {Moment} dateStop - the ending date
     */
    displayDayTimes(startDate, stopDate) {
        var currDate = startDate.clone().hour(0).minute(0).second(0).millisecond(0);

        const darknessColor = "#3332";

        var currSunRiseAndSetTime = sun.getRiseAndSetTime(this.geographicCoordinate, currDate);
        var currSetGraphHour = moment.duration(currDate.diff(startDate)).asHours() + currSunRiseAndSetTime.setTime;

        while (currDate < stopDate) {
            currDate.add(1, "day");
            currSunRiseAndSetTime = sun.getRiseAndSetTime(this.geographicCoordinate, currDate);
            var currRiseGraphHour = moment.duration(currDate.diff(startDate)).asHours() + currSunRiseAndSetTime.riseTime;

            // draw annotations for sunset and twilights
            const CIVIL_TWILIGHT_SUN_ANGLE = 96, NAUTICAL_TWILIGHT_SUN_ANGLE = 102, ASTRONOMICAL_TWILIGHT_ANGLE = 108;
            var civilTwilightTime = sun.getTwilightTime(this.geographicCoordinate, currDate, CIVIL_TWILIGHT_SUN_ANGLE);
            var nauticalTwilightTime = sun.getTwilightTime(this.geographicCoordinate, currDate, NAUTICAL_TWILIGHT_SUN_ANGLE);
            var astronomicalTwilightTime = sun.getTwilightTime(this.geographicCoordinate, currDate, ASTRONOMICAL_TWILIGHT_ANGLE);

            this.altitudeGraph.options.annotation.annotations.push(AltitudeGraph.getBoxArea(currSetGraphHour, currRiseGraphHour, 0, 90, darknessColor));
            this.altitudeGraph.options.annotation.annotations.push(AltitudeGraph.getBoxArea(currSetGraphHour + civilTwilightTime, currRiseGraphHour - civilTwilightTime, 0, 90, darknessColor));
            this.altitudeGraph.options.annotation.annotations.push(AltitudeGraph.getBoxArea(currSetGraphHour + nauticalTwilightTime, currRiseGraphHour - nauticalTwilightTime, 0, 90, darknessColor));
            this.altitudeGraph.options.annotation.annotations.push(AltitudeGraph.getBoxArea(currSetGraphHour + astronomicalTwilightTime, currRiseGraphHour - astronomicalTwilightTime, 0, 90, darknessColor));

            currSetGraphHour = moment.duration(currDate.diff(startDate)).asHours() + currSunRiseAndSetTime.setTime;
        }
    }

    /**
     * Get an annotations box object for 
     * @param {number} xMin
     * @param {number} xMax
     * @param {number} yMin
     * @param {number} yMax
     * @param {string} colorStr - the color of the box
     */
    static getBoxArea(xMin, xMax, yMin, yMax, colorStr) {
        return {
            type: "box",
            xScaleID: "x-axis-0",
            yScaleID: "y-axis-0",
            xMin: xMin,
            xMax: xMax,
            yMin: yMin,
            yMax: yMax,
            backgroundColor: colorStr
        };
    }

    /**
     * Add an astronomical object to the list of objects which will be checked against the other's for proximity alert annotations.
     * @param {AstronomicalObjectProximity} checkAstronomicalObjectProximity - the astronomical object proximity to add to the list.
     */
    addAstronomicalObjectCheckProximity(checkAstronomicalObjectProximity) {
        this.checkAstronomicalObjectProximities.push(checkAstronomicalObjectProximity);

        // update the proximity alert annotations
        this.astronomicalObjectGraphs.forEach((astronomicalObjectGraph) => {
            this.annotateAstronomicalObjectProximity(checkAstronomicalObjectProximity, astronomicalObjectGraph.astronomicalObject, this.startDate, this.stopDate);
        });
    }

    /**
     * Update all the proximity alert annotations on the graph
     */
    refreshAllProximityAlertAnnotations() {
        // clear the annotations
        this.altitudeGraph.options.annotation.annotations = [];

        // show sunrise/set times
        this.displayDayTimes(this.startDate, this.stopDate);

        this.astronomicalObjectGraphs.forEach((astronomicalObjectGraph, index) => {
            if (this.altitudeGraph.data.datasets[index].hidden !== true) {
                this.checkAstronomicalObjectProximities.forEach((checkAstronomicalObjectProximity) => {
                    this.annotateAstronomicalObjectProximity(checkAstronomicalObjectProximity, astronomicalObjectGraph.astronomicalObject, this.startDate, this.stopDate);
                });
            }
        });
    }

    /**
     * Check over a date range if two specified astronomical object gets within a specified angular distance from each other and, if so, annotate this on the altitude graph.
     * @param {AstronomicalObjectProximity} checkAstronomicalObjectProxmity - the astronomical object proximity to check the other obect against
     * @param {AstronomicalObject} astronomicalObject - the astronomical object to check with
     * @param {Moment} startDate - the start date of the date range to check
     * @param {Moment} stopDate - the stop date of the date range to check
     * @param {number} numChecks - the number of checks to perform
     */
    annotateAstronomicalObjectProximity(checkAstronomicalObjectProximity, astronomicalObject, startDate, stopDate, numChecks = 240) {
        var checkProximityAstronomicalObject = checkAstronomicalObjectProximity.astronomicalObject;

        var hoursDelta = (moment.duration(stopDate.diff(startDate)).asHours()) / numChecks; // minutes difference between successive proximity checks
        var currDate = startDate.clone();

        while (currDate < stopDate) { // check over the entire date range
            let checkHorizonCoordinates = CoordinateSystemService.convertFromEquatorialToHorizonCoordinate(checkProximityAstronomicalObject.getEquatorialCoordinate(currDate), this.geographicCoordinate, currDate);

            let id1 = checkProximityAstronomicalObject.identifier.replace(/\s+/ig, "").toLowerCase();
            let id2 = astronomicalObject.identifier.replace(/\s+/ig, "").toLowerCase();

            if (id1 !== id2) { // if they are not the same object
                let currHorizonCoordinate = CoordinateSystemService.convertFromEquatorialToHorizonCoordinate(astronomicalObject.getEquatorialCoordinate(currDate), this.geographicCoordinate, currDate);
                if (MathService.areWithinRadius(checkHorizonCoordinates, currHorizonCoordinate, checkAstronomicalObjectProximity.angularDistance)) { // add proximity alert annotation to graph
                    let xMin = moment.duration(currDate.diff(startDate)).asHours();
                    let xMax = xMin + hoursDelta;
                    const CONFLICT_ANNOTATION_RADIUS = 4;
                    let yMin = currHorizonCoordinate.altitude - CONFLICT_ANNOTATION_RADIUS;
                    let yMax = currHorizonCoordinate.altitude + CONFLICT_ANNOTATION_RADIUS;

                    this.altitudeGraph.options.annotation.annotations.push(AltitudeGraph.getBoxArea(xMin, xMax, yMin, yMax, "#F006"));
                }
            }
            currDate.add(hoursDelta, "hours");
        }
    }

    /**
     * Returns a random css color string in format rgb(r, g, b)
     * @returns {string} - a random color string
     */
    static getRandomColor() {
        var red = Math.floor(Math.random() * 256);
        var green = Math.floor(Math.random() * 256);
        var blue = Math.floor(Math.random() * 256);

        return `rgb(${red}, ${green}, ${blue})`;
    }
}

/**
 * A class for representing the data necessary to graph an astronomical object
 */
export class AstronomicalObjectGraph {
    /**
     * Create an astronomical object graph object with these properties
     * @param {AstronomicalObject} astronomicalObject - the astronomical object to graph
     * @param {string} color - the color of this object's graph
     */
    constructor(astronomicalObject, color) {
        this.astronomicalObject = astronomicalObject;
        this.color = color;
    }
}

/**
 * A class for representing the data necessary for an astronomical object and angular proximity
 */
export class AstronomicalObjectProximity {
    /**
     * @param {AstronomicalObject} astronomicalObject - the astronomical object to graph
     * @param {number} angularDistance - the angular distance to check
     */
    constructor(astronomicalObject, angularDistance) {
        this.astronomicalObject = astronomicalObject;
        this.angularDistance = angularDistance;
    }
}
