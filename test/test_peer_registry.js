const assert = require('assert');
const path = require('path');
const levelup = require('levelup');
const memdown = require('memdown');
const PeerRegistry = require('../lib/peer_registry');
const Query = require('calypso').Query;

const dbPath = path.join(__dirname, './.peers');

describe('Peer Registry', () => {
  let db;
  let opts;

  beforeEach(done => {
    db = levelup(dbPath, { db: memdown });
    opts = { db, collection: 'peers' };
    done();
  });

  afterEach(done => {
    if (db) {
      db.close(done);
    }
  });

  it('should save a peer', done => {
    const reg = new PeerRegistry(opts);
    reg.save({ id: 0 }, err => {
      assert.ifError(err);
      done();
    });
  });

  it('should remove error property on peer save when status is not failed', done => {
    const reg = new PeerRegistry(opts);
    reg.save({ id: 0, error: new Error() }, () => {
      reg.get(0, (err, result) => {
        assert.equal(result.error, undefined);
        done();
      });
    });
  })

  it('should find multiple peers', done => {
    const reg = new PeerRegistry(opts);
    reg.save({ id: 0 }, () => {
      reg.save({ id: 1 }, () => {
        const query = Query.of('peers');
        reg.find(query, (err, results) => {
          assert.equal(results.length, 2);
          done();
        });
      });
    });
  });

  it('should get peers by id', done => {
    const reg = new PeerRegistry(opts);
    reg.save({ id: 12345 }, () => {
      reg.get(12345, (err, peer) => {
        assert(peer);
        done();
      });
    });
  });

  it('should delete peers', done => {
    const reg = new PeerRegistry(opts);
    const peer = { id: 123456 };
    reg.save(peer, () => {
      reg.remove(peer, (err, peer) => {
        assert.ifError(err);
        done();
      });
    });
  });

  it('should close', done => {
    const reg = new PeerRegistry(opts);
    reg.close(err => {
      assert.ifError(err);
      done();
    });
  });

  describe('#add', () => {
    it('should save new peers', done => {
      const reg = new PeerRegistry(opts);
      const peer = {id: 'someid'};
      
      reg.add(peer, (err, result) => {
        assert.ok(result);
        done();
      });
    });

    it('should generate an ID for new peers', done => {
      const reg = new PeerRegistry(opts);
      const peer = {id: 'someid'};
      
      reg.add(peer, (err, result) => {
        assert.ok(result.id);
        done();
      });
    });

    it('should update existing peers', done => {
      const reg = new PeerRegistry(opts);
      const peer = { id: 12345 };
      
      reg.save(peer, () => {
        reg.add(peer, (err, result) => {
          assert.equal(result.id, peer.id);
          done();
        });
      });
    });

    it('propagates errors from #find', done => {
      const reg = new PeerRegistry(opts);
      const peer = {id: 'someid'};
      
      reg.find = (key, cb) => {
        cb(new Error());
      };

      reg.add(peer, (err, result) => {
        assert.ok(err);
        done();
      });
    });

    it('propagates errors from #save', done => {
      const reg = new PeerRegistry(opts);
      const peer = {};
      
      reg.save = (key, cb) => {
        cb(new Error());
      };

      reg.add(peer, (err, result) => {
        assert.ok(err);
        done();
      });
    });


    it('it should not match entries when both .url are undefined or null', done => {
      const reg = new PeerRegistry(opts);
      const peer1 = { id: 'some-peer-1'};
      const peer2 = { id: 'some-peer-2'};
      
      reg.add(peer1, (err, result1) => {
        assert.ok(result1.id);
        reg.add(peer2, (err, result2) => {
          assert.ok(result2.id);
          assert.ok(result1.id !== result2.id, 'should create two unique peers')
          done();
        });
      });
    });

    // issue 308: https://github.com/zettajs/zetta/issues/308
    it('should get a peer added with an ID greater than Number.MAX_VALUE', done => {
      const reg = new PeerRegistry(opts);
      const peer = { id: '1e309'};
      reg.add(peer, () => {
        reg.get('1e309', (err, peer) => {
          console.log(err);
          assert(peer);
          done();
        });
      });
    });


  });
});
