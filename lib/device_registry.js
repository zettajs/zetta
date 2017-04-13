const Registry = require('./registry');
const util = require('util');
const path = require('path');

class DeviceRegistry extends Registry {
  constructor(opts) {
    if(!opts) {
      opts = {
        path: path.join(process.cwd(), './.devices'),
        collection: 'devices'  
      };  
    } 

    super(opts);
  }

  save(machine, cb) {
    const json = machine.properties();
    json.id = machine.id; // add id to properties
    this.db.put(machine.id, json, { valueEncoding: 'json' }, cb);
  }
}

module.exports = DeviceRegistry;
