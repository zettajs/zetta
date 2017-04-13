const rels = require('zetta-rels');
const MediaType = require('api-media-type');
const querystring = require('querystring');
const Query = require('calypso').Query;
const rel = require('zetta-rels');
const Stream = require('stream');

const RootResource = module.exports = function(server) {
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
  const self = this;
  const params = env.route.query;
  if (params.ql) {
    const ql = params.ql;
    const server = params.server || this.server.id;

    if (server === '*') {
      this.server.peerRegistry.find(Query.of('peers'), function(err, peers) {
        if (err) {
          env.response.statusCode = 500;
          return next(env);
        }

        // Filter only peers connecting to this server
        peers = peers.filter(function(peer) {
          return peer.direction === 'acceptor';
        });
        
        const href = '/servers/{{peerName}}';
        const qs ='?' + querystring.stringify({ql: params.ql});
        env.request.templateUrl = href + qs;

        const httpServer = self.server.httpServer;

        const results = [];
        const query = self.server.runtime.ql(params.ql);
        const keys = Object.keys(self.server.runtime._jsDevices);
        const maxIndex = keys.length - 1;
        let hasError = false;

        if (maxIndex === -1) {
          return done();
        }

        // Return all devices from local server
        keys.forEach(function(key, i) {
          const device = self.server.runtime._jsDevices[key];

          if (hasError) {
            return;
          }

          self.server.runtime.registry.match(query, device, function(err, match) {
            if (err) {
              env.response.statusCode = 400;
              hasError = true;
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

            if (match) {
              results.push(match);
            }

            if (i === maxIndex) {
              done();
            }
          });
        });

        function done() {
          const localEntities = (!!err || !results) ? [] : results.map(function(device){
            const deviceOnRuntime = device;
            if (deviceOnRuntime) {
              const model = deviceOnRuntime;
              const loader = {path: '/servers/' + encodeURI(self.server.id)};
              const server = self.server;
              const properties = model.properties();
              const entity = {
                class: ['device', properties.type],
                rel: [rel.device],
                properties: properties,
                links: [{ rel: ['self'], href: env.helpers.url.path(loader.path + '/devices/' + model.id) },
                        { title: server._name, rel: ['up', rel.server], href: env.helpers.url.path(loader.path) }]
              };
              return entity;
            }
          }).filter(function(entity) { return entity !== null || entity !== undefined; });

          httpServer.proxyToPeers(peers, env, function(err, results, messageId) {
            const entities = results.map(function(obj) {
              if (obj.err) {
                return [];
              }

              const response = obj.res;
              let body = obj.body;

              const res = httpServer.clients[messageId];
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

            const res = httpServer.clients[messageId];
            const obj = {
              class: ['root', 'search-results'],
              properties: {
                server: '*',
                ql: params.ql
              },
              entities: localEntities.concat(entities),
              links: [
                { rel: ['self'], href: env.helpers.url.current() }
              ]
            };

            const queryTopic = querystring.stringify({topic: 'query/'+params.ql, since: new Date().getTime()});
            obj.links.push({ rel: [rel.query], href: env.helpers.url.path('/events').replace(/^http/, 'ws') + '?' + queryTopic });

            res.body = JSON.stringify(obj);
            delete httpServer.clients[messageId];
            next(env);
          });
        }// done

      });
    } else if (this.shouldProxy(server)) {
      this.server.peerRegistry.get(server, function(err, peer) {
        if(err) {
          env.response.statusCode = 500;
          return next(env);
        }

        const href = '/servers/' + encodeURI(peer.id);
        const qs ='?' + querystring.stringify({ql: params.ql});
        const rootParams = '?' + querystring.stringify({ql: params.ql, server: params.server});
        
        env.request.url = href + qs;
        env.proxyOpts = {};
        env.proxyOpts.pipe = false;
        self.proxy(env, function(env){
          const body = JSON.parse(env.response.body);  
          body.class = ['root', 'search-results'];
          body.actions = null;
          const selfLinks = body.links.filter(function(link) { return link.rel.indexOf('self') !== -1 });
          const selfLink = selfLinks[0];
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
  const params = env.route.query;
  const self = this;

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

      const devices = {};
        
      results.forEach(function(device){
        const deviceOnRuntime = self.server.runtime._jsDevices[device.id];
        if (deviceOnRuntime) {
          devices[device.id] = deviceOnRuntime;
        }
      });

      const context = {
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

  const isForwardedProtocol = env.request.headers.hasOwnProperty('x-forwarded-proto') && ['http', 'https'].indexOf(env.request.headers['x-forwarded-proto']) !== -1;
  const isSpdy = !!env.request.isSpdy && !isForwardedProtocol;


  const eventsPath = env.helpers.url.path('/events');
  const wsEventsPath = eventsPath.replace(/^http/, 'ws');
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


  if(!isSpdy) {
    env.response.body.links.push({
        rel: [rels.events],
        href: wsEventsPath  
    });  
  }
  const peerQuery = Query.of('peers').ql('where direction = "acceptor" and status = "connected"');
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
