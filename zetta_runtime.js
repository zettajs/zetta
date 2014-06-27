var Runtime = require('./zetta');

var exp = function(options) {
  var zetta = new Runtime(options);
  return zetta;
}

exp.Device = require('./lib/device');
exp.Scout = require('./lib/scout');
exp.Scientist = require('./lib/scientist');

module.exports = exp;
