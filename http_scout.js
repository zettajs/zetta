var EventEmitter = require('events').EventEmitter;
var util = require('util');

var HTTPScout = module.exports = function() {
  this.drivers = [];
  this.driverFunctions = [];
  EventEmitter.call(this);
};
util.inherits(HTTPScout, EventEmitter);

HTTPScout.prototype.init = function(next) {
  next();
};

HTTPScout.prototype.provision = function(device) {
  var idx = this.drivers.indexOf(device.type);
  if (idx === -1) {
    return;
  }

  return this.driverFunctions[id];
};
