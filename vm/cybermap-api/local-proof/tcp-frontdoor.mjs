import net from 'node:net';

const LISTEN_HOST = '0.0.0.0';
const LISTEN_PORT = 8443;
const UPSTREAM_HOST = 'api';
const UPSTREAM_PORT = 8443;

const server = net.createServer((client) => {
  const upstream = net.createConnection({ host: UPSTREAM_HOST, port: UPSTREAM_PORT });
  const closeBoth = () => {
    client.destroy();
    upstream.destroy();
  };

  client.once('error', closeBoth);
  upstream.once('error', closeBoth);
  client.once('close', () => upstream.end());
  upstream.once('close', () => client.end());
  client.pipe(upstream);
  upstream.pipe(client);
});

server.once('error', () => process.exit(1));
server.listen(LISTEN_PORT, LISTEN_HOST);
