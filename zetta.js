const os = require('os');
const AutoScout = require('zetta-auto-scout');
const async = require('async');
const HttpScout = require('./lib/http_scout');
const HttpServer = require('./lib/http_server');
const Logger = require('./lib/logger');
const PeerClient = require('./lib/peer_client');
const PeerRegistry = require('./lib/peer_registry');
const PubSub = require('./lib/pubsub_service');
const Runtime = require('./lib/runtime');
const scientist = require('zetta-scientist');
const Query = require('calypso').Query;

const Zetta = module.exports = function(opts) {
  if (!(this instanceof Zetta)) {
    return new Zetta(opts);
  }

  opts = opts || {};

  this._name = os.hostname(); // optional name, defaults to OS hostname
  this.id = this._name;
  this._properties = {}; // custom properties

  this._exposeQuery = '';
  this._scouts = [];
  this._apps = [];
  this._peers = [];
  this._peerClients = [];

  this.peerRegistry = opts.peerRegistry || new PeerRegistry();

  this.pubsub = opts.pubsub || new PubSub();
  this.log = opts.log || new Logger({ pubsub: this.pubsub });
  this.log.init();
  this._silent = false;

  const httpOptions = {};
  if(typeof opts.useXForwardedHostHeader !== 'undefined') {
    httpOptions.useXForwardedHostHeader = opts.useXForwardedHostHeader;
  }
  if(typeof opts.useXForwardedPathHeader !== 'undefined') {
    httpOptions.useXForwardedPathHeader = opts.useXForwardedPathHeader;
  }

  if (typeof opts.tls === 'object') {
    Object.keys(opts.tls).forEach(k => {
      httpOptions[k] = opts.tls[k];
    });
  }
  this.httpServer = new HttpServer(this, httpOptions);

  const runtimeOptions = {
    pubsub: this.pubsub,
    log: this.log,
    httpServer: this.httpServer
  };

  if (opts && opts.registry) {
    runtimeOptions.registry = opts.registry;
  }
  this.runtime = new Runtime(runtimeOptions);

  const httpScout = scientist.create.apply(null, [HttpScout]);
  httpScout.server = this.runtime;
  this.httpScout = httpScout;
  this._scouts.push(httpScout);
};

Zetta.prototype.silent = function() {
  this._silent = true;
  return this;
};

// pass in a custom logging
Zetta.prototype.logger = function(func) {
  this._silent = true;
  func(this.log);
  return this;
};

Zetta.prototype.name = function(name) {
  if (name === '*') {
    throw new Error('Cannot set name to *');
  }

  this._name = name;
  this.id = this._name;
  return this;
};

Zetta.prototype.properties = function(props) {
  const self = this;
  if (typeof props === 'object') {
    delete props.name; // cannot overide name
    this._properties = props;
  }
  return this;
};

Zetta.prototype.getProperties = function() {
  const self = this;
  const ret = { name: this._name };
  Object.keys(this._properties).forEach(k => {
    ret[k] = self._properties[k];
  });
  return ret;
};

Zetta.prototype.use = function() {
  const args = Array.prototype.slice.call(arguments);
  const constructor = args[0];

  const self = this;
  function addScout(scout) {
    scout.server = self.runtime;
    self._scouts.push(scout);
  }

  function init() {
    const machine = Object.create(constructor.prototype);
    constructor.apply(machine, args.slice(1));
    machine._pubsub = self.pubsub;
    machine._log = self.log;
    machine._registry = self.runtime.registry;

    const config = scientist.config(machine);
    return { config: config, instance: machine };
  }

  function walk(proto) {
    if (!proto || !proto.__proto__) {
      self.load.apply(self, args);
    } else if (proto.__proto__.constructor.name === 'HttpDevice') {
      const config = init().config;
      self.httpScout.driverFunctions[config._type] = constructor;
    } else if (proto.__proto__.constructor.name === 'Device') {
      const build = init();
      args.unshift(build.config._type);
      var scout = Object.create(AutoScout.prototype);
      scout._deviceInstance = build; // pass both machine and config to autoscout need to _generate device
      AutoScout.apply(scout, args);
      addScout(scout);
    } else if (proto.__proto__.constructor.name === 'Scout') {
      var scout = scientist.create.apply(null, args);
      addScout(scout);
    } else {
      walk(proto.__proto__);
    }
  }

  walk(constructor.prototype);

  return this;
};

Zetta.prototype.expose = function(query) {
  this._exposeQuery = query;
  this.runtime.expose(query);
  return this;
};

Zetta.prototype.load = function() {
  const args = Array.prototype.slice.call(arguments);
  const appArgs = args.slice(1, args.length);
  const app = {
    app: args[0],
    args: appArgs
  };
  this._apps.push(app);
  return this;
};

Zetta.prototype.link = function(peers) {
  const self = this;
  if(!Array.isArray(peers)) {
    peers = [peers];
  }

  peers.forEach(peer => {
    //self._peers.push(new PeerClient(peer, self));
    self._peers.push(peer);
  });

  return this;
};


Zetta.prototype.listen = function() {
  const self = this;

  const args = Array.prototype.slice.call(arguments);

  const last = args[args.length - 1];

  let callback;
  if (typeof last === 'function') {
    callback = last;
  }

  this._run(err => {
    if(err) {
      if (callback) {
        return callback(err);
      } else {
        throw err;
      }
    }

    const cb = err => {
      if (err) {
        if (callback) {
          callback(err);
        } else {
          throw err;
        }
      }

      let host;
      if (typeof args[0] === 'string') {
        host = args[0]; // UNIX socket
      } else if (typeof args[0] === 'number') {
        if (args.length > 1 && typeof args[1] === 'string') {
          host = `http://${args[1]}:${args[0]}`; // host + port
        } else {
          host = `http://127.0.0.1:${args[0]}`; // just port
        }
      } else if (typeof args[0] === 'object' && args[0].fd) {
        host = `fd: ${args[0].fd}`; // handle
      } else {
        host = '<unknown>';
      }

      self.log.emit('log', 'server', `Server (${self._name}) ${self.id} listening on ${host}`);

      if (callback) {
        callback(err);
      }
    };

    if (!callback) {
      args.push(cb);
    } else {
      args[args.length - 1] = cb;
    }

    self.httpServer.listen.apply(self.httpServer, args);
  });

  return this;
};

// run scouts/apps init server but do not listening on http port
Zetta.prototype._run = function(callback) {
  const self = this;

  if(!callback) {
    callback = () => {};
  }

  if (!this._silent) {
    Logger.ConsoleOutput(this.log);
  }

  async.series([
    next => {
      self.runtime.registry._init(next);
    },
    next => {
      self.peerRegistry._init(next);
    },
    next => {
      self._initScouts(next);
    },
    next => {
      self._initApps(next);
    },
    next => {
      self._initHttpServer(next);
    },
    next => {
      self._cleanupPeers(next);
    },
    next => {
      self._initPeers(self._peers, next);
      self.link = (peers, cb) => {
        self._initPeers(peers, (cb || (() => {})) );
      };
    }
  ], err => {
    setImmediate(() => {
      callback(err);
    });
  });

  return this;
};

Zetta.prototype._initScouts = function(callback) {
  async.each(this._scouts, (scout, next) => {
    scout.init(next);
  }, err => {
    callback(err);
  });

  return this;
};

Zetta.prototype._initApps = function(callback) {
  const self = this;
  this._apps.forEach(app => {
    const args = app.args;
    args.unshift(self.runtime);
    app.app.apply(null, args);
  });
  callback();

  return this;
};

Zetta.prototype._initHttpServer = function(callback) {
  this.httpServer.init();
  callback();

  return this;
};


// set all peers to disconnected
Zetta.prototype._cleanupPeers = function(callback) {
  const self = this;
  this.peerRegistry.find(Query.of('peers'), (err, results) => {
    if(err) {
      callback(err);
      return;
    }

    async.forEach(results, (peer, next) => {
      peer.status = 'disconnected';
      self.peerRegistry.save(peer, next);
    }, callback);
  });
};

Zetta.prototype._initPeers = function(peers, callback) {
  const self = this;
  const existingUrls = [];
  let allPeers = [];

  if (!Array.isArray(peers)) {
    peers = [peers];
  }

  this.peerRegistry.find(Query.of('peers'), (err, results) => {
    if(err) {
      callback(err);
      return;
    }

    results.forEach(peer => {
      peer.status = 'disconnected';
      if (peer.direction === 'initiator' && peer.url) {
        allPeers.push(peer);
        existingUrls.push(peer.url);
        return;
      }
    });

    // peers added through js api to registry peers if they don't already exist
    allPeers = allPeers.concat(peers.filter(peer => existingUrls.indexOf(peer) === -1));

    allPeers.forEach(obj => {
      const existing = (typeof obj === 'object');
      if (existing) {
        if(!obj.fromLink || peers.indexOf(obj.url) > -1) {
          self.peerRegistry.save(obj, () => {
            self._runPeer(obj);
          });
        } else {
          //Delete
          self.peerRegistry.remove(obj, err => {
            if(err) {
              console.error(err);
            }
          });
        }
      } else {
        const peerData = {
          url: obj,
          direction: 'initiator',
          fromLink:true
        };
        self.peerRegistry.add(peerData, (err, newPeer) => {
          self._runPeer(newPeer);
        });
      }


    });

    // end after db read
    callback();
  });

  return this;
};

Zetta.prototype._extendPeerRequest = function(client) {
  this.runtime.modifyPeerRequest(client.ws);
};

Zetta.prototype._extendPeerResponse = function(client) {
  this.runtime.modifyPeerResponse(client.ws);
};

Zetta.prototype._runPeer = function(peer) {
  const self = this;
  const peerClient = new PeerClient(peer.url, self);
  this._extendPeerRequest(peerClient);
  this._extendPeerResponse(peerClient);

  self._peerClients.push(peerClient);

  // when websocket is established
  peerClient.on('connecting', () => {
    self.peerRegistry.get(peer.id, (err, result) => {
      result.status = 'connecting';
      result.connectionId = peerClient.connectionId;
      self.peerRegistry.save(result);
    });
  });

  // when peer handshake is made
  peerClient.on('connected', () => {
    self.peerRegistry.get(peer.id, (err, result) => {
      result.status = 'connected';
      result.connectionId = peerClient.connectionId;
      self.peerRegistry.save(result);

      // peer-event
      self.pubsub.publish('_peer/connect', { peer: peerClient});
    });
  });

  peerClient.on('error', error => {

    self.peerRegistry.get(peer.id, (err, result) => {
      result.status = 'failed';
      result.error = error;
      result.connectionId = peerClient.connectionId;
      self.peerRegistry.save(result);

      // peer-event
      self.pubsub.publish('_peer/disconnect', { peer: peerClient, error: error });
    });
  });

  peerClient.on('closed', () => {
    self.peerRegistry.get(peer.id, (err, result) => {
      result.status = 'disconnected';
      result.connectionId = peerClient.connectionId;

      // peer-event
      self.pubsub.publish('_peer/disconnect', { peer: peerClient });
      self.peerRegistry.save(result);
    });
  });

  peerClient.start();

  // update initial connectionId in db
  peer.connectionId = peerClient.connectionId;
  self.peerRegistry.save(peer);
}
