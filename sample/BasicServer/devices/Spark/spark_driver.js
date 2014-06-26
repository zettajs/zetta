var Device = require('../../../../zetta_runtime').Device;
var util = require('util');

var Spark = module.exports = function() {
  Device.call(this);
  this.vendorId = '1234567';
};
util.inherits(Spark, Device);

Spark.prototype.init = function(config){
  config
    .type('spark')
    .state('off')
    .name('Matt\'s Spark')
    .when('on', {allow: ['off']})
    .when('off', {allow: ['on']})
    .map('on', this.turnOn)
    .map('off', this.turnOff);
};

Spark.prototype.turnOn = function(cb) {
  this.state = 'on';
  cb();
};

Spark.prototype.turnOff = function(cb) {
  this.state = 'off';
  cb();
};
