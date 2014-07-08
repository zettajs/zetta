var util = require('util');
var Scout = require('../../zetta_runtime').Scout;
var Driver = require('./example_driver');

var HubScout = module.exports = function() {
  this.count = 0;
  this.interval = 5000;
  Scout.call(this);
};
util.inherits(HubScout, Scout);

HubScout.prototype.init = function(cb) {
  this.search();
  cb();
};

HubScout.prototype.search = function() {
  this.discover(Driver);
};
