var assert = require('assert');
var path = require('path');
var levelup = require('levelup');
var leveldown = require('leveldown');
var PeerRegistry = require('../lib/peer_registry');

var dbPath = path.join(__dirname, './.peers');

describe('Peer Registry', function() {
  var db;

  beforeEach(function(done) {
    db = levelup(dbPath);
    done();
  });

  afterEach(function(done) {
    if (db) {
      db.close(function() {
        leveldown.destroy(dbPath, done);
      });
    }
  });

  it('should save a peer', function(done) {
    var reg = new PeerRegistry(db);
    reg.save({ id: 0 }, function(err) {
      assert.ifError(err);
      done();
    });
  });

  it('should remove error property on peer save when status is not failed', function(done) {
    var reg = new PeerRegistry(db);
    reg.save({ id: 0, error: new Error() }, function() {
      reg.get(0, function(err, result) {
        assert.equal(result.error, undefined);
        done();
      });
    });
  })

  it('should find multiple peers', function(done) {
    var reg = new PeerRegistry(db);
    reg.save({ id: 0 }, function() {
      reg.save({ id: 1 }, function() {
        var query = { match: function() { return true; } };
        reg.find(query, function(err, results) {
          assert.equal(results.length, 2);
          done();
        });
      });
    });
  });

  it('should get peers by id', function(done) {
    var reg = new PeerRegistry(db);
    reg.save({ id: 012345 }, function() {
      reg.get(012345, function(err, peer) {
        assert(peer);
        done();
      });
    });
  });

  it('should delete peers', function(done) {
    var reg = new PeerRegistry(db);
    var peer = { id: 0123456 };
    reg.save(peer, function() {
      reg.remove(peer, function(err, peer) {
        assert.ifError(err);
        done();
      });
    });
  });

  it('should close', function(done) {
    var reg = new PeerRegistry(db);
    reg.close(function(err) {
      assert.ifError(err);
      done();
    });
  });

  describe('#add', function() {
    it('should save new peers', function(done) {
      var reg = new PeerRegistry(db);
      var peer = {};
      
      reg.add(peer, function(err, result) {
        assert.ok(result);
        done();
      });
    });

    it('should generate an ID for new peers', function(done) {
      var reg = new PeerRegistry(db);
      var peer = {};
      
      reg.add(peer, function(err, result) {
        assert.ok(result.id);
        done();
      });
    });

    it('should update existing peers', function(done) {
      var reg = new PeerRegistry(db);
      var peer = { id: 012345 };
      
      reg.save(peer, function() {
        reg.add(peer, function(err, result) {
          assert.equal(result.id, peer.id);
          done();
        });
      });
    });

    it('propagates errors from #find', function(done) {
      var reg = new PeerRegistry(db);
      var peer = {};
      
      reg.find = function(key, cb) {
        cb(new Error());
      };

      reg.add(peer, function(err, result) {
        assert.ok(err);
        done();
      });
    });

    it('propagates errors from #save', function(done) {
      var reg = new PeerRegistry(db);
      var peer = {};
      
      reg.save = function(key, cb) {
        cb(new Error());
      };

      reg.add(peer, function(err, result) {
        assert.ok(err);
        done();
      });
    });


    it('it should not match entries when both .url are undefined or null', function(done) {
      var reg = new PeerRegistry(db);
      var peer1 = { name: 'some-peer-1'};
      var peer2 = { name: 'some-peer-2'};
      
      reg.add(peer1, function(err, result1) {
        assert.ok(result1.id);
        reg.add(peer2, function(err, result2) {
          assert.ok(result2.id);
          assert.ok(result1.id !== result2.id, 'should create two unique peers')
          done();
        });
      });
    });



  });
});
