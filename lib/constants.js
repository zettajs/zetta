// Defined Contants

// Defines the allowed transport protocols of a z2z connection. The protocol is
// informed by the zetta client (peer) but used as the node-spdy protocol from
// server to client (which becomes client to server in SPDY/HTTP2). When a
// client does not supply a protocol through the `zetta-transport-protocol`
// header `spdy/3.1` is chosen as the default. If a protocol is unrecognized by
// the server during peer initiation the connection is closed with a 400.
module.exports.TransportProtocols = [
  'h2', 'spdy/3.1'
];

// The header used by the zetta client to send the protocol the server should
// use to initiate the z2z connection.
module.exports.TransportProtocolHeader = 'zetta-transport-protocol';

// The transport protocol the zetta server will fallback to when the protocol
// is not sent by the zetta client.
module.exports.FallbackTransportProtocol = 'spdy/3.1';

// Default transport protocol used and sent from the client.
module.exports.DefaultTransportProtocol = 'h2';