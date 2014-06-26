var Runtime = require('../../zetta_runtime');
var Device = Runtime.Device;
var util = require('util');

var TestDriver = module.exports = function(){
  Device.call(this);
  this.foo = 0;
  this.bar = 0;
};
util.inherits(TestDriver, Device);

TestDriver.prototype.init = function(config) {
  config
    .state('ready')
    .type('testdriver')
    .name('Matt\'s Test Device')
    .when('ready', { allow: ['change'] })
    .when('changed', { allow: ['prepare'] })
    .map('change', this.change)
    .map('prepare', this.prepare)
    .monitor('foo')
    .stream('bar', this.streamBar);
};

TestDriver.prototype.change = function(cb) {
  this.state = 'changed';
  cb();
};

TestDriver.prototype.prepare = function(cb) {
  this.state = 'ready';
  cb();
};

TestDriver.prototype.incrementStreamValue = function() {
  this.bar++;
  if(this._stream) {
    this._stream.write(this.bar);
  }
}

TestDriver.prototype.streamBar = function(stream) {
  this._stream = stream;
}
