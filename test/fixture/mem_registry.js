var util = require('util');
var levelup = require('levelup');
var memdown = require('memdown');
var DeviceRegistry = require('../../lib/device_registry');

var MemRegistry = module.exports = function() {
  var db = levelup({ db: memdown });
  DeviceRegistry.call(this, { db: db, collection: 'devices' });
}
util.inherits(MemRegistry, DeviceRegistry);

