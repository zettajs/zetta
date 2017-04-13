const Scout = require('zetta-scout');
const util = require('util');

const HTTPScout = module.exports = function() {
  this.driverFunctions = {};
  Scout.call(this);
};
util.inherits(HTTPScout, Scout);

HTTPScout.prototype.init = function(next) {
  next();
};

HTTPScout.prototype.createHTTPDevice = function(type, id, name) {
  const constructor = this.driverFunctions[type];
  const deviceObject = { id: id, name: name};
  if(constructor) {
    if(id) {
      this.provision(deviceObject, constructor);
    } else {
      this.discover(constructor, arguments);
    }
    return true;
  } else {
    this.server.log(`Constructor for type: ${type} not found.`);
    return false;
  }
};

