var Runtime = require('../../zetta_runtime');
var Device = Runtime.Device;
var util = require('util');

var TestDriver = module.exports = function(x, y){
  Device.call(this);
  this.foo = 0;
  this.bar = 0;
  this.value = 0;
  this._fooBar = 0;
  this._x = x;
  this._y = y;
};
util.inherits(TestDriver, Device);

TestDriver.prototype.init = function(config) {
  config
    .state('ready')
    .type('testdriver')
    .name('Matt\'s Test Device')
    .when('ready', { allow: ['change', 'test', 'error', 'test-number', 'test-text', 'test-none', 'test-date', 'test-custom-error'] })
    .when('changed', { allow: ['prepare', 'test', 'error'] })
    .map('change', this.change)
    .map('prepare', this.prepare)
    .map('test', this.test, [{ name: 'value', type: 'number'}])
    .map('error', this.returnError, [{ name: 'error', type: 'string'}])
    .monitor('foo')
    .monitor('disabledMonitor', { disable: true })
    .monitor('enabledMonitor', { disable: false })
    .stream('bar', this.streamBar)
    .stream('foobar', this.streamFooBar, {binary: true})
    .stream('fooobject', this.streamObject)
    .stream('disabledStream', function(stream){}, { disable: true })
    .stream('enabledStream', function(stream){}, { disable: false })
    .map('test-number', function(x, cb) { cb(); }, [{ name: 'value', type: 'number'}])
    .map('test-text', function(x, cb) { this.message = x; cb(); }, [{ name: 'value', type: 'text'}])
    .map('test-none', function(x, cb) { cb(); }, [{ name: 'value'}])
    .map('test-date', function(x, cb) { cb(); }, [{ name: 'value', type: 'date'}])
    .map('test-custom-error', this.customError);
};

TestDriver.prototype.customError = function(cb) {
  cb(new Device.ActionError(401, {message: 'custom error message'}))
}

TestDriver.prototype.test = function(value, cb) {
  this.value = value;
  cb();
};

TestDriver.prototype.change = function(cb) {
  this.state = 'changed';
  cb();
};

TestDriver.prototype.prepare = function(cb) {
  this.state = 'ready';
  cb();
};

TestDriver.prototype.streamObject = function(stream) {
  this._streamObject = stream;
};

TestDriver.prototype.returnError = function(error, cb) {
  cb(new Error(error));
};

TestDriver.prototype.incrementStreamValue = function() {
  this.bar++;
  if(this._stream) {
    this._stream.write(this.bar);
  }
}

TestDriver.prototype.publishStreamObject = function(obj) {
  if(this._streamObject) {
    this._streamObject.write(obj);
  }
};

TestDriver.prototype.streamBar = function(stream) {
  this._stream = stream;
}

TestDriver.prototype.incrementFooBar = function(stream) {
  this._fooBar++;
  var buf = new Buffer([this._fooBar]);
  this._streamFooBar.write(buf);
}

TestDriver.prototype.streamFooBar = function(stream) {
  this._streamFooBar = stream;
}
