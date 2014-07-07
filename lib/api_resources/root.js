var rel = require('../api_rels');

var RootResource = module.exports = function(server) {
  this.server = server;
};

RootResource.prototype.init = function(config) {
  config
    .path('/')
    .get('/', this.list);
};

RootResource.prototype.list = function(env, next) {
  env.response.body = {
    class: ['root'],
    properties: {},
    entities: [],
    links: [
      {
	rel: ['self'],
	href: env.helpers.url.current()
      },
      {
	title: this.server._name,
	href: env.helpers.url.path('/servers/'+this.server.id),
	rel: [rel.server]
      }
    ]
  };


  // @todo Add peer links
  

  next(env);
};
