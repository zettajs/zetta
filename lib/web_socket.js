const crypto = require('crypto');
const EventEmitter = require('events').EventEmitter;
const http = require('http');
const https = require('https');
const url = require('url');
const util = require('util');
const revolt = require('revolt');

class WebSocket extends EventEmitter {
  constructor(address, httpOptions) {
    super();

    this.options = {
      method: 'GET',
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Version': '13',
      }
    };

    this.isClosed = false;
    this._requestExtensions = [];
    this._responseExtensions = [];

    const self = this;
    if (httpOptions) {
      for (const k in httpOptions) {
        self.options[k] = httpOptions[k];
      }
    }

    this.setAddress(address);

    this.request = revolt();
  }

  setAddress(address) {
    if (address.substr(0, 2) === 'ws') {
      address = `http${address.substr(2)}`;
    }

    this.options.uri = address;
    const parsed = url.parse(address);
    this.options.headers['Host'] = parsed.host;
  }

  extendRequest(extensions) {
    this._requestExtensions = extensions;
  }

  extendResponse(extensions) {
    this._responseExtensions = extensions;
  }

  close() {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    if(this.socket) {
      this.socket.end();
  //    this.emit('close', null, null, true);
    } 
  }

  start() {
    const key = new Buffer(`13-${Date.now()}`).toString('base64');
    const shasum = crypto.createHash('sha1');
    shasum.update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`);
    const expectedServerKey = shasum.digest('base64');

    this.options.headers['Sec-WebSocket-Key'] = key;

    const self = this;
    let req = this.request;

    this._requestExtensions.forEach(ext => {
      ext(req);
    });

    req = req.request(self.options);

    this._responseExtensions.forEach(ext => {
      req = ext(req);
    });

    const subscription = req.subscribe(env => {
      // Handle non 101 response codes with clearer message
      if (env.response.statusCode !== 101) {
        self.emit('error', `server returned ${env.response.statusCode}`);
        return;
      }

      const serverKey = env.response.headers['sec-websocket-accept'];
      if (typeof serverKey == 'undefined' || serverKey !== expectedServerKey) {
        self.emit('error', 'invalid server key');
        return;
      }
      
      self.isClosed = false;
      self.socket = env.request.connection;
      self.socket.on('close', () => {
        self.emit('close');
        env.request.abort();
        subscription.dispose();
      });
      self.emit('open', env.request.connection);
    }, err => {
      self.emit('error', err);
    });
  }
}

module.exports = WebSocket;