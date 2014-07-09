var Runtime = require('../lib/runtime');
var assert = require('assert');
var Mocks = require('./fixture/scout_test_mocks');
var Registry = Mocks.MockRegistry;
var EventEmitter = require('events').EventEmitter;

describe('Runtime', function(){
  describe('Reactive', function(done){
    var runtime = null;
    beforeEach(function() {
      var reg = new Registry();
      runtime = new Runtime({registry: reg});
    });

    it('implements the filter method.', function() {
      assert.ok(runtime.filter);
    });

    it('implements the map method.', function() {
      assert.ok(runtime.map);
    });

    it('implements the zip method.', function() {
      assert.ok(runtime.zip);
    });

    it('implements the subscribe method.', function() {
      assert.ok(runtime.subscribe);
    });

    it('implements the observe method.', function() {
      assert.ok(runtime.observe);
    });

    it('calls the calls the filter method on deviceready', function() {
      var d = { type: 'test' };

      runtime
        .filter(function(e) {
          assert.equal(e.type, 'test');
          done();
        });

      runtime.emit('deviceready', d);
    });

    it('calls subscribe when the observable chain is complete.', function(done) {
      var d = { type: 'test' };
      runtime
        .subscribe(function(d) {
          assert.equal(d.type, 'test');
          done();
        });

      runtime.emit('deviceready', d);
    });

    it('calls map on the observable chain when an event occurs', function(done) {
      var d = { type: 'test' };
      runtime
        .map(function(d) {
          assert.equal(d.type, 'test');
          return d;
        })
        .subscribe(function(x) {
          assert.equal(x.type, 'test');
          done();
        });

      runtime.emit('deviceready', d);

    });

    it('only calls zip when all conditions are fulfilled.', function(done) {
      var d1 = { type: 'test' };
      var d2 = { type: 'test2' };

      var filter2 = runtime.filter(function(d) {
        return d.type == 'test2';
      });

      runtime
        .filter(function(d) {
          return d.type == 'test';
        }).zip(filter2, function(){
          return arguments;
        })
        .subscribe(function(x) {
          assert.equal(x[0].type, 'test');
          assert.equal(x[1].type, 'test2');
          done();
        });

      runtime.emit('deviceready', d1);
      runtime.emit('deviceready', d2);
    });

    describe('Runtime#observe', function() {
      it('will call the observe callback when the query is fullfilled.', function(done) {
        var q = runtime.where({type: 'test'});
        var d = { type: 'test' };
        runtime.observe([q], function(device) {
          assert.equal(device.type, 'test');
          done();
        });

        runtime.emit('deviceready', d);
      });

      it('will call the observe callback when all queries are fullfilled.', function(done) {
          var q1 = runtime.where({ type: 'test1' });
          var q2 = runtime.where({ type: 'test2' });

          var d1 = { type: 'test1' };
          var d2 = { type: 'test2' };

          runtime.observe([q1, q2], function(one, two) {
            assert.equal(one.type, 'test1');
            assert.equal(two.type, 'test2');
            done();
          });

          runtime.emit('deviceready', d1);
          runtime.emit('deviceready', d2);
      });

      it('will call the observe callback when all queries are fullfilled, and when events happen in any order', function(done) {
          var q1 = runtime.where({ type: 'test1' });
          var q2 = runtime.where({ type: 'test2' });

          var d1 = { type: 'test1' };
          var d2 = { type: 'test2' };

          runtime.observe([q1, q2], function(one, two) {
            assert.equal(one.type, 'test1');
            assert.equal(two.type, 'test2');
            done();
          });

          runtime.emit('deviceready', d2);
          runtime.emit('deviceready', d1);
      });


  });

  describe('Extended reactive syntax', function() {
    it('will respond the same way using the extended reactive syntax.', function(done) {
      runtime
        .filter(function(d) {
          return d.type === 'test1';
        })
        .zip(runtime.filter(function(d){
          return d.type === 'test2';
        }), function() {
          return Array.prototype.slice.call(arguments);
        })
        .subscribe(function(x) {
          var devOne = x[0];
          var devTwo = x[1];
          assert.equal(devOne.type, 'test1');
          assert.equal(devTwo.type, 'test2');
          done();
        });

        var d1 = { type: 'test1' };
        var d2 = { type: 'test2' };

        runtime.emit('deviceready', d1);
        runtime.emit('deviceready', d2);
    });

    it('take will only fire with one pair.', function(done) {
      var emitter = new EventEmitter();
      var fired = 0;
      runtime
        .filter(function(d) {
          return d.type === 'test1';
        })
        .zip(runtime.filter(function(d){
          return d.type === 'test2';
        }), function() {
          return Array.prototype.slice.call(arguments);
        })
        .take(1)
        .subscribe(function(x) {
          var devOne = x[0];
          var devTwo = x[1];
          assert.equal(devOne.type, 'test1');
          assert.equal(devTwo.type, 'test2');
          fired++;
          emitter.on('complete', function() {
            assert.equal(fired, 1);
            done();
          });
        });

        var d1 = { type: 'test1' };
        var d2 = { type: 'test2' };

        runtime.emit('deviceready', d1);
        runtime.emit('deviceready', d2);
        runtime.emit('deviceready', d1);
        runtime.emit('deviceready', d2);
        emitter.emit('complete');
      });

      it('will only fire take one time', function(done) {
        var d = { type: 'test' };
        var fired = 0;
        var emitter = new EventEmitter();
        runtime
          .take(1)
          .subscribe(function(x) {
            assert.equal(x.type, 'test');
            fired++;
            emitter.on('complete', function(){
              assert.equal(fired, 1);
              done();
            });
          });

        runtime.emit('deviceready', d);
        emitter.emit('complete');
      });

      it('will only fire take twice.', function(done) {
        var d = { type: 'test' };
        var fired = 0;
        var emitter = new EventEmitter();
        runtime
          .take(2)
          .subscribe(function(x) {
            assert.equal(x.type, 'test');
            fired++;
            if(fired > 1) {
              emitter.on('complete', function(){
                assert.equal(fired, 2);
                done();
              });
            }
          });

        runtime.emit('deviceready', d);
        runtime.emit('deviceready', d);
        runtime.emit('deviceready', d);
        emitter.emit('complete');
      });  


    });
  });
});

