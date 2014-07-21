var Device = require('../../../../zetta_runtime').Device;
var util = require('util');

var iPhone = module.exports = function() {
  Device.call(this);
};
util.inherits(iPhone, Device);

iPhone.prototype.init = function(config){
  config
    .type('iphone')
    .state('on')
    .name('Matt\'s iPhone')
    .when('on', {allow: ['off']})
    .when('off', {allow: ['on']})
    .map('on', this.turnOn)
    .map('off', this.turnOff);
};

iPhone.prototype.turnOn = function(cb) {
  this.state = 'on';
  cb();
};

iPhone.prototype.turnOff = function(cb) {
  this.state = 'off';
  cb();
};
