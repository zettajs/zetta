const http = require('http');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const async = require('async');
const spdy = require('spdy');
const argo = require('argo');
const titan = require('titan');
const WebSocketServer = require('ws').Server;
const SpdyAgent = require('./spdy_agent');
const EventBroker = require('./event_broker');
const PeerSocket = require('./peer_socket');
const EventSocket = require('./event_socket');
const Siren = require('argo-formatter-siren');
const DevicesResource = require('./api_resources/devices');
const PeersManagementResource = require('./api_resources/peer_management');
const RootResource = require('./api_resources/root');
const ServersResource = require('./api_resources/servers');
const deviceFormatter = require('./api_formats/siren/device.siren');
const rels = require('zetta-rels');

const querytopic = require('./query_topic');

const ZettaHttpServer = module.exports = function(zettaInstance, options) {
  const self = this;
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
  const httpOptions = {
    windowSize: 1024 * 1024
  };
  const tlsCheckOptions = ['cert', 'key', 'pfx', 'ca'];
  let usingSSL = false;
  Object.keys(options).forEach(k => {
    httpOptions[k] = options[k];
    if (tlsCheckOptions.indexOf(k) > -1) {
      usingSSL = true;
    }
  });

  // If any tls options were specified, use ssl and not plain
  httpOptions.plain = (usingSSL) ? false : true;
  httpOptions.ssl = (usingSSL) ? true : false;
  this.server = spdy.createServer(httpOptions);

  // internal server for z2z, allways ssl: false, plain: true
  this.spdyServer = spdy.createServer({
    windowSize: 1024 * 1024,
    plain: true,
    ssl: false
  });

  const ValidWSUrls = [
      /^\/events$/, // /events
      /^\/events\?.+$/, // /events?topic=query:where type="led"
      /^\/servers\/(.+)\/events/, // /servers/BC2832FD-9437-4473-A4A8-AC1D56B12C61/events
      /^\/peers\/(.+)$/, // /peers/123123...
      /^\/peer-management$/, // /peer-management
  ];

  function match(request) {
    return ValidWSUrls.some(re => re.test(request.url));
  }

  this.wss = new WebSocketServer({ noServer: true });
  this.server.on('upgrade', (request, socket, headers) => {

    const sendError = code => {
      // Check any custom websocket paths from extentions
      const finish = () => {
        const responseLine = `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r\n\r\n\r\n`;
        socket.end(responseLine);
      };

      if (self.server.listeners('upgrade').length > 1) {
        const timer = setTimeout(() => {
          if (socket.bytesWritten === 0) {
            finish();
          }
        }, 5000);
        socket.on('close', () => {
          clearTimeout(timer);
        });
      } else {
        finish();
      }
    };

    if (/^\/peers\/(.+)$/.exec(request.url)) {
      async.eachSeries(self._wsHooks.peerConnect, (handler, next) => handler(request, socket, headers, next), err => {
        if (err) {
          return sendError(500);
        }

        // Handle Peer Request
        self.wss.handleUpgrade(request, socket, headers, ws => {
          self.setupPeerSocket(ws);
        });
      });
    } else if (match(request)) {
      async.eachSeries(self._wsHooks.websocketConnect, (handler, next) => handler(request, socket, headers, next), err => {
        if (err) {
          return sendError(500);
        }

        self.wss.handleUpgrade(request, socket, headers, ws => {
          if (ws.upgradeReq.url === '/peer-management') {
            const query = [
              { name: self.zetta.id, topic: '_peer/connect' },
              { name: self.zetta.id, topic: '_peer/disconnect' }];

            const client = new EventSocket(ws, query);
            self.eventBroker.client(client);
          } else {
            self.setupEventSocket(ws);
          }
        });
      });
    } else {
      // 404
      sendError(404);
    }

  });

  const titanOpts = {
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
    .use(handle => {
      handle('request', (env, next) => {
        if (env.request.method === 'OPTIONS') {
          env.argo._routed = true;
        }
        next(env);
      });
    })
    .use(handle => {
      handle('request', (env, next) => {
        // stop execution in argo for initiate peer requests, handled by peer_client
        if (!(/^\/_initiate_peer\/(.+)$/.exec(env.request.url)) ) {
          next(env);
        }
      });
    });
};

ZettaHttpServer.prototype.init = function(cb) {
  const self = this;

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
  const xfp = req.headers['x-forwarded-proto'];
  let protocol;

  if (xfp && xfp.length) {
    protocol = xfp.replace(/\s*/, '').split(',')[0];
  } else {
    protocol = req.connection.encrypted ? 'https' : 'http';
  }

  return protocol;
}

ZettaHttpServer.prototype.wireUpWebSocketForEvent = (ws, host, p) => {
  ws._env = { helpers: {}};
  ws._loader = { path: p };

  ws._env.uri = () => {
    const protocol = getCurrentProtocol(ws.upgradeReq);

    if (!host) {
      const address = ws.upgradeReq.connection.address();
      host = address.address;
      if (address.port) {
        if (!(protocol === 'https' && address.port === 443) &&
            !(protocol === 'http' && address.port === 80)) {
          host += `:${address.port}`
        }
      }
    }
    return (`${protocol}://${path.join(host, ws.upgradeReq.url)}`).replace(/\\/g, '/');
  };

  ws._env.helpers.url = {};
  ws._env.helpers.url.path = pathname => {
    const parsed = url.parse(ws._env.uri());
    parsed.search = null;
    parsed.pathname = pathname;
    return url.format(parsed);
  };
};

ZettaHttpServer.prototype.setupPeerSocket = function(ws) {
  const self = this;
  let name = /^\/peers\/(.+)$/.exec(url.parse(ws.upgradeReq.url, true).pathname)[1];
  name = decodeURI(name);
  self.zetta.log.emit('log', 'http_server', `Websocket connection for peer "${name}" established.`);

  // Include ._env and ._loader on websocket, allows argo formatters to work used in virtual_device build actions.
  const host = ws.upgradeReq.headers['host'];
  self.wireUpWebSocketForEvent(ws, host, `/servers/${name}`);

  if (self.peers[name] && self.peers[name].state !== PeerSocket.DISCONNECTED) {
    // peer already connected or connecting
    ws.close(4000, 'peer already connected');
  } else if (self.peers[name]) {
    // peer has been disconnected but has connected before.
    self.peers[name].init(ws);
  } else {
    const peer = new PeerSocket(ws, name, self.peerRegistry, self.peerOptions);
    self.peers[name] = peer;

    // Events coming from the peers pubsub using push streams
    peer.on('zetta-events', (topic, data) => {
      self.zetta.pubsub.publish(`${name}/${topic}`, data, true); // Set fromRemote flag to true
    });

    peer.on('connected', () => {
      self.eventBroker.peer(peer);
      self.zetta.log.emit('log', 'http_server', `Peer connection established "${name}".`);
      self.zetta.pubsub.publish('_peer/connect', { peer: peer });
    });

    peer.on('error', err => {
      self.zetta.log.emit('log', 'http_server', `Peer connection failed for "${name}": ${err.message}.`);
      self.zetta.pubsub.publish('_peer/disconnect', { peer: peer, err: err });
    });

    peer.on('end', () => {
      self.zetta.log.emit('log', 'http_server', `Peer connection closed for "${name}".`);
      self.zetta.pubsub.publish('_peer/disconnect', { peer: peer });
    });
  }
};

ZettaHttpServer.prototype.setupEventSocket = function(ws) {
  const self = this;
  const host = ws.upgradeReq.headers['host'];

  if (/^\/events/.exec(ws.upgradeReq.url)) {
    self.wireUpWebSocketForEvent(ws, host, `/servers/${self.zetta._name}`);
    const parsed = url.parse(ws.upgradeReq.url, true);
    var query = parsed.query;

    if(!query.topic) {
      var client = new EventSocket(ws, null, { streamEnabled: true, filterMultiple: !!(query.filterMultiple) });
      self.eventBroker.client(client);
      return;
    }

    function copy(q) {
      const c = {};
      Object.keys(q).forEach(k => {
        c[k] = q[k];
      });

      return c;
    }

    [self.zetta._name].concat(Object.keys(self.peers)).forEach(serverId => {
      const q = copy(query);
      q.name = serverId;

      if (q.topic) {
        const qt = querytopic.parse(query.topic);
        if (qt) {
          q.topic = querytopic.format(qt);
        }
        const client = new EventSocket(ws, q, { streamEnabled: false });
        self.eventBroker.client(client);
      }
    });

    function subscribeOnPeerConnect(e, obj) {
      const q = copy(query);
      q.name = obj.peer.name;

      if (q.topic) {
        const qt = querytopic.parse(query.topic);
        if (qt) {
          q.topic = querytopic.format(qt);
        }

        const client = new EventSocket(ws, q);
        self.eventBroker.client(client);
      }
    }

    ws.on('close', () => {
      self.zetta.pubsub.unsubscribe('_peer/connect', subscribeOnPeerConnect);
    });

    self.zetta.pubsub.subscribe('_peer/connect', subscribeOnPeerConnect);
  } else {
    const match = /^\/servers\/(.+)\/events/.exec(ws.upgradeReq.url);
    if(!match) {
      ws.close(1001); // go away status code
      return;
    }

    var query = querystring.parse(url.parse(ws.upgradeReq.url).query);
    query.serverId = match[1]; // set serverId on query

    self.wireUpWebSocketForEvent(ws, host, `/servers/${query.serverId}`);

    var query = querystring.parse(url.parse(ws.upgradeReq.url).query);
    query.name = decodeURI(match[1]);

    if (query.topic) {
      const qt = querytopic.parse(query.topic);
      if (qt) {
        query.topic = querytopic.format(qt);
      }
      var client = new EventSocket(ws, query);
      self.eventBroker.client(client);
    }
  }
};

ZettaHttpServer.prototype.httpRegistration = handle => {
  handle('request', (env, next) => {
    if (!(env.request.method === 'POST' && env.request.url === '/registration')) {
      return next(env);
    }

    env.request.getBody((err, body) => {
      body = JSON.parse(body.toString());
      const peer = self.peers[body.target];

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
  const self = this;

  const req = env.request;
  const res = env.response;
  const protocol = getCurrentProtocol(req);

  const messageId = ++self.idCounter;
  self.clients[messageId] = res;

  const tasks = peers.map(p => {
    const name = p.id;
    return callback => {

      const reqUrl = req.templateUrl.replace('{{peerName}}', encodeURIComponent(name));
      const headers = {};

      Object.keys(req.headers).forEach(key => {
        headers[key] = req.headers[key];
      });

      if (!req.isSpdy) {
        headers['x-forwarded-proto'] = protocol;
      }

      const peer = self.peers[name];
      if (!peer || peer.state !== PeerSocket.CONNECTED){
        callback(null, { err: new Error('Peer does not exist.') });
        return;
      }

      const agent = env.zettaAgent || peer.agent;

      const opts = { method: req.method, headers: headers, path: reqUrl, agent: agent };
      const request = http.request(opts, response => {
        response.getBody((err, body) => {
          callback(null, { res: response, err: err, body: body });
        });
      }).on('error', err => callback(null, { err: err }));

      if (req.body) {
        request.end(req.body);
      } else {
        req.pipe(request);
      }
    };
  });

  async.parallelLimit(tasks, 5, (err, results) => {
    cb(err, results, messageId);
  });
};

ZettaHttpServer.prototype.proxyToPeer = function(env, next) {
  const self = this;
  const req = env.request;
  const res = env.response;

  const parsed = url.parse(req.url);
  const name = decodeURIComponent(parsed.pathname.split('/')[2]);

  if (!req.isSpdy) {
    req.headers['x-forwarded-proto'] = getCurrentProtocol(req);
  }

  const peer = self.peers[name];
  if (!peer || peer.state !== PeerSocket.CONNECTED){
    res.statusCode = 404;
    res.end();
    return;
  }

  const agent = env.zettaAgent || peer.agent;

  const opts = {
    method: req.method,
    headers: req.headers,
    path: req.url,
    agent: agent,
    pipe: true
  };
  if (typeof env.proxyOpts === 'object') {
    Object.keys(env.proxyOpts).forEach(k => {
      opts[k] = env.proxyOpts[k];
    });
  }

  const request = http.request(opts, response => {

    Object.keys(response.headers).forEach(header => {
      res.setHeader(header, response.headers[header]);
    });

    res.statusCode = response.statusCode;

    if (!opts.pipe) {
      let body = null;
      const buf = [];
      let len = 0;

      response.on('readable', () => {
        let chunk;

        while ((chunk = response.read()) != null) {
          buf.push(chunk);
          len += chunk.length;
        }

        if (!buf.length) {
          return;
        }

        body = new Buffer(len);
        let i = 0;
        buf.forEach(chunk => {
          chunk.copy(body, i, 0, chunk.length);
          i += chunk.length;
        });
      });

      response.on('end', () => {
        env.response.body = body;
        next(env);
      });
    } else {
      env.response.body = response;
      next(env);
    }
  }).on('error', err => {
    env.response.statusCode = 502;
    return next(env);
  });

  if (req.body) {
    request.end(req.body);
  } else {
    req.pipe(request);
  }
};
