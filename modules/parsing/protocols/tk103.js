var _ = require('underscore');
var log = require('../../log')(module);

// --- GlobalSat GPS ------------------------------------------------------------
var parser = {};
module.exports = parser;

labels = {
    NO_VALUE: '<no value>',
    NO_PARAM: 'unknown'
};

/**
 * Are passed data in supported format and can be parsed ?
 *
 * @param data
 * @returns {boolean}   true if data format recognized and can be parsed,
 *                      false otherwise.
 */
parser.canParse = function(buffer) {
    log.debug('globalsat.canParse():');
    var strData;
    try {
        //  TODO:   wrap as ensureString() method.
        if (_.isString(buffer)) {
            strData = buffer;
        } else {
            //  trying convert data
            if (buffer instanceof Buffer) {
                strData = buffer.toString('ascii'); // convert binary data to string so it can be processed.
            } else {
                throw new Exception("can't convert binary data to String.");
            }
        }

        //  The general format of : *XX,YYYYYYYYYY,V1,HHMMSS,S,latitude,D,longitude,G,speed,direction,DDMMYY,vehicle_status#
        ////
        var start = data.substr(0, 1);
        var end = data.substr(data.length - 1, 1);
        ////

        // var pattern = /^.*HQ,\d{1,20},.{2,6},\d{6},.*[#]$/; //  use RegExp for data format verification
        var pattern = /\*HQ,(\d+),V\d,(\d{2})(\d{2})(\d{2}),([AV]),(\d{2})(\d{2}.\d+),([NS]),(\d{2,3})(\d{2,3}.\d+),([EW]),(\d+.\d+),.*,(\d{2})(\d{2})(\d{2}),.*[#]$/; //  use RegExp for data format verification
        var passed = pattern.test(strData);
        log.debug('passed RegExp ? ' + passed);
        return passed;

    } catch (ex) {
        log.error('Data packet analysis failed: ' + ex);
    }
    return false;
}

parser.parse = function(socket, data) {
    console.log('Before convert data', data);
    if (!_.isString(data)) {
        var strData;
        //  trying convert data
        if (data instanceof Buffer) {
            strData = data.toString('utf8'); // convert binary data to string so it can be processed.
        }
        data = strData;
    }
    console.log('After convert data', data);
    console.log('Before slice data', data);
    data = data.slice(1, -1);
    console.log('After slice data', data);

    //  for 'Tk103' only
    var arrParsedMaps = [];
    log.info('Start parsing of data');

    //  slice data string in multiple packets, if any.
    var packets = data.split('!');
    //  always suppress last part as it's just an empty string
    if (packets[packets.length - 1] == '') {
        packets.pop();
    }

    log.info('found ' + packets.length + ' packets in data string.');

    if (packets.length == 0) {
        log.error('Data packets in proper format not found, parsing cancelled.');
        return null;
    }

    //  TK103 data format:
    // Normal information(v1): *XX,YYYYYYYYYY,V1,HHMMSS,S,latitude,D,longitude,G,speed,direction,DDMMYY,vehicle_status#
    //*HQ,355488020909847,V1,161322,A,2741.13423,N,08520.76243,E,0.00,0,160417,FFFFFBFF#
    // Confirmation of information(V4): *XX,YYYYYYYYYY,V4,CMD,hhmmss,HHMMSS,S,latitude,D,longitude,G,speed,direction,DDMMYY,vehicle_status#
    // * : Head of command
    // XX : Name of maker, Consists of two ASCII characters, such as HQ.
    // , : separator
    // YYYYYYYYYY : SN of terminal, is ten characters front of IMEI.
    // CMD : Command
    // HHMMSS : Time: hour/minute/second,device time, GMT, Beijing is 8 hours ahead GMT.
    // S : Effective mark of data, ‘A’ stand for effective, ‘V’ stand for invalid.
    // Latitude : Latitude, format : DDFF.FFFF, DD : Degree(00 ~ 90), FF.FFFF : minute (00.0000 ~ 59.9999), keep four decimal places.
    // D : latitude marks (N:north, S:south)
    // Longitude : longitude, format : DDDFF.FFFF, DDD : Degree(000 ~ 180), FF.FFFF : minute
    // (00.0000 ~ 59.9999), keep four decimal places.
    // G : longitude marks (E:east, W:west)
    // Speed: speed,range of 000.00 ~ 999.99 knots, Keep two decimal places.
    // Speed maybe empty, as longitude,G,,direction, speed is 0.
    // Direction: Azimuth, north to 0 degrees, resolution 1 degrees, clockwise direction. Direction maybe empty, as longitude,G,speed,, MMDDYY, azimuth is zero.
    // DDMMYY:day/month/year
    // vehicle_status(V1): Vehicle state, four bytes, says the terminal parts state, vehicle parts state and alarm state, etc.
    var REPORT_TEMPLATE = "maker,IMEI,CMD,utcTime,dataState,latitude,latmark,longitude,lngmark,speedKnots,direction,utcDate,vehicleStatus";
    var arrParamNames = REPORT_TEMPLATE.split(',');
    log.debug('number of supported params: ' + arrParamNames.length);

    //  TODO: verify packet's checksum !!

    for (var index in packets) { //  returns index of array item

        var strDataPacket = packets[index];
        var arrParamValues = strDataPacket.split(',');
        log.debug('number of params in the packet: ' + arrParamValues.length);
        if (arrParamValues[0].trim() != 'HQ') {
            log.error('Wrong packet\'s data type, expected "HQ" but got: "' + arrParamValues[0] + '"');
            continue;
        }

        var count;
        if (arrParamNames.length >= arrParamValues.length) {
            count = arrParamNames.length;
        } else {
            count = arrParamValues.length;
            var exceeds = arrParamNames.length;
        }
        log.info('number of supported params: ' + arrParamNames.length + ', number of actual values in data string: ' + arrParamValues.length);

        var mapParams = [];
        for (var i = 0; i < count; i++) {
            //  keys and values with suppressed spaces
            if (exceeds && i >= exceeds) {
                mapParams[labels.NO_PARAM + i] = arrParamValues[i].trim();
            } else {
                //mapParams[ arrParamNames[i].trim() ] = arrParamValues[i].trim();
                mapParams[arrParamNames[i].trim()] = (i < arrParamValues.length) ? arrParamValues[i].trim() : labels.NO_VALUE;
            }
        }


        var lat = ensureDecimal(mapParams['latitude'], mapParams['latmark']);
        var lng = ensureDecimal(mapParams['longitude'], mapParams['lngmark']);

        mapParams['latitude'] = lat;
        mapParams['longitude'] = lng;

        var utcDateTime = ensureUtc(mapParams['utcDate'], mapParams['utcTime']);
        mapParams['utcDateTime'] = utcDateTime;

        var speed = parseFloat(mapParams['speedKnots']) * 1.852;
        mapParams['speed'] = speed;

        log.debug('map built: ' + mapParams.toString());
        arrParsedMaps.push(mapParams);

    }
    log.info('Parsing completed: ' + arrParsedMaps.toString());
    return arrParsedMaps;
};



function ensureDecimal(strValue, mark) {
    var res = '';
    try {
        res = convert2decimal(strValue, mark);
    } catch (e) {
        log.error(e);
    }
    return res;
};

/**
 * expected format:    E03408.0595,N4427.3934 2741.13423,N,08520.76243,E
 * 
 * @param {type} strValue
 * @returns {String}
 */
function convert2decimal(strValue, mark) {

    if (_.isEmpty(strValue)) {
        throw new Error('Can\'t convert empty string into decimal coords value.');
    }

    if (typeof(mark) == "undefined") mark = "N";
    var dg = parseInt(strValue / 100);
    var minutes = strValue - (dg * 100);
    var res = (minutes / 60) + dg;
    return (mark.toUpperCase() == "S" || mark.toUpperCase() == "W") ? res * -1 : res;
};

function ensureUtc(strDate, strTime) {
    //  formatter = new SimpleDateFormat("ddMMyy");
    //  DateFormat formatter = new SimpleDateFormat("HHmmss");
    if (_.isEmpty(strDate) || strDate.length != 6) {
        log.error('Date string is empty, or has length != 6');
        return null;
    }
    if (_.isEmpty(strTime) || strTime.length != 6) {
        log.error('Time string is empty, or has length != 6');
        return null;
    }

    try {
        //  new Date(year, month[, day[, hour[, minutes[, seconds[, milliseconds]]]]]);
        var month = parseInt(strDate.substr(2, 2)) - 1;
        //var utcDateTime = new Date( '20'+strDate.substr(4, 2), month, strDate.substr(0, 2), strTime.substr(0, 2), strTime.substr(2, 2), strTime.substr(4, 2) );
        var utcDateTime = Date.UTC('20' + strDate.substr(4, 2), month, strDate.substr(0, 2), strTime.substr(0, 2), strTime.substr(2, 2), strTime.substr(4, 2));
    } catch (e) {
        log.error(e);
        return null;
    }
    //return utcDateTime.toUTCString(); // no such method
    return utcDateTime;
};