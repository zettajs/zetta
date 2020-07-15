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

var ZettaHttpServer = module.exports = function(zettaInstance, options) {
  var self = this;
  options = (typeof options === 'object') ? options : {};
  if(typeof options.useXForwardedHostHeader !== 'undefined') {
    this.useXForwardedHostHeader = options.useXForwardedHostHeader ? true : false;
  } else {
    this.useXForwardedHostHeader = true;
  }
  if(typeof options.useXForwardedPathHeader !== 'undefined') {
    this.useXForwardedPathHeader = options.useXForwardedPathHeader ? true : false;
  } else {
    this.useXForwardedPathHeader = true;
  }
  this.idCounter = 0;
  this.zetta = zettaInstance;
  this.peerRegistry = zettaInstance.peerRegistry;
  this.eventBroker = new EventBroker(zettaInstance);
  this.clients = {};
  this.peers = {}; // connected peers
  this.peerOptions = {}; // default empty options for PeerSocket

  this._deviceQueries = [];

  this._collectors = {};

  // WS hooks to be called before finishing upgrade
  this._wsHooks = {
    peerConnect: [],
    websocketConnect: []
  };

  // external http(s) server
  var httpOptions = {
    connection: {
      windowSize: 1024 * 1024,
      autoSpdy31: false
    },
    spdy: {
      plain: true,
      ssl: false
    }
  };

  var tlsCheckOptions = ['cert', 'key', 'pfx', 'ca'];
  var usingSSL = false;
  Object.keys(options).forEach(function(k) {
    httpOptions[k] = options[k];
    if (tlsCheckOptions.indexOf(k) > -1) {
      usingSSL = true;
    }
  });

  // If any tls options were specified, use ssl and not plain
  httpOptions.spdy.plain = (usingSSL) ? false : true;
  httpOptions.spdy.ssl = (usingSSL) ? true : false;

  var spdyServerOpts = {
    connection: {
      windowSize: 1024 * 1024,
      autoSpdy31: false
    },
    spdy: {
      plain: true,
      ssl: false
    }
  };

  // Outside http server
  this.server = spdy.createServer(httpOptions);
  
  // internal server for z2z, allways ssl: false, plain: true
  // TODO: remove this as it is unneeded now.
  this.spdyServer = spdy.createServer(spdyServerOpts);
  this.spdyServer.on('ping', function(socket) {
    socket.emit('spdyPing');
  })

  var ValidWSUrls = [
      /^\/events$/, // /events
      /^\/events\?.+$/, // /events?topic=query:where type="led"
      /^\/servers\/(.+)\/events/, // /servers/BC2832FD-9437-4473-A4A8-AC1D56B12C61/events
      /^\/peers\/(.+)$/, // /peers/123123...
      /^\/peer-management$/, // /peer-management
  ];

  function match(request) {
    return ValidWSUrls.some(function(re) {
      return re.test(request.url);
    });
  }

  this.wss = new WebSocketServer({ noServer: true });
  this.server.on('upgrade', function(request, socket, headers) {
    var sendError = function(code) {
      // Check any custom websocket paths from extentions
      var finish = function() {
        var responseLine = 'HTTP/1.1 ' + code + ' ' + http.STATUS_CODES[code] + '\r\n\r\n\r\n';
        socket.end(responseLine);
      };

      if (self.server.listeners('upgrade').length > 1) {
        var timer = setTimeout(function() {
          if (socket.bytesWritten === 0) {
            finish();
          }
        }, 5000);
        socket.on('close', function() {
          clearTimeout(timer);
        });
      } else {
        finish();
      }
    };

    if (/^\/peers\/(.+)$/.exec(request.url)) {
      async.eachSeries(self._wsHooks.peerConnect, function(handler, next) {
        return handler(request, socket, headers, next);
      }, function(err) {
        if (err) {
          return sendError(500);
        }

        // Handle Peer Request
        self.wss.handleUpgrade(request, socket, headers, function(ws) {
          self.setupPeerSocket(ws, request);
        });
      });
    } else if (match(request)) {
      async.eachSeries(self._wsHooks.websocketConnect, function(handler, next) {
        return handler(request, socket, headers, next);
      }, function(err) {
        if (err) {
          return sendError(500);
        }

        self.wss.handleUpgrade(request, socket, headers, function(ws) {
          if (request.url === '/peer-management') {
            var query = [
              { name: self.zetta.id, topic: '_peer/connect' },
              { name: self.zetta.id, topic: '_peer/disconnect' }];

            var client = new EventSocket(ws, query);
            self.eventBroker.client(client);
          } else {
            self.setupEventSocket(ws, request);
          }
        });
      });
    } else {
      // 404
      sendError(404);
    }

  });

  var titanOpts = {
    useXForwardedHostHeader: this.useXForwardedHostHeader,
    useXForwardedPathHeader: this.useXForwardedPathHeader
  };
  this.cloud = titan(titanOpts)
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


ZettaHttpServer.prototype.onPeerConnect = function(handler) {
  if (typeof handler !== 'function') {
    throw new Error('Must supply function as a hook');
  }
  this._wsHooks.peerConnect.push(handler);
};

ZettaHttpServer.prototype.onEventWebsocketConnect = function(handler) {
  if (typeof handler !== 'function') {
    throw new Error('Must supply function as a hook');
  }
  this._wsHooks.websocketConnect.push(handler);
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

ZettaHttpServer.prototype.wireUpWebSocketForEvent = function(ws, request, host, p) {
  ws._env = { helpers: {}};
  ws._loader = { path: p };

  ws._env.uri = function() {
    var protocol = getCurrentProtocol(request);

    if (!host) {
      var address = request.connection.address();
      host = address.address;
      if (address.port) {
        if (!(protocol === 'https' && address.port === 443) &&
            !(protocol === 'http' && address.port === 80)) {
          host += ':' + address.port
        }
      }
    }
    return (protocol + '://' + path.join(host, request.url)).replace(/\\/g, '/');
  };

  ws._env.helpers.url = {};
  ws._env.helpers.url.path = function(pathname) {
    var parsed = url.parse(ws._env.uri());
    parsed.search = null;
    parsed.pathname = pathname;
    return url.format(parsed);
  };
};

ZettaHttpServer.prototype.setupPeerSocket = function(ws, request) {
  var self = this;
  var name = /^\/peers\/(.+)$/.exec(url.parse(request.url, true).pathname)[1];
  name = decodeURI(name);
  self.zetta.log.emit('log', 'http_server', 'Websocket connection for peer "' + name + '" established.');

  // Include ._env and ._loader on websocket, allows argo formatters to work used in virtual_device build actions.
  var host = request.headers['host']
  self.wireUpWebSocketForEvent(ws, request, host, '/servers/' + name);

  if (self.peers[name] && self.peers[name].state !== PeerSocket.DISCONNECTED) {
    // peer already connected or connecting
    ws.close(4000, 'peer already connected');
  } else if (self.peers[name]) {
    // peer has been disconnected but has connected before.
    self.peers[name].init(ws, request);
  } else {
    var peer = new PeerSocket(ws, request, name, self.peerRegistry, self.peerOptions);
    self.peers[name] = peer;

    // Events coming from the peers pubsub using push streams
    peer.on('zetta-events', function(topic, data) {
      self.zetta.pubsub.publish(name + '/' + topic, data, true); // Set fromRemote flag to true
    });

    peer.on('connected', function() {
      self.eventBroker.peer(peer);
      self.zetta.log.emit('log', 'http_server', 'Peer connection established "' + name + '".');
      self.zetta.pubsub.publish('_peer/connect', { peer: peer });
    });

    peer.on('error', function(err) {
      self.zetta.log.emit('log', 'http_server', 'Peer connection failed for "' + name + '": ' + err.message + '.');
      self.zetta.pubsub.publish('_peer/disconnect', { peer: peer, err: err });
    });

    peer.on('end', function() {
      self.zetta.log.emit('log', 'http_server', 'Peer connection closed for "' + name + '".');
      self.zetta.pubsub.publish('_peer/disconnect', { peer: peer });
    });
  }
};

ZettaHttpServer.prototype.setupEventSocket = function(ws, request) {
  var self = this;
  var host = request.headers['host'];

  if (/^\/events/.exec(request.url)) {
    self.wireUpWebSocketForEvent(ws, request, host, '/servers/' + self.zetta._name);
    var parsed = url.parse(request.url, true);
    var query = parsed.query;

    if(!query.topic) {
      var client = new EventSocket(ws, null, { streamEnabled: true, filterMultiple: !!(query.filterMultiple) });
      self.eventBroker.client(client);
      return;
    }

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
        var client = new EventSocket(ws, q, { streamEnabled: false });
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
    var match = /^\/servers\/(.+)\/events/.exec(request.url);
    if(!match) {
      ws.close(1001); // go away status code
      return;
    }

    var query = querystring.parse(url.parse(request.url).query);
    query.serverId = match[1]; // set serverId on query

    self.wireUpWebSocketForEvent(ws, request, host, '/servers/' + query.serverId);

    var query = querystring.parse(url.parse(request.url).query);
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

  var parsed = url.parse(req.url);
  var name = decodeURIComponent(parsed.pathname.split('/')[2]);

  if (!req.isSpdy) {
    req.headers['x-forwarded-proto'] = getCurrentProtocol(req);
  }

  var peer = self.peers[name];
  if (!peer || peer.state !== PeerSocket.CONNECTED){
    res.statusCode = 404;
    res.end();
    return;
  }

  var agent = env.zettaAgent || peer.agent;

  var opts = {
    method: req.method,
    headers: req.headers,
    path: req.url,
    agent: agent,
    pipe: true
  };
  if (typeof env.proxyOpts === 'object') {
    Object.keys(env.proxyOpts).forEach(function(k) {
      opts[k] = env.proxyOpts[k];
    });
  }

  var request = http.request(opts, function(response) {

    Object.keys(response.headers).forEach(function(header) {
      res.setHeader(header, response.headers[header]);
    });

    res.statusCode = response.statusCode;

    if (!opts.pipe) {
      var body = null;
      var buf = [];
      var len = 0;

      response.on('readable', function() {
        var chunk;

        while ((chunk = response.read()) != null) {
          buf.push(chunk);
          len += chunk.length;
        }

        if (!buf.length) {
          return;
        }

        body = new Buffer(len);
        var i = 0;
        buf.forEach(function(chunk) {
          chunk.copy(body, i, 0, chunk.length);
          i += chunk.length;
        });
      });

      response.on('end', function() {
        env.response.body = body;
        next(env);
      });
    } else {
      env.response.body = response;
      next(env);
    }
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
