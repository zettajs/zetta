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
    .monitor('amplitude')
    .stream('somevar', this.streamSomeVar, { binary: true});

  var self = this;
  setInterval(function(){
    self.amplitude = Math.floor(Math.random() * 100);
  }, 200);
};

Microphone.prototype.streamSomeVar = function(stream) {
  setInterval(function(){
    var buf = new Buffer(1);
    buf[0] = Math.floor(Math.random() * 255);
    stream.write(buf);
  }, 25);
};
