const Runtime = require('../lib/runtime');
const assert = require('assert');
const Registry = require('./fixture/mem_registry');
const EventEmitter = require('events').EventEmitter;
EventEmitter.prototype._sendLogStreamEvent = function(topic, args, cb) {
  if(cb) {
    cb()
  }
};

describe('Runtime', function(){
  describe('Reactive', function(done){
    let runtime = null;
    beforeEach(function() {
      const reg = new Registry();
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
      const d = new EventEmitter();
      d.type = 'test';

      runtime
        .filter(function(e) {
          assert.equal(e.type, 'test');
          done();
        });

      runtime.emit('deviceready', d);
    });

    it('calls subscribe when the observable chain is complete.', function(done) {
      const d = new EventEmitter();
      d.type = 'test';
      runtime
        .subscribe(function(d) {
          assert.equal(d.type, 'test');
          done();
        });

      runtime.emit('deviceready', d);
    });

    it('calls map on the observable chain when an event occurs', function(done) {
      const d = new EventEmitter();
      d.type = 'test';

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
      const d1 = new EventEmitter();
      d1.type = 'test';
      const d2 = new EventEmitter();
      d2.type = 'test2';

      const filter2 = runtime.filter(function(d) {
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
      it('returns a Subscription when a subscribe function is provided', function() {
        const q = runtime.where({ type: 'test' });

        const sub = runtime.observe(q, function(device) {
          // do nothing
        });

        assert(typeof(sub.dispose) === 'function');
      });

      it('returns an Observable when a subscribe function is not provided', function() {
        const q = runtime.where({ type: 'test' });

        const obs = runtime.observe(q);

        assert(typeof(obs.subscribe) === 'function');
      });

      it('will take a single query as the first argument', function(done) {
        const q = runtime.where({ type: 'test' });
        const d = new EventEmitter();
        d.type = 'test';

        runtime.observe(q, function(device) {
          assert.equal(device.type, 'test');
          done();
        });

        runtime.emit('deviceready', d);
      });

      it('will call the observe callback when the query is fullfilled.', function(done) {
        const q = runtime.where({type: 'test'});
        const d = new EventEmitter();
        d.type = 'test';
        runtime.observe([q], function(device) {
          assert.equal(device.type, 'test');
          done();
        });

        runtime.emit('deviceready', d);
      });

      it('will call the observe callback when all queries are fullfilled.', function(done) {
          const q1 = runtime.where({ type: 'test1' });
          const q2 = runtime.where({ type: 'test2' });

          const d1 = new EventEmitter();
          d1.type = 'test1'; 
          const d2 = new EventEmitter();
          d2.type = 'test2';

          runtime.observe([q1, q2], function(one, two) {
            assert.equal(one.type, 'test1');
            assert.equal(two.type, 'test2');
            done();
          });

          runtime.emit('deviceready', d1);
          runtime.emit('deviceready', d2);
      });

      it('will call the observe callback when all queries are fullfilled, and when events happen in any order', function(done) {
          const q1 = runtime.where({ type: 'test1' });
          const q2 = runtime.where({ type: 'test2' });

          const d1 = new EventEmitter();
          d1.type = 'test1'; 
          const d2 = new EventEmitter();
          d2.type = 'test2';          
          runtime.observe([q1, q2], function(one, two) {
            assert.equal(one.type, 'test1');
            assert.equal(two.type, 'test2');
            done();
          });

          runtime.emit('deviceready', d2);
          runtime.emit('deviceready', d1);
      });

      it('will fire if a device exists in the registry and doesn\'t call deviceready', function(done) {
        runtime._jsDevices['1'] = { id: '1', type: 'test1' };

        const q1 = runtime.where({ type: 'test1' });
        const q2 = runtime.where({ type: 'test2' });

        const d2 = new EventEmitter();
        d2.type = 'test2';

        runtime.observe([q1, q2], function(one, two) {
          assert.equal(one.type, 'test1');
          assert.equal(two.type, 'test2');
          done();
        });

        runtime.emit('deviceready', d2);
      });
  });

  describe('Device deletion from runtime', function() {
    it('will delete a remote device from the runtime', function(done) {
      const peerName = 'hub';
      const id = '1';
      const peer = new EventEmitter();
      peer.subscribe = function() {};
      peer.name = peerName;
      const data = { 'properties': { 'id': id }, 'actions': [], 'links': [{'title': 'logs', 'href': 'http://localhost/servers/hub/devices/1?topic=logs', 'rel': []}]};
      runtime._remoteDevices[peerName] = {};
      const virtualDevice = runtime._createRemoteDevice(peer, data);
      virtualDevice._eventEmitter.emit('zetta-device-destroy');
      setTimeout(function() {
        assert.ok(!runtime._remoteDevices[peerName][id]);
        done();
      }, 100);
    });


    it('will delete a device from the runtime', function(done) {
      const emitter = new EventEmitter();
      emitter.id = '1';
      emitter.type = 'test1';
      runtime._jsDevices['1'] = emitter;
      runtime.registry.db.put('1', {'id': '1', 'type': 'test1'}, {valueEncoding: 'json'}, function() {
        runtime.emit('deviceready', emitter);
        emitter.emit('destroy', emitter);
        setTimeout(function() {    
          assert.ok(!runtime._jsDevices.hasOwnProperty('1'));
          done();
        }, 100);
      });
    });  

    it('will delete a device from the runtime using _destroyDevice', function(done) {
      const emitter = new EventEmitter();
      emitter.id = '1';
      emitter.type = 'test1';
      runtime._jsDevices['1'] = emitter;
      runtime.registry.db.put('1', {'id': '1', 'type': 'test1'}, {valueEncoding: 'json'}, function() {
        runtime.emit('deviceready', emitter);
        runtime._destroyDevice(emitter, function(err) {
          assert.ok(!err);
          assert.ok(!runtime._jsDevices.hasOwnProperty('1'));
          done();
        });
      });
    });

    it('_destroyDevice callback will pass an error if _sendLogStreamEvent is not a function on the device prototype.', function(done) {
      const emitter = new EventEmitter();
      emitter.id = '1';
      emitter.type = 'test1';
      emitter._sendLogStreamEvent = null;
      runtime._jsDevices['1'] = emitter;
      runtime.registry.db.put('1', {'id': '1', 'type': 'test1'}, {valueEncoding: 'json'}, function() {
        runtime.emit('deviceready', emitter);
        runtime._destroyDevice(emitter, function(err) {
          assert.ok(err);
          assert.equal(err.message, 'Device not compatible');
          done();
        });
      });
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
          const devOne = x[0];
          const devTwo = x[1];
          assert.equal(devOne.type, 'test1');
          assert.equal(devTwo.type, 'test2');
          done();
        });

        const d1 = new EventEmitter();
        d1.type = 'test1';
        const d2 = new EventEmitter();
        d2.type = 'test2';

        runtime.emit('deviceready', d1);
        runtime.emit('deviceready', d2);
    });

    it('take will only fire with one pair.', function(done) {
      const emitter = new EventEmitter();
      let fired = 0;
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
          const devOne = x[0];
          const devTwo = x[1];
          assert.equal(devOne.type, 'test1');
          assert.equal(devTwo.type, 'test2');
          fired++;
          emitter.on('complete', function() {
            assert.equal(fired, 1);
            done();
          });
        });

        const d1 = new EventEmitter();
        d1.type = 'test1';
        const d2 = new EventEmitter();
        d2.type = 'test2';

        runtime.emit('deviceready', d1);
        runtime.emit('deviceready', d2);
        runtime.emit('deviceready', d1);
        runtime.emit('deviceready', d2);
        emitter.emit('complete');
      });

      it('will only fire take one time', function(done) {
        const d = new EventEmitter();
        d.type = 'test';
        let fired = 0;
        const emitter = new EventEmitter();
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
        const d = new EventEmitter();
        d.type = 'test';
        let fired = 0;
        const emitter = new EventEmitter();
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

