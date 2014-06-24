var Logger = require('./logger')();
var Scientist = require('./scientist');
var Device = require('./device');

var Zetta = {}; 

Zetta.log = function(msg, data) {
  Logger.emit('user-log', msg, data);
};

Zetta.configure = function(/* args */) {
  return Scientist.configure.apply(null,arguments);
};

Zetta.Device = Device;

module.exports = Zetta;
