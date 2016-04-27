var assert = require('assert');
var path = require('path');
var levelup = require('levelup');
var memdown = require('memdown');
var PeerRegistry = require('../lib/peer_registry');
var Query = require('calypso').Query;

var dbPath = path.join(__dirname, './.peers');

describe('Peer Registry', function() {
  var db, opts;

  beforeEach(function(done) {
    db = levelup(dbPath, { db: memdown });
    opts = { db: db, collection: 'peers' };
    done();
  });

  afterEach(function(done) {
    if (db) {
      db.close(done);
    }
  });

  it('should save a peer', function(done) {
    var reg = new PeerRegistry(opts);
    reg.save({ id: 0 }, function(err) {
      assert.ifError(err);
      done();
    });
  });

  it('should remove error property on peer save when status is not failed', function(done) {
    var reg = new PeerRegistry(opts);
    reg.save({ id: 0, error: new Error() }, function() {
      reg.get(0, function(err, result) {
        assert.equal(result.error, undefined);
        done();
      });
    });
  })

  it('should find multiple peers', function(done) {
    var reg = new PeerRegistry(opts);
    reg.save({ id: 0 }, function() {
      reg.save({ id: 1 }, function() {
        var query = Query.of('peers');
        reg.find(query, function(err, results) {
          assert.equal(results.length, 2);
          done();
        });
      });
    });
  });

  it('should get peers by id', function(done) {
    var reg = new PeerRegistry(opts);
    reg.save({ id: 012345 }, function() {
      reg.get(012345, function(err, peer) {
        assert(peer);
        done();
      });
    });
  });

  it('should delete peers', function(done) {
    var reg = new PeerRegistry(opts);
    var peer = { id: 0123456 };
    reg.save(peer, function() {
      reg.remove(peer, function(err, peer) {
        assert.ifError(err);
        done();
      });
    });
  });

  it('should close', function(done) {
    var reg = new PeerRegistry(opts);
    reg.close(function(err) {
      assert.ifError(err);
      done();
    });
  });

  describe('#add', function() {
    it('should save new peers', function(done) {
      var reg = new PeerRegistry(opts);
      var peer = {id: 'someid'};
      
      reg.add(peer, function(err, result) {
        assert.ok(result);
        done();
      });
    });

    it('should generate an ID for new peers', function(done) {
      var reg = new PeerRegistry(opts);
      var peer = {id: 'someid'};
      
      reg.add(peer, function(err, result) {
        assert.ok(result.id);
        done();
      });
    });

    it('should update existing peers', function(done) {
      var reg = new PeerRegistry(opts);
      var peer = { id: 012345 };
      
      reg.save(peer, function() {
        reg.add(peer, function(err, result) {
          assert.equal(result.id, peer.id);
          done();
        });
      });
    });

    it('propagates errors from #find', function(done) {
      var reg = new PeerRegistry(opts);
      var peer = {id: 'someid'};
      
      reg.find = function(key, cb) {
        cb(new Error());
      };

      reg.add(peer, function(err, result) {
        assert.ok(err);
        done();
      });
    });

    it('propagates errors from #save', function(done) {
      var reg = new PeerRegistry(opts);
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
      var reg = new PeerRegistry(opts);
      var peer1 = { id: 'some-peer-1'};
      var peer2 = { id: 'some-peer-2'};
      
      reg.add(peer1, function(err, result1) {
        assert.ok(result1.id);
        reg.add(peer2, function(err, result2) {
          assert.ok(result2.id);
          assert.ok(result1.id !== result2.id, 'should create two unique peers')
          done();
        });
      });
    });

    // issue 308: https://github.com/zettajs/zetta/issues/308
    it('should get a peer added with an ID greater than Number.MAX_VALUE', function(done) {
      var reg = new PeerRegistry(opts);
      var peer = { id: '1e309'};
      reg.add(peer, function() {
        reg.get('1e309', function(err, peer) {
          console.log(err);
          assert(peer);
          done();
        });
      });
    });


  });
});
