var Zetta = require('./zetta');

var exp = function(options) {
  var zetta = new Zetta(options);
  return zetta;
}

exp.Device = require('zetta-device');
exp.Scout = require('zetta-scout');
exp.DeviceRegistry = require('./lib/device_registry')
exp.PeerRegistry = require('./lib/peer_registry')

module.exports = exp;
