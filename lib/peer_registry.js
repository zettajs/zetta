const Registry = require('./registry');
const util = require('util');
const uuid = require('uuid');
const Query = require('calypso').Query;
const path = require('path');

class PeerRegistry extends Registry {
  constructor(opts) {
    if(!opts) {
      opts = {
        path: path.join(process.cwd(), './.peers'),
        collection: 'peers'  
      };  
    }  

    super(opts);
  }

  save(peer, cb) {
    if(peer.status !== 'failed' && peer.hasOwnProperty('error')) {
      delete peer.error; 
    }  

    peer.updated = Date.now();

    this.db.put(peer.id, peer, { valueEncoding: 'json' }, cb);
  }

  add(peer, cb) {
    const self = this;
    
    const peerQuery = Query.of('peers');
    const whereObject = {};

    if(peer.id) {
      whereObject.id = JSON.stringify(peer.id);
    } else if(peer.url) {
      whereObject.url = peer.url;
    }
    peerQuery.where(whereObject);
    self.find(peerQuery, (err, results) => {
      if(err && cb) {
        return cb(err);  
      }  

      const result = (results && results.length) ? results[0] : null;
      if(result) {
        result.status = peer.status;  
      }

      peer = result || peer;

      if(!peer.id) {
        peer.id = uuid.v4();
      }

      peer.status = peer.status || 'connecting';
      peer.direction = peer.direction || 'initiator';

      self.save(peer, err => {
        if(err && cb) {
          return cb(err);
        }
        
        if(cb) {
          cb(null, peer);
        }
      });
    });  
    
  }
}

module.exports = PeerRegistry;
