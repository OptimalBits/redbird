var proxy = require('../index')({port: 8080});

proxy.register("http://127.0.0.1/a", "http://127.0.0.1:3000");
proxy.register("http://127.0.0.1/b", "http://127.0.0.1:4000");

startServer(3000);
startServer(4000);

function startServer(port){
  var http = require('http');
  function handleRequest(request, response){
    response.end('Path Hit: ' + request.url);
  }
  var server = http.createServer(handleRequest);

  server.listen(port, function(){
    console.log("Server listening on: http://localhost:%s", port);
  });
}
