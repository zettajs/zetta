const util = require('util');
const Scout = require('../../zetta_runtime').Scout;
const Driver = require('./example_driver');

const HubScout = module.exports = function() {
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
