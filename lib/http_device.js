var util = require('util');
var Device = require('./device');

var HttpDevice = module.exports = function() {
  Device.call(this);
};
util.inherits(HttpDevice, Device);
