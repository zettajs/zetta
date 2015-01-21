var Registry = require('./registry');
var util = require('util');

var DeviceRegistry = module.exports = function(opts) {
  if(!opts) {
    opts = {
      path: './registry',
      collection: 'devices'  
    };  
  } 

  Registry.call(this, opts);
};
util.inherits(DeviceRegistry, Registry);

DeviceRegistry.prototype.save = function(machine, cb) {
  var json = machine.properties();
  json.id = machine.id; // add id to properties
  this.db.put(machine.id, json, { valueEncoding: 'json' }, cb);
};
