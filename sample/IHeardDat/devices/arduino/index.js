var Scout = require('../../../../zetta_runtime').Scout;
var LCDDriver = require('./lcd_driver');
var MicrophoneDriver = require('./microphone_driver');
var util = require('util');

var ArduinoScout = module.exports = function() {
  Scout.call(this);
}
util.inherits(ArduinoScout, Scout);

ArduinoScout.prototype.initDevice = function(type, Class) {
  var self = this;
  var query = self.server.where({type: type});

  self.server.find(query, function(err, results) {
    if(err) {
      return;
    }
    if (results.length) {
      var instance = self.provision(results[0], Class);
    } else {
      console.log('no device found for ' + type)
      self.discover(Class);
   }
  });
};

ArduinoScout.prototype.init = function(cb) {
  var self = this;
  setTimeout(function() {
    self.initDevice('microphone', MicrophoneDriver);
    self.initDevice('lcd', LCDDriver);
  }, 500);
  cb();
};


