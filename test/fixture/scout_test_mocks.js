var util = require('util');
var zetta = require('../../zetta_runtime');

//Mock device single transition. Also takes constructor params optionally.
var GoodDevice = function() {
  zetta.Device.call(this);
  var args = Array.prototype.slice.call(arguments);
  if(args.length > 0) {
    this.foo = args[0];
    this.bar = args[1];
  }
  this.vendorId = '1234567';
};
util.inherits(GoodDevice, zetta.Device);

GoodDevice.prototype.init = function(config){
  config
    .name('Good Device')
    .type('test')
    .state('ready')
    .when('ready', {allow: ['transition']})
    .map('transition', this.transition);
}

GoodDevice.prototype.transition = function(cb) {
  cb();
}

//Mock scout.
var GoodScout = function() {
  zetta.Scout.call(this);
};
util.inherits(GoodScout, zetta.Scout);

GoodScout.prototype.init = function(cb) {
  this.discover(GoodDevice, 'foo', 'bar');
  return cb();
};

//A mock registry so we can easily instrospect that we're calling the save and find functions correctly.
//This also gets around some leveldb locking issues I was running into.
var MockRegistry = function() {
  this.machines = [];
}

MockRegistry.prototype.save = function(machine, cb){
  this.machines.push(machine.properties);
  cb(null, this.machines);
};

MockRegistry.prototype.find = function(query, cb) {
  this.machines.forEach(function(machine) {
    if(query.match(machine)) {
      cb(null, [machine]);
    }
  });

  cb(null, []);
};

exports.MockRegistry = MockRegistry;
exports.GoodScout = GoodScout;
exports.GoodDevice = GoodDevice;
