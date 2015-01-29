var querystring = require('querystring');
var PeerClient = require('../peer_client');
var rels = require('zetta-rels');
var MediaType = require('api-media-type');
var Query = require('calypso').Query;
var http = require('http');

var PeerManagementResource = module.exports = function(server) {
  this.server = server;
  this.registry = server.peerRegistry;
};

PeerManagementResource.prototype.init = function(config) {
  config
    .path('/peer-management')
    .produces(MediaType.SIREN)
    .consumes(MediaType.FORM_URLENCODED)
    .get('/', this.list)
    .post('/', this.link)
    .get('/{id}', this.show)
    .del('/{id}', this.deletePeer)
    .put('/{id}', this.updatePeer);
};

PeerManagementResource.prototype.list = function(env, next) {
  var params = env.route.query;
  var allQuery = Query.of('peers');
  if(params) {
    allQuery.ql(params.ql);
  }  

  this.registry.find(allQuery, function(err, results) {
    var builder = new PeerManagementBuilder(results, env.helpers.url);
    env.response.body = builder.build();
    next(env);
  });

};

PeerManagementResource.prototype.link = function(env, next) {
  var self = this;

  env.request.getBody(function(err, body) {
    if (err) {
      env.response.statusCode = 400;
      return next(env);
    }

    var query = querystring.parse(body.toString());

    self.server._peers.push(query.url);

    var peer = {
      url: query.url,
      direction: 'initiator',
      status: 'connecting'
    }; 

    self.registry.add(peer, function(err, peer) {
      if (err) {
        env.response.statusCode = 500;
        return next(env);
      }

      self.server._runPeer(peer);

      env.response.statusCode = 202;
      env.response.setHeader('Location', env.helpers.url.join(peer.id));

      next(env);
    });
  });
};

//This is conditonal based on where the request is coming from.
//From acceptor we'll add additonal info to the request, and proxy to initiator
//From intiator we'll perform the disconnection
PeerManagementResource.prototype.deletePeer = function(env, next) {
  var id = env.route.params.id;
  var self = this;
  var query = Query.of('peers').where({connectionId: id});
  this.registry.find(query, function(err, results) {
    if(results.length) {
      var peer = results[0];
      if(peer.direction === 'initiator') {
        self._disconnect(peer);
        env.response.statusCode = 200;
        next(env);
      } else if(peer.direction === 'acceptor') {
        self._proxyDisconnect(env, next, id);
      } else {
        env.response.statusCode = 500;
        next(env);  
      }
    } else {
      env.response.statusCode = 404;
      next(env);
    }
  });
};

//Updating a peer is a two part process.
//First we'll determine whether or not the API call should be proxied
//Then we'll connect to the new peer.
//Then we'll disconnect from the old peer.
PeerManagementResource.prototype.updatePeer = function(env, next) {
  var self = this;
  env.request.getBody(function(err, body) {
    var params = querystring.parse(body.toString());
    var id = env.route.params.id;
    var url = params.url;
    var query = Query.of('peers').where({connectionId: id});
    self.registry.find(query, function(err, results) {
      if(results.length) {
        var peer = results[0];
        if(peer.direction === 'initiator') {

          self.server._peers.push(url);

          var newPeer = {
            url: url,
            direction: 'initiator',
            status: 'connecting'
          }; 
          

          self.registry.add(newPeer, function(err, newPeer) {
            if (err) {
              env.response.statusCode = 500;
              return next(env);
            }

            self.server._runPeer(newPeer);
            self._disconnect(peer);
            env.response.statusCode = 200;
            next(env);
          });

        } else if(peer.direction === 'acceptor') {
          self._proxyDisconnect(env, next, id);
        } else {
          env.response.statusCode = 500;
          next(env);
        } 
      } else {
        env.response.statusCode = 404;
        next(env);
      }
    });
  });
};

PeerManagementResource.prototype._disconnect = function(peer) {
  var wsUrl = PeerClient.calculatePeerUrl(peer.url, this.server._name);
  var peers = this.server._peerClients.filter(function(peer) {
    return peer.url === wsUrl;  
  });
  var client = peers[0];
  client.close();     
};

PeerManagementResource.prototype._proxyDisconnect = function(env, next, id) { 
  var self = this;
  var peerSocket;
  var sockets = Object.keys(this.server.httpServer.peers).forEach(function(socketId){
    var peers = self.server.httpServer.peers;
    var socket = peers[socketId];
    if(socket.connectionId === id) {
      peerSocket = socket;  
    }
  });

  if (!peerSocket) {
    env.response.statusCode = 404;
    return next(env);
  }

  peerSocket.on('end', function() {
    env.response.statusCode = 200;
    next(env);  
  });

  this._proxyToPeer(peerSocket, env);
 
};

PeerManagementResource.prototype._proxyToPeer = function(peer, env) {
  var req = env.request;
  var res = env.response;
  var agent = env.zettaAgent || peer.agent;
  var opts = { method: req.method, headers: req.headers, path: req.url, agent: agent };
  var request = http.request(opts);
  if(req.body) {
    request.end(req.body);  
  } else {
    req.pipe(request);
  }
};

PeerManagementResource.prototype.show = function(env, next) {
  var id = env.route.params.id;
  this.registry.get(id, function(err, result) {
    if (err) {
      env.response.statusCode = 404;
      return next(env);
    }

    if (typeof result === 'string') {
      result = JSON.parse(result);
    }

    var builder = new PeerItemBuilder(result, env.helpers.url);
    env.response.body = builder.build();

    next(env);
  });
};

var PeerManagementBuilder = function(data, urlHelper) {
  this.data = data || {};
  this.urlHelper = urlHelper;
  this.base = { class: ['peer-management'] };
};

PeerManagementBuilder.prototype.build = function() {
  this.actions().entities().links();

  return this.base;
};

PeerManagementBuilder.prototype.entities = function() {
  var self = this;
  if (this.data && this.data.length) {
    this.base.entities = this.data.map(function(peer) {
      var peerUrl = peer.url || self.urlHelper.path('/servers/' + encodeURI(peer.id));

      var entity = {
        class: ['peer'],
        properties: {
          id: peer.id,
          name: peer.id,
          direction: peer.direction,
          status: peer.status,
          error: peer.error,
          updated: peer.updated,
          connectionId: peer.connectionId
        }
      };

      entity.actions = [];
      entity.actions.push({
        name: 'disconnect',
        method: 'DELETE',
        href: self.urlHelper.path('/peer-management/'+peer.connectionId)
      },{
        name: 'update',
        method: 'PUT',
        href: self.urlHelper.path('/peer-management/'+peer.connectionId),
        fields: [{name: 'url', type: 'url'}]
      }); 

      /* API action does not work wait till we fix it
      if (peer.direction === 'initiator') {
        entity.actions.push({
          name: 'reconnect',
          method: 'POST',
          href: self.urlHelper.current(),
          fields: [{ name: 'url', type: 'url', value: peerUrl }]
        });
      }
      */

      var peerUrlRel = peer.direction === 'initiator' ? rels.root : rels.server;
      entity.links = [
        { rel: [rels.self], href: self.urlHelper.join(encodeURI(peer.id)) },
        { rel: [peerUrlRel], href: peerUrl },
        { rel: [rels.monitor], href: peerUrl.replace(/^http/, 'ws') }
      ];

      return entity;
    });
  }

  return this;
};

PeerManagementBuilder.prototype.actions = function() {
  this.base.actions = [{
    name: 'link',
    method: 'POST',
    href: this.urlHelper.current(),
    fields: [ { name: 'url', type: 'url' } ]
  }];

  return this;
};

PeerManagementBuilder.prototype.links = function() {
  this.base.links = [{
    rel: [rels.self],
    href: this.urlHelper.current()
  }];

  return this;
};

var PeerItemBuilder = function(data, urlHelper) {
  this.data = data || {};
  this.urlHelper = urlHelper;
  this.base = { class: ['peer'] };
};

PeerItemBuilder.prototype.build = function() {
  this.properties().actions().links();

  return this.base;
};

PeerItemBuilder.prototype.properties = function() {
  this.base.properties = {
    id: this.data.id,
    name: this.data.id,
    direction: this.data.direction,
    status: this.data.status,
    error: this.data.error,
    updated: this.data.updated,
    connectionId: this.data.connectionId
  };

  return this;
};

PeerItemBuilder.prototype.actions = function() {
  this.base.actions = [];

  this.base.actions.push({
    name: 'disconnect',
    method: 'DELETE',
    href: this.urlHelper.path('/peer-management/'+this.data.connectionId),
  },{
    name: 'update',
    method: 'PUT',
    href: this.urlHelper.path('/peer-management/'+this.data.connectionId),
    fields: [{name: 'url', type: 'url'}]
  });  

  if (this.data.direction === 'initiator') {
    this.base.actions.push({
      name: 'reconnect',
      method: 'POST',
      href: this.urlHelper.path('/peer-management'),
      fields: [{ name: 'url', type: 'url', value: this.data.url }]
    });
  }

  return this;
};

PeerItemBuilder.prototype.links = function() {
  var self = this;
  var peerUrl = this.data.url || self.urlHelper.path('/servers/' + encodeURI(this.data.id));

  var peerUrlRel = self.base.properties.direction === 'initiator' ? rels.root : rels.server;
  this.base.links = [
    { rel: [rels.self], href: self.urlHelper.current() },
    { rel: [peerUrlRel], href: peerUrl },
    { rel: [rels.monitor], href: peerUrl.replace(/^http/, 'ws') }
  ];

  return this;
};
