var Registry = require('./registry');
var util = require('util');

var PeerRegistry = module.exports = function(opts) {
  if(!opts) {
    opts = {
      path: './peers',
      collection: 'peers'  
    };  
  }  

  Registry.call(this, opts);
};
util.inherits(PeerRegistry, Registry);
