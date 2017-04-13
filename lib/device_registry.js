const Registry = require('./registry');
const util = require('util');
const path = require('path');

const DeviceRegistry = module.exports = function(opts) {
  if(!opts) {
    opts = {
      path: path.join(process.cwd(), './.devices'),
      collection: 'devices'  
    };  
  } 

  Registry.call(this, opts);
};
util.inherits(DeviceRegistry, Registry);

DeviceRegistry.prototype.save = function(machine, cb) {
  const json = machine.properties();
  json.id = machine.id; // add id to properties
  this.db.put(machine.id, json, { valueEncoding: 'json' }, cb);
};
