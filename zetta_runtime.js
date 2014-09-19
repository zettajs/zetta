var Zetta = require('./zetta');

var exp = function(options) {
  var zetta = new Zetta(options);
  return zetta;
}

exp.Device = require('./lib/device');
exp.HttpDevice = require('./lib/http_device');
exp.Scout = require('./lib/scout');

module.exports = exp;
