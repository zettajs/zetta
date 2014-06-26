var Device = require('../../../../zetta_runtime').Device;
var util = require('util');

var Led = module.exports = function() {
  Device.call(this);
};
util.inherits(Led, Device);

Led.prototype.init = function(config){
  config
    .type('led')
    .state('off')
    .name('Matt\'s LED')
    .when('on', {allow: ['off']})
    .when('off', {allow: ['on']})
    .map('on', this.turnOn)
    .map('off', this.turnOff);
};

Led.prototype.turnOn = function(cb) {
  this.state = 'on';
  cb();
};

Led.prototype.turnOff = function(cb) {
  this.state = 'off';
  cb();
};
