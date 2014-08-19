var Runtime = require('../../zetta_runtime');
var Device = Runtime.Device;
var util = require('util');

var SensorDriver = module.exports = function(){
  Device.call(this);
};
util.inherits(SensorDriver, Device);

SensorDriver.prototype.init = function(config) {
  config
    .type('sensordriver');
};
