const assert = require('assert');
const path = require('path');
const levelup = require('levelup');
const memdown = require('memdown');
const PeerRegistry = require('../lib/peer_registry');
const Query = require('calypso').Query;

const dbPath = path.join(__dirname, './.peers');

describe('Peer Registry', function() {
  let db, opts;

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
    const reg = new PeerRegistry(opts);
    reg.save({ id: 0 }, function(err) {
      assert.ifError(err);
      done();
    });
  });

  it('should remove error property on peer save when status is not failed', function(done) {
    const reg = new PeerRegistry(opts);
    reg.save({ id: 0, error: new Error() }, function() {
      reg.get(0, function(err, result) {
        assert.equal(result.error, undefined);
        done();
      });
    });
  })

  it('should find multiple peers', function(done) {
    const reg = new PeerRegistry(opts);
    reg.save({ id: 0 }, function() {
      reg.save({ id: 1 }, function() {
        const query = Query.of('peers');
        reg.find(query, function(err, results) {
          assert.equal(results.length, 2);
          done();
        });
      });
    });
  });

  it('should get peers by id', function(done) {
    const reg = new PeerRegistry(opts);
    reg.save({ id: 12345 }, function() {
      reg.get(12345, function(err, peer) {
        assert(peer);
        done();
      });
    });
  });

  it('should delete peers', function(done) {
    const reg = new PeerRegistry(opts);
    const peer = { id: 123456 };
    reg.save(peer, function() {
      reg.remove(peer, function(err, peer) {
        assert.ifError(err);
        done();
      });
    });
  });

  it('should close', function(done) {
    const reg = new PeerRegistry(opts);
    reg.close(function(err) {
      assert.ifError(err);
      done();
    });
  });

  describe('#add', function() {
    it('should save new peers', function(done) {
      const reg = new PeerRegistry(opts);
      const peer = {id: 'someid'};
      
      reg.add(peer, function(err, result) {
        assert.ok(result);
        done();
      });
    });

    it('should generate an ID for new peers', function(done) {
      const reg = new PeerRegistry(opts);
      const peer = {id: 'someid'};
      
      reg.add(peer, function(err, result) {
        assert.ok(result.id);
        done();
      });
    });

    it('should update existing peers', function(done) {
      const reg = new PeerRegistry(opts);
      const peer = { id: 12345 };
      
      reg.save(peer, function() {
        reg.add(peer, function(err, result) {
          assert.equal(result.id, peer.id);
          done();
        });
      });
    });

    it('propagates errors from #find', function(done) {
      const reg = new PeerRegistry(opts);
      const peer = {id: 'someid'};
      
      reg.find = function(key, cb) {
        cb(new Error());
      };

      reg.add(peer, function(err, result) {
        assert.ok(err);
        done();
      });
    });

    it('propagates errors from #save', function(done) {
      const reg = new PeerRegistry(opts);
      const peer = {};
      
      reg.save = function(key, cb) {
        cb(new Error());
      };

      reg.add(peer, function(err, result) {
        assert.ok(err);
        done();
      });
    });


    it('it should not match entries when both .url are undefined or null', function(done) {
      const reg = new PeerRegistry(opts);
      const peer1 = { id: 'some-peer-1'};
      const peer2 = { id: 'some-peer-2'};
      
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
      const reg = new PeerRegistry(opts);
      const peer = { id: '1e309'};
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
