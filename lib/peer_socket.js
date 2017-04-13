const EventEmitter = require('events').EventEmitter;
const util = require('util');
const http = require('http');
const url = require('url');
const querystring = require('querystring');
const spdy = require('spdy');
const ws = require('ws');
const SpdyAgent = require('./spdy_agent');
const Logger = require('./logger');

const STATES = {
  'DISCONNECTED' : 0,
  'CONNECTING': 1,
  'CONNECTED': 2
};

class PeerSocket extends EventEmitter {
  constructor(ws, name, peerRegistry, opts) {
    super();

    if (!opts) {
      opts = {};
    }
    
    const self = this;
    this.state = STATES.DISCONNECTED;
    this.name = name; // peers local id
    this.agent = null;
    this.subscriptions = {}; // { <topic>: <subscribed_count> }
    this.connectionId = null;
    this._pingTimer = null;
    this._pingTimeout = Number(opts.pingTimeout) || (10 * 1000);
    this._confirmationTimeout = Number(opts.confirmationTimeout) || 10 * 1000;
    this.peerRegistry = peerRegistry;
    this.logger = new Logger();

    this.on('connecting', () => {
      self.state = STATES.CONNECTING;    
    });

    this.on('end', function() {
      self.state = STATES.DISCONNECTED;
      self._setRegistryStatus('disconnected');
      this._cleanup();
    });

    this.on('error', function(err) {
      self.state = STATES.DISCONNECTED;
      self._setRegistryStatus('failed', err);
     this._cleanup();
    });

    this.on('connected', () => {
      self.state = STATES.CONNECTED;
      self._setRegistryStatus('connected');
    });
    
    this.init(ws);
  }

  properties() {
    return {
      id: this.name,
      connectionId: this.connectionId
    };
  }

  close() {
    clearInterval(this._pingTimer);
    this.ws.close();
  }

  _cleanup() {
    if (!this.agent) {
      return;
    }

    const streams = this.agent._spdyState.connection._spdyState.streams;
    Object.keys(streams).forEach(k => {
      streams[k].destroy();
    });

    this.agent.close();
  }

  init(ws) {
    const self = this;
    self.emit('connecting');
    
    if (ws) {
      this._initWs(ws);
    }
    
    // delay because ws/spdy may not be fully established
    setImmediate(() => {
      // setup connection
      self._setupConnection(err => {
        if (err) {
          self.close();
          self.emit('error', err);
          return;
        }

        if (self.ws.readyState !== ws.OPEN) {
          // dissconnected already, reset
          self.close();
          self.emit('error', new Error(`Peer Socket: Setup connection finished but ws not opened for peer "${self.name}".`));
          return;
        }

        const subscriptions = self.subscriptions;
        self.subscriptions = {}; // clear it before resubscribing
        // subscribe to all prev subscriptions
        Object.keys(subscriptions).forEach(event => {
          self.subscribe(event);
        });

        self._startPingTimer();
        self.emit('connected');
      });
    });
  }

  _setupConnection(cb, tries) {
    const self = this;
    const peerItem = {
      direction: 'acceptor',
      id: self.name,
      status: 'connecting'
    };

    self.peerRegistry.add(peerItem, (err, newPeer) => {
      if (err) {
        return cb(err);
      }

      // confirm connection with peer
      self.confirmConnection(self.connectionId, cb);
    });
  }

  _initWs(ws) {
    const self = this;
    const u = url.parse(ws.upgradeReq.url, true); // parse out connectionId
    this.ws = ws;
    this.connectionId = u.query.connectionId;
    this.ws._socket.removeAllListeners('data'); // Remove WebSocket data handler.

    this.ws._socket.on('end', () => {
      clearInterval(self._pingTimer);
      self.emit('end');
    });

    this.ws.on('error', err => {
      clearInterval(self._pingTimer);
      self.emit('error', err);
    });


    this.agent = spdy.createAgent(SpdyAgent, {
      host: this.name,
      port: 80,
      socket: this.ws._socket,
      spdy: {
        plain: true,
        ssl: false
      }
    });

    // TODO: Remove this when bug in agent socket removal is fixed.
    this.agent.maxSockets = 150;
    this.agent.on('push', this.onPushData.bind(this));
    this.agent.on('error', err => {
      self.close();
      self.emit('error', err);
    });
  }

  _startPingTimer() {
    const self = this;
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      const timeout = setTimeout(() => {
        self.close();
        self.emit('error', new Error('Peer socket timed out'));
      }, self._pingTimeout);

      self.agent.ping(err => {
        if (timeout) {
          clearTimeout(timeout);
        }
      });
    }, self._pingTimeout);

  }

  _setRegistryStatus(status, err, cb) {
    const self = this;
    
    if (typeof err === 'function') {
      cb = err;
      err = undefined;
    }

    if (!cb) {
      cb = () => {};
    }

    this.peerRegistry.get(this.name, (err, peer) => {
      if (err) {
        return cb(err);
      }

      peer.status = status;
      peer.connectionId = self.connectionId;
      if (err) {
        peer.error = err;
      }
      self.peerRegistry.save(peer, cb);
    });
  }

  onPushData(stream) {
    const streamUrl = stream.url.slice(1);
    const self = this;
    
    if(!this.subscriptions[streamUrl]) {
      stream.connection.end();
    }

    let encoding = stream.headers['content-type'] || 'application/json';
    // remove additional parameters such as in `application/json; charset=utf-8`
    if (encoding.indexOf(';') !== -1) {
      encoding = encoding.split(';')[0].trim(); 
    }
    const length = Number(stream.headers['content-length']);
    const data = new Buffer(length);
    let idx = 0;
    let d = null;
    stream.on('readable', () => {
      while (d = stream.read()) {
        for (let i=0; i<d.length;i++) {
          data[idx++] = d[i];
        }
      };
    });

    stream.on('error', err => {
      console.error('error on push:', err);
    });

    stream.on('end', () => {
      let body = null;
      if (encoding === 'application/json') {
        try {
          body = JSON.parse(data.toString());
        } catch (err) {
          console.error('PeerSocket push data json parse error', err);
        }
      } else if(encoding === 'application/octet-stream') {
        body = data;
      }
      
      self.emit(streamUrl, body);
      self.emit('zetta-events', streamUrl, body)
      stream.connection.close();
    });
  }

  subscribe(event, cb) {
    if(!cb) {
      cb = () => {};
    }

    const queryPrefix = 'query%2F';
    if (event && event.slice(0, queryPrefix.length) === queryPrefix) {
      event = decodeURIComponent(event);
    }

    // keep track of number of subscriptions
    if (this.subscriptions[event] === undefined) {
      this.subscriptions[event] = 0;
    }
    this.subscriptions[event]++;

    // if already subscribed ignore
    if (this.subscriptions[event] > 1) {
      cb();
      return;
    }

    let host;
    if(this.ws && this.ws.upgradeReq) {
      host = this.ws.upgradeReq.headers.host
    } else {
      host = `${encodeURIComponent(this.name)}.unreachable.zettajs.io`;
    }

    const opts = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': host
      },
      path: `/servers/${encodeURIComponent(this.name)}/events?topic=${encodeURIComponent(event)}`,
      agent: this.agent
    };

    const req = http.request(opts, res => {
      cb();
    }).on('error', cb);
    req.end();
  }

  unsubscribe(event, cb) { 
    if(!cb) {
      cb = () => {};
    }

    if (this.subscriptions[event] === undefined) {
      this.subscriptions[event] = 0;
    } else {
      this.subscriptions[event]--;
      if (this.subscriptions[event] < 0) {
        this.subscriptions[event] = 0;
      }
    }
    
    // only unsubscribe once all subscriptions count reaches 0
    if (this.subscriptions[event] > 0) {
      return cb();
    }

    let host;
    if(this.ws && this.ws.upgradeReq) {
      host = this.ws.upgradeReq.headers.host
    } else {
      host = `${encodeURIComponent(this.name)}.unreachable.zettajs.io`;
    }

    const body = new Buffer(`topic=${event}`);
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': host,
        'Content-Length': body.length
      },
      path: `/servers/${encodeURIComponent(this.name)}/events/unsubscribe`,
      agent: this.agent
    };

    const req = http.request(opts, res => {
      cb();
    }).on('error', cb);
    req.end(body);
  }

  confirmConnection(connectionId, callback) { 
    const timeout = setTimeout(() => {
      req.abort();
      callback(new Error('Confirm connection timeout reached.'));
    }, this._confirmationTimeout);
    
    const opts = { agent: this.agent, path: `/_initiate_peer/${connectionId}` };
    var req = http.get(opts, res => {
      clearTimeout(timeout);
      if (res.statusCode !== 200) {
        return callback(new Error('Unexpected status code'));
      }
      callback();
    }).on('error', err => {
      clearTimeout(timeout);
      callback(err);
    });
  }

  transition(action, args, cb) {
    const u = url.parse(action.href);
    const path = u.pathname;

    const body = new Buffer(querystring.stringify(args));

    let host;
    if(this.ws && this.ws.upgradeReq) {
      host = this.ws.upgradeReq.headers.host
    } else {
      host = `${encodeURIComponent(this.name)}.unreachable.zettajs.io`;
    }

    const opts = {
      agent: this.agent,
      path,
      method: action.method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': host,
        'Content-Length': body.length,
      }
    };

    const req = http.request(opts, res => {
      const buffer = [];
      let len = 0;
      res.on('readable', () => {
        let data;
        while (data = res.read()) {
          buffer.push(data);
          len += data.length;
        }
      });

      res.on('end', () => {
        const buf = Buffer.concat(buffer, len);
        if (res.statusCode !== 200) {
          return cb(new Error(buf.toString()));
        }

        let jsonBody = null;
        try {
          jsonBody = JSON.parse(buf.toString());
        } catch(err) {
          return cb(new Error('Failed to parse body'));
        }
        return cb(null, jsonBody);
      });
    }).on('error', cb);
    req.end(body);
  }
}

Object.keys(STATES).forEach(k => {
  module.exports[k] = STATES[k];
});

module.exports = PeerSocket;