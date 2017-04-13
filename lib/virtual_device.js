const url = require('url');
const util = require('util');
const ReadableStream = require('stream').Readable;
const EventEmitter = require('events').EventEmitter;
const rels = require('zetta-rels');
const buildDeviceActions = require('./api_formats/siren/device.siren').buildActions;

const VirtualStream = module.exports = function(topic, socket, options) {
  ReadableStream.call(this, options);
  this._topic = topic;
  this._socket = socket;
  this.listener = null;
};
util.inherits(VirtualStream, ReadableStream);

VirtualStream.prototype._read = function(size) {
  const self = this;
  
  if(!this.listener) {
    this.listener = function(data) {
      if(!self.push(data)) {
        self._socket.unsubscribe(self._topic, self.listener);
        self.listener = null;
      }
    };
    this._socket.subscribe(this._topic);
    this._socket.on(this._topic, this.listener);
  }
};

const VirtualDevice = module.exports = function(entity, peerSocket) {
  const self = this;
  this._socket = peerSocket;
  this._update(entity);

  this._eventEmitter = new EventEmitter();
  this.on = this._eventEmitter.on.bind(this._eventEmitter);
  
  const logTopic = this._getTopic(this._getLinkWithTitle('logs'));
  this._socket.subscribe(logTopic, function() {
    self._eventEmitter.emit('ready');
  });

  this._socket.on(logTopic, function(data) {
    // Format data.actions to siren action format
    data.actions = buildDeviceActions(data.properties.id, self._socket.ws._env, self._socket.ws._loader, data.transitions);
    delete data.transitions;

    self._update(data);
    self._eventEmitter.emit(data.transition);
  });

  self._eventEmitter.on('zetta-device-destroy', function() {
    self._eventEmitter.emit('remote-destroy', self);
    self._eventEmitter.emit('destroy');
  });

  // setup streams
  this.streams = {};

  // add all object-stream
  this._getLinksWithRel(rels.objectStream).forEach(function(monitor) {
    const topic = self._getTopic(monitor);
    // subscribe to topic
    self._socket.subscribe(topic);
    if(!self.streams[monitor.title]) {
      self.streams[monitor.title] = new VirtualStream(self._getTopic(monitor), self._socket, { objectMode: true });
    }
    self._socket.on(topic, function(data) {
      self[monitor.title] = data.data;
    });
  });

  // add all binary-stream
  this._getLinksWithRel(rels.binaryStream).forEach(function(monitor) {
    const topic = self._getTopic(monitor);
    if(!self.streams[monitor.title]) {
      self.streams[monitor.title] = new VirtualStream(self._getTopic(monitor), self._socket, { objectMode: false });
    }
    self._socket.on(topic, function(data) {
      self[monitor.title] = data.data;
    });
  });

};

VirtualDevice.prototype.createReadStream = function(name) {
  const link = this._getLinkWithTitle(name);
  return new VirtualStream(this._getTopic(link), this._socket, { objectMode: (link.rel.indexOf(rels.objectStream) > -1) });
};

VirtualDevice.prototype.call = function(/* transition, args, cb */) {
  const self = this;
  const args = Array.prototype.slice.call(arguments);
  const transition = args[0];

  let cb, transitionArgs;
  if(typeof args[args.length - 1] === 'function') {
    cb = args[args.length - 1];
    transitionArgs = args.slice(1, args.length - 1);
  } else {
    transitionArgs = args.slice(1, args.length);
    cb = function(err) {
      if (err) {
        throw err;
      }
    };
  }

  const action = this._getAction(transition);
  if(!action) {
    cb(new Error('Transition not available'));
    return;
  }

  const actionArguments = this._encodeData(action, transitionArgs);

  this._socket.transition(action, actionArguments, function(err, body) {
    if(err) {
      cb(err);
    } else {
      self._update(body);
      cb();
    }
  });

};

VirtualDevice.prototype.available = function(transition) {
  return !!this._getAction(transition);
};

VirtualDevice.prototype._encodeData = function(action, transitionArgs) {
  const actionArguments = {};
  action.fields.forEach(function(arg) {
    if(arg.type === 'hidden') {
      actionArguments[arg.name] = arg.value;
    } else if(transitionArgs.length) {
      actionArguments[arg.name] = transitionArgs.shift();
    }
  });
    
  return actionArguments;
};

VirtualDevice.prototype._update = function(entity) {
  const self = this;
  Object.keys(entity.properties).forEach(function(prop) {
    self[prop] = entity.properties[prop];
  });
  this._actions = entity.actions;

  if(entity.links) {
    this._links = entity.links;
  }
};

VirtualDevice.prototype._getAction = function(name) {
  let returnAction;
  this._actions.some(function(action) { 
    if(action.name === name) {
      returnAction = action;
      return true;
    }
  });
  return returnAction;
};

VirtualDevice.prototype._getLinkWithTitle = function(title) {
  let returnLink;
  this._links.some(function(link) {
    if(link.title === title) {
      returnLink = link;
      return true;
    }
  });
  return returnLink;
};

VirtualDevice.prototype._getTopic = function(link) {
  const querystring = url.parse(link.href, true);
  return querystring.query.topic;
};

VirtualDevice.prototype._getLinksWithRel = function(rel) {
  const returnLinks = this._links.filter(function(link) {
    return link.rel.indexOf(rel) !== -1;
  });
  return returnLinks;
};
