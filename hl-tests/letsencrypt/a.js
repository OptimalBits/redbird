var spdy = require('spdy'),
    fs = require('fs'),
    path = require('path');

var options = {
  // Private key
  //key: fs.readFileSync(path.join(__dirname, "certs/dev-key.pem")),
	//cert: fs.readFileSync(path.join(__dirname, "certs/dev-cert.pem")),

  // **optional** SPDY-specific options
  spdy: {
    protocols: [ 'h2', 'spdy/3.1', 'http/1.1' ],
    plain: false,

    // **optional**
    // Parse first incoming X_FORWARDED_FOR frame and put it to the
    // headers of every request.
    // NOTE: Use with care! This should not be used without some proxy that
    // will *always* send X_FORWARDED_FOR
    'x-forwarded-for': true,

    connection: {
      windowSize: 1024 * 1024, // Server's window size

      // **optional** if true - server will send 3.1 frames on 3.0 *plain* spdy
      autoSpdy31: false
    }
  }
};

var server = spdy.createServer(options, function(req, res) {
  res.writeHead(200);
  res.end('hello world!');
});

server.listen(3000);
