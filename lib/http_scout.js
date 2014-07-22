var Scout = require('./scout');
var util = require('util');

var HTTPScout = module.exports = function() {
  this.driverFunctions = {};
  Scout.call(this);
};
util.inherits(HTTPScout, Scout);

HTTPScout.prototype.init = function(next) {
  next();
};

HTTPScout.prototype.createHTTPDevice = function(type, id, name) {
  var constructor = this.driverFunctions[type];
  var deviceObject = { id: id, name: name};
  if(constructor) {
    if(id) {
      this.provision(deviceObject, constructor);
    } else {
      this.discover(constructor, arguments);
    }
    return true;
  } else {
    this.server.log('Constructor for type: ' + type + ' not found.');
    return false;
  }
};

