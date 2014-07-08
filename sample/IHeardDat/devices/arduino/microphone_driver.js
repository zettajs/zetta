var Device = require('../../../../zetta_runtime').Device;
var util = require('util');

var Microphone = module.exports = function(port){
  Device.call(this);
  this.amplitude = 0;
};
util.inherits(Microphone, Device);

Microphone.prototype.init = function(config) {
  config
    .name('sound-sensor')
    .type('microphone')
    .state('ready')
    .monitor('amplitude');

  var self = this;
  setInterval(function(){
    self.amplitude = Math.floor(Math.random() * 100);
  }, 200);
};
