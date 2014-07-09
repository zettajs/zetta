var fs = require('fs');
var http = require('http');
var spdy = require('spdy');
var argo = require('argo');
var argoMultiparty = require('argo-multiparty');
var titan = require('titan');
var WebSocketServer = require('ws').Server;
var PubSubService = require('./pubsub_service');
var SpdyAgent = require('./spdy_agent');
var PeerSocket = require('./peer_socket');

var DevicesResource = require('./api_resources/devices');
var RootResource = require('./api_resources/root');
var ServersResource = require('./api_resources/servers');

var ZettaHttpServer = module.exports = function(zettaInstance) {
  this.peers = [];
  this.idCounter = 0;
  this.clients = {};
  this.subscriptions = {};
  this.eventRequests = {};
  this.agent = null;
  this.agents = {};
  this.server = http.createServer();
  this._collectors = {};
  this.zetta = zettaInstance;

  this.cloud = argo()
    .use(titan)
    .add(RootResource, zettaInstance)
    .add(DevicesResource, zettaInstance)
    .add(ServersResource, zettaInstance)
    .use(argoMultiparty)
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
    });
};

ZettaHttpServer.prototype.init = function(cb) {
  var self = this;

  // handle http registration of device
  this.cloud = this.cloud.use(this.httpRegistration.bind(this));
  // handle proxying to peer
  this.cloud = this.cloud.route('*', this.proxyToPeer.bind(this));

  // setup http servers request handler to argo routes
  this.server.on('request', this.cloud.build().run);

  this.wss = new WebSocketServer({ server: this.server });
  this.wss.on('connection', function(ws) {
    
    console.log('Websocket: ' + ws.upgradeReq.url);

    var match = /^\/peers\/(.+)$/.exec(ws.upgradeReq.url);
    if (match) {
      var appName = match[1];
      var peer = new PeerSocket(ws, appName);
    } else if(ws.upgradeReq.url.search('/servers/') === 0){      
      var match = /^\/servers\/(.+)\/devices\/(.+)\/(.+)$/.exec(ws.upgradeReq.url);
      if(!match) {
	return;
      }

      var serverId = match[1];
      var deviceId = match[2];
      var topic = match[3];

      if (self.zetta.id !== serverId) {
	// @todo proxy to peer...
	console.error('Cannot proxy');
	return;
      }
      
      var device = self.zetta.runtime._jsDevices[deviceId];
      if (!device) {
	console.error('Device does not exist');
	// Device does not exist
	return;
      }

      topic = device.type + '/' + device.id + '/' + topic;




      return;

      var client = new EventSocket();
      self.setupEventSocket(ws);
    }
    
  });

  if (cb) {
    cb();
  }
};





ZettaHttpServer.prototype.setupEventSocket = function(ws){
}

ZettaHttpServer.prototype.listen = function(){
  this.server.listen.apply(this.server,arguments);
  return this;
};

ZettaHttpServer.prototype.collector = function(name,collector){
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



ZettaHttpServer.prototype._publish = function(queueName, body) {
  var self = this;

  if(self._collectors[queueName] && self._collectors[queueName].length){
    self._collectors[queueName].forEach(function(collector){
      collector(body);
    });
  }

  if(self.subscriptions[queueName] && self.subscriptions[queueName].length /*&& self.eventRequests[queueName]*/){
    var toRemove = [];
    self.subscriptions[queueName].forEach(function(client, i){
      var data;

      try {
        data = JSON.parse(body);
      } catch(e) {
        data = body;
      }

      client.send(JSON.stringify({ destination : queueName, data : data }), function(err) {
        if (err) {
          toRemove.push(i);
        }
      });
    });

    toRemove.forEach(function(idx) {
      self.subscriptions[queueName].splice(idx);
    });
  }
};

ZettaHttpServer.prototype.httpRegistration = function(handle) {
  handle('request', function(env, next) {
    if (!(env.request.method === 'POST' && env.request.url === '/registration')) {
      return next(env);
    }
    
    env.request.getBody(function(err, body) {
      body = JSON.parse(body.toString());
      var agent = self.agents[body.target];
      
      if (!agent) {
        env.response.statusCode = 404;
        return next(env);
      }

      env.request.body = new Buffer(JSON.stringify(body.device));
      env.zettaAgent = agent;
      next(env);
    });
  });
};

ZettaHttpServer.prototype.proxyToPeer = function(handle) {
  handle('request', function(env, next) {
    var req = env.request;
    var res = env.response;
    if (!self.peers.length) {
      res.statusCode = 500;
      res.end();
      return;
    }
    var messageId = ++self.idCounter;

    // change this to handle multiple fogs
    self.clients[messageId] = res;//req.socket; Will need socket for event broadcast.

    req.headers['zetta-message-id'] = messageId;

    var appName = req.url.split('/')[1];
    var agent = env.zettaAgent || self.agents[appName];
    if(!agent){
      res.statusCode = 404;
      res.end();
      return;
    }
    
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
  });
};
