const util = require('util');
const levelup = require('levelup');
const memdown = require('memdown');
const PeerRegistry = require('../../lib/peer_registry');

class MemPeerRegistry extends PeerRegistry {
  constructor() {
    const db = levelup({ db: memdown });
    super({ db, collection: 'peers' });
  }
}

module.exports = MemPeerRegistry;