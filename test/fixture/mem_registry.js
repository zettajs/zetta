const util = require('util');
const levelup = require('levelup');
const memdown = require('memdown');
const DeviceRegistry = require('../../lib/device_registry');

const MemRegistry = module.exports = function() {
  const db = levelup({ db: memdown });
  DeviceRegistry.call(this, { db: db, collection: 'devices' });
};
util.inherits(MemRegistry, DeviceRegistry);

