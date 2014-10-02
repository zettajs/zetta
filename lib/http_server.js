var http = require('http');
var path = require('path');
var url = require('url');
var querystring = require('querystring');
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
var PubSubResource = require('./api_resources/pubsub_subscriptions');
var rels = require('zetta-rels');

var ZettaHttpServer = module.exports = function(zettaInstance) {
  this.idCounter = 0;
  this.server = http.createServer();
  this.zetta = zettaInstance;
  this.peerRegistry = zettaInstance.peerRegistry;
  this.eventBroker = new EventBroker(zettaInstance);
  this.clients = {};
  this.peers = {}; // connected peers
  this._disconnectedPeers = {};

  this._collectors = {};
  this.server = http.createServer();
  this.spdyServer = spdy.createServer({
    windowSize: 1024 * 1024,
    plain: true,
    ssl: false
  });

  this.cloud = argo()
    .use(titan)
   .format({ engines: [Siren], override: { 'application/json': Siren }, directory: path.join(__dirname, './api_formats') })
    .add(RootResource, zettaInstance)
    .add(PeersManagementResource, zettaInstance)
    .add(DevicesResource, zettaInstance)
    .add(ServersResource, zettaInstance)
    .add(PubSubResource, zettaInstance)
    .allow({
      methods: ['DELETE', 'PUT', 'PATCH', 'POST'],
      origins: ['*'],
      headers: ['accept', 'content-type'],
      maxAge: '432000'
    })
    .use(function(handle) {
      handle('request', function(env, next) {
        if (env.request.headers['zetta-message-id']) {
          env.response.setHeader('zetta-message-id', env.request.headers['zetta-message-id']);
        }
        next(env);
      });
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

  this.wss = new WebSocketServer({ server: this.server });
  this.wss.on('connection', function(ws) {
    var match = /^\/peers\/(.+)$/.exec(ws.upgradeReq.url);
    if (match) {
      var name = /^\/peers\/(.+)$/.exec(url.parse(ws.upgradeReq.url, true).pathname)[1];
      name = decodeURI(name);
      self.zetta.log.emit('log', 'http_server', 'Websocket connection for peer "' + name + '" established.');
      
      var peer = null;
      if (self.peers[name]) {
        // peer already connected?
        ws.close(4000, 'peer already connected');
      } else if (self._disconnectedPeers[name]) {
        // peer has been disconnected but has connected before.
        peer = self._disconnectedPeers[name];
        delete self._disconnectedPeers[name];
        peer.init(ws);
      } else {
        peer = new PeerSocket(ws, name, self.peerRegistry);

        peer.on('connected', function() {
          self.peers[name] = peer;
          self.eventBroker.peer(peer);

          self.zetta.log.emit('log', 'http_server', 'Peer connection established "' + name + '".');
          self.zetta.pubsub.publish('_peer/connect', { peer: peer });
        });

        peer.on('error', function(err) {
          self.zetta.log.emit('log', 'http_server', 'Peer connection failed for "' + name + '".');
          self._disconnectedPeers[name] = self.peers[name];
          delete self.peers[name];
          self.zetta.pubsub.publish('_peer/disconnect', { peer: peer });
        });

        peer.on('end', function() {
          self._disconnectedPeers[name] = self.peers[name];
          delete self.peers[name];
          self.zetta.log.emit('log', 'http_server', 'Peer connection closed for "' + name + '".');
          self.zetta.pubsub.publish('_peer/disconnect', { peer: peer });
        });
      }
    } else {
      self.setupEventSocket(ws);
    }
  });

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

ZettaHttpServer.prototype.setupEventSocket = function(ws) {
  var match = /^\/servers\/(.+)\/events/.exec(ws.upgradeReq.url);
  if(!match) {
    ws.close(1001); // go away status code
    return;
  }

  var query = querystring.parse(url.parse(ws.upgradeReq.url).query);
  query.serverId = match[1]; // set serverId on query

  // setup helpers for 
  ws._env = { helpers: {}};
  var serverId = query.serverId;
  ws._loader = { path: '/servers/' + serverId };
  
  ws._env.uri = function() {
    var xfp = ws.upgradeReq.headers['x-forwarded-proto'];
    var protocol;

    if (xfp && xfp.length) {
      protocol = xfp.replace(/\s*/, '').split(',')[0];
    } else {
      protocol = ws.upgradeReq.connection.encrypted ? 'https' : 'http';
    }

    var host = ws.upgradeReq.headers['host'];

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
  }

  ws._env.helpers.url = {};
  ws._env.helpers.url.path = function(pathname) {
    var parsed = url.parse(ws._env.uri());
    parsed.search = null;
    parsed.pathname = pathname;
    return url.format(parsed);
  };
  
  var query = querystring.parse(url.parse(ws.upgradeReq.url).query);
  query.serverId = match[1]; // set serverId on query

  // setup helpers for 
  ws._env = { helpers: {}};
  var serverId = query.serverId;
  ws._loader = { path: '/servers/' + serverId };
  
  ws._env.uri = function() {
    var xfp = ws.upgradeReq.headers['x-forwarded-proto'];
    var protocol;

    if (xfp && xfp.length) {
      protocol = xfp.replace(/\s*/, '').split(',')[0];
    } else {
      protocol = ws.upgradeReq.connection.encrypted ? 'https' : 'http';
    }

    var host = ws.upgradeReq.headers['host'];

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
  }

  ws._env.helpers.url = {};
  ws._env.helpers.url.path = function(pathname) {
    var parsed = url.parse(ws._env.uri());
    parsed.search = null;
    parsed.pathname = pathname;
    return url.format(parsed);
  };
  
  var query = querystring.parse(url.parse(ws.upgradeReq.url).query);
  query.name = decodeURI(match[1]);
  var client = new EventSocket(ws, query);
  this.eventBroker.client(client);
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

//ZettaHttpServer.prototype.proxyToPeer = function(handle) {
ZettaHttpServer.prototype.proxyToPeer = function(env, next) {
  var self = this;

  var req = env.request;
  var res = env.response;

  var messageId = ++self.idCounter;

  // change this to handle multiple fogs
  self.clients[messageId] = res;//req.socket; Will need socket for event broadcast.

  var name = decodeURI(req.url.split('/')[2]);

  req.headers['zetta-message-id'] = messageId;
  req.headers['zetta-forwarded-server'] = name;

  var peer = self.peers[name];
  if (!peer){
    res.statusCode = 404;
    res.end();
    return;
  }

  var agent = env.zettaAgent || peer.agent;

  var opts = { method: req.method, headers: req.headers, path: req.url, agent: agent };
  var request = http.request(opts, function(response) {
    var id = response.headers['zetta-message-id'];
    var res = self.clients[id];

    if (!res) {
      response.statusCode = 404;
      return;
    }

    Object.keys(response.headers).forEach(function(header) {
      if (header !== 'zetta-message-id') {
        res.setHeader(header, response.headers[header]);
      }
    });

    response.pipe(res);

    response.on('finish', function() {
      delete self.clients[id];
      next(env);
    });

  });

  if (req.body) {
    request.end(req.body);
  } else {
    req.pipe(request);
  }
};
