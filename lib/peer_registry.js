var path = require('path');
var level = require('level');
var uuid = require('node-uuid');

var PeerRegistry = module.exports = function(db){
  this.db = db || level(path.join(process.cwd(), './.peers'));
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

PeerRegistry.prototype.add = function(peerUrl, cb) {
  var self = this;

  var peerQuery = {
    match: function(item) {
      return item.url === peerUrl;
    }
  };

  self.find(peerQuery, function(err, results) {
    if (err) {
      return cb(err);
    }

    var peer = (results && results.length) ? results[0] : { url: peerUrl };

    if (!peer.id) {
      peer.id = uuid.v4();
    }

    peer.status = 'connecting';

    self.save(peer, function(err) {
      if (err) {
        return cb(err);
      }

      cb(null, peer);
    });
  });
};

PeerRegistry.prototype.get = function(id, cb) {
  this.db.get(id, cb);
};

PeerRegistry.prototype.save = function(peer, cb) {
  this.db.put(peer.id, JSON.stringify(peer), cb);
};

PeerRegistry.prototype.close = function() {
  this.db.close.apply(this.db, arguments);
};
