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
        rel: ['self'],
        href: env.helpers.url.current()
      },
      {
        title: this.server._name,
        href: env.helpers.url.path('/servers/'+this.server.id),
        rel: [rels.server]
      },
      {
        href: env.helpers.url.path('/peer-management'),
        rel: [rels.peerManagement]
      }
    ]
  };


  // @todo Add peer links
  

  next(env);
};
