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
  var allQuery = {
    match: function() { return true; }
  };

  this.registry.find(allQuery, function(results) {
    var builder = new PeerManagementBuilder(results, env.helpers.url);
    env.response.body = builder.build();
    next(env);
  });

};

PeerManagementResource.prototype.link = function(env, next) {
  // TODO: Verify and insert connect job into database.
  // Update database on connected.

  var self = this;

  env.request.getBody(function(err, body) {
    if (err) {
      env.response.statusCode = 400;
      return next(env);
    }

    var query = querystring.parse(body.toString());

    self.server._peers.push(query.url);

    self.registry.add(query.url, function(err, peer) {
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

  client.start();
  // setTimeout to change status to failed if connection not made.
};

PeerManagementResource.prototype.show = function(env, next) {
  var id = env.route.params.id;

  this.registry.get(id, function(err, result) {
    if (err) {
      env.response.statusCode = 404;
      return next(env);
    }

    var builder = new PeerItemBuilder(JSON.parse(result), env.helpers.url.current());
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
  if (this.data && this.data.length) {
    this.base.entities = this.data.map(function(peer) {
      return {
        class: ['peer'],
        properties: {
          id: peer.id,
          name: peer.name,
          status: peer.status
        },
        links: [
          { rel: [rels.self], href: this.urlHelper.join(peer.id) },
          { rel: [rels.server], href: peer.url },
          { rel: [rels.monitor], href: peer.monitor }
        ]
      };
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

var PeerItemBuilder = function(data, current) {
  this.data = data || {};
  this.current = current;
  this.base = { class: ['peer'] };
};

PeerItemBuilder.prototype.build = function() {
  this.properties().links();

  return this.base;
};

PeerItemBuilder.prototype.properties = function() {
  this.base.properties = {
    id: this.data.id,
    name: this.data.name,
    status: this.data.status
  };

  return this;
};

PeerItemBuilder.prototype.links = function() {
  this.base.links = [ { rel: [rels.self], href: this.current } ];

  if (this.data.server) {
    this.base.links.push({ rel: [rels.server], href: this.data.server });
  }

  if (this.data.monitor) {
    this.base.links.push({ rel: [rels.monitor], href: this.data.monitor });
  }

  return this;
};
