const url = require('url');
const util = require('util');
const ReadableStream = require('stream').Readable;
const EventEmitter = require('events').EventEmitter;
const rels = require('zetta-rels');
const buildDeviceActions = require('./api_formats/siren/device.siren').buildActions;

class VirtualStream extends ReadableStream {
  constructor(topic, socket, options) {
    super(options);
    this._topic = topic;
    this._socket = socket;
    this.listener = null;
  }

  _read(size) {
    const self = this;
    
    if(!this.listener) {
      this.listener = data => {
        if(!self.push(data)) {
          self._socket.unsubscribe(self._topic, self.listener);
          self.listener = null;
        }
      };
      this._socket.subscribe(this._topic);
      this._socket.on(this._topic, this.listener);
    }
  }
}

class VirtualDevice {
  constructor(entity, peerSocket) {
    const self = this;
    this._socket = peerSocket;
    this._update(entity);

    this._eventEmitter = new EventEmitter();
    this.on = this._eventEmitter.on.bind(this._eventEmitter);
    
    const logTopic = this._getTopic(this._getLinkWithTitle('logs'));
    this._socket.subscribe(logTopic, () => {
      self._eventEmitter.emit('ready');
    });

    this._socket.on(logTopic, data => {
      // Format data.actions to siren action format
      data.actions = buildDeviceActions(data.properties.id, self._socket.ws._env, self._socket.ws._loader, data.transitions);
      delete data.transitions;

      self._update(data);
      self._eventEmitter.emit(data.transition);
    });

    self._eventEmitter.on('zetta-device-destroy', () => {
      self._eventEmitter.emit('remote-destroy', self);
      self._eventEmitter.emit('destroy');
    });

    // setup streams
    this.streams = {};

    // add all object-stream
    this._getLinksWithRel(rels.objectStream).forEach(monitor => {
      const topic = self._getTopic(monitor);
      // subscribe to topic
      self._socket.subscribe(topic);
      if(!self.streams[monitor.title]) {
        self.streams[monitor.title] = new VirtualStream(self._getTopic(monitor), self._socket, { objectMode: true });
      }
      self._socket.on(topic, data => {
        self[monitor.title] = data.data;
      });
    });

    // add all binary-stream
    this._getLinksWithRel(rels.binaryStream).forEach(monitor => {
      const topic = self._getTopic(monitor);
      if(!self.streams[monitor.title]) {
        self.streams[monitor.title] = new VirtualStream(self._getTopic(monitor), self._socket, { objectMode: false });
      }
      self._socket.on(topic, data => {
        self[monitor.title] = data.data;
      });
    });

  }

  createReadStream(name) {
    const link = this._getLinkWithTitle(name);
    return new VirtualStream(this._getTopic(link), this._socket, { objectMode: (link.rel.indexOf(rels.objectStream) > -1) });
  }

  call() /* transition, args, cb */{
    const self = this;
    const args = Array.prototype.slice.call(arguments);
    const transition = args[0];

    let cb;
    let transitionArgs;
    if(typeof args[args.length - 1] === 'function') {
      cb = args[args.length - 1];
      transitionArgs = args.slice(1, args.length - 1);
    } else {
      transitionArgs = args.slice(1, args.length);
      cb = err => {
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

    this._socket.transition(action, actionArguments, (err, body) => {
      if(err) {
        cb(err);
      } else {
        self._update(body);
        cb();
      }
    });
  }

  available(transition) {
    return !!this._getAction(transition);
  }

  _encodeData(action, transitionArgs) {
    const actionArguments = {};
    action.fields.forEach(arg => {
      if(arg.type === 'hidden') {
        actionArguments[arg.name] = arg.value;
      } else if(transitionArgs.length) {
        actionArguments[arg.name] = transitionArgs.shift();
      }
    });
      
    return actionArguments;
  }

  _update(entity) {
    const self = this;
    Object.keys(entity.properties).forEach(prop => {
      self[prop] = entity.properties[prop];
    });
    this._actions = entity.actions;

    if(entity.links) {
      this._links = entity.links;
    }
  }

  _getAction(name) {
    let returnAction;
    this._actions.some(action => { 
      if(action.name === name) {
        returnAction = action;
        return true;
      }
    });
    return returnAction;
  }

  _getLinkWithTitle(title) {
    let returnLink;
    this._links.some(link => {
      if(link.title === title) {
        returnLink = link;
        return true;
      }
    });
    return returnLink;
  }

  _getTopic(link) {
    const querystring = url.parse(link.href, true);
    return querystring.query.topic;
  }

  _getLinksWithRel(rel) {
    const returnLinks = this._links.filter(link => link.rel.indexOf(rel) !== -1);
    return returnLinks;
  }
}

module.exports = {
  VirtualStream,
  VirtualDevice
}