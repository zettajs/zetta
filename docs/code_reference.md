# Zetta Runtime Code Reference

File list:

```
zetta-runtime
├── app_resource.js
├── bootstrapper.js
├── cloud.js
├── cloud_client.js
├── device.js
├── fog_agent.js
├── fog_app_loader.js
├── fog_runtime.js
├── http_scout.js
├── logger.js
├── machine_config.js
├── observable_rx_wrap.js
├── pubsub_resource.js
├── pubsub_service.js
├── registration_resource.js
├── registry.js
├── scientist.js
├── web_socket.js
├── zetta.js
└── zetta_runtime.js
```

## app_resource.js

Run as part of `FogAppLoader#load` (`fog_app_loader.js`), `AppResource.create` builds dynamic resource classes based on exposed devices' `MachineConfig` instances.  AppResource pieces together the appropriate Siren representations for the device, setting HTTP routes, and handling state transitions via actions.

## bootstrapper.js

The bootstrapper is what is called by the CLI when executing `zetta run`.  Its responsibility is to look for a locally deployed app in an `app` directory, discover and load a config file (how we were passing in NPM scouts/devices in the past), load the app from the previously discovered directory, and initiate any connections to peers.

Much of this will have to change, as we're evolving the app concept and introducing a server concept.  Some of this will be merged with the functionality of `cloud.js`.


## cloud.js

`ZettaCloud` is the entry point to the Zeta server.  It manages API client connections, peer connections, client event stream subscriptions, and collector subscriptions.

Sample usage:

```
var cloud = new ZettaCloud();
cloud.setup();
cloud.listen(3000);
```

This file represents a lot of functionality.  This is where the SPDY connection management lives.  This file contains the server code that accepts connections from Zetta instances and sets up the peer association via SPDY.  API requests are proxied to appropriate peers.  Subscription requests to this cloud instance create subscription requests to relevant peers.  Event streams are then routed to subscribed API clients and data collectors.

## cloud_client.js

When using `zetta run` via the CLI, `CloudClient` runs a SPDY server and opens a WebSocket connection for a peering request.  When run by `Cloud#setup`, the `CloudClient` doesn't appear to be doing much, except setting a correlation ID, which may not be needed.  Consider altering that functionality.

## device.js

Appears to not be in use.

## fog_agent.js

The SPDY wire-up in `Cloud#init` creates a `FogAgent` for each peer connection.  This inherits `http.Agent` and is in place to reuse a single socket connection for each incoming request.  The socket is provided by the Web socket used to upgrade peer connections.  The file name can be changed to `peer_agent.js` or something more clever.

## fog_app_loader.js

Instantiates app classes and loads them into the Web API using `AppResource`.  Provies helper methods to instantiate resource classes.

## fog_runtime.js

Responsible for wiring up scouts.  Adds configured resources to Argo.  Provides the interface passed into the `#init` method of app classes (via both `FogAppLoader` and `AppResource`, a particulary circuitous path).  Defines `observe` and `get` methods using `RxWrap`, which currently wraps Reactive Extension for JavaScript, the `rx` module.

## http_scout.js

Scout implementation for self-declaring devices.  Used by `RegistrationResource` to emit declared devices to the runtime.  This is more of a "listener" than a "scout".  This might suffer from being implemented in a quick and dirty fashion.

## logger.js

Logger interface.  Outputs logs via Bunyan.

## machine_config.js

Provides the configuration plumbing for devices.  Gets passed as an argument to the `#init` function of device classes via the `Scientist`.  Holds state machine and stream configuration for devices.  Provides the function to execute state transitions, via `#call`.

## observable_rx_wrap.js

Wraps a reactive library in a Zetta-compatible interface.  Used by `FogRuntime`.

## pubsub_resource.js

Manages event stream subscription requests from API clients.  Currently wired up by the bootstrapper.  Uses `pubsub_service.js` for subscription management.

## pubsub_service.js

A singleton routing published events to subscribers.  Uses SPDY stream push for remote subscriptions and a callback for local subscriptions.

## registration_resource.js

Listens for remote device registrations.  Uses the `HTTPScout` to wire up newly registered devices with the runtime.

## registry.js

Manages file operations for the JSON-based local registry.

## scientist.js

Instantiates device drivers with a `MachineConfig`.

## web_socket.js

Initiates WebSocket handshakes in `CloudClient`.  This allows us to control the socket and prevent it from closing for other reasons.

## zetta.js

Main file exported in the Zetta Runtime Node module.  Exports ZettaCloud, bootstrapper, and scientist.