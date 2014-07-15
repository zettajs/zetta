var querystring = require('querystring');
var PeerClient = require('../peer_client');
var rels = require('../api_rels');

var PeerManagementResource = module.exports = function(server) {
  this.server = server;
  this.registry = server.peerRegistry;
};

PeerManagementResource.prototype.init = function(config) {
  config
    .path('/peer-management')
    .produces('application/vnd.siren+json')
    .consumes('application/x-www-form-urlencoded')
    .get('/', this.list)
    .post('/', this.link)
    .get('/{id}', this.show);
};

PeerManagementResource.prototype.list = function(env, next) {
  console.log('in #list');
  var allQuery = {
    match: function() { console.log('in all query'); return true; }
  };

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

PeerManagementResource.prototype._connect = function(peer) {
  var self = this;
  var client = new PeerClient(peer.url, this.server);

  client.on('connected', function() {
    self.registry.get(peer.id, function(err, result) {
      result = JSON.parse(result);
      result.status = 'connected';
      self.registry.save(result);
    });
  });

  client.on('error', function(error) {
    self.registry.get(peer.id, function(err, result) {
      result = JSON.parse(result);
      result.status = 'failed';
      result.error = error;
      self.registry.save(result);
    });
  });

  client.on('closed', function() {
    self.registry.get(peer.id, function(err, result) {
      result = JSON.parse(result);
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
      var peerUrl = peer.url || self.urlHelper.path('/servers/' + peer.id);

      var entity = {
        class: ['peer'],
        properties: {
          id: peer.id,
          name: peer.name,
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
        { rel: [rels.self], href: self.urlHelper.join(peer.id) },
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
    name: this.data.name,
    direction: this.data.direction,
    status: this.data.status,
    error: this.data.error,
    updated: this.data.updated
  };

  return this;
};

PeerItemBuilder.prototype.actions = function() {
  if (this.data.direction === 'initiator') {
    this.base.actions = [{
      name: 'reconnect',
      method: 'POST',
      href: this.urlHelper.path('/peer-management'),
      fields: [{ name: 'url', type: 'url', value: this.data.url }]
    }];
  }

  return this;
};

PeerItemBuilder.prototype.links = function() {
  var self = this;
  var peerUrl = this.data.url || self.urlHelper.path('/servers/' + this.data.id);

  var peerUrlRel = self.base.properties.direction === 'initiator' ? rels.root : rels.server;
  this.base.links = [
    { rel: [rels.self], href: self.urlHelper.current() },
    { rel: [peerUrlRel], href: peerUrl },
    { rel: [rels.monitor], href: peerUrl.replace(/^http/, 'ws') }
  ];

  return this;
};
