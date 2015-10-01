var rels = require('zetta-rels');
var MediaType = require('api-media-type');
var querystring = require('querystring');
var Query = require('calypso').Query;
var rel = require('zetta-rels');
var Stream = require('stream');

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
  if (params.ql) {
    var ql = params.ql;
    var server = params.server || this.server.id;

    if (server === '*') {
      this.server.peerRegistry.find(Query.of('peers'), function(err, peers) {
        if (err) {
          env.response.statusCode = 500;
          return next(env);
        }

        var href = '/servers/{{peerName}}';
        var qs ='?' + querystring.stringify({ql: params.ql});
        env.request.templateUrl = href + qs;

        var httpServer = self.server.httpServer;

        self.server.runtime.registry.find(params.ql, function(err, results) {
          if (err) {
            env.response.statusCode = 400;
            env.response.body = {
              class: ['query-error'],
              properties: {
                message: err.message
              },
              links: [
                { rel: ['self'], href: env.helpers.url.current() }
              ]
            };
            return next(env);
          }
          var localEntities = (!!err || !results) ? [] : results.map(function(device){
            var deviceOnRuntime = self.server.runtime._jsDevices[device.id];
            if (deviceOnRuntime) {
              var model = deviceOnRuntime;
              var loader = {path: '/servers/' + encodeURI(self.server.id)}
              var server = self.server;
              var properties = model.properties();
              var entity = {
                class: ['device', properties.type],
                rel: [rel.device],
                properties: properties,
                links: [{ rel: ['self'], href: env.helpers.url.path(loader.path + '/devices/' + model.id) },
                        { title: server._name, rel: ['up', rel.server], href: env.helpers.url.path(loader.path) }]
              };
              return entity;
            }
          }).filter(function(entity) { return entity !== null });

          httpServer.proxyToPeers(peers, env, function(err, results, messageId) {
            var entities = results.map(function(obj) {
              if (obj.err) {
                return [];
              }

              var response = obj.res;
              var body = obj.body;

              var res = httpServer.clients[messageId];
              if (!res) {
                return [];
              }

              Object.keys(response.headers).forEach(function(header) {
                res.setHeader(header, response.headers[header]);
              });

              res.statusCode = response.statusCode;

              if (body) {
                body = JSON.parse(body.toString());
                return body && body.entities ? body.entities : [];
              } else {
                return [];
              }
            }).reduce(function(prev, curr) {
              return prev.concat(curr);
            }, []);

            var res = httpServer.clients[messageId];
            var obj = {
              class: ['root', 'search-results'],
              properties: {
                server: '*',
                ql: params.ql
              },
              entities: localEntities.concat(entities),
              links: [
                { rel: ['self'], href: env.helpers.url.current() }
              ]
            }

            var queryTopic = querystring.stringify({topic: 'query/'+params.ql, since: new Date().getTime()});
            obj.links.push({ rel: [rel.query], href: env.helpers.url.path('/events').replace(/^http/, 'ws') + '?' + queryTopic });

            res.body = JSON.stringify(obj);
            delete httpServer.clients[messageId];
            next(env);
          });
        });
      });
    } else if (this.shouldProxy(server)) {
      this.server.peerRegistry.get(server, function(err, peer) {
        if(err) {
          env.response.statusCode = 500;
          return next(env);
        }

        var href = '/servers/' + encodeURI(peer.id);
        var qs ='?' + querystring.stringify({ql: params.ql});
        var rootParams = '?' + querystring.stringify({ql: params.ql, server: params.server});
        
        env.request.url = href + qs;
        env.proxyOpts = {};
        env.proxyOpts.pipe = false;
        self.proxy(env, function(env){
          var body = JSON.parse(env.response.body);  
          body.class = ['root', 'search-results'];
          body.actions = null;
          var selfLinks = body.links.filter(function(link) { return link.rel.indexOf('self') !== -1 });
          var selfLink = selfLinks[0];
          selfLink.href = env.helpers.url.path('/') + rootParams;
          body.links = body.links.filter(function(link) { return link.rel.indexOf('monitor') === -1 || link.rel.indexOf('self') !== -1 });
          body.properties.server = body.properties.name;
          delete body.properties.name;
          env.response.body = body;
          next(env);
        });
      });
    } else {
      this._queryDevices(env, next);
    }
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
        env.response.statusCode = 400;
        env.response.body = {
          class: ['query-error'],
          properties: {
            message: err.message
          },
          links: [
            { rel: ['self'], href: env.helpers.url.current() }
          ]
        };
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
      },
      {
        rel: [rels.events],
        href: env.helpers.url.path('/events').replace(/^http/, 'ws') 
      }
    ], 
    actions: [
      {
        name: 'query-devices',
        method: 'GET',
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

  var peerQuery = Query.of('peers').ql('where direction = "acceptor" and status = "connected"');
  this.server.peerRegistry.find(peerQuery, function(err, results) {
    if (results) {
      results.forEach(function(peer) {
        env.response.body.links.push({
          title: peer.id,
          rel: [rels.peer, rels.server],
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
