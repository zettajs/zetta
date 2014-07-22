var Device = require('../../../../zetta_runtime.js').Device;
var util = require('util');

var Phone = module.exports = function() {
  Device.call(this);
  this.x = 0;
  this.y = 0;
  this.z = 0;
};
util.inherits(Phone, Device);

Phone.prototype.init = function(config) {
  config
    .state('on')
    .type('iphone')
    .when('off', { allow: 'change' })
    .when('on', { allow: 'change' })
    .map('change', this.change,
        [{ name: 'x', type: 'text' }, { name: 'y', type: 'text' }, { name: 'z', type: 'text' }])
    .monitor('x')
    .monitor('y')
    .monitor('z');
};

Phone.prototype.change = function(x, y, z, cb) {
  this.x = x;
  this.y = y;
  this.z = z;

  if (cb) {
    cb();
  }
};
