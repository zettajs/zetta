var http = require('http');
var path = require('path');
var url = require('url');
var querystring = require('querystring');
var async = require('async');
var spdy = require('spdy');
var argo = require('argo');
var titan = require('titan');
var WebSocketServer = require('ws').Server;
var SpdyAgent = require('./spdy_agent');
var EventBroker = require('./event_broker');
var PeerSocket = require('./peer_socket');
var EventSocket = require('./event_socket');
var Siren = require('argo-formatter-siren');
var DevicesResource = require('./api_resources/devices');
var PeersManagementResource = require('./api_resources/peer_management');
var RootResource = require('./api_resources/root');
var ServersResource = require('./api_resources/servers');
var deviceFormatter = require('./api_formats/siren/device.siren');
var rels = require('zetta-rels');

var querytopic = require('./query_topic');

var ZettaHttpServer = module.exports = function(zettaInstance) {
  var self = this;
  this.idCounter = 0;
  this.zetta = zettaInstance;
  this.peerRegistry = zettaInstance.peerRegistry;
  this.eventBroker = new EventBroker(zettaInstance);
  this.clients = {};
  this.peers = {}; // connected peers

  this._deviceQueries = [];

  this._collectors = {};
  this.server = spdy.createServer({
    windowSize: 1024 * 1024,
    plain: true,
    ssl: false
  });
  this.spdyServer = spdy.createServer({
    windowSize: 1024 * 1024,
    plain: true,
    ssl: false
  });

  this.wss = new WebSocketServer({ noServer: true });
  this.server.on('upgrade', function(request, socket, headers) {
    function match(request) {
      if(/^\/peers\/(.+)$/.exec(request.url)) {
        return true; 
      } else if(request.url === '/peer-management') {
        return true;
      } else if(/^\/servers\/(.+)\/events/.exec(request.url)) {
        return true;
      } else if(/^\/events/.exec(request.url)) {
        return true;
      } else {
        return false;
      }
    }

    if(match(request)) {
      self.wss.handleUpgrade(request, socket, headers, function(ws) {
        var match = /^\/peers\/(.+)$/.exec(ws.upgradeReq.url);
        if (match) {
          var name = /^\/peers\/(.+)$/.exec(url.parse(ws.upgradeReq.url, true).pathname)[1];
          name = decodeURI(name);
          self.zetta.log.emit('log', 'http_server', 'Websocket connection for peer "' + name + '" established.');

          if (self.peers[name] && self.peers[name].state !== PeerSocket.DISCONNECTED) {
            // peer already connected or connecting
            ws.close(4000, 'peer already connected');
          } else if (self.peers[name]) {
            // peer has been disconnected but has connected before.
            self.peers[name].init(ws);
          } else {
            var peer = new PeerSocket(ws, name, self.peerRegistry);
            self.peers[name] = peer;

            peer.on('connected', function() {
              self.eventBroker.peer(peer);
              self.zetta.log.emit('log', 'http_server', 'Peer connection established "' + name + '".');
              self.zetta.pubsub.publish('_peer/connect', { peer: peer });
            });

            peer.on('error', function(err) {
              self.zetta.log.emit('log', 'http_server', 'Peer connection failed for "' + name + '".');
              self.zetta.pubsub.publish('_peer/disconnect', { peer: peer });
            });

            peer.on('end', function() {
              self.zetta.log.emit('log', 'http_server', 'Peer connection closed for "' + name + '".');
              self.zetta.pubsub.publish('_peer/disconnect', { peer: peer });
            });
          }
        } else if (ws.upgradeReq.url === '/peer-management') {
          var query = [
            { name: self.zetta.id, topic: '_peer/connect' },
            { name: self.zetta.id, topic: '_peer/disconnect' }];

          var client = new EventSocket(ws, query);
          self.eventBroker.client(client);
        } else {
          var parsedUrl = url.parse(ws.upgradeReq.url, true);
          if(parsedUrl.pathname === '/events') {
            
          } else {
            self.setupEventSocket(ws);
          } 
        }
      });
    }
  });

  this.cloud = argo()
    .use(titan)
   .format({ engines: [Siren], override: { 'application/json': Siren }, directory: path.join(__dirname, './api_formats') })
    .add(RootResource, zettaInstance)
    .add(PeersManagementResource, zettaInstance)
    .add(DevicesResource, zettaInstance)
    .add(ServersResource, zettaInstance)
    .allow({
      methods: ['DELETE', 'PUT', 'PATCH', 'POST'],
      origins: ['*'],
      headers: ['accept', 'content-type'],
      maxAge: '432000'
    })
    .use(function(handle) {
      handle('request', function(env, next) {
        if (env.request.method === 'OPTIONS') {
          env.argo._routed = true;
        }
        next(env);
      });
    })
    .use(function(handle) {
      handle('request', function(env, next) {
        // stop execution in argo for initiate peer requests, handled by peer_client
        if (!(/^\/_initiate_peer\/(.+)$/.exec(env.request.url)) ) {
          next(env);
        }
      });
    });
};

ZettaHttpServer.prototype.init = function(cb) {
  var self = this;

  // handle http registration of device
  this.cloud = this.cloud.use(this.httpRegistration.bind(this));
  // handle proxying to peer
  //this.cloud = this.cloud.route('*', this.proxyToPeer.bind(this));
  // setup http servers request handler to argo routes
  this.cloud = this.cloud.build();

  this.server.on('request', this.cloud.run);
  this.spdyServer.on('request', this.cloud.run);

  if (cb) {
    cb();
  }
};

ZettaHttpServer.prototype.listen = function() {
  this.server.listen.apply(this.server,arguments);
  return this;
};

ZettaHttpServer.prototype.collector = function(name, collector) {
  if(typeof name === 'function'){
    collector = name;
    name = '_logs';
  }

  if(!this._collectors[name]) {
    this._collectors[name] = [];
  }

  this._collectors[name].push(collector);
  return this;
};

function getCurrentProtocol(req) {
  var xfp = req.headers['x-forwarded-proto'];
  var protocol;

  if (xfp && xfp.length) {
    protocol = xfp.replace(/\s*/, '').split(',')[0];
  } else {
    protocol = req.connection.encrypted ? 'https' : 'http';
  }

  return protocol;
}

ZettaHttpServer.prototype.wireUpWebSocketForEvent = function(ws, host, p) {
  ws._env = { helpers: {}};
  ws._loader = { path: p };

  ws._env.uri = function() {
    var protocol = getCurrentProtocol(ws.upgradeReq);

    if (!host) {
      var address = ws.upgradeReq.connection.address();
      host = address.address;
      if (address.port) {
        if (!(protocol === 'https' && address.port === 443) &&
            !(protocol === 'http' && address.port === 80)) {
          host += ':' + address.port
        }
      }
    }

    return protocol + '://' + path.join(host, ws.upgradeReq.url);
  };

  ws._env.helpers.url = {};
  ws._env.helpers.url.path = function(pathname) {
    var parsed = url.parse(ws._env.uri());
    parsed.search = null;
    parsed.pathname = pathname;
    return url.format(parsed);
  };
};

ZettaHttpServer.prototype.setupEventSocket = function(ws) {
  var self = this;
  var host = ws.upgradeReq.headers['host'];

  if (/^\/events/.exec(ws.upgradeReq.url)) {
    self.wireUpWebSocketForEvent(ws, host, '/servers/' + self.zetta._name);

    var query = querystring.parse(url.parse(ws.upgradeReq.url).query);

    function copy(q) {
      var c = {};
      Object.keys(q).forEach(function(k) {
        c[k] = q[k];
      });

      return c;
    }

    [self.zetta._name].concat(Object.keys(self.peers)).forEach(function(serverId) {
      var q = copy(query);
      q.name = serverId;

      if (q.topic) {
        var qt = querytopic.parse(query.topic);
        if (qt) {
          q.topic = querytopic.format(qt);
        }
        var client = new EventSocket(ws, q);
        self.eventBroker.client(client);
      }
    });

    function subscribeOnPeerConnect(e, obj) {
      var q = copy(query);
      q.name = obj.peer.name;

      if (q.topic) {
        var qt = querytopic.parse(query.topic);
        if (qt) {
          q.topic = querytopic.format(qt);
        }

        var client = new EventSocket(ws, q);
        self.eventBroker.client(client);
      }
    }

    ws.on('close', function() {
      self.zetta.pubsub.unsubscribe('_peer/connect', subscribeOnPeerConnect);
    });

    self.zetta.pubsub.subscribe('_peer/connect', subscribeOnPeerConnect);
  } else {
    var match = /^\/servers\/(.+)\/events/.exec(ws.upgradeReq.url);
    if(!match) {
      ws.close(1001); // go away status code
      return;
    }

    var query = querystring.parse(url.parse(ws.upgradeReq.url).query);
    query.serverId = match[1]; // set serverId on query

    self.wireUpWebSocketForEvent(ws, host, '/servers/' + query.serverId);

    var query = querystring.parse(url.parse(ws.upgradeReq.url).query);
    query.name = decodeURI(match[1]);

    if (query.topic) {
      var qt = querytopic.parse(query.topic);
      if (qt) {
        query.topic = querytopic.format(qt);
      }
      var client = new EventSocket(ws, query);
      self.eventBroker.client(client);
    }
  }
};

ZettaHttpServer.prototype.httpRegistration = function(handle) {
  handle('request', function(env, next) {
    if (!(env.request.method === 'POST' && env.request.url === '/registration')) {
      return next(env);
    }

    env.request.getBody(function(err, body) {
      body = JSON.parse(body.toString());
      var peer = self.peers[body.target];

      if (!peer.agent) {
        env.response.statusCode = 404;
        return next(env);
      }

      env.request.body = new Buffer(JSON.stringify(body.device));
      env.zettaAgent = peer.agent;
      next(env);
    });
  });
};

ZettaHttpServer.prototype.proxyToPeers = function(peers, env, cb) {
  var self = this;

  var req = env.request;
  var res = env.response;
  var protocol = getCurrentProtocol(req);

  var messageId = ++self.idCounter;
  self.clients[messageId] = res;

  var tasks = peers.map(function(p) {
    var name = p.id;
    return function(callback) {

      var reqUrl = req.templateUrl.replace('{{peerName}}', encodeURIComponent(name));
      var headers = {};

      Object.keys(req.headers).forEach(function(key) {
        headers[key] = req.headers[key];
      });

      if (!req.isSpdy) {
        headers['x-forwarded-proto'] = protocol;
      }

      var peer = self.peers[name];
      if (!peer || peer.state !== PeerSocket.CONNECTED){
        callback(null, { err: new Error('Peer does not exist.') });
        return;
      }

      var agent = env.zettaAgent || peer.agent;

      var opts = { method: req.method, headers: headers, path: reqUrl, agent: agent };
      var request = http.request(opts, function(response) {
        response.getBody(function(err, body) {
          callback(null, { res: response, err: err, body: body });
        });
      }).on('error', function(err) {
        return callback(null, { err: err });
      });

      if (req.body) {
        request.end(req.body);
      } else {
        req.pipe(request);
      }
    };
  });

  async.parallelLimit(tasks, 5, function(err, results) {
    cb(err, results, messageId);
  });
};

ZettaHttpServer.prototype.proxyToPeer = function(env, next) {
  var self = this;
  var req = env.request;
  var res = env.response;
  var opts = env.proxyOpts || {};

  var messageId = ++self.idCounter;

  // change this to handle multiple fogs
  self.clients[messageId] = res;//req.socket; Will need socket for event broadcast.

  var parsed = url.parse(req.url);
  var name = decodeURIComponent(parsed.pathname.split('/')[2]);

  if (!req.isSpdy) {
    req.headers['x-forwarded-proto'] = getCurrentProtocol(req);
  }

  var peer = self.peers[name];
  if (!peer){
    res.statusCode = 404;
    res.end();
    return;
  }

  var agent = env.zettaAgent || peer.agent;

  var opts = { method: req.method, headers: req.headers, path: req.url, agent: agent };
  var request = http.request(opts, function(response) {
    var res = self.clients[messageId];

    if (!res) {
      response.statusCode = 404;
      return;
    }

    Object.keys(response.headers).forEach(function(header) {
      res.setHeader(header, response.headers[header]);
    });

    res.statusCode = response.statusCode;
    var buf = [];
    if(!opts.pipe) {
      response.on('data', function(d) {
        buf += d;  
      });
    } else {
      response.pipe(res);
    } 

    response.on('end', function() {
      if(!opts.pipe) {
        env.response.body = buf.toString();  
      }
      delete self.clients[messageId];
      next(env);
    });

  }).on('error', function(err) {
    env.response.statusCode = 502;
    return next(env);
  });

  if (req.body) {
    request.end(req.body);
  } else {
    req.pipe(request);
  }
};
