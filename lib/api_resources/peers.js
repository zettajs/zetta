var rels = require('../api_rels');

var PeersResource = module.exports = function(server) {
  this.server = server;
};

PeersResource.prototype.init = function(config) {
  config
    .path('/peer-management')
    .produces('application/vnd.siren+json')
    .consumes('application/x-www-form-urlencoded')
    .get('/', this.list)
    .post('/', this.link)
    .get('/{id}', this.show);
};

PeersResource.prototype.list = function(env, next) {
  // TODO: Lookup peer data and pass it into builder.
  var builder = new PeerManagementBuilder({}, env.helpers.url.current());
  env.response.body = builder.build();
  next(env);
};

PeersResource.prototype.link = function(env, next) {
  // TODO: Verify and insert connect job into database.
  // Update database on connected.

  env.response.statusCode = 201;
  env.response.setHeader('Location', env.helpers.url.join('/new-peer-uuid'));

  next(env);
};

PeersResource.prototype.show = function(env, next) {
  var id = env.route.params.id;

  // TODO: Lookup peer in database by id.

  /*
  var representation = base();
  var current = env.helpers.url.current();

  representation.properties = {};
  representation.properties.id = id;
  representation.properties.name = 'detroit';
  representation.properties.status = 'connected';

  links(representation, current);
  */

  var builder = new PeerItemBuilder({}, env.helpers.url.current);
  env.response.body = builder.build();

  next(env);
};

var PeerManagementBuilder = function(data, current) {
  this.data = data || {};
  this.current = current;
  this.base = { class: ['peer-management'] };
};

PeerManagementBuilder.prototype.build = function() {
  // if (peers) { this.entities(); }
  this.actions().links();

  return this.base;
};

PeerManagementBuilder.prototype.entities = function() {
  if (this.data.peers && this.data.peers.length) {
    this.base.entities = this.data.peers.map(function(peer) {
      return {
        class: ['peer'],
        properties: {
          id: peer.id,
          name: peer.name,
          status: peer.status
        },
        links: [
          { rel: [rels.self], href: this.current },
          { rel: [rels.server], href: peer.url },
          { rel: [rels.monitor], href: peer.monitor }
        ]
      };
    });
  };
};

PeerManagementBuilder.prototype.actions = function() {
  this.base.actions = [{
    name: 'link',
    method: 'POST',
    href: this.current,
    fields: [ { name: 'url', type: 'url' } ]
  }];

  return this;
};

PeerManagementBuilder.prototype.links = function() {
  this.base.links = [{
    rel: [rels.self],
    href: this.current
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
  this.base.links = [
    { rel: [rels.self], href: this.current },
    { rel: [rels.server], href: this.data.server },
    { rel: [rels.monitor], href: this.data.monitor }
  ];

  return this;
};
