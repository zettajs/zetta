const util = require('util');
const levelup = require('levelup');
const memdown = require('memdown');
const DeviceRegistry = require('../../lib/device_registry');

class MemRegistry extends DeviceRegistry {
  constructor() {
    const db = levelup({ db: memdown });
    super({ db, collection: 'devices' });
  }
}

module.exports = MemRegistry;