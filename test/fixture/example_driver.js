var Runtime = require('../../zetta_runtime');
var Device = Runtime.Device;
var util = require('util');

var TestDriver = module.exports = function(){
  Device.call(this);
  this.data = 0;
};
util.inherits(TestDriver, Device);

TestDriver.prototype.init = function(config) {
  config
    .state('ready')
    .type('testdriver')
    .name('Matt\'s Test Device')
    .when('ready', { allow: ['change', 'current'] })
    .when('changed', { allow: ['prepare', 'current'] })
    .map('change', this.change)
    .map('prepare', this.prepare);
};

TestDriver.prototype.change = function(cb) {
  this.state = 'changed';
  cb();
};

TestDriver.prototype.prepare = function(cb) {
  this.state = 'ready';
  cb();
};

TestDriver.prototype.current = function(cb) {
  cb(null, this.state);
}
