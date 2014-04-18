var fs = require('fs');
var http = require('http');
var spdy = require('spdy');
var argo = require('argo');
var titan = require('titan');
var WebSocketServer = require('ws').Server;
var bootstrapper = require('./bootstrapper');
var PubSubService = require('./pubsub_service');
var FogAgent = require('./fog_agent');

var ZettaCloud = module.exports = function() {
  this.webSocket = null;
  this.idCounter = 0;
  this.isLocal = false;

  this._collectors = {};
  this.clients = {};
  this.subscriptions = {};
  this.eventRequests = {};

  this.agent = null;

  this.server = http.createServer();
  this.cloud = argo();
};

ZettaCloud.prototype.setup = function(cb) {
  var localApp = './app/app.js';
  var self = this;
  fs.stat(localApp, function(err, stat) {
    if (!err) {
      self.isLocal = true;
      bootstrapper('./app/app.js', self.cloud);
    }

    self.init(cb);
  });
};

ZettaCloud.prototype.init = function(cb) {
  var self = this;
  this.cloud = this.cloud.route('*', function(handle) {
    handle('request', function(env, next) {
      var req = env.request;
      var res = env.response;
      if (!self.webSocket) {
        res.statusCode = 500;
        res.end();
        return;
      }
      var messageId = ++self.idCounter;

      self.clients[messageId] = res;//req.socket; Will need socket for event broadcast.

      req.headers['zetta-message-id'] = messageId;


      var opts = { method: req.method, headers: req.headers, path: req.url, agent: self.agent };
      var request = http.request(opts, function(response) {
        var id = response.headers['zetta-message-id'];
        var res = self.clients[id];

        Object.keys(response.headers).forEach(function(header) {
          if (header !== 'zetta-message-id') {
            res.setHeader(header, response.headers[header]);
          }
        });

        response.pipe(res);

        response.on('finish', function() {
          next(env);
        });

        delete self.clients[id];
      });

      req.pipe(request);
    });
  })
  .build();

  this.server.on('request', this.cloud.run);

  this.wss = new WebSocketServer({ server: this.server });
  this.wss.on('connection', function(ws) {
    if (ws.upgradeReq.url === '/'){
      ws._socket.removeAllListeners('data'); // Remove WebSocket data handler.

      self.webSocket = ws._socket;

      self.webSocket.on('end', function() {
        self.webSocket = null;
        setTimeout(function() {
          if (!self.webSocket) {
            self.subscriptions = {};
            self._collectors = {};
          }
        }, 5 * 60 * 1000);
      });

      self.agent = spdy.createAgent(FogAgent, {
        host: 'localhost',
        port: 80,
        socket: ws._socket,
        spdy: {
          plain: true,
          ssl: false
        }
      });

      // TODO: Remove this when bug in agent socket removal is fixed.
      self.agent.maxSockets = 150;

      self.agent.on('push', function(stream) {
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
          if (!self.webSocket) {
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
        self._subscribe(k);  
      });

      setInterval(function() {
        self.agent.ping(function(err) {
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
        if (!self.isLocal) {
          var con = self.eventRequests[channel].connection;

          self.agent.removeSocket(con, self.agent.host + ':' + self.agent.port,
            self.agent.host, self.agent.port, self.agent.host);

          delete self.eventRequests[channel];
          con.end();
        }
      }
    });
  }

  ws.on('close',function(){
    closeSocket();  
  });

  ws.on('error',function(err){
    console.error(err);
    closeSocket();
  });
  
  function onEventMessage (data){
    var msg = null;
    try{
     msg = JSON.parse(data);
    }catch(err){
      console.error(err);
      return;
    }

    if(msg.cmd === 'subscribe' && msg.name){
      var isNew = false;
      if(!self.subscriptions[msg.name]) {
        self.subscriptions[msg.name] = [];
        isNew = true;
      }

      self.subscriptions[msg.name].push(ws);

      if (isNew) {
        self._subscribe(msg.name);
      }
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
  if (self.isLocal) {
    PubSubService.subscribeLocal(event, self._publish.bind(self));
  } else {
    var body = 'name='+event;

    var opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': 'fog.argo.cx',
        'Content-Length': body.length
      },
      path: '/_subscriptions',
      agent: this.agent
    };

    var req = http.request(opts);
    req.end(new Buffer(body));
    self.eventRequests[event] = req;
  }
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
