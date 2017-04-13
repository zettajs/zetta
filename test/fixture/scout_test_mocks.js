const util = require('util');
const uuid = require('uuid');
const zetta = require('../../zetta_runtime');

//Mock device single transition. Also takes constructor params optionally.
class GoodDevice extends zetta.Device {
  constructor() {
    super();
    const args = Array.prototype.slice.call(arguments);
    if(args.length > 0) {
      this.foo = args[0];
      this.bar = args[1];
    }
    this.vendorId = '1234567';
  }

  init(config) {
    config
      .name(`Good Device:${this.foo}`)
      .type('test')
      .state('ready')
      .when('ready', {allow: ['transition']})
      .map('transition', this.transition);
  }

  transition(cb) {
    cb();
  }
}

//Mock scout.
class GoodScout extends zetta.Scout {
  constructor() {
    super();
  }

  init(cb) {
    this.discover(GoodDevice, 'foo', 'bar');
    return cb();
  }
}

//A mock registry so we can easily instrospect that we're calling the save and find functions correctly.
//This also gets around some leveldb locking issues I was running into.
class MockRegistry {
  constructor() {
    this.machines = [];
  }

  save(machine, cb) {
    this.machines.push(machine.properties());
    cb(null, this.machines);
  }

  find(query, cb) {
    this.machines.forEach(machine => {
      if(query.match(machine)) {
        cb(null, [machine]);
      }
    });

    cb(null, []);
  }
}

class MockPeerRegistry {
  constructor() {
    this.peers = [];
  }

  save(peer, cb) {
    if (!cb) {
      cb = () => {};
    }
    this.peers.push(peer);
    cb(null);
  }

  add(peer, cb) {
    if (!peer.id) {
      peer.id = uuid.v4();
    }

    this.peers.push(peer);
    cb(null, peer);
  }

  get(id, cb) {
    this.peers.forEach(peer => {
      if (peer.id === id) {
        cb(null, peer);
      }
    });
  }

  find(query, cb) {
    const results = this.peers.filter(peer => query.match(peer));

    cb(null, results);
  }
}

exports.MockRegistry = MockRegistry;
exports.MockPeerRegistry = MockPeerRegistry;
exports.GoodScout = GoodScout;
exports.GoodDevice = GoodDevice;
