var qs = require('querystring');

var Subscription = module.exports = function(zetta) {
  this.path = '/_pubsub';
  this.zetta = zetta;
  this._listeners = {};
  /*
  this._listeners = {
    'serverId': {
      'topic': env.res
    }
  };
  */
};

Subscription.prototype.init = function(config) {
  config
    .path(this.path)
    .consumes('application/x-www-form-urlencoded')
    .produces('application/vnd.siren+json')
    .post('/subscribe', this.subscribe)
    .post('/unsubscribe', this.unsubscribe);
};

Subscription.prototype.subscribe = function(env, next) {
  var self = this;
  env.request.getBody(function(err, body) {
    if(err) {
      env.response.statusCode = 400;
      next(env);
    } else {
      body = qs.parse(body.toString());
      if (body.topic) {
        var serverId = env.request.headers['zetta-forwarded-server'];
        if (!self._listeners[serverId]) {
          self._listeners[serverId] = {};
        }
        env.response.connection.setTimeout(0); // keep connection alive
        self._listeners[serverId][body.topic] = env.response;
        self.zetta.pubsub.subscribe(body.topic, env.response);
      } else {
        env.response.statusCode = 404;
        next(env);
      }
    }
  });
};

Subscription.prototype.unsubscribe = function(env, next) {
  var self = this;
  env.request.getBody(function(err, body) {
    if(err) {
      env.response.statusCode = 400;
      next(env);
    } else {
      body = qs.parse(body.toString());
      if (body.topic) {
        env.response.statusCode = 202;
        var serverId = env.request.headers['zetta-forwarded-server'];
        if (!self._listeners[serverId] || !self._listeners[serverId][body.topic]) {
          return next(env);
        }
        self.zetta.pubsub.unsubscribe(body.topic, self._listeners[serverId][body.topic]);
        next(env);
      } else {
        env.response.statusCode = 404;
        next(env);
      }
    }
  });
};
