const Zetta = require('./zetta');

const exp = options => {
  const zetta = new Zetta(options);
  return zetta;
};

exp.Device = require('zetta-device');
exp.HttpDevice = require('zetta-http-device');
exp.Scout = require('zetta-scout');
exp.DeviceRegistry = require('./lib/device_registry')
exp.PeerRegistry = require('./lib/peer_registry')

module.exports = exp;
