const assert = require('assert');
const path = require('path');
const Registry = require('../lib/registry');
const Query = require('calypso').Query;
const memdown = require('memdown');
const levelup = require('levelup');

const dbPath = path.join(__dirname, './.peers');

describe('Registry Compaction', () => {
  describe('custom database', () => {
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

    it('should not have a compactor property with a custom db.', () => {
      const reg = new Registry(opts);
      assert.ok(!reg.compactor); 
    });
  });
  
  describe('standard medea database', () => {
    let reg;
    const opts = {
      collection: 'peer',
      path: './.peers'
    };

    beforeEach(done => {
      reg = new Registry(opts); 
      done();
    });

    afterEach(done => {
      if(reg.db) {
        reg.close(done);
      } else {
        done();
      }
    });

    it('should have a compactor property without a custom db.', () => { 
      assert.ok(reg.compactor);
    });

    it('should call open before compact.', done => {
      const compactor = {};

      compactor.open = (path, cb) => {
        assert.ok(path);
        assert.ok(cb);
        done();
      };

      reg.compactor = compactor;
      reg._init(e => {
          
      });
    });

    it('should call compact.', done => { 
      const compactor = {};

      compactor.open = (path, cb) => {
        assert.ok(path);
        assert.ok(cb);
        done();
      };

      compactor.compact = cb => {
        assert.ok(cb);
        done();
      };

      reg.compactor = compactor;
      reg._init(e => {
          
      });
    });  

    it('should call close.', done => {
      const compactor = {};

      compactor.open = (path, cb) => {
        assert.ok(path);
        assert.ok(cb);
        done();
      };

      compactor.compact = cb => {
        assert.ok(cb);
        done();
      };

      compactor.close = cb => {
        assert.ok(cb);
        done();
      };

      reg.compactor = compactor;
      reg._init(e => {
          
      });
    });
  });
});
