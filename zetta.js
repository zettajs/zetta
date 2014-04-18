var Logger = require('./logger')();
var Scientist = require('./scientist');

var Zetta = {}; 

Zetta.log = function(msg, data) {
  Logger.emit('user-log', msg, data);
};

Zetta.configure = function(/* args */) {
  return Scientist.configure.apply(null,arguments);
};

module.exports = Zetta;
