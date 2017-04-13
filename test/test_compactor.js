const assert = require('assert');
const path = require('path');
const Registry = require('../lib/registry');
const Query = require('calypso').Query;
const memdown = require('memdown');
const levelup = require('levelup');

const dbPath = path.join(__dirname, './.peers');

describe('Registry Compaction', function() {
  describe('custom database', function() {
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

    it('should not have a compactor property with a custom db.', function() {
      const reg = new Registry(opts);
      assert.ok(!reg.compactor); 
    });  
    
  });
  
  describe('standard medea database', function() {
    let reg;
    const opts = {
      collection: 'peer',
      path: './.peers'
    };

    beforeEach(function(done) {
      reg = new Registry(opts); 
      done();
    });

    afterEach(function(done) {
      if(reg.db) {
        reg.close(done);
      } else {
        done();
      }
    });

    it('should have a compactor property without a custom db.', function() { 
      assert.ok(reg.compactor);
    });

    it('should call open before compact.', function(done) {
      const compactor = {};

      compactor.open = function(path, cb) {
        assert.ok(path);
        assert.ok(cb);
        done();
      };

      reg.compactor = compactor;
      reg._init(function(e) {
          
      });
    });

    it('should call compact.', function(done) { 
      const compactor = {};

      compactor.open = function(path, cb) {
        assert.ok(path);
        assert.ok(cb);
        done();
      };

      compactor.compact = function(cb) {
        assert.ok(cb);
        done();
      };

      reg.compactor = compactor;
      reg._init(function(e) {
          
      });
    });  

    it('should call close.', function(done) {
      const compactor = {};

      compactor.open = function(path, cb) {
        assert.ok(path);
        assert.ok(cb);
        done();
      };

      compactor.compact = function(cb) {
        assert.ok(cb);
        done();
      };

      compactor.close = function(cb) {
        assert.ok(cb);
        done();
      };

      reg.compactor = compactor;
      reg._init(function(e) {
          
      });
    });
  });
});
