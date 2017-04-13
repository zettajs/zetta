const util = require('util');
const levelup = require('levelup');
const memdown = require('memdown');
const PeerRegistry = require('../../lib/peer_registry');

const MemPeerRegistry = module.exports = function() {
  const db = levelup({ db: memdown });
  PeerRegistry.call(this, { db: db, collection: 'peers' });
};
util.inherits(MemPeerRegistry, PeerRegistry);

