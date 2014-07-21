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

