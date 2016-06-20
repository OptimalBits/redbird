#Redbird Reverse Proxy
##with built in Cluster and Docker support.


![redbird](http://cliparts.co/cliparts/6cr/o9d/6cro9dRzi.jpg)

Handling dynamic virtual hosts, load balancing, proxying web sockets and SSL encryption should be
easy and robust.

With redbird you get a complete library to build dynamic reverse proxies with the speed and robustness of http-proxy.

This light-weight package includes everything you need for easy reverse routing of your applications.
Great for routing many applications from different domains in one single host, handling SSL with ease, etc.

Developed by [manast](http://twitter.com/manast)

[![BuildStatus](https://secure.travis-ci.org/OptimalBits/redbird.png?branch=master)](http://travis-ci.org/OptimalBits/redbird)
[![NPM version](https://badge.fury.io/js/redbird.svg)](http://badge.fury.io/js/redbird)

##Features

- Flexible and easy routing.
- Websockets.
- Seamless SSL Support (HTTPS -> HTTP proxy)
- Automatic HTTP to HTTPS redirects.
- Load balancer.
- Register and unregister routes programatically without restart (allows zero downtime deployments)
- Docker support for automatic registration of running containers
- Cluster support that enables automatic multi-process.
- Based on top of rock-solid node-http-proxy and battle tested on production in many sites.
- Optional logging based on bunyan.

##Install


```sh
npm install redbird
```

##Example


You can programatically register or unregister routes dynamically even if the proxy is already running:

```js
var proxy = require('redbird')({port: 80});

// OPTIONAL: Setup your proxy but disable the X-Forwarded-For header
var proxy = require('redbird')({port: 80, xfwd: false});

// Route to any global ip
proxy.register("optimalbits.com", "http://167.23.42.67:8000");

// Route to any local ip, for example from docker containers.
proxy.register("example.com", "http://172.17.42.1:8001");

// Route from hostnames as well as paths
proxy.register("example.com/static", "http://172.17.42.1:8002");
proxy.register("example.com/media", "http://172.17.42.1:8003");

// Subdomains, paths, everything just works as expected
proxy.register("abc.example.com", "http://172.17.42.4:8080");
proxy.register("abc.example.com/media", "http://172.17.42.5:8080");

// Route to any href including a target path
proxy.register("foobar.example.com", "http://172.17.42.6:8080/foobar");

// You can also enable load balancing by registering the same hostname with different
// target hosts. The requests will be evenly balanced using a Round Robin scheme.
proxy.register("balance.me", "http://172.17.40.6:8080");
proxy.register("balance.me", "http://172.17.41.6:8080");
proxy.register("balance.me", "http://172.17.42.6:8080");
proxy.register("balance.me", "http://172.17.43.6:8080");

```


##About HTTPS

The HTTPS proxy supports virtual hosts by using SNI (which most modern browsers support: IE7 and above).
The proxying is performed by hostname, so you must use the same SSL certificates for a given hostname independently of its paths.


##HTTPS Example

Conceptually HTTPS is easy, but it is also easy to struggle getting it right. With redbird its straightforward, check this complete example:

1) Generate a localhost development SSL certificate:

```sh
/certs $ openssl genrsa -out dev-key.pem 1024
/certs $ openssl req -new -key dev-key.pem -out dev-csr.pem

// IMPORTANT: Do not forget to fill the field! Common Name (e.g. server FQDN or YOUR name) []:localhost

/certs $ openssl x509 -req -in dev-csr.pem -signkey dev-key.pem -out dev-cert.pem

```

Note: For production sites you need to buy valid SSL certificates from a trusted authority.

2) Create a simple redbird based proxy:

```js
var redbird = new require('redbird')({
	port: 8080,

	// Specify filenames to default SSL certificates (in case SNI is not supported by the
	// user's browser)
	ssl: {
		port: 8443,
		key: "certs/dev-key.pem",
		cert: "certs/dev-cert.pem",
	}
});

// Since we will only have one https host, we dont need to specify additional certificates.
redbird.register('localhost', 'http://localhost:8082', {ssl: true});
```

3) Test it:

Point your browser to ```localhost:8000``` and you will see how it automatically redirects to your https server and proxies you to
your target server.


You can define many virtual hosts, each with its own SSL certificate. And if you do not define any, they will use the default one
as in the example above:

```js
redbird.register('example.com', 'http://172.60.80.2:8082', {
	ssl: {
		key: "../certs/example.key",
		cert: "../certs/example.crt",
		ca: "../certs/example.ca"
	}
});

redbird.register('foobar.com', 'http://172.60.80.3:8082', {
	ssl: {
		key: "../certs/foobar.key",
		cert: "../certs/foobar.crt",
	}
});
```

You can also specify https hosts as targets and also specify if you want the connection to the target host to be secure (default is true).

```js
var redbird = require('redbird')({
	port: 80,
	secure: false,
	ssl: {
		port: 443,
		key: "../certs/default.key",
		cert: "../certs/default.crt",
	}
});
redbird.register('tutorial.com', 'https://172.60.80.2:8083', {
	ssl: {
		key: "../certs/tutorial.key",
		cert: "../certs/tutorial.crt",
	}
});

```

##Docker support
If you use docker, you can tell Redbird to automatically register routes based on image
names. You register your image name and then everytime a container starts from that image,
it gets registered, and unregistered if the container is stopped. If you run more than one
container from the same image, redbird will load balance following a round robin schema:

```js
var redbird = require('redbird')({
  port: 8080,
});

require('redbird')
  .docker(redbird)
  .register("example.com", 'company/myimage:latest');
```

##Cluster support
Redbird support automatic support for node cluster. Just specify in the options object
the number of processes that you want redbird to use. Redbird will automatically re-start
any thread thay may crash automatically, increasing even more its reliability.

```js
var redbird = new require('redbird')({
	port: 8080,
  cluster: 4
});
```

##NTLM support
If you need NTLM support, you can tell Redbird to add the required header handler. This
registers a response handler which makes sure the NTLM auth header is properly split into
two entries from http-proxy.

```js
var redbird = new require('redbird')({
  port: 8080,
  ntlm: true
});
```

##etcd backend
RedBird can use [node-etcd](https://github.com/stianeikeland/node-etcd) to automatically create proxy records from an etcd cluster. Configuration
is accomplished by passing an array of [options](https://github.com/stianeikeland/node-etcd#constructor-options), plus the hosts and path variables,
which define which etcd cluster hosts, and which directory within those hosts, that redbird should poll for updates.

```js
var redbird = require('redbird')({
  port:8080
});

var options = {
  hosts: ['localhost:2379'], // REQUIRED - you must define array of cluster hosts
	path: ['redbird'], // OPTIONAL - path to etcd keys
	... // OPTIONAL - pass in node-etcd connection options
}
require('redbird').etcd(redbird,options);
```
etcd records can be created in one of two ways, either as a target destination pair:
```/redbird/example.com			"8.8.8.8"```
or by passing a JSON object containing multiple hosts, and redbird options:
```
/redbird/derek.com				{ "hosts" : ["10.10.10.10", "11.11.11.11"]}
/redbird/johnathan.com    { "ssl" : true }
/redbird/jeff.com         { "docker" : "alpine/alpine:latest" }
```

##Roadmap

- Statistics (number of connections, load, response times, etc)
- CORS support.
- Rate limiter.
- Simple IP Filtering.
- Automatic routing via Redis.

##Reference

<a name="redbird"/>
###Redbird(opts)

This is the Proxy constructor. Creates a new Proxy and starts listening to
the given port.

__Arguments__

```javascript
    opts {Object} Options to pass to the proxy:
    {
    	port: {Number} // port number that the proxy will listen to.
    	ssl: { // Optional SSL proxying.
    		port: {Number} // SSL port the proxy will listen to.
    		// Default certificates
    		key: keyPath,  
    		cert: certPath,
    		ca: caPath // Optional.
            redirect: true, // Disable HTTPS autoredirect to this route.
    	}
        bunyan: {Object} Bunyan options. Check [bunyan](https://github.com/trentm/node-bunyan) for info.
        If you want to disable bunyan, just set this option to false. Keep in mind that
        having logs enabled incours in a performance penalty of about one order of magnitude per request.
	}
```

---------------------------------------

<a name="register"/>
#### Redbird##register(src, target, opts)

Register a new route. As soon as this method is called, the proxy will
start routing the sources to the given targets.

__Arguments__

```javascript
    src {String} {String|URL} A string or a url parsed by node url module.
    	Note that port is ignored, since the proxy just listens to one port.

    target {String|URL} A string or a url parsed by node url module.
    opts {Object} route options:
    examples:
    {ssl : true} // Will use default ssl certificates.
    {ssl: {
        redirectPort: port, // optional https port number to be redirected if entering using http.
    	key: keyPath,
    	cert: certPath,
    	ca: caPath // optional
    	}
    }
```

---------------------------------------

<a name="unregister"/>
#### Redbird##unregister(src, [target])

 Unregisters a route. After calling this method, the given route will not
 be proxied anymore.

__Arguments__

```javascript
    src {String|URL} A string or a url parsed by node url module.
    target {String|URL} A string or a url parsed by node url module. If not
    specified, it will unregister all routes for the given source.
```

---------------------------------------

<a name="close"/>
#### Redbird##close()

 Close the proxy stoping all the incoming connections.

---------------------------------------
