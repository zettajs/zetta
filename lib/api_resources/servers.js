const querystring = require('querystring');
const url = require('url');
const MediaType = require('api-media-type');
const querytopic = require('../query_topic');
const streams = require('zetta-streams');
const ObjectStream = streams.ObjectStream;
const ActionError = require('zetta-device').ActionError;

const ServerResource = module.exports = function(server) {
  this.server = server;
  this.httpScout = this.server.httpScout;
  this.deviceTypes = [];
  this.typeIndex = [];
  this._listeners = {};
};

ServerResource.prototype.getServer = function(env) {
  const parsed = url.parse(env.request.url);
  const re = /^\/servers\/([^\/]+)/;
  const match = re.exec(parsed.pathname);

  const serverId = match && match[1] ? decodeURI(match[1]) : this.server.id;

  return { path: `/servers/${encodeURI(serverId)}` };
};

ServerResource.prototype.init = function(config) {
  config
    .path('/servers')
    .produces(MediaType.SIREN)
    .consumes(MediaType.FORM_URLENCODED)
    .consumes(MediaType.MULTIPART_FORM_DATA)
    .consumes(MediaType.JSON)
    .get('/{serverId}', this.showServer)
    .get('/{serverId}/devices/{deviceId}', this.showDevice)
    .put('/{serverId}/devices/{deviceId}', this.updateDevice)
    .del('/{serverId}/devices/{deviceId}', this.destroyDevice)
    .post('/{serverId}/devices/{deviceId}', this.deviceAction)
    .post('/{serverId}/devices', this.addRemoteDevice)
    .get('/{serverId}/events', this.subscribe)
    .post('/{serverId}/events/unsubscribe', this.unsubscribe)
    .get('/{serverId}/meta', this.showMetadata)
    .get('/{serverId}/meta/{type}', this.showMetadataType);

  this.listenForMetadata();
};

ServerResource.prototype.listenForMetadata = function() {
  const self = this;
  this.server.runtime.on('deviceready', device => {
    if (self.typeIndex.indexOf(device.type) !== -1) {
      return;
    }

    const props = device.properties();

    const transitions = Object.keys(device._transitions).map(key => ({
      name: key,
      fields: device._transitions[key].fields || undefined
    }));

    self.typeIndex.push(device.type);

    const obj = {
      type: device.type,
      properties: Object.keys(props).filter(key => props[key] !== undefined),
      streams: Object.keys(device._streams),
      transitions: transitions.length ? transitions : undefined
    };

    self.server.pubsub.publish('meta', obj);

    self.deviceTypes.push(obj);
  });
};

ServerResource.prototype.shouldProxy = function(env) {
  return this.server.id !== env.route.params.serverId;
};

ServerResource.prototype.proxy = function(env, next) {
  return this.server.httpServer.proxyToPeer(env, next);
};

ServerResource.prototype.subscribe = function(env, next) {
  if (!env.request.isSpdy) {
    env.response.statusCode = 426;
    return next(env);
  }

  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  const self = this;
  const parsed = url.parse(env.request.url, true);
  let topic = decodeURIComponent(parsed.query.topic);

  if (topic) {
    const serverId = env.route.params.serverId;
    if (!self._listeners[serverId]) {
      self._listeners[serverId] = {};
    }
    env.response.connection.setTimeout(0); // keep connection alive
    env.response.writeHead(200);
    self._listeners[serverId][topic] = env;

    function unsubscribe() {
      if (!self._listeners[serverId] || !self._listeners[serverId][topic]) {
        return next(env);
      }
      self.server.pubsub.unsubscribe(topic, self._listeners[serverId][topic]);
    }

    const qt = querytopic.parse(topic);
    if (qt) {
      topic = querytopic.format(qt);
      self.server.pubsub.subscribe(topic, env);

      setImmediate(() => {
        self.server.httpServer.eventBroker.subscribeToDeviceQuery(topic);
        env.response.on('close', unsubscribe);
        env.request.connection.on('close', unsubscribe);
      });
    } else {
      setImmediate(() => {
        self.server.pubsub.subscribe(topic, env);
        env.response.on('close', unsubscribe);
        env.request.connection.on('close', unsubscribe);
      });
    }
  } else {
    env.response.statusCode = 404;
    next(env);
  }
};

ServerResource.prototype.unsubscribe = function(env, next) {
  if (!env.request.isSpdy) {
    env.response.statusCode = 426;
    return next(env);
  }

  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  const serverId = env.route.params.serverId;
  const self = this;

  env.request.getBody((err, body) => {
    if(err) {
      env.response.statusCode = 400;
      next(env);
    } else {
      body = querystring.parse(body.toString());
      if (body.topic) {
        env.response.statusCode = 202;
        if (!self._listeners[serverId] || !self._listeners[serverId][body.topic]) {
          return next(env);
        }
        self.server.pubsub.unsubscribe(body.topic, self._listeners[serverId][body.topic]);
        next(env);
      } else {
        env.response.statusCode = 404;
        next(env);
      }
    }
  });
};

ServerResource.prototype.showMetadata = function(env, next) {
  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  const context = {
    server: this.server,
    types: this.deviceTypes,
    loader: this.getServer(env),
    env
  };

  env.format.render('metadata', context);
  next(env);
};

ServerResource.prototype.showMetadataType = function(env, next) {
  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  const typeName = env.route.params.type;

  if (this.typeIndex.indexOf(typeName) === -1) {
    env.response.statusCode = 404;
    next(env);
    return;
  }

  const type = this.deviceTypes.filter(t => t.type === typeName)[0];

  const context = {
    server: this.server,
    type,
    loader: this.getServer(env),
    env
  };

  env.format.render('type', context);
  next(env);
};

ServerResource.prototype.showServer = function(env, next) {
  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  if (env.route.query.ql) {
    return this._queryDevices(env, next);
  }

  //TODO: argo-formatter may want to take multiple arguments for a format. This context obj is a hack.
  const context = { server: this.server, devices: this.server.runtime._jsDevices, loader: this.getServer(env), env };
  env.format.render('server', context);
  next(env);
};

ServerResource.prototype._queryDevices = function(env, next) {
  const params = env.route.query;
  const self = this;

  if(!params.ql) {
    env.response.statusCode = 404;
    return next(env);
  } else {
    const results = [];

    const query = self.server.runtime.ql(params.ql);
    const keys = Object.keys(self.server.runtime._jsDevices);
    const maxIndex = keys.length - 1;
    let hasError = false;

    if (maxIndex === -1) {
      return done();
    }

    keys.forEach((key, i) => {
      const device = self.server.runtime._jsDevices[key];

      if (hasError) {
        return;
      }

      self.server.runtime.registry.match(query, device, (err, match) => {
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
      const devices = {};

      results.forEach(device => {
        const deviceOnRuntime = self.server.runtime._jsDevices[device.id];
        if (deviceOnRuntime) {
          devices[device.id] = deviceOnRuntime;
        }
      });

      const context = {
        server: self.server,
        devices,
        loader: self.getServer(env),
        env,
        classes:['search-results'],
        query: params.ql
      };

      env.format.render('server', context);
      next(env);
    };
  }
};

ServerResource.prototype.destroyDevice = function(env, next) {
  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  const device = this.server.runtime._jsDevices[env.route.params.deviceId];
  if(!device) {
    env.response.body = 'Device does not exist';
    env.response.statusCode = 404;
    return next(env);
  }

  if (typeof device._handleRemoteDestroy !== 'function') {
    env.response.statusCode = 501;
    return next(env);
  }

  device._handleRemoteDestroy((err, destroyFlag) => {
    if (err) {
      env.response.statusCode = 500;
      return next(env);
    }

    if(destroyFlag) {
      device.destroy(err => {
        if(err) {
          env.response.statusCode = 500;
          return next(env);
        } else {
          env.response.statusCode = 204;
          return next(env);
        }
      });
    } else {
      env.response.statusCode = 500;
      return next(env);
    }

  });

};

ServerResource.prototype.showDevice = function(env, next) {
  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  const device = this.server.runtime._jsDevices[env.route.params.deviceId];
  if(!device) {
    env.response.body = 'Device does not exist';
    env.response.statusCode = 404;
    return next(env);
  }

  const model = {
    model: device,
    loader: this.getServer(env),
    serverName: this.server._name,
    env
  };

  env.format.render('device', model);

  next(env);
};

ServerResource.prototype.updateDevice = function(env, next) {
  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  const device = this.server.runtime._jsDevices[env.route.params.deviceId];

  if (!device) {
    env.response.body = 'Device does not exist';
    env.response.statusCode = 404;
    return next(env);
  }

  if (env.request.headers['content-range']) {
    env.response.statusCode = 400;
    return next(env);
  }

  const self = this;
  env.request.getBody((err, body) => {
    if (err) {
      env.response.statusCode = 400;
      return next(env);
    }

    let input;

    try {
      input = JSON.parse(body.toString());
    } catch(e) {
      env.response.statusCode = 400;
      return next(env);
    }

    if (typeof device._handleRemoteUpdate !== 'function') {
      env.response.statusCode = 501;
      return next(env);
    }

    // TODO: Check for conditional PUT using ETag.

    device._handleRemoteUpdate(input, err => {
      if (err) {
        env.response.statusCode = 500;
        return next(env);
      }

      const model = {
        model: device,
        loader: self.getServer(env),
        serverName: self.server._name,
        env
      };

      env.format.render('device', model);
      next(env);
    });
  });
};

ServerResource.prototype.deviceAction = function(env, next) {
  const self = this;

  if(this.shouldProxy(env)) {
    return this.proxy(env, next);
  }

  const device = this.server.runtime._jsDevices[env.route.params.deviceId];
  if(!device) {
    env.response.body = 'Device does not exist';
    env.response.statusCode = 404;
    return next(env);
  }

  env.request.getBody((err, body) => {
    if (err || !body) {
      env.response.statusCode = 400;
      next(env);
      return;
    }

    body = querystring.parse(body.toString());
    return run(body);
  });

  function run(body){
    if (!body.action) {
      env.response.statusCode = 400;
      return next(env);
    }

    const action = device._transitions[body.action];
    if (!action) {
      env.response.statusCode = 400;
      return next(env);
    }

    if(!device.available(body.action)) {
      env.response.statusCode = 400;
      return next(env);
    }


    // device.call(actionName, arg1, arg2, argn, cb);
    const args = [body.action];

    if (action.fields && action.fields.length) {

      const parseErrors = [];
      action.fields.forEach(field => {
        if (field.name !== 'action') {
          let arg = body[field.name];
          if (field.type === 'number') {
            arg = Number(arg);

            if (isNaN(arg)) {
              parseErrors.push(`Field "${field.name}" expected to be a Number.`);
            }
          } else if (field.type === 'date') {
            // HTML5 secifies YYYY-MM-DD for transfer over the wire. Convert it to YYYY/MM/DD for js Date object parsing
            arg = new Date(arg.replace(/-/g, "/"));

            // test if date parsed correctly
            if (isNaN(arg.getTime())) {
              parseErrors.push(`Field "${field.name}" expected to be a Date. eg YYYY-MM-DD`);
            }
          }
          args.push(arg);
        }
      });


      // Test is any did not decode properly
      if (parseErrors.length > 0) {
        env.response.statusCode = 400;
        env.response.body = {
          class: ['input-error'],
          properties: {
            message: 'Invalid argument(s)',
            errors: parseErrors
          },
          links: [
            { rel: ['self'], href: env.helpers.url.current() }
          ]
        };
        return next(env);
      }
    }

    const cb = err => {
      if (err) {
        let properties = {};
        let statusCode = 500;

        if(err instanceof ActionError) {
          statusCode = err.statusCode;
          properties = err.properties;
        } else if (err instanceof Error) {
          properties.message = err.message;
        } else if(typeof error === 'string') {
          properties.message = error
        }

        env.response.statusCode = statusCode;
        env.response.body = {
          class: ['action-error'],
          properties,
          links: [
            { rel: ['self'], href: env.helpers.url.current() }
          ]
        };
      } else {
        const model = {
          model: device,
          loader: self.getServer(env),
          serverName: self.server._name,
          env
        };
        env.format.render('device', model);
      }

      next(env);
    };

    args.push(cb);
    device.call(...args);
  }
};

ServerResource.prototype.addRemoteDevice = function(env, next) {
  const self = this;
  env.request.getBody((err, body) => {
    body = querystring.parse(body.toString());
    if(body.type) {
      if(self.httpScout.createHTTPDevice(body.type, body.id, body.name)) {
        env.response.statusCode = 201;
      } else {
        env.response.statusCode = 404;
      }
    } else {
      env.response.statusCode = 500;
    }
    next(env);
  });
};
