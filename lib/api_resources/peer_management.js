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
};

PeerManagementResource.prototype.list = function(env, next) {
  var allQuery = Query.of('peers');

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

      self._connect(peer);

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
  this.registry.get(id, function(err, result) {
    if(result.direction === 'initiator') {
      var wsUrl = PeerClient.calculatePeerUrl(result.url, id);
      var peers = self.server._peerClients.filter(function(peer) {
        return peer.url === wsUrl;  
      });
      var client = peers[0];
      env.response.statusCode = 200;
      next(env);
      client.close();     

    } else if(result.direction === 'acceptor') {
      var socket = self.server.httpServer.peers[id];
      socket.on('end', function() {
        env.response.statusCode = 200;
        next(env);  
      });
      //self.server.httpServer.proxyToPeer(env, next); 
      var peer = self.server.httpServer.peers[id];
      var req = env.request;
      var res = env.response;
      var agent = env.zettaAgent || peer.agent;

      var opts = { method: req.method, headers: req.headers, path: req.url, agent: agent };
      var request = http.request(opts);
      request.end();
    } else {
      env.response.statusCode = 500;
      next(env);  
    }  
  });
};

PeerManagementResource.prototype.updatePeer = function(env, next) {};

PeerManagementResource.prototype._connect = function(peer) {
  var self = this;
  var client = new PeerClient(peer.url, this.server);

  client.on('connected', function() {
    self.registry.get(peer.id, function(err, result) {
      result.status = 'connected';
      self.registry.save(result);
    });
  });

  client.on('error', function(error) {
    self.registry.get(peer.id, function(err, result) {
      result.status = 'failed';
      result.error = error;
      self.registry.save(result);
    });
  });

  client.on('closed', function() {
    self.registry.get(peer.id, function(err, result) {
      result.status = 'connecting';
      self.registry.save(result, function() {
        client.start();
      });
    });
  });

  peer.status = 'connecting';
  self.registry.save(peer, function() {
    client.start();
  });
  // setTimeout to change status to failed if connection not made.
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
          updated: peer.updated
        }
      };

      if (peer.direction === 'initiator') {
        entity.actions = [{
          name: 'reconnect',
          method: 'POST',
          href: self.urlHelper.current(),
          fields: [{ name: 'url', type: 'url', value: peerUrl }]
        }];
      }

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
    updated: this.data.updated
  };

  return this;
};

PeerItemBuilder.prototype.actions = function() {
  this.base.actions = [];

  if(this.data.direction === 'acceptor') {
    this.base.actions.push({
      name: 'disconnect',
      method: 'DELETE',
      href: this.urlHelper.current(),
      fields:[]
    },{
      name: 'update',
      method: 'PUT',
      href: this.urlHelper.current(),
      fields: [{name: 'url', type: 'url'}]
    });  
  }
  

  if (this.data.direction === 'initiator') {
    this.base.actions.push({
      name: 'reconnect',
      method: 'POST',
      href: this.urlHelper.path('/peer-management'),
      fields: [{ name: 'url', type: 'url', value: this.data.url }]
    },
    {
      name: 'disconnect',
      method: 'DELETE',
      href: this.urlHelper.current(),
      fields: [{name:'peer', type: 'text'}]  
    },
    {
      name: 'update',
      method: 'PUT',
      href: this.urlHelper.current(),
      fields: [{name:'from', type:'url'}, {name: 'to', type:'url'}]  
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
