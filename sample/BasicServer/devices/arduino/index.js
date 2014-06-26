var Scout = require('../../../../zetta_runtime').Scout;
var LedDriver = require('./led_driver');
var util = require('util');

var ArduinoScout = module.exports = function() {
  Scout.call(this);
}
util.inherits(ArduinoScout, Scout);

ArduinoScout.prototype.init = function(cb) {
  var self = this;
  setTimeout(function(){
    self.discover(LedDriver);
  }, 2000);
  cb();
};
