var rels = require('../api_rels');

var RootResource = module.exports = function(server) {
  this.server = server;
};

RootResource.prototype.init = function(config) {
  config
    .path('/')
    .produces('application/vnd.siren+json')
    .consumes('application/x-www-form-urlencoded')
    .get('/', this.list);
};

RootResource.prototype.list = function(env, next) {
  env.response.body = {
    class: ['root'],
    links: [
      {
        rel: [rels.self],
        href: env.helpers.url.current()
      },
      {
        title: this.server._name,
        rel: [rels.server],
        href: env.helpers.url.path('/servers/'+this.server.id)
      }
    ]
  };

  var peerQuery = {
    match: function(obj) {
      return obj.direction === 'out';
    }
  };

  this.server.peerRegistry.find(peerQuery, function(err, results) {
    if (results) {
      results.forEach(function(peer) {
        env.response.body.links.push({
          title: peer.name,
          rel: [rels.peer],
          href: env.helpers.url.path('/servers/' + peer.id)
        });
      });
    }

    env.response.body.links.push({
      rel: [rels.peerManagement],
      href: env.helpers.url.path('/peer-management')
    });

    next(env);
  });

};
