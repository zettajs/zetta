var Device = require('../../../../zetta_runtime').Device;
var util = require('util');

var LCD = module.exports = function(){
  Device.call(this);
  this.message = null;
};
util.inherits(LCD, Device);

LCD.prototype.init = function(config) {
  config
    .name('message-screen')
    .type('lcd')
    .state('ready')
    .when('ready', { allow: ['change'] })
    .map('change', this.change, [{ name: 'message', type: 'string' }])
    .monitor('message');
}

LCD.prototype.change = function(message, cb) {
  this.message = message;
  cb();
};
