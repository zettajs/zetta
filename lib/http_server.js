var fs = require('fs');
var http = require('http');
var spdy = require('spdy');
var argo = require('argo');
var titan = require('titan');
var WebSocketServer = require('ws').Server;
var PubSubService = require('./pubsub_service');
var FogAgent = require('./fog_agent');

var DevicesResource = require('./api_resources/devices');
var RootResource = require('./api_resources/root');
var ServersResource = require('./api_resources/servers');

var ZettaCloud = module.exports = function(server) {
  this.peers = [];
  this.idCounter = 0;

  this._collectors = {};
  this.clients = {};
  this.subscriptions = {};
  this.eventRequests = {};

  this.agent = null;
  this.agents = {};

  this.server = http.createServer();

  this.cloud = argo()
    .use(titan)
    .add(RootResource, server)
    .add(DevicesResource, server)
    .add(ServersResource, server)
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

ZettaCloud.prototype.setup = function(cb) {
  var localApp = './app/app.js';
  var self = this;
  fs.stat(localApp, function(err, stat) {
    if (!err) {
      //bootstrapper('./app/app.js', self.cloud);
    }

    self.init(cb);
  });
};

ZettaCloud.prototype.init = function(cb) {
  var self = this;
  this.cloud = this.cloud.use(function(handle) {
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
  });
  this.cloud = this.cloud.route('*', function(handle) {
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
  })
  .build();

  this.server.on('request', this.cloud.run);

  this.wss = new WebSocketServer({ server: this.server });
  this.wss.on('connection', function(ws) {
    var regex = /^\/peers\/(.+)$/;
    var match = regex.exec(ws.upgradeReq.url);
    if (match) {
      var appName = match[1];
      ws._socket.removeAllListeners('data'); // Remove WebSocket data handler.

      var len = self.peers.push(ws._socket);
      var idx = len - 1;

      ws._socket.on('end', function() {
        self.peers.splice(idx, 1);
        setTimeout(function() {
          if (!ws._socket) {
            self.subscriptions = {};
            self._collectors = {};
          }
        }, 5 * 60 * 1000);
      });

      self.agents[appName] = spdy.createAgent(FogAgent, {
        host: appName,
        port: 80,
        socket: ws._socket,
        spdy: {
          plain: true,
          ssl: false
        }
      });

      var agent = self.agents[appName];

      // TODO: Remove this when bug in agent socket removal is fixed.
      agent.maxSockets = 150;

      agent.on('push', function(stream) {
        if (!self.subscriptions[stream.url] && !self._collectors[stream.url]) {
          stream.connection.end();
          return;
        }

        var data = [];
        var len = 0;
        stream.on('readable', function() {
          while (d = stream.read()) {
            data.push(d);
            len += d.length;
          };
        });

        stream.on('error', function(err) {
          console.error('error on push:', err);
        });

        stream.on('end', function() {
          if (!self.peers.length) {
            stream.connection.end();
            return;
          }

          if (!self.subscriptions[stream.url] && !self._collectors[stream.url]) {
            stream.connection.end();
            return;
          }

          var queueName = stream.url;
          var body = data.join();

          self._publish(queueName, body);

          stream.connection.end();
        });
      });

      var keys = Object.keys(self._collectors).concat(Object.keys(self.subscriptions));

      keys.forEach(function(k){
        self._subscribe.bind(self)(k);  
      });

      setInterval(function() {
        agent.ping(function(err) {
          //TODO: Handle a lack of PONG.
        });
      }, 10 * 1000);

    } else if(ws.upgradeReq.url === '/events'){
      self.setupEventSocket(ws);
    }

    if (cb) {
      cb();
    }
  });
};

ZettaCloud.prototype.setupEventSocket = function(ws){
  var self = this;

  ws.on('message', onEventMessage);

  function closeSocket(){
    Object.keys(self.subscriptions).forEach(function(channel){
      self.subscriptions[channel].forEach(function(c,idx){
        if(c === ws)
          self.subscriptions[channel].splice(idx,1);  
      });

      if (self.subscriptions[channel].length === 0) {
        delete self.subscriptions[channel];
        var channel = self.eventRequests[channel];
        if (channel) {
          var con = channel.connection;

          if (con) {
            Object.keys(self.agents).forEach(function(key) {
              var agent = self.agents[key];
              agent.removeSocket(
                con, agent.host + ':' + agent.port,
                agent.host, agent.port, agent.host);

              delete self.eventRequests[channel];
            });

            con.end();
          }
        }
      }
    });
  }

  ws.on('close',function(){
    closeSocket();  
  });

  ws.on('error',function(err){
    console.error('ws error:', err);
    closeSocket();
  });
  
  function onEventMessage (data){
    var msg = null;
    if (typeof data === 'string') {
      try {
        msg = JSON.parse(data.toString());
      } catch(err) {
        return;
      }
    } else {
      msg = data;
    }

    if(msg.cmd === 'subscribe' && msg.name){
      var isNew = false;
      if(!self.subscriptions[msg.name]) {
        self.subscriptions[msg.name] = [];
        isNew = true;
      }

      self.subscriptions[msg.name].push(ws);

      if (isNew) {
        self._subscribe.bind(self)(msg.name);
      }
    } else if (msg.cmd === 'publish' && msg.name && msg.data) {
      self._publish(msg.name, msg.data);
    }
  };
}

ZettaCloud.prototype.listen = function(){
  this.server.listen.apply(this.server,arguments);
  return this;
};

ZettaCloud.prototype.collector = function(name,collector){
  if(typeof name === 'function'){
    collector = name;
    name = '_logs';
  }

  if(!this._collectors[name])
    this._collectors[name] = [];

  this._collectors[name].push(collector);

  return this;
};

ZettaCloud.prototype._subscribe = function(event) {
  var self = this;

  PubSubService.subscribeLocal(event, self._publish.bind(self));

  var body = 'name='+event;

  Object.keys(self.agents).forEach(function(key) {
    var agent = self.agents[key];
    var opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': 'fog.argo.cx',
        'Content-Length': body.length
      },
      path: '/_subscriptions',
      agent: agent
    };

    var req = http.request(opts);
    req.end(new Buffer(body));
    self.eventRequests[event] = req;
  });
};

ZettaCloud.prototype._publish = function(queueName, body) {
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
