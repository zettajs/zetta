var Registry = require('./registry');
var util = require('util');
var uuid = require('uuid');
var Query = require('calypso').Query;
var path = require('path');

var PeerRegistry = module.exports = function(opts) {
  if(!opts) {
    opts = {
      path: path.join(process.cwd(), './.peers'),
      collection: 'peers'  
    };  
  }  

  Registry.call(this, opts);
};
util.inherits(PeerRegistry, Registry);

PeerRegistry.prototype.save = function(peer, cb) {
  if(peer.status !== 'failed' && peer.hasOwnProperty('error')) {
    delete peer.error; 
  }  

  peer.updated = Date.now();

  this.db.put(peer.id, peer, { valueEncoding: 'json' }, cb);
}

PeerRegistry.prototype.add = function(peer, cb) {
  var self = this;
  
  var peerQuery = Query.of('peers');
  var whereObject = {};

  if(peer.id) {
    whereObject.id = JSON.stringify(peer.id);
  } else if(peer.url) {
    whereObject.url = peer.url;
  }
  peerQuery.where(whereObject);
  self.find(peerQuery, function(err, results) {
    if(err && cb) {
      return cb(err);  
    }  

    var result = (results && results.length) ? results[0] : null;
    if(result) {
      result.status = peer.status;  
    }

    peer = result || peer;

    if(!peer.id) {
      peer.id = uuid.v4();
    }

    peer.status = peer.status || 'connecting';
    peer.direction = peer.direction || 'initiator';

    self.save(peer, function(err) {
      if(err && cb) {
        return cb(err);
      }
      
      if(cb) {
        cb(null, peer);
      }
    });
  });  
  
};

