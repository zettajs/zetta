var path = require('path');
var levelup = require('levelup');
var medeadown = require('medeadown');
var uuid = require('node-uuid');

var PeerRegistry = module.exports = function(db){
  if (db) {
    this.db = db;
  } else {
    var location = path.join(process.cwd(), './.peers');
    this.db = levelup(location, { db: medeadown });
  }
};

PeerRegistry.prototype.find = function(query, cb) {
  var results = [];

  this.db.createReadStream()
    .on('data', function (data) {
      var obj = JSON.parse(data.value);
      if(query.match(obj)) {
        results.push(obj);
      }
    })
    .on('error', cb)
    .on('end', function () {
      cb(null, results);
    });
};

PeerRegistry.prototype.add = function(peer, cb) {
  var self = this;

  var peerQuery = {
    match: function(item) {
      if (peer.id && item.id === peer.id) {
        return true;
      }

      if (peer.url && peer.url === item.url) {
        return true;
      }
      return false;
    }
  };

  self.find(peerQuery, function(err, results) {
    if (err && cb) {
      return cb(err);
    }
    var result = (results && results.length) ? results[0] : null;
    if (result) {
      result.status = peer.status;
    }
    
    peer = result || peer;
    peer.status = peer.status || 'connecting';
    peer.direction = peer.direction || 'initiator';
    
    self.save(peer, function(err) {
      if (err && cb) {
        return cb(err);
      }

      if (cb) {
        cb(null, peer);
      }
    });
  });
};

PeerRegistry.prototype.get = function(id, cb) {
  this.db.get(id, cb);
};

PeerRegistry.prototype.save = function(peer, cb) {
  if (peer.status !== 'failed' && peer.hasOwnProperty('error')) {
    delete peer.error;
  }

  peer.updated = Date.now();

  this.db.put(peer.id, JSON.stringify(peer), cb);
};

PeerRegistry.prototype.remove = function(peer, cb) {
  this.db.del(peer.id, cb);
};

PeerRegistry.prototype.close = function() {
  this.db.close.apply(this.db, arguments);
};
