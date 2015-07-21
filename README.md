[![Zetta](http://www.zettajs.org/images/logos/zetta-logo.svg)](http://www.zettajs.org/)


[![Gitter](https://badges.gitter.im/Join Chat.svg)](https://gitter.im/zettajs/zetta?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge) [![Build Status](https://travis-ci.org/zettajs/zetta.svg?branch=master)](https://travis-ci.org/zettajs/zetta) 

# What is it?

Zetta is an open source Node.js based platform for the internet of things. It's a complete toolkit for generating HTTP APIs for devices. Zetta is protocol agnostic meaning that it can support almost all device protocols, and mediate them to HTTP.

**JavaScript**

Zetta has developers express devices as state machines using an elegant and expressive syntax. 

**APIs**

Zetta then takes that JavaScript, and generates a consistent Hypermedia HTTP API for those devices. Our HTTP APIs are expressed using the [Siren specification](https://github.com/kevinswiber/siren). We also expose websocket endpoints to stream real time events out of the Zetta system. This paradigm of merging Hypermedia with websocket streaming is also known as Reactive Hypermedia.

**Queries**

Zetta has a robust query system that allows you to not only search for devices, but also subscribe to websockets to be notified when new devices come online that fulfill the query.

**Apps**

Zetta also allows you to write stateless applications that live in the server itself. You can query for devices, and wire up interactions between them in these applications.

**Peering** 

Zetta can create persistent connections between servers to expose APIs in new and unqiue ways. You can peer a Zetta server in your home with a server in the cloud, and allow for access to devices on the open internet.

# Getting started with Zetta

This is the quintessential "Hello World!" program for Zetta. This program will generate your first Zetta UI for a particular server.

```javascript
var zetta = require('zetta');

zetta()
  .name('hello.world')
  .listen(1337);
```

# Installation

Retrieving the Zetta package is fairly straight forward.
**git**
```bash
git clone git@github.com:zettajs/zetta.git && cd zetta

npm install
```

**NPM**
```bash
npm install zetta
```


# Community

The Zetta community is steadily growing. We have a few channels that you can talk to the Zetta team on.

* [Google group](https://groups.google.com/forum/#!forum/zetta-discuss)
* [Gitter chat](https://gitter.im/zettajs/zetta) 

You can also file an issue on our github issues page.

# Docs

Visit our site at [http://zettajs.github.io/](http://zettajs.github.io/) for documentation, and recipes for building systems with Zetta. 

## License

MIT
