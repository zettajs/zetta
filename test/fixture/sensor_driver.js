const Runtime = require('../../zetta_runtime');
const Device = Runtime.Device;
const util = require('util');

const SensorDriver = module.exports = function(){
  Device.call(this);
};
util.inherits(SensorDriver, Device);

SensorDriver.prototype.init = config => {
  config
    .type('sensordriver');
};
