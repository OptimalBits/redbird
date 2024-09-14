import { createServer, IncomingMessage } from 'http';

export function testServer(port: number) {
  return new Promise<IncomingMessage>(function (resolve, reject) {
    const server = createServer(function (req, res) {
      res.write('');
      res.end();
      server.close((err) => {
        if (err) {
          return reject(err);
        }
        resolve(req);
      });
    });

    server.listen(port);
  });
}
