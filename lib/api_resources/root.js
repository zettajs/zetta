var rels = require('zetta-rels');
var MediaType = require('api-media-type');
var querystring = require('querystring');

var RootResource = module.exports = function(server) {
  this.server = server;
};

RootResource.prototype.init = function(config) {
  config
    .path('/')
    .produces(MediaType.SIREN)
    .consumes(MediaType.FORM_URLENCODED)
    .get('/', this.list);
};

RootResource.prototype.shouldProxy = function(serverId) {
  return this.server.id !== serverId;
};

RootResource.prototype.proxy = function(env, next) {
  return this.server.httpServer.proxyToPeer(env, next);
};


RootResource.prototype.list = function(env, next) {
  var self = this;
  var params = env.route.query;
  if(params.ql) {
    var ql = params.ql;
    var server = params.server || this.server.id;

    if(this.shouldProxy(server)) {
      this.server.peerRegistry.get(server, function(err, peer) {
        if(err) {
          env.response.statusCode = 500;
          return next(env);
        } else {
          peer = JSON.parse(peer);
          var href = '/servers/' + encodeURI(peer.id);
          var qs ='?' + querystring.stringify({ql: params.ql});
          env.request.url = href + qs;
          self.proxy(env, next);
        }
      });

    } else {
      this._queryDevices(env, next);
    }
    //check server id
    //proxy if not the same
    //send response back
  } else {
    this._renderRoot(env, next);
  }
};

RootResource.prototype._queryDevices = function(env, next) {
  var params = env.route.query;
  var self = this;

  if(!params.ql) {
    env.response.statusCode = 404;
    return next(env);
  } else {
    self.server.runtime.registry.find(params.ql, function(err, results) {
      if (err) {
        env.response.statusCode = 500;
        return next(env);
      }

      var devices = {};
        
      results.forEach(function(device){
        var deviceOnRuntime = self.server.runtime._jsDevices[device.id];
        if (deviceOnRuntime) {
          devices[device.id] = deviceOnRuntime;
        }
      });

      var context = {
        server: self.server,
        devices: devices,
        loader: {path: '/servers/' + encodeURI(self.server.id)},
        env: env,
        classes:['search-results'],
        query: params.ql 
      };

      env.format.render('server', context);
      next(env);
    });
  }
};
//This is called when ql and server isn't supplied
RootResource.prototype._renderRoot = function(env, next) {
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
        href: env.helpers.url.path('/servers/' + encodeURI(this.server.id) )
      }
    ], 
    actions: [
      {
        name: 'query-devices',
        method: 'POST',
        href: env.helpers.url.current(),
        type: 'application/x-www-form-urlencoded',
        fields: [
          {
            name: 'server',
            type: 'text'
          },
          {
            name: 'ql',
            type: 'text'
          }
        ]
      }
    ]
  };

  var peerQuery = {
    match: function(obj) {
      return (obj.direction === 'acceptor' && obj.status === 'connected');
    }
  };

  this.server.peerRegistry.find(peerQuery, function(err, results) {
    if (results) {
      results.forEach(function(peer) {
        env.response.body.links.push({
          title: peer.id,
          rel: [rels.peer],
          href: env.helpers.url.path('/servers/' + encodeURI(peer.id))
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
