var Zetta = require('./zetta');

var exp = function(options) {
  var zetta = new Zetta(options);
  return zetta;
}

exp.Device = require('zetta-device');
exp.HttpDevice = require('zetta-http-device');
exp.Scout = require('zetta-scout');

module.exports = exp;
